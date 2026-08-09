/**
 * Anfitrión del pipeline de render por lotes dentro del viewport del editor.
 *
 * ## Qué resuelve
 *
 * `lib/cad/render/scene.ts` está completo y probado, y su propia cabecera dice
 * que «este PR NO la enchufa». Éste sí. Todo lo que hace falta para enchufarla
 * —cuándo reemplazar, cuándo invalidar, cuándo sincronizar mallas, qué color
 * lleva la selección y cómo convive con el resto de la escena— vive aquí, fuera
 * del monolito, porque es lógica imperativa que no necesita React y porque el
 * presupuesto de `check:cad` sólo permite que `Layout3DEditor.tsx` encoja.
 *
 * ## Las tres cosas que el benchmark de Node no pudo comprobar
 *
 * Su campo `notMeasured` lo confiesa: GPU y llamadas de dibujo reales,
 * composición del navegador, y **rasterizado de glifos** —en Node no hay canvas,
 * así que `text-atlas.ts` nunca se había ejecutado de verdad—. Además su corpus
 * era 100.000 líneas, círculos y arcos, y **cero** polilíneas, hatches, mtext,
 * cotas e inserts. Aquí se cierra lo que se puede cerrar desde el consumidor:
 *
 * - `diagnostics()` publica el recuento real de lotes, instancias y GLIFOS, que
 *   es lo que un golden puede afirmar en un navegador de verdad.
 * - `replace()` acepta un documento entero, no una lista de líneas, así que el
 *   primer dibujo con MTEXT, hatch e insert pasa por este camino.
 *
 * ## Convivencia con el resto de la escena — la lámina de profundidad
 *
 * Los lotes escriben el orden de dibujo en `gl_Position.z`, y para que eso
 * signifique algo necesitan `depthTest`/`depthWrite` encendidos. Pero esa `z`
 * es SEMÁNTICA: la entidad que va primero en `modelSpace.entityIds` recibe
 * z ≈ +0,9, es decir, el fondo del búfer de profundidad. Dibujada tal cual
 * dentro de la escena del editor, el suelo o una estación la taparían — un
 * dibujo entero desaparecería debajo del plano de la planta.
 *
 * La primera versión de este archivo lo resolvía limpiando la profundidad justo
 * antes del grupo del CAD. Funcionaba y **costó un golden**: bajo el WebGL por
 * software con el que corren los goldens y CI, una limpieza de profundidad a
 * pantalla completa por cuadro atasca el hilo principal lo bastante como para
 * que un arrastre HTML5 pierda su `drop`. Medido: el golden 20 pasaba 3/3 sin la
 * limpieza y fallaba 2/3 con ella, con `main` verde.
 *
 * Lo que hace ahora es COMPRIMIR el orden de dibujo en una lámina delante de
 * todo lo demás (`CAD_RENDER_DEPTH_*`). Cuesta dos multiplicaciones en el
 * vertex shader, conserva el orden interno entre entidades y deja el resto de la
 * escena intacto. Los objetos heredados del CAD (selección, grips, cotas) siguen
 * en 28–31 con `depthTest: false`, así que se dibujan DESPUÉS y encima: la
 * selección se sigue viendo.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import { CAD_ENTITY_REGISTRY } from "@/lib/cad/entity-runtime";
import type { CadThreeViewport } from "@/lib/cad/entity-three";
import { CadRenderScene } from "@/lib/cad/render/scene";
import {
  CAD_RENDER_DEFAULT_COLOR,
  CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
  type CadRenderView,
} from "@/lib/cad/render/pipeline";
import type { CadLineStyle } from "@/lib/cad/render/line-batch";
import type { CadScreenYSign } from "@/lib/cad/render/text-atlas";

/** Color de selección: el mismo cian que usaba la proyección por entidad. */
export const CAD_RENDER_SELECTED_COLOR = 0x22d3ee;

/**
 * `renderOrder` de los lotes.
 *
 * Por debajo van suelo, rejilla, estaciones y activos (0–11). Por encima, los
 * objetos heredados del CAD (28–31): selección, grips y anotaciones.
 */
export const CAD_RENDER_BATCH_ORDER = 26;

/**
 * Lámina de profundidad del dibujo, en NDC.
 *
 * `cadDrawOrderDepth` produce (−0,9 … +0,9); comprimido queda
 * (−0,9895 … −0,8905): todo el dibujo delante del suelo y de los objetos 3D,
 * y el orden interno intacto. Con un búfer de 24 bits, esos 0,099 de NDC son
 * ~830.000 escalones, más de ocho por posición incluso con 100.000 entidades.
 */
export const CAD_RENDER_DEPTH_BIAS = -0.94;
export const CAD_RENDER_DEPTH_SCALE = 0.055;

export interface CadViewportRenderHostOptions {
  /** Grupo del CAD dentro de la escena; el del editor es `nativeGroupRef`. */
  parent: THREE.Object3D;
  viewport: CadThreeViewport;
  yScreenSign?: CadScreenYSign;
  frameBudgetMs?: number;
}

export interface CadViewportRenderDiagnostics {
  /** Entidades del documento entregadas al pipeline. */
  total: number;
  /** Entidades dentro de la vista. Sin muestrear: son TODAS. */
  visible: number;
  /** Entidades con detalle ya materializado y visible. */
  rendered: number;
  batches: number;
  instances: number;
  /** Glifos realmente subidos a la GPU por el atlas de texto. */
  glyphs: number;
  /** Glifos que el atlas no pudo colocar. Un número > 0 es un fallo visible. */
  droppedGlyphs: number;
  meshes: number;
  visibleTiles: number;
  residentTiles: number;
  /** false mientras quede trabajo encolado: la carga es progresiva. */
  settled: boolean;
}

/**
 * Sincronizaciones que pueden pasar sin publicar diagnóstico.
 *
 * `stats()` NO es barato: recorre las entidades visibles y las residentes para
 * poder afirmar que son las mismas. El propio pipeline avisa de que llamarlo
 * dentro del bucle de cuadros lo vuelve cuadrático — pasó al escribir su arnés
 * y a 100.000 entidades el benchmark dejó de terminar. Se publica al asentar
 * (que es el momento que interesa) y, durante una carga larga, de vez en
 * cuando, para que el indicador avance en vez de quedarse mudo.
 */
const DIAGNOSTICS_SYNC_INTERVAL = 30;

const EMPTY_DIAGNOSTICS: CadViewportRenderDiagnostics = {
  total: 0,
  visible: 0,
  rendered: 0,
  batches: 0,
  instances: 0,
  glyphs: 0,
  droppedGlyphs: 0,
  meshes: 0,
  visibleTiles: 0,
  residentTiles: 0,
  settled: true,
};

export class CadViewportRenderHost {
  private readonly scene: CadRenderScene;
  private readonly parent: THREE.Object3D;
  private selection: ReadonlySet<string> = new Set();
  private glyphs = 0;
  private droppedGlyphs = 0;
  /** Pendiente de reconciliar mallas. Sincronizar en cada cuadro sería caro. */
  private dirty = true;
  private disposed = false;
  private hasContent = false;
  private published: CadViewportRenderDiagnostics = EMPTY_DIAGNOSTICS;
  private syncsSincePublish = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: CadViewportRenderHostOptions) {
    this.parent = options.parent;
    this.scene = new CadRenderScene({
      viewport: options.viewport,
      yScreenSign: options.yScreenSign,
      frameBudgetMs: options.frameBudgetMs,
      style: (entity) => this.styleOf(entity),
      depthBias: CAD_RENDER_DEPTH_BIAS,
      depthScale: CAD_RENDER_DEPTH_SCALE,
    });
    this.scene.group.renderOrder = CAD_RENDER_BATCH_ORDER;
    this.parent.add(this.scene.group);
  }

  /** El grupo THREE con los lotes; lo expone para pruebas y para ocultarlo. */
  get group(): THREE.Group {
    return this.scene.group;
  }

  /**
   * true en cuanto recibió un documento. El editor lo consulta para no
   * invalidar un pipeline vacío: si el lienzo se monta DESPUÉS de que el
   * documento se cargue, el primer aviso que llega es un parche, y aplicarlo
   * sobre la nada dejaría el dibujo en blanco sin decir nada.
   */
  get loaded(): boolean {
    return this.hasContent;
  }

  get visible(): boolean {
    return this.scene.group.visible;
  }

  setVisible(visible: boolean): void {
    this.scene.group.visible = visible;
  }

  /**
   * Estilo por entidad. La selección viaja como COLOR de instancia, no como un
   * objeto aparte: el pipeline no tiene una malla por entidad que recolorear.
   * Por eso `setSelection` invalida los ids que entran y salen — es lo que
   * hace que el cambio de color llegue a la GPU.
   */
  private styleOf(entity: CadNativeEntity): CadLineStyle {
    const presentation = entity.context?.presentation;
    const value = presentation?.color?.value;
    const color = this.selection.has(entity.id)
      ? CAD_RENDER_SELECTED_COLOR
      : value && /^#[0-9a-f]{6}$/i.test(value)
        ? Number.parseInt(value.slice(1), 16)
        : CAD_RENDER_DEFAULT_COLOR;
    const weight = presentation?.lineweight?.value;
    return {
      color,
      halfWidthPx:
        typeof weight === "number" && weight > 0
          ? Math.max(CAD_RENDER_DEFAULT_HALF_WIDTH_PX, weight / 50)
          : CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
      linetypeIndex: 0,
      layer: entity.layer,
    };
  }

  /**
   * Sustituye el contenido con el documento entero.
   *
   * `excludeEntityIds` existe para los INSERT que ya dibuja el lote instanciado
   * de `buildCadInsertBatches`: ese camino se conserva intacto —es un shader
   * propio con una matriz por instancia— y dibujarlos dos veces sería duplicar
   * geometría y romper el guionado. El orden de dibujo sale de
   * `modelSpace.entityIds`, no del orden del array de entidades.
   */
  replace(
    document: CadDocument,
    options: { excludeEntityIds?: ReadonlySet<string> } = {},
  ): void {
    if (this.disposed) return;
    const excluded = options.excludeEntityIds;
    const entities = document.entities.filter(
      (entity): entity is CadNativeEntity =>
        CAD_ENTITY_REGISTRY.supports(entity) && !excluded?.has(entity.id),
    );
    const drawOrder = excluded
      ? document.modelSpace.entityIds.filter((id) => !excluded.has(id))
      : document.modelSpace.entityIds;
    this.scene.replace(entities, drawOrder, document);
    this.hasContent = true;
    this.dirty = true;
  }

  /**
   * Edición: exactamente el contrato del pipeline — un id afectado que no venga
   * en `upserts` se trata como BAJA.
   */
  invalidate(
    affectedEntityIds: readonly string[],
    upserts: readonly CadNativeEntity[] = [],
  ): void {
    if (this.disposed || affectedEntityIds.length === 0) return;
    this.scene.invalidate(affectedEntityIds, upserts);
    this.dirty = true;
  }

  /**
   * Cambia la selección. Invalida la unión simétrica —lo que se selecciona y lo
   * que se deselecciona—, que es el conjunto mínimo que hay que reteselar para
   * que el color nuevo llegue a la GPU.
   */
  setSelection(entityIds: readonly string[], document: CadDocument | null): void {
    if (this.disposed) return;
    const next = new Set(entityIds);
    const touched: string[] = [];
    for (const id of this.selection) if (!next.has(id)) touched.push(id);
    for (const id of next) if (!this.selection.has(id)) touched.push(id);
    this.selection = next;
    if (touched.length === 0) return;
    // Los ids tocados SIGUEN existiendo: hay que pasar su entidad como upsert o
    // el pipeline los daría de baja y desaparecerían del dibujo al seleccionar.
    const byId = new Map(
      (document?.entities ?? [])
        .filter((entity): entity is CadNativeEntity =>
          CAD_ENTITY_REGISTRY.supports(entity),
        )
        .map((entity) => [entity.id, entity] as const),
    );
    const upserts = touched
      .map((id) => byId.get(id))
      .filter((entity): entity is CadNativeEntity => !!entity);
    this.scene.invalidate(touched, upserts);
    this.dirty = true;
  }

  setHiddenLayers(hiddenLayers: ReadonlySet<string>): void {
    if (this.disposed) return;
    this.scene.setHiddenLayers(hiddenLayers);
  }

  /**
   * Un cuadro. Se llama desde el bucle de dibujo del editor.
   *
   * Sincronizar mallas en CADA cuadro sería tirar y reconstruir la malla de
   * texto sesenta veces por segundo aunque nada cambiase. Sólo se reconcilia
   * cuando el conjunto de tiles cambió, cuando el planificador materializó algo
   * o cuando el contenido se tocó desde fuera.
   */
  frame(view: CadRenderView, viewport?: CadThreeViewport): void {
    if (this.disposed || !this.scene.group.visible) return;
    const update = this.scene.setView(view, viewport);
    if (update.addedTiles > 0 || update.removedTiles > 0 || update.lodChanged)
      this.dirty = true;
    const result = this.scene.runFrame();
    if (result.ran > 0) this.dirty = true;
    if (!this.dirty) return;
    const sync = this.scene.sync();
    this.glyphs = sync.glyphs;
    this.droppedGlyphs = sync.droppedGlyphs;
    // Las mallas nacen con `renderOrder` 0, que las dibujaría entremezcladas
    // con el suelo y los activos. La lámina de profundidad las pone delante,
    // pero el ORDEN de las llamadas también importa para lo translúcido.
    for (const child of this.scene.group.children)
      child.renderOrder = CAD_RENDER_BATCH_ORDER;
    this.dirty = false;
    this.syncsSincePublish += 1;
    if (this.scene.settled || this.syncsSincePublish >= DIAGNOSTICS_SYNC_INTERVAL)
      this.publish();
  }

  /**
   * Suscripción para `useSyncExternalStore`.
   *
   * La instantánea se compara POR IDENTIDAD, así que `getSnapshot` devuelve el
   * mismo objeto mientras ninguna cifra cambie. Devolver uno nuevo en cada
   * lectura mete a React en un bucle infinito de renders — es el mismo error
   * que documenta `CadCommandEngineHost`, y no hace falta cometerlo dos veces.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CadViewportRenderDiagnostics => this.published;

  private publish(): void {
    this.syncsSincePublish = 0;
    const next = this.diagnostics();
    const current = this.published;
    if (
      current.total === next.total &&
      current.visible === next.visible &&
      current.rendered === next.rendered &&
      current.batches === next.batches &&
      current.instances === next.instances &&
      current.glyphs === next.glyphs &&
      current.droppedGlyphs === next.droppedGlyphs &&
      current.meshes === next.meshes &&
      current.visibleTiles === next.visibleTiles &&
      current.residentTiles === next.residentTiles &&
      current.settled === next.settled
    )
      return;
    this.published = next;
    for (const listener of this.listeners) listener();
  }

  diagnostics(): CadViewportRenderDiagnostics {
    if (this.disposed) return EMPTY_DIAGNOSTICS;
    const stats = this.scene.stats();
    return {
      total: stats.totalEntities,
      visible: stats.visibleEntities,
      rendered: stats.renderedEntities,
      batches: stats.batches,
      instances: stats.instances,
      glyphs: this.glyphs,
      droppedGlyphs: this.droppedGlyphs,
      meshes: stats.meshes,
      visibleTiles: stats.visibleTiles,
      residentTiles: stats.residentTiles,
      settled: stats.settled,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hasContent = false;
    this.published = EMPTY_DIAGNOSTICS;
    for (const listener of this.listeners) listener();
    this.scene.dispose();
  }
}

/**
 * Ranura estable para el anfitrión.
 *
 * El anfitrión nace y muere con el lienzo THREE, dentro de un efecto, mientras
 * que el indicador es un componente de React que se monta antes. Sin una ranura
 * intermedia el indicador recibiría `null` en el primer render y no habría nada
 * que le avisara de la llegada del anfitrión: el contador se quedaría a cero
 * para siempre, que es exactamente el silencio que este diagnóstico existe para
 * evitar.
 *
 * `getSnapshot` sigue siendo estable por identidad —delega en el del anfitrión,
 * que sólo cambia de objeto cuando alguna cifra cambia—, así que
 * `useSyncExternalStore` no entra en bucle.
 */
export class CadRenderHostSlot {
  private host: CadViewportRenderHost | null = null;
  private detach: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CadViewportRenderDiagnostics =>
    this.host?.getSnapshot() ?? EMPTY_DIAGNOSTICS;

  get current(): CadViewportRenderHost | null {
    return this.host;
  }

  set(host: CadViewportRenderHost | null): void {
    this.detach?.();
    this.host = host;
    this.detach = host ? host.subscribe(() => this.emit()) : null;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
