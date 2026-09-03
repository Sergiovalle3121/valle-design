/**
 * SOLVIEW: crea la VENTANA de una vista derivada —planta, alzado, corte o
 * detalle— y las capas donde vivirá su dibujo.
 *
 * SOLVIEW no dibuja nada. Prepara el sitio: la ventana con su cámara, su
 * encuadre y su escala, y las cuatro capas con las que un despacho separa el
 * perfil visto, el oculto, el sombreado del corte y las cotas. Dibujar es
 * SOLDRAW, y están separados por la misma razón que en el original: crear las
 * vistas es una decisión de composición que se toma una vez, y redibujarlas es
 * algo que pasa cada vez que el modelo cambia.
 *
 * ## Dónde acaba el dibujo derivado, y por qué ahí
 *
 * Cada vista recibe una PLACA: un rectángulo propio del espacio modelo, en el
 * plano XY, donde SOLDRAW deja la proyección ya aplanada. La ventana encuadra
 * esa placa (`modelBounds`), y la cámara (`view`) queda como el registro de con
 * qué proyección se produjo — y como lo que un visor 3D usaría para mirar el
 * modelo directamente.
 *
 * La alternativa —dejar el dibujo derivado sobre el plano de la vista en 3D,
 * que es lo que hace SOLPROF— es más elegante y hoy no se puede trazar: el
 * emisor de láminas proyecta el modelo por su `x` e `y`, así que un alzado
 * puesto de canto en un plano vertical saldría convertido en una raya. Aplanar
 * a una placa hace que un alzado ENTRE HOY en una presentación, en una serie de
 * hojas y en un trazado con su cajetín, sin tocar una línea del emisor. Ése era
 * el encargo: alimentar el sistema de láminas que ya existe, no construir otro.
 *
 * El coste, dicho en voz alta: la geometría derivada es una segunda copia
 * dentro del documento, y el archivo crece. Es lo mismo que cuesta cualquier
 * perfil aplanado, y es lo que se paga por poder acotarlo.
 *
 * ## Las placas no se pisan
 *
 * Se colocan en fila a la derecha de todo lo que ya ocupa sitio —la envolvente
 * del modelo y las placas que ya existen—, con una separación proporcional. El
 * sitio se calcula del documento, no de un contador de sesión, así que dos
 * ejecuciones sobre el mismo documento colocan la placa en el mismo punto.
 */
import type {
  CadDocument,
  CadLayerDef,
  CadPaperSpace,
  CadPaperViewport,
  CadPoint2,
  CadViewportView,
} from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import {
  CAD_SOLVIEW_LAYER_SUFFIXES,
  type CadSolviewLayerSuffix,
} from "../cad-paper-viewport";
import { upsertCadLayoutCommand } from "./layout-operations";
import {
  cadSolviewSources,
  cadSolviewWindow,
  type CadSolviewRect,
  type CadSolviewSource,
} from "./solview-model";
import { cadViewportViewFrame } from "./viewport-view";
import {
  createCadRectangularViewport,
  freezeCadLayerInViewport,
  nearestCadViewportScale,
} from "./viewport-operations";

export type CadSolviewErrorCode =
  /** El modelo no tiene ni un muro ni un sólido del que derivar nada. */
  | "sin-modelo"
  /** La cámara no define una vista: dirección nula o vertical paralela. */
  | "camara-invalida"
  /** Lo que la cámara ve queda vacío: la vista no enseñaría nada. */
  | "vista-vacia"
  /** Ya hay una vista con ese nombre: sus capas colisionarían. */
  | "nombre-repetido";

export interface CadSolviewFailure {
  ok: false;
  code: CadSolviewErrorCode;
  message: string;
}

/** Separación entre placas, como fracción del lado mayor de la propia placa. */
const PLATE_GAP_RATIO = 0.25;

/** Colores de las cuatro capas. Son los que un despacho espera ver. */
const LAYER_COLORS: Record<CadSolviewLayerSuffix, string> = {
  VIS: "#ffffff",
  HID: "#808080",
  HAT: "#00a0a0",
  DIM: "#00c000",
  ROT: "#ffff00",
};

/** Nombre de una capa de la vista: `<base>-VIS`, `-HID`, `-HAT`, `-DIM`, `-ROT`. */
export function cadSolviewLayerName(base: string, suffix: CadSolviewLayerSuffix): string {
  return `${base}-${suffix}`;
}

/** Las cuatro capas de una vista, en el orden en que se dibujan. */
export function cadSolviewLayerNames(base: string): string[] {
  return CAD_SOLVIEW_LAYER_SUFFIXES.map((suffix) => cadSolviewLayerName(base, suffix));
}

/**
 * Nombre base a partir del que se derivan las capas.
 *
 * Se normaliza a mayúsculas sin acentos porque es un nombre de CAPA y las capas
 * se referencian por nombre en toda la casa —congelado por ventana, tabla de
 * plumas, DXF—. Un «Alzado Sur» y un «ALZADO SUR» serían dos capas distintas y
 * el usuario vería una sola.
 */
export function cadSolviewLayerBase(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, "-")
    .replace(/[^A-Z0-9-]/gu, "");
}

/** Bases de capa que ya usa alguna vista derivada del documento. */
export function cadSolviewUsedBases(document: Pick<CadDocument, "paperSpaces">): Set<string> {
  const used = new Set<string>();
  for (const space of document.paperSpaces)
    for (const viewport of space.viewports ?? [])
      if (viewport.derivation) used.add(viewport.derivation.layerBase);
  return used;
}

function modelPlanBounds(sources: readonly CadSolviewSource[]): CadSolviewRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const source of sources)
    for (const vertex of source.body.vertices) {
      if (vertex.point.x < minX) minX = vertex.point.x;
      if (vertex.point.y < minY) minY = vertex.point.y;
      if (vertex.point.x > maxX) maxX = vertex.point.x;
      if (vertex.point.y > maxY) maxY = vertex.point.y;
    }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Dónde va la placa de la vista nueva: a la derecha de todo lo ocupado.
 *
 * «Todo lo ocupado» es la envolvente del modelo más las placas que ya existen.
 * Se lee del DOCUMENTO y no de un contador, para que ejecutar SOLVIEW dos veces
 * sobre el mismo documento coloque la placa en el mismo sitio — un contador de
 * sesión daría plantas distintas según el orden en que se abrieron las láminas.
 */
export function cadSolviewPlateOrigin(
  document: Pick<CadDocument, "paperSpaces">,
  modelBounds: CadSolviewRect | null,
  size: { width: number; height: number },
): CadPoint2 {
  const gap = Math.max(size.width, size.height) * PLATE_GAP_RATIO;
  let right = modelBounds ? modelBounds.x + modelBounds.width : 0;
  let bottom = modelBounds ? modelBounds.y : 0;
  for (const space of document.paperSpaces)
    for (const viewport of space.viewports ?? []) {
      if (!viewport.derivation) continue;
      const plate = viewport.modelBounds;
      right = Math.max(right, plate.x + plate.width);
      bottom = Math.min(bottom, plate.y);
    }
  return { x: right + gap, y: bottom };
}

export interface CadSolviewCreateInput {
  /**
   * Sólo se leen entidades y láminas. Se pide el mínimo y no el documento
   * entero para que un COMANDO pueda llamar a esto: el motor da `entity()` y
   * `paperSpaces()`, no un `CadDocument`, y exigirlo aquí habría obligado a
   * fabricar uno falso en la única ruta por la que el usuario teclea SOLVIEW.
   */
  document: Pick<CadDocument, "entities" | "paperSpaces">;
  space: CadPaperSpace;
  /** Id de la ventana nueva. Lo aporta el llamante para que sea determinista. */
  viewportId: string;
  /** Nombre de la vista: da nombre a la ventana y raíz a sus cuatro capas. */
  name: string;
  view: CadViewportView;
  /** Rectángulo en PAPEL, en milímetros. */
  paperBounds: { x: number; y: number; width: number; height: number };
  /** Escala 1:n. Sin ella se encaja el encuadre en el papel. */
  scale?: number;
  /**
   * Qué entidades del modelo definen el ENCUADRE. Sin filtro, todas.
   *
   * No es una lista congelada de fuentes: quien contribuye a la vista se
   * recalcula en cada comprobación de frescura. Esto sólo decide qué trozo del
   * edificio entra en la ventana, y por tanto qué ediciones la afectan.
   */
  sourceIds?: readonly string[];
  /**
   * Encuadre explícito, en coordenadas de la CÁMARA.
   *
   * Lo usa el detalle, que no encuadra «todo lo que se ve» sino un trozo de lo
   * que ya encuadra su padre. Sin él, el encuadre se calcula de `sourceIds`.
   */
  window?: CadSolviewRect;
  /** Vista de la que deriva un detalle, o la que orientó este alzado. */
  parentViewportId?: string;
}

export interface CadSolviewCreateResult {
  ok: true;
  viewport: CadPaperViewport;
  space: CadPaperSpace;
  /** Capas nuevas que hay que dar de alta. */
  layers: CadLayerDef[];
  /** Órdenes listas: las cuatro capas y la lámina, en un solo lote. */
  commands: CadEntityCommand[];
}

function fail(code: CadSolviewErrorCode, message: string): CadSolviewFailure {
  return { ok: false, code, message };
}

/**
 * Crea la ventana de una vista derivada y sus capas.
 *
 * Devuelve las órdenes juntas porque son una sola transacción: una lámina con
 * una ventana que apunta a capas que no existen, o cuatro capas huérfanas sin
 * ventana, son dos formas de dejar el documento a medias si algo falla entre
 * medias. Es el mismo criterio que ya aplica `createCadPolygonalViewport`.
 */
export function createCadSolView(
  input: CadSolviewCreateInput,
): CadSolviewCreateResult | CadSolviewFailure {
  const base = cadSolviewLayerBase(input.name);
  if (!base) return fail("nombre-repetido", "La vista necesita un nombre con letras o dígitos.");
  if (cadSolviewUsedBases(input.document).has(base))
    return fail(
      "nombre-repetido",
      `Ya hay una vista llamada «${base}»: sus capas ${base}-VIS y ${base}-HID colisionarían con las suyas.`,
    );

  const outcome = cadViewportViewFrame(input.view);
  if (!outcome.ok) return fail("camara-invalida", outcome.message);

  const filter = input.sourceIds ? new Set(input.sourceIds) : undefined;
  const all = cadSolviewSources(input.document);
  if (all.length === 0)
    return fail(
      "sin-modelo",
      "No hay muros ni sólidos de los que derivar una vista. Dibuja el modelo primero.",
    );
  const framing = filter ? all.filter((source) => filter.has(source.entityId)) : all;
  const window = input.window ?? cadSolviewWindow(framing, outcome.frame, input.view);
  if (!window)
    return fail(
      "vista-vacia",
      "Desde esa cámara no se ve nada del modelo: la vista quedaría en blanco.",
    );

  const plate = cadSolviewPlateOrigin(input.document, modelPlanBounds(all), window);
  const modelBounds = { x: plate.x, y: plate.y, width: window.width, height: window.height };
  const scale =
    input.scale ??
    nearestCadViewportScale(
      Math.max(
        window.width / Math.max(1, input.paperBounds.width),
        window.height / Math.max(1, input.paperBounds.height),
      ),
    );

  const viewport: CadPaperViewport = {
    ...createCadRectangularViewport({
      space: input.space,
      id: input.viewportId,
      name: input.name,
      paperBounds: input.paperBounds,
      modelBounds,
      scale,
      view: input.view,
    }),
    derivation: {
      layerBase: base,
      window: { ...window },
      status: "never-drawn",
      ...(input.parentViewportId ? { parentViewportId: input.parentViewportId } : {}),
    },
  };

  const layers: CadLayerDef[] = CAD_SOLVIEW_LAYER_SUFFIXES.map((suffix) => ({
    id: cadSolviewLayerName(base, suffix),
    name: cadSolviewLayerName(base, suffix),
    color: LAYER_COLORS[suffix],
    visible: true,
    locked: false,
    // El sombreado del corte y el perfil oculto se trazan; sólo se apagan por
    // ventana, que es como se separan las vistas entre sí.
    plot: true,
  }));

  let space: CadPaperSpace = {
    ...input.space,
    viewports: [...(input.space.viewports ?? []), viewport],
  };
  // Cada vista ve SUS capas y ninguna de las otras. Las placas ya están
  // separadas en el espacio, así que esto es cinturón y tirantes — pero es
  // barato y es la disciplina que hace que dos vistas en la misma lámina no se
  // contaminen el día que alguien mueva una placa a mano.
  const foreign: string[] = [];
  for (const other of space.viewports ?? [])
    if (other.derivation && other.derivation.layerBase !== base)
      foreign.push(...cadSolviewLayerNames(other.derivation.layerBase));
  if (foreign.length > 0) space = freezeCadLayerInViewport(space, viewport.id, foreign, true);
  const own = cadSolviewLayerNames(base);
  for (const other of space.viewports ?? [])
    if (other.id !== viewport.id) space = freezeCadLayerInViewport(space, other.id, own, true);

  const created = (space.viewports ?? []).find((v) => v.id === viewport.id) ?? viewport;
  return {
    ok: true,
    viewport: created,
    space,
    layers,
    commands: [
      ...layers.map((layer): CadEntityCommand => ({ type: "layer", op: "upsert", layer })),
      upsertCadLayoutCommand(space),
    ],
  };
}
