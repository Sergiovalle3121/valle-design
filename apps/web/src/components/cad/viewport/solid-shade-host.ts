/**
 * Anfitrión del visor SOMBREADO de sólidos.
 *
 * `solid3d-three.ts` sabía construir la malla de un sólido con sus cuatro
 * estilos visuales y no tenía ni un consumidor: los sólidos se veían siempre
 * como su proyección alámbrica 2D aplanada. Este anfitrión les da el grupo de
 * escena que faltaba, con el MISMO patrón que los INSERT por lotes: los ids de
 * sólido se EXCLUYEN del pipeline por lotes (que vive comprimido en una lámina
 * de profundidad NDC, incompatible con la z real de una pieza) y se proyectan
 * aquí como mallas con profundidad de verdad y luz.
 *
 * El estilo (VSCURRENT/SHADEMODE) es estado del visor: cambiarlo reconstruye
 * las mallas y no toca el documento. Estado fuera de React, como todos los
 * anfitriones del viewport.
 *
 * ## Y por qué aquí vive también el ENGANCHE 3D
 *
 * Porque los sólidos que hay que indexar para enganchar son exactamente los que
 * este anfitrión ya reconcilia contra el documento, uno a uno y por identidad de
 * referencia. Un segundo anfitrión con su propia lista sería una segunda verdad,
 * y las dos se desincronizarían el día que una entidad cambie entre un `sync` y
 * el otro: el visor dibujando la pieza donde está y el enganche buscándola donde
 * estaba. El índice y su aritmética viven aparte —`solid-snap-host.ts` y
 * `lib/cad/view/solid-snap.ts`—; lo que vive aquí es el ciclo de vida.
 *
 * El puente de VISTA que lo alimenta es opcional. Sin él —una previsualización
 * de trazado, una prueba en Node— no hay enganche 3D ni líneas ocultas por CPU,
 * y se dice con un `null` en vez de con un anfitrión que existe y nunca
 * responde. Es la capa apagable que exige el presupuesto de rendimiento.
 */
import * as THREE from "three";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadSolid3dEntity } from "@/lib/cad/cad-entities-v5";
import { cadHiddenLayerIds } from "@/lib/cad/cad-layer-visibility";
import {
  buildCadSolidObject,
  disposeCadSolidObject,
} from "@/lib/cad/solid3d-three";
import {
  CAD_DEFAULT_VISUAL_STYLE,
  cadVisualStyle,
  type CadVisualStyleId,
} from "@/lib/cad/view/visual-styles";
import type { CadHiddenLineView } from "@/lib/cad/view/hidden-lines";
import type { CadThreeViewport } from "@/lib/cad/entity-three";
import type { SnapType } from "@/lib/cad/snap-engine";
import type {
  CadSolidSnapProjector,
  CadSolidSnapQuery,
  CadSolidSnapResult,
} from "@/lib/cad/view/solid-snap";
import { CadSolidSnapHost, type CadSolidViewBridge } from "./solid-snap-host";

/** Ids de los sólidos del documento: lo que se excluye del pipeline de líneas. */
export function cadSolidEntityIds(document: CadDocument): string[] {
  return document.entities
    .filter((entity) => entity.type === "solid3d")
    .map((entity) => entity.id);
}

/**
 * Lo que el puente de vista necesita del controlador, declarado estructuralmente.
 *
 * `CadViewController` lo cumple sin saberlo. Se declara así para que el anfitrión
 * se pueda montar en Node con un objeto de cinco funciones, y para que el
 * monolito no tenga que escribir el puente a mano —son cinco líneas que no
 * pintan nada allí.
 */
export interface CadSolidViewControllerLike {
  readonly revision: number;
  readonly mode: "2d" | "3d";
  readonly view: { widthPx: number; heightPx: number };
  createDrawingProjector(): CadSolidSnapProjector;
  eyeDrawingPoint(): { x: number; y: number; z: number };
  viewDirectionDrawing(): { x: number; y: number; z: number };
  worldToScreen(point: { x: number; y: number }): { x: number; y: number };
  onChange(listener: () => void): () => void;
}

/** Puente de vista a partir de un controlador vivo, leído por `ref`. */
export function cadSolidViewBridge(
  controller: () => CadSolidViewControllerLike | null,
): CadSolidViewBridge {
  return {
    projector: () => controller()?.createDrawingProjector() ?? null,
    revision: () => controller()?.revision ?? -1,
    viewportPx: () => {
      const view = controller()?.view;
      return { widthPx: view?.widthPx ?? 0, heightPx: view?.heightPx ?? 0 };
    },
    eye: () => controller()?.eyeDrawingPoint() ?? null,
    direction: () => controller()?.viewDirectionDrawing() ?? null,
  };
}

/** Lo que devuelve `snapAtDrawingPoint`, con la forma que espera el editor. */
export interface CadSolidDrawingSnap {
  wx: number;
  wy: number;
  /** Siempre `true`: hubo enganche a geometría, no a la rejilla. */
  onDxf: true;
  snapType: SnapType;
  /** La COTA del punto enganchado. El canal 2D del puntero todavía la ignora. */
  wz: number;
}

/**
 * Cuántos grados tiene que girar la vista antes de recalcular qué aristas tapa
 * el sólido.
 *
 * Sin umbral, arrastrar una órbita reconstruiría la geometría de líneas en cada
 * cuadro, que es exactamente el coste que el presupuesto de 60 Hz prohíbe. Con
 * cinco grados, un giro completo cuesta 72 reconstrucciones en vez de una por
 * cuadro, y el peor desfase visible es una arista de silueta que tarda cinco
 * grados en aparecer.
 */
export const CAD_HIDDEN_LINE_REFRESH_DEG = 5;

export class CadSolidShadeHost {
  readonly group = new THREE.Group();
  private style: CadVisualStyleId = CAD_DEFAULT_VISUAL_STYLE;
  private readonly built = new Map<
    string,
    { entity: CadSolid3dEntity; selected: boolean; object: THREE.Object3D }
  >();

  /**
   * Enganche 3D. `null` sin puente de vista: un montaje sin cámara —una
   * previsualización de trazado, una prueba en Node— no engancha, y decirlo con
   * un `null` es más honesto que un anfitrión que existe y nunca responde.
   */
  private readonly snapHost: CadSolidSnapHost | null;
  /** Ojo con el que se calcularon las aristas visibles vigentes. */
  private hiddenLineEye: { x: number; y: number; z: number } | null = null;
  /** Y la dirección de mirada de entonces: es la que mide cuánto ha girado. */
  private hiddenLineDirection: { x: number; y: number; z: number } | null = null;

  /** Baja de la suscripción al controlador. `null` mientras no la haya. */
  private unsubscribeView: (() => void) | null = null;
  private readonly viewBridge: CadSolidViewBridge | null;

  /**
   * El segundo argumento es un GETTER del controlador y no el puente ya hecho.
   *
   * Es lo que permite construir este anfitrión ANTES de que exista la cámara
   * —que es el orden real en el editor— sin que quien lo monta tenga que
   * escribir el puente a mano. Sin puente, el anfitrión dibuja igual y no hay
   * enganche 3D ni líneas ocultas por CPU.
   */
  constructor(
    private readonly viewport: () => CadThreeViewport,
    private readonly viewController?: () => CadSolidViewControllerLike | null,
  ) {
    this.group.name = "cad-solids-shaded";
    this.viewBridge = viewController ? cadSolidViewBridge(viewController) : null;
    this.snapHost = this.viewBridge ? new CadSolidSnapHost(this.viewBridge) : null;
  }

  /**
   * Se engancha al controlador la PRIMERA vez que hay uno.
   *
   * No se puede hacer en el constructor: allí la cámara todavía no existe. Y no
   * se puede dejar en manos de quien monta el lienzo, porque entonces la
   * reconstrucción de líneas ocultas dependería de que alguien se acordara de
   * llamarla desde el manejador de la órbita — exactamente el tipo de cable
   * suelto que hace que una funcionalidad exista y no funcione.
   */
  private ensureSubscribed(): void {
    if (this.unsubscribeView || !this.viewController) return;
    const controller = this.viewController();
    if (!controller) return;
    this.unsubscribeView = controller.onChange(() => {
      this.refreshHiddenLines();
    });
  }

  /**
   * Enganche a una arista o vértice de sólido bajo un píxel del lienzo.
   *
   * Vive en ESTE anfitrión y no en uno aparte porque los sólidos que hay que
   * indexar son exactamente los que este anfitrión ya reconcilia contra el
   * documento. Un segundo anfitrión con su propia lista sería una segunda
   * verdad, y las dos se desincronizarían el día que una entidad cambie entre
   * un `sync` y el otro.
   */
  snap3d(
    cursorX: number,
    cursorY: number,
    options: CadSolidSnapQuery,
  ): CadSolidSnapResult | null {
    return this.snapHost?.query(cursorX, cursorY, options) ?? null;
  }

  /**
   * Enganche a un sólido desde un punto de DIBUJO, con la forma que el editor
   * espera de su `snapFloor`.
   *
   * Aquí vive la traducción que antes estaba en el monolito, y merece quedar
   * escrita: el punto de dibujo que llega es el que el rayo del puntero corta
   * contra el plano del SUELO, así que proyectarlo devuelve exactamente el
   * píxel donde está el cursor. De ahí en adelante se razona en pantalla, que
   * es donde el usuario ve la arista.
   *
   * Sólo en modo 3D. En 2D la proyección plana ya acierta y el motor de siempre
   * la resuelve; meterse ahí movería goldens sin ganar nada.
   */
  snapAtDrawingPoint(
    wx: number,
    wy: number,
    options: CadSolidSnapQuery,
  ): CadSolidDrawingSnap | null {
    const controller = this.viewController?.() ?? null;
    if (!controller || controller.mode !== "3d") return null;
    const at = controller.worldToScreen({ x: wx, y: wy });
    const hit = this.snap3d(at.x, at.y, options);
    if (!hit) return null;
    return {
      wx: hit.point.x,
      wy: hit.point.y,
      onDxf: true,
      snapType: hit.type,
      wz: hit.point.z,
    };
  }

  /** Por qué no hay enganche 3D, o `null` si lo hay. Para el panel de estado. */
  get snapDisabledReason(): string | null {
    return this.snapHost?.disabledReason ?? null;
  }

  get snapIndexedEdges(): number {
    return this.snapHost?.indexedEdges ?? 0;
  }

  /**
   * Recalcula qué aristas tapa el sólido, si la vista ha girado lo bastante.
   *
   * **Sólo en el estilo Oculto**, y la restricción es deliberada. En los estilos
   * sombreados hay caras opacas y el búfer de profundidad esconde las aristas de
   * detrás con exactitud de píxel, incluso en piezas cóncavas donde la
   * clasificación por caras traseras se equivoca; sustituirlo por una cuenta de
   * CPU sería cambiar algo exacto por algo aproximado. En Oculto no hay caras
   * que mirar —sólo un ocultador del color del fondo— y saber qué aristas
   * sobran es lo que hace que el estilo signifique lo que dice.
   *
   * ## Por qué el umbral se mide sobre la DIRECCIÓN y no sobre el ojo
   *
   * Porque es la dirección la que decide qué caras miran al observador. Un
   * desplazamiento puro de la cámara —3DPAN, 3DZOOM— mueve el ojo sin girar la
   * mirada y no reclasifica hasta que la dirección cambia; y eso es SEGURO, no
   * un descuido: el estilo Oculto también pinta el ocultador, así que una
   * clasificación vieja que conserve aristas de más las sigue escondiendo la
   * GPU. El único error que se vería es quitar una arista que debería verse, y
   * eso sólo pasa al GIRAR, que es justo lo que este umbral mide.
   *
   * Devuelve `true` si reconstruyó.
   */
  refreshHiddenLines(): boolean {
    if (this.style !== "hidden" || !this.viewBridge) return false;
    const eye = this.viewBridge.eye();
    const direction = this.viewBridge.direction();
    if (!eye || !direction) return false;
    if (this.hiddenLineDirection && !turnedEnough(this.hiddenLineDirection, direction)) return false;
    this.hiddenLineEye = eye;
    this.hiddenLineDirection = direction;
    const entries = [...this.built.values()];
    this.clear();
    for (const entry of entries) this.add(entry.entity, entry.selected);
    return true;
  }

  /** La vista con la que construir aristas, o `undefined` para el camino de la GPU. */
  private hiddenLineView(): CadHiddenLineView | undefined {
    if (this.style !== "hidden" || !this.hiddenLineEye) return undefined;
    return { kind: "perspective", eye: this.hiddenLineEye };
  }

  get visualStyle(): CadVisualStyleId {
    return this.style;
  }

  /** Cambia el estilo y reconstruye. Devuelve el estilo por si hay que anunciarlo. */
  setStyle(style: CadVisualStyleId): CadVisualStyleId {
    if (style === this.style) return this.style;
    this.style = style;
    // El ojo se toma AQUÍ, al entrar en Oculto, y no se espera a la siguiente
    // órbita: si no, cambiar de estilo sin tocar la cámara dejaría el alambre
    // completo hasta que alguien girase, y el usuario vería que VSCURRENT
    // Oculto «no hace nada» durante ese rato.
    this.hiddenLineEye = style === "hidden" ? (this.viewBridge?.eye() ?? null) : null;
    this.hiddenLineDirection = style === "hidden" ? (this.viewBridge?.direction() ?? null) : null;
    const entries = [...this.built.values()];
    this.clear();
    for (const entry of entries) this.add(entry.entity, entry.selected);
    return this.style;
  }

  /** Para el renglón de la línea de comandos: aplica y devuelve la ETIQUETA. */
  applyVisualStyle(style: CadVisualStyleId): string {
    return cadVisualStyle(this.setStyle(style)).label;
  }

  /**
   * Reconcilia contra el documento: crea lo que falta, reconstruye lo que
   * cambió (por identidad de referencia — las mutaciones canónicas no clonan
   * lo que no tocan) y libera lo que ya no está.
   */
  sync(document: CadDocument, selectedIds: ReadonlySet<string>): void {
    // El índice de enganche 3D se reconcilia con el MISMO documento y en el
    // mismo punto: si se hiciera aparte, habría un instante en el que el visor
    // dibuja una pieza donde el enganche todavía la busca en su sitio anterior.
    this.snapHost?.sync(document);
    // Primera oportunidad real de encontrar la cámara: cuando el editor
    // reconcilia, el lienzo ya está montado.
    this.ensureSubscribed();
    // Lo que no se ve no puede ser un imán ni renderizarse — un sólido en
    // capa apagada o congelada no se construye (y si ya estaba construido, el
    // bucle de reconciliación de abajo lo libera al no encontrarlo en
    // `wanted`, exactamente igual que `CadWallSolidHost.sync()` ya hace).
    const hiddenLayers = cadHiddenLayerIds(document.layers);
    const wanted = new Map<string, CadSolid3dEntity>();
    for (const entity of document.entities)
      if (entity.type === "solid3d" && !hiddenLayers.has(entity.layer))
        wanted.set(entity.id, entity);
    for (const [id, entry] of [...this.built]) {
      const next = wanted.get(id);
      const selected = selectedIds.has(id);
      if (next && next === entry.entity && selected === entry.selected) {
        wanted.delete(id);
        continue;
      }
      disposeCadSolidObject(entry.object);
      this.built.delete(id);
      if (!next) wanted.delete(id);
    }
    for (const [id, entity] of wanted) this.add(entity, selectedIds.has(id));
  }

  private add(entity: CadSolid3dEntity, selected: boolean): void {
    const view = this.hiddenLineView();
    const object = buildCadSolidObject(entity, this.viewport(), {
      style: this.style,
      selected,
      ...(view ? { view } : {}),
    });
    this.group.add(object);
    this.built.set(entity.id, { entity, selected, object });
  }

  private clear(): void {
    for (const entry of this.built.values()) disposeCadSolidObject(entry.object);
    this.built.clear();
  }

  get count(): number {
    return this.built.size;
  }

  dispose(): void {
    this.clear();
    this.snapHost?.invalidate();
    this.unsubscribeView?.();
    this.unsubscribeView = null;
    this.group.removeFromParent();
  }
}

/** ¿La mirada ha girado al menos `CAD_HIDDEN_LINE_REFRESH_DEG`? */
function turnedEnough(
  previous: { x: number; y: number; z: number },
  next: { x: number; y: number; z: number },
): boolean {
  const before = Math.hypot(previous.x, previous.y, previous.z);
  const after = Math.hypot(next.x, next.y, next.z);
  // Sin dirección que comparar se recalcula: no saber es motivo para rehacer,
  // no para conservar un dibujo que puede estar mal.
  if (!(before > 0) || !(after > 0)) return true;
  const cosine =
    (previous.x * next.x + previous.y * next.y + previous.z * next.z) / (before * after);
  const degrees = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
  return degrees >= CAD_HIDDEN_LINE_REFRESH_DEG;
}
