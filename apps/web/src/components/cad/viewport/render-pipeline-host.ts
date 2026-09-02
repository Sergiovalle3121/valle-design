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
import { CadImageLayer, cadBrowserImageLoader, type CadImageLoader } from "@/lib/cad/render/image-layer-three";
import type { CadRenderOrigin, CadRenderView } from "@/lib/cad/render/pipeline";
import { defaultCadRenderStyle } from "@/lib/cad/render/render-style";
import type { CadLineStyle } from "@/lib/cad/render/line-batch";
import { disposeCadTessellateWorker } from "@/lib/cad/render/tessellate-worker-client";
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
  /** Cargador de imágenes; por defecto el del navegador. Las specs inyectan uno. */
  imageLoader?: CadImageLoader;
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
  /** Imágenes adjuntas con sus píxeles en pantalla (Ola H). */
  images: number;
  /** Imágenes esperando su textura. */
  imagesPending: number;
  meshes: number;
  visibleTiles: number;
  residentTiles: number;
  /** false mientras quede trabajo encolado: la carga es progresiva. */
  settled: boolean;
  /**
   * De dónde salió el último teselado: `worker` es el camino fuera de hilo
   * funcionando; `fallback` es el cliente rescatándose en el hilo principal;
   * `sync` es que aún no se pidió nada (o no hay worker); `none`, sin
   * anfitrión. Publicado en el DOM para que el golden pueda afirmar que el
   * worker corre — sin esto, un empaquetado roto degradaría en silencio.
   */
  tessellation: "sync" | "worker" | "fallback" | "none";
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
 *
 * El número es alto A PROPÓSITO. Bajarlo a ocho para que el indicador se
 * moviera más seguido multiplicó por cuatro las lecturas de `stats()` y hundió
 * la carga de un plano de 100.000 entidades de ~4 min a no terminar: el
 * diagnóstico se comía el presupuesto que debía teselar. El indicador se
 * refresca además cuando el encuadre PARA de moverse, que es cuando su cifra
 * cambia de verdad.
 */
const DIAGNOSTICS_SYNC_INTERVAL = 30;

/**
 * Movimiento de vista por debajo del cual no se vuelve a fijar: 0,4 % del
 * encuadre. A 1.600 px de ancho son ~6 px, que es menos de lo que se aprecia y
 * mucho más de lo que la amortiguación de la cámara produce en reposo.
 */
const VIEW_CHANGE_TOLERANCE = 0.004;

const EMPTY_DIAGNOSTICS: CadViewportRenderDiagnostics = {
  total: 0,
  visible: 0,
  rendered: 0,
  batches: 0,
  instances: 0,
  glyphs: 0,
  droppedGlyphs: 0,
  images: 0,
  imagesPending: 0,
  meshes: 0,
  visibleTiles: 0,
  residentTiles: 0,
  settled: true,
  tessellation: "none",
};

export class CadViewportRenderHost {
  private readonly scene: CadRenderScene;
  /** Los píxeles de las imágenes adjuntas, debajo de los lotes (Ola H). */
  private readonly images: CadImageLayer;
  private images_: { images: number; pending: number } = { images: 0, pending: 0 };
  private readonly parent: THREE.Object3D;
  private selection: ReadonlySet<string> = new Set();
  /**
   * El documento vigente, para resolver BYLAYER/BYBLOCK y la ranura del tipo
   * de línea. Medido el 2026-09-02: sin él, `styleOf` devolvía `linetypeIndex:
   * 0` fijo y ningún tipo de línea llegaba a la pantalla aunque la sonda
   * `visor.linetypeIndex` de la matriz de propiedades —que sí pasa el
   * documento— dijera «intacto».
   */
  private document: CadDocument | null = null;
  private glyphs = 0;
  private droppedGlyphs = 0;
  /** Pendiente de reconciliar mallas. Sincronizar en cada cuadro sería caro. */
  private dirty = true;
  private disposed = false;
  private hasContent = false;
  private lastView: CadRenderView | null = null;
  private published: CadViewportRenderDiagnostics = EMPTY_DIAGNOSTICS;
  private syncsSincePublish = 0;
  private viewPublishPending = false;
  /** Evita republicar en cada cuadro mientras la escena sigue en reposo. */
  private publishedSettled = false;
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
    this.images = new CadImageLayer({
      viewport: options.viewport,
      loader: options.imageLoader ?? cadBrowserImageLoader(),
      depthBias: CAD_RENDER_DEPTH_BIAS,
      depthScale: CAD_RENDER_DEPTH_SCALE,
      // Una textura que termina de cargar es contenido nuevo: el siguiente
      // cuadro reconcilia y publica, como cuando el planificador materializa.
      onChange: () => {
        this.dirty = true;
      },
    });
    this.images.group.renderOrder = CAD_RENDER_BATCH_ORDER - 1;
    this.parent.add(this.images.group);
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

  /**
   * Origen flotante vigente del pipeline por lotes. Lo necesita quien dibuja
   * FUERA de este anfitrión pero tiene que coincidir con él en dónde cae cada
   * punto — hoy, el lote de INSERTs (`buildCadInsertBatchObject`), que corre
   * siempre, esté o no activo el pipeline por lotes.
   */
  get renderOrigin(): CadRenderOrigin {
    return this.scene.renderOrigin;
  }

  setVisible(visible: boolean): void {
    this.scene.group.visible = visible;
    this.images.group.visible = visible;
  }

  /** La capa de imágenes, para las specs. */
  get imageLayer(): CadImageLayer {
    return this.images;
  }

  /** La tabla de tipos de línea que el shader tiene ahora; ver `CadRenderScene.linetypeUniforms`. */
  linetypeUniforms(): ReturnType<CadRenderScene["linetypeUniforms"]> {
    return this.scene.linetypeUniforms();
  }

  /**
   * Estilo por entidad. La selección viaja como COLOR de instancia, no como un
   * objeto aparte: el pipeline no tiene una malla por entidad que recolorear.
   * Por eso `setSelection` invalida los ids que entran y salen — es lo que
   * hace que el cambio de color llegue a la GPU.
   */
  private styleOf(entity: CadNativeEntity): CadLineStyle {
    // El MISMO resolutor que mide la matriz de propiedades del DXF: grosor y
    // ranura ya resueltos contra capa y bloque. La selección sólo cambia el
    // color, no el grosor ni el guion.
    const style = defaultCadRenderStyle(entity, this.document ?? undefined);
    return this.selection.has(entity.id)
      ? { ...style, color: CAD_RENDER_SELECTED_COLOR }
      : style;
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
  /**
   * ¿Cambió la vista lo bastante como para volver a fijarla?
   *
   * Con TOLERANCIA, y no por elegancia. `setView` aborta la cola del
   * planificador y vuelve a encolar los tiles visibles; con cientos de tiles
   * eso es trabajo por cuadro que NO cuenta contra el presupuesto de teselado
   * —ocurre antes de `runFrame`— y se lo come entero. Y la cámara del editor
   * tiene amortiguación: emite cambios de fracción de píxel mucho después de
   * que el usuario suelte el ratón, así que sin tolerancia la comparación exacta
   * daba «cambió» en cada cuadro y la carga de un dibujo grande se arrastraba.
   *
   * El umbral es el mismo criterio que `cadViewportBoundsChanged` aplica al
   * índice espacial: una fracción del propio encuadre, no un absoluto.
   */
  private viewChanged(view: CadRenderView): boolean {
    const last = this.lastView;
    if (!last) return true;
    if (
      Math.abs(last.pixelsPerUnit - view.pixelsPerUnit) >
      last.pixelsPerUnit * VIEW_CHANGE_TOLERANCE
    )
      return true;
    const toleranceX =
      Math.max(1, last.bounds.maxX - last.bounds.minX) * VIEW_CHANGE_TOLERANCE;
    const toleranceY =
      Math.max(1, last.bounds.maxY - last.bounds.minY) * VIEW_CHANGE_TOLERANCE;
    return (
      Math.abs(last.bounds.minX - view.bounds.minX) > toleranceX ||
      Math.abs(last.bounds.maxX - view.bounds.maxX) > toleranceX ||
      Math.abs(last.bounds.minY - view.bounds.minY) > toleranceY ||
      Math.abs(last.bounds.maxY - view.bounds.maxY) > toleranceY
    );
  }

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
    this.document = document;
    this.scene.replace(entities, drawOrder, document);
    this.images.replace(document);
    this.hasContent = true;
    this.dirty = true;
    // Contenido nuevo: hay que volver a fijar la vista para que los tiles del
    // encuadre actual se encolen. Sin esto, cargar un documento con la cámara
    // quieta no dibujaría nada hasta que alguien moviese el ratón.
    this.lastView = null;
  }

  /**
   * Edición: exactamente el contrato del pipeline — un id afectado que no venga
   * en `upserts` se trata como BAJA.
   *
   * El documento viaja con la edición porque hay geometría que se deriva de la
   * VECINDAD (las uniones de muro): rederivar el contorno de un vecino contra
   * el documento de antes lo reconstruiría idéntico, con el inglete del muro
   * que acaba de moverse.
   */
  invalidate(
    affectedEntityIds: readonly string[],
    upserts: readonly CadNativeEntity[] = [],
    document?: CadDocument,
  ): void {
    if (this.disposed) return;
    if (document) this.document = document;
    if (affectedEntityIds.length === 0) return;
    this.scene.invalidate(affectedEntityIds, upserts, document);
    this.images.invalidate(affectedEntityIds, upserts, document);
    this.dirty = true;
  }

  /**
   * Cambia la selección. Invalida la unión simétrica —lo que se selecciona y lo
   * que se deselecciona—, que es el conjunto mínimo que hay que reteselar para
   * que el color nuevo llegue a la GPU.
   */
  setSelection(
    entityIds: readonly string[],
    document: CadDocument | null,
  ): void {
    if (this.disposed) return;
    if (document) this.document = document;
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
    this.scene.invalidate(touched, upserts, document ?? undefined);
    this.dirty = true;
  }

  setHiddenLayers(hiddenLayers: ReadonlySet<string>): void {
    if (this.disposed) return;
    this.scene.setHiddenLayers(hiddenLayers);
    this.images.setHiddenLayers(hiddenLayers);
    this.dirty = true;
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
    // `setView` NO es gratis y no es idempotente: aborta la cola del
    // planificador, recalcula los tiles visibles y los vuelve a encolar.
    // Llamarlo en cada cuadro con la MISMA vista convierte un dibujo en reposo
    // en trabajo perpetuo — y el editor tiene una cámara amortiguada que emite
    // cambios mucho después de que el usuario suelte el ratón. Se llama sólo
    // cuando la vista cambió de verdad.
    let viewMoved = false;
    if (viewport || this.viewChanged(view)) {
      if (viewport) this.images.setView(viewport);
      const update = this.scene.setView(view, viewport);
      this.lastView = {
        bounds: { ...view.bounds },
        pixelsPerUnit: view.pixelsPerUnit,
      };
      if (
        update.addedTiles > 0 ||
        update.removedTiles > 0 ||
        update.lodChanged
      ) {
        this.dirty = true;
        viewMoved = true;
      }
    }
    // Publicar en CADA cuadro de un zoom sería pagar `stats()` —que recorre las
    // entidades— sesenta veces por segundo. Se espera al primer cuadro en que el
    // encuadre ya NO se mueve: una rueda de ratón produce una publicación, no
    // ciento veinte.
    if (viewMoved) this.viewPublishPending = true;
    const result = this.scene.runFrame();
    if (result.ran > 0) this.dirty = true;
    if (this.dirty) {
      const sync = this.scene.sync();
      this.glyphs = sync.glyphs;
      this.droppedGlyphs = sync.droppedGlyphs;
      // Las imágenes comparten origen flotante con los lotes; si cambió, la
      // capa reconstruye sus mallas.
      this.images.setOrigin(this.scene.renderOrigin);
      const imagesSync = this.images.sync();
      this.images_ = { images: imagesSync.images, pending: imagesSync.pending };
      // Las mallas nacen con `renderOrder` 0, que las dibujaría entremezcladas
      // con el suelo y los activos. La lámina de profundidad las pone delante,
      // pero el ORDEN de las llamadas también importa para lo translúcido.
      for (const child of this.scene.group.children)
        child.renderOrder = CAD_RENDER_BATCH_ORDER;
      this.dirty = false;
      this.syncsSincePublish += 1;
    }
    // La decisión de publicar vive FUERA de la reconciliación. Dentro, un
    // encuadre que se para justo cuando ya no queda trabajo no volvía a
    // sincronizar nunca y su publicación pendiente no llegaba jamás: el
    // indicador se quedaba con las cifras del encuadre anterior para siempre.
    const settled = this.scene.settled;
    const viewSettled = this.viewPublishPending && !viewMoved;
    if (
      viewSettled ||
      (settled && !this.publishedSettled) ||
      this.syncsSincePublish >= DIAGNOSTICS_SYNC_INTERVAL
    ) {
      this.viewPublishPending = viewMoved;
      this.publish();
    }
    this.publishedSettled = settled;
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
      current.images === next.images &&
      current.imagesPending === next.imagesPending &&
      current.meshes === next.meshes &&
      current.visibleTiles === next.visibleTiles &&
      current.residentTiles === next.residentTiles &&
      current.settled === next.settled &&
      current.tessellation === next.tessellation
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
      images: this.images_.images,
      imagesPending: this.images_.pending,
      meshes: stats.meshes,
      visibleTiles: stats.visibleTiles,
      residentTiles: stats.residentTiles,
      settled: stats.settled,
      tessellation: stats.tessellation,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hasContent = false;
    this.document = null;
    this.published = EMPTY_DIAGNOSTICS;
    for (const listener of this.listeners) listener();
    this.scene.dispose();
    this.images.dispose();
    // El worker de teselado es un singleton del módulo y éste es su consumidor
    // del editor: desmontar el lienzo lo cierra. Si el lienzo vuelve a
    // montarse, el cliente lo recrea perezosamente en la primera petición.
    disposeCadTessellateWorker();
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
