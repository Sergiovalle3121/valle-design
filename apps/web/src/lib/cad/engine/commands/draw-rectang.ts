/**
 * RECTANG con sus opciones: Chaflán, Elevación, Empalme, Grosor, Ancho, Área,
 * Dimensiones y Rotación.
 *
 * Sale de `draw-basics.ts`, donde era literalmente «dos esquinas y una
 * polilínea de cuatro vértices». Las opciones no son adorno: un rectángulo con
 * las esquinas redondeadas es la planta de casi cualquier mesa, bancada o
 * armario, y hoy había que dibujarlo con RECTANG + FILLET × 4.
 *
 * ## Todo se construye en un marco LOCAL
 *
 * Las esquinas se calculan en el sistema del propio rectángulo —origen en la
 * primera esquina, eje X en la dirección de `Rotación`— y se llevan al plano al
 * final. Así la rotación no obliga a duplicar la aritmética de chaflanes,
 * empalmes y áreas: sigue siendo un rectángulo recto hasta el último paso.
 *
 * ## Empalme: el signo del bulge
 *
 * Cada esquina redondeada es un arco de 90°, así que `|bulge| = tan(22,5°)`.
 * El SIGNO depende de la orientación del recorrido: un rectángulo recorrido en
 * antihorario gira a la izquierda en cada esquina y sus arcos barren +90°;
 * recorrido en horario, −90°. Como el usuario designa las dos esquinas en
 * cualquier orden, la orientación se deduce del área con signo (`w·h`) en vez
 * de suponerse. Con el signo equivocado las esquinas salen ABOMBADAS hacia
 * fuera: la silueta sigue siendo cerrada y plausible, y es exactamente lo
 * contrario de un empalme.
 *
 * ## Grosor (`Thickness`), dicho claramente
 *
 * `Grosor` en AutoCAD es la EXTRUSIÓN en Z, y el modelo canónico no tiene
 * campo para ella: es un CAD 2D. En vez de fingir que la opción no existe o de
 * aceptarla y perderla en silencio, se guarda en `context.metadata.thickness`,
 * que sobrevive al guardado y a la reapertura. Lo que NO hace es extruir nada
 * ni exportarse como grupo 39 de DXF — eso llegará con el soporte 3D, si llega.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const CHAMFER = { keyword: "Chaflán", shortcut: "C" } as const;
const ELEVATION = { keyword: "Elevación", shortcut: "E" } as const;
const FILLET = { keyword: "Empalme", shortcut: "F" } as const;
const THICKNESS = { keyword: "Grosor", shortcut: "G" } as const;
const WIDTH = { keyword: "Ancho", shortcut: "N" } as const;
const AREA = { keyword: "Área", shortcut: "A" } as const;
const DIMENSIONS = { keyword: "Dimensiones", shortcut: "D" } as const;
const ROTATION = { keyword: "Rotación", shortcut: "R" } as const;
const BY_LENGTH = { keyword: "Longitud", shortcut: "L" } as const;
const BY_WIDTH = { keyword: "Anchura", shortcut: "W" } as const;

/** Arco de 90°: `bulge = tan(θ/4)` con θ = 90°. */
const QUARTER_TURN_BULGE = Math.tan(Math.PI / 8);

type RectPending =
  | "none"
  | "chamfer-first"
  | "chamfer-second"
  | "fillet"
  | "elevation"
  | "thickness"
  | "width"
  | "rotation"
  | "area-value"
  | "area-basis"
  | "dimension-length"
  | "dimension-width";

interface RectangState {
  first: CadPoint2 | null;
  chamfer: { first: number; second: number } | null;
  fillet: number;
  elevation: number;
  thickness: number;
  width: number;
  rotationDeg: number;
  dimensions: { length: number; width: number } | null;
  area: number | null;
  areaBasis: "length" | "width";
  pending: RectPending;
  pendingNumber: number;
}

function initialState(): RectangState {
  return {
    first: null,
    chamfer: null,
    fillet: 0,
    elevation: 0,
    thickness: 0,
    width: 0,
    rotationDeg: 0,
    dimensions: null,
    area: null,
    areaBasis: "length",
    pending: "none",
    pendingNumber: 0,
  };
}

interface LocalVertex {
  x: number;
  y: number;
  bulge?: number;
}

/**
 * Las esquinas en el marco LOCAL, ya con chaflán o empalme aplicados.
 *
 * Devuelve `null` cuando el rectángulo es degenerado o cuando el chaflán o el
 * empalme no caben en los lados: un chaflán mayor que el lado no produce «un
 * rectángulo un poco raro», produce un polígono con los lados cruzados.
 */
function localVertices(
  state: RectangState,
  w: number,
  h: number,
): { vertices: LocalVertex[]; error?: string } | null {
  if (Math.abs(w) < 1e-9 || Math.abs(h) < 1e-9) return null;
  const corners: CadPoint2[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const counterClockwise = w * h > 0;

  if (state.fillet > 0) {
    const radius = state.fillet;
    if (radius * 2 > Math.abs(w) + 1e-9 || radius * 2 > Math.abs(h) + 1e-9)
      return {
        vertices: [],
        error: `Un empalme de radio ${radius} no cabe en un rectángulo de ${Math.abs(w)} × ${Math.abs(h)}.`,
      };
    const bulge = counterClockwise ? QUARTER_TURN_BULGE : -QUARTER_TURN_BULGE;
    const dx = Math.sign(w) * radius;
    const dy = Math.sign(h) * radius;
    return {
      vertices: [
        { x: dx, y: 0 },
        { x: w - dx, y: 0, bulge },
        { x: w, y: dy },
        { x: w, y: h - dy, bulge },
        { x: w - dx, y: h },
        { x: dx, y: h, bulge },
        { x: 0, y: h - dy },
        { x: 0, y: dy, bulge },
      ],
      // El último tramo (del octavo vértice al primero) es el cuarto empalme:
      // su bulge vive en el vértice de arranque, que es el octavo.
    };
  }

  if (state.chamfer) {
    const { first, second } = state.chamfer;
    if (first + second > Math.abs(w) + 1e-9 || first + second > Math.abs(h) + 1e-9)
      return {
        vertices: [],
        error: `Un chaflán de ${first} × ${second} no cabe en un rectángulo de ${Math.abs(w)} × ${Math.abs(h)}.`,
      };
    // El primer valor recorta el lado por el que se LLEGA a la esquina y el
    // segundo el lado por el que se SALE, que es lo que hace AutoCAD y lo que
    // permite un chaflán asimétrico.
    const ax = Math.sign(w) * first;
    const bx = Math.sign(w) * second;
    const ay = Math.sign(h) * first;
    const by = Math.sign(h) * second;
    return {
      vertices: [
        { x: bx, y: 0 },
        { x: w - ax, y: 0 },
        { x: w, y: by },
        { x: w, y: h - ay },
        { x: w - bx, y: h },
        { x: ax, y: h },
        { x: 0, y: h - by },
        { x: 0, y: ay },
      ],
    };
  }

  return { vertices: corners };
}

/**
 * Área que los chaflanes o los empalmes RESTAN al rectángulo completo.
 *
 * Hace falta para que la opción `Área` diga la verdad: si se ignorase, pedir
 * 10 m² con las esquinas redondeadas daría un rectángulo de 10 m² menos los
 * cuatro trozos que se le quitan — es decir, menos de lo pedido.
 */
function cornerAreaLoss(state: RectangState): number {
  if (state.fillet > 0) return state.fillet * state.fillet * (4 - Math.PI);
  if (state.chamfer) return 2 * state.chamfer.first * state.chamfer.second;
  return 0;
}

function rectangleEntity(
  state: RectangState,
  w: number,
  h: number,
  context: CadCommandContext,
): { entity?: CadNativeEntity; error?: string } {
  const local = localVertices(state, w, h);
  // Esquinas alineadas: sin este mensaje, RECTANG terminaba en silencio
  // absoluto — ni rectángulo ni explicación — que es un no-op mudo de los que
  // el gate de integridad persigue.
  if (!local)
    return {
      error:
        "Las dos esquinas quedaron alineadas: el rectángulo saldría sin ancho o sin alto. Precise una esquina opuesta que no esté sobre la primera.",
    };
  if (local.error) return { error: local.error };
  const first = state.first!;
  const radians = (state.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "polyline",
    vertices: local.vertices.map((vertex) => ({
      x: first.x + vertex.x * cos - vertex.y * sin,
      y: first.y + vertex.x * sin + vertex.y * cos,
      z: state.elevation,
      ...(vertex.bulge !== undefined ? { bulge: vertex.bulge } : {}),
      ...(state.width > 0 ? { startWidth: state.width, endWidth: state.width } : {}),
    })),
    closed: true,
    layer: context.activeLayer,
  };
  return {
    entity: state.thickness > 0
      ? { ...entity, context: { metadata: { thickness: state.thickness } } }
      : entity,
  };
}

function finish(
  state: RectangState,
  w: number,
  h: number,
  context: CadCommandContext,
): CadCommandStep<RectangState> {
  const built = rectangleEntity(state, w, h, context);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: built.error
      ? { kind: "message", text: built.error }
      : built.entity
        ? { kind: "document", commands: [{ type: "insert", entity: built.entity }], label: "RECTANG" }
        : { kind: "none" },
  };
}

const NUMBER_PROMPTS: Record<Exclude<RectPending, "none" | "area-basis">, string> = {
  "chamfer-first": "Precise la primera distancia de chaflán",
  "chamfer-second": "Precise la segunda distancia de chaflán",
  fillet: "Precise el radio de empalme",
  elevation: "Precise la elevación",
  thickness: "Precise el grosor",
  width: "Precise el ancho de línea",
  rotation: "Precise el ángulo de rotación",
  "area-value": "Precise el área del rectángulo",
  "dimension-length": "Precise la longitud del rectángulo",
  "dimension-width": "Precise la anchura del rectángulo",
};

function rectangStep(state: RectangState, context: CadCommandContext): CadCommandStep<RectangState> {
  if (state.pending === "area-basis")
    return {
      state,
      prompt: {
        message: "Calcule las dimensiones a partir de",
        options: [BY_LENGTH, BY_WIDTH],
        defaultOption: BY_LENGTH.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.pending !== "none")
    return {
      state,
      prompt: { message: NUMBER_PROMPTS[state.pending], options: [] },
      accepts: state.pending === "rotation"
        ? CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE
        : CAD_ACCEPT_DISTANCE,
    };
  if (!state.first)
    return {
      state,
      prompt: {
        message: "Precise la primera esquina",
        options: [CHAMFER, ELEVATION, FILLET, THICKNESS, WIDTH],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message: state.dimensions
        ? "Precise la esquina opuesta para elegir el cuadrante"
        : "Precise la esquina opuesta",
      options: [AREA, DIMENSIONS, ROTATION],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    // La previsualización se construye con la MISMA función que emite la
    // entidad, así que lo que el usuario ve bajo el cursor —chaflanes,
    // empalmes, rotación— es exactamente lo que se va a dibujar. Una
    // previsualización aproximada convierte cada opción en una sorpresa.
    preview: rectanglePreview(state, context.cursor),
  };
}

function rectanglePreview(
  state: RectangState,
  cursor: CadPoint2 | undefined,
): { points: CadPoint2[]; closed: boolean }[] {
  if (!state.first || !cursor) return [];
  const { w, h } = localSize(state, cursor);
  const local = localVertices(state, w, h);
  if (!local || local.error) return [];
  const radians = (state.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    {
      points: local.vertices.map((vertex) => ({
        x: state.first!.x + vertex.x * cos - vertex.y * sin,
        y: state.first!.y + vertex.x * sin + vertex.y * cos,
      })),
      closed: true,
    },
  ];
}

/** Componentes del vector primera→segunda esquina en el marco del rectángulo. */
function localSize(state: RectangState, opposite: CadPoint2): { w: number; h: number } {
  const first = state.first!;
  const radians = (-state.rotationDeg * Math.PI) / 180;
  const dx = opposite.x - first.x;
  const dy = opposite.y - first.y;
  return {
    w: dx * Math.cos(radians) - dy * Math.sin(radians),
    h: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

const rectangCommand: CadCommandDescriptor<RectangState> = {
  name: "RECTANG",
  aliases: ["REC", "RECTANGLE"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => rectangStep(initialState(), context),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") {
      if (state.pending === "area-basis")
        return rectangStep({ ...state, areaBasis: "length", pending: "dimension-length" }, context);
      if (state.pending !== "none") return rectangStep({ ...state, pending: "none" }, context);
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    }

    if (input.kind === "keyword") {
      if (input.keyword === CHAMFER.keyword)
        return rectangStep({ ...state, fillet: 0, pending: "chamfer-first" }, context);
      if (input.keyword === FILLET.keyword)
        return rectangStep({ ...state, chamfer: null, pending: "fillet" }, context);
      if (input.keyword === ELEVATION.keyword)
        return rectangStep({ ...state, pending: "elevation" }, context);
      if (input.keyword === THICKNESS.keyword)
        return rectangStep({ ...state, pending: "thickness" }, context);
      if (input.keyword === WIDTH.keyword) return rectangStep({ ...state, pending: "width" }, context);
      if (input.keyword === ROTATION.keyword)
        return rectangStep({ ...state, pending: "rotation" }, context);
      if (input.keyword === AREA.keyword) return rectangStep({ ...state, pending: "area-value" }, context);
      if (input.keyword === DIMENSIONS.keyword)
        return rectangStep({ ...state, pending: "dimension-length" }, context);
      if (state.pending === "area-basis" && input.keyword === BY_LENGTH.keyword)
        return rectangStep({ ...state, areaBasis: "length", pending: "dimension-length" }, context);
      if (state.pending === "area-basis" && input.keyword === BY_WIDTH.keyword)
        return rectangStep({ ...state, areaBasis: "width", pending: "dimension-width" }, context);
      return rectangStep(state, context);
    }

    if (input.kind === "angle" && state.pending === "rotation")
      return rectangStep({ ...state, rotationDeg: input.degrees, pending: "none" }, context);

    if (input.kind === "distance") {
      const value = input.value;
      if (state.pending === "chamfer-first")
        return rectangStep({ ...state, pendingNumber: Math.abs(value), pending: "chamfer-second" }, context);
      if (state.pending === "chamfer-second")
        return rectangStep(
          {
            ...state,
            chamfer: { first: state.pendingNumber, second: Math.abs(value) },
            pending: "none",
          },
          context,
        );
      if (state.pending === "fillet")
        return rectangStep({ ...state, fillet: Math.abs(value), pending: "none" }, context);
      if (state.pending === "elevation")
        return rectangStep({ ...state, elevation: value, pending: "none" }, context);
      if (state.pending === "thickness")
        return rectangStep({ ...state, thickness: Math.abs(value), pending: "none" }, context);
      if (state.pending === "width")
        return rectangStep({ ...state, width: Math.abs(value), pending: "none" }, context);
      if (state.pending === "rotation")
        return rectangStep({ ...state, rotationDeg: value, pending: "none" }, context);
      if (state.pending === "area-value")
        return rectangStep({ ...state, area: Math.abs(value), pending: "area-basis" }, context);

      if (state.pending === "dimension-length" || state.pending === "dimension-width") {
        const known = Math.abs(value);
        if (!(known > 1e-9)) return rectangStep({ ...state, pending: "none" }, context);
        if (state.area !== null) {
          // Área: la dimensión que falta sale de la conocida, sumando lo que
          // los chaflanes o empalmes le quitan al rectángulo completo.
          const other = (state.area + cornerAreaLoss(state)) / known;
          const size = state.pending === "dimension-length"
            ? { w: known, h: other }
            : { w: other, h: known };
          return finish({ ...state, pending: "none" }, size.w, size.h, context);
        }
        if (state.pending === "dimension-length")
          return rectangStep(
            { ...state, pendingNumber: known, pending: "dimension-width" },
            context,
          );
        return rectangStep(
          {
            ...state,
            dimensions: { length: state.pendingNumber, width: known },
            pending: "none",
          },
          context,
        );
      }
      return rectangStep(state, context);
    }

    if (input.kind !== "point") return rectangStep(state, context);
    if (!state.first) return rectangStep({ ...state, first: input.point }, context);
    if (state.dimensions) {
      // Con Dimensiones ya fijadas, el punto sólo elige el CUADRANTE: hacia
      // dónde crece el rectángulo desde la primera esquina.
      const local = localSize(state, input.point);
      return finish(
        state,
        Math.sign(local.w || 1) * state.dimensions.length,
        Math.sign(local.h || 1) * state.dimensions.width,
        context,
      );
    }
    const { w, h } = localSize(state, input.point);
    return finish(state, w, h, context);
  },
};

export const CAD_DRAW_RECTANG_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(rectangCommand),
];

export const __testables = { cornerAreaLoss, localVertices, QUARTER_TURN_BULGE };
