/**
 * PLINE completa: tramos rectos, tramos de ARCO y GROSOR.
 *
 * Sale de `draw-basics.ts` porque deja de ser un caso trivial. Hasta ahora
 * trazaba segmentos rectos y nada más — y eso no era una carencia del modelo:
 * el `bulge` existe en `CadEntity` desde el primer día, los adaptadores lo
 * teselan, los bounds lo tienen en cuenta y la exportación lo escribe. Lo que
 * faltaba era la PUERTA: no había forma de que un usuario creara uno.
 *
 * ## La aritmética del arco, que es donde esto se rompe
 *
 * `bulge = tan(θ/4)`, con θ el ángulo incluido y el signo diciendo hacia qué
 * lado de la cuerda se comba. La regla que lo conecta con el dibujo es el
 * ángulo tangente-cuerda: en un arco de ángulo incluido θ, la cuerda forma θ/2
 * con la tangente en CADA extremo. De ahí salen las dos fórmulas que usa este
 * archivo, y no hay una tercera:
 *
 *     θ            = 2 · (ángulo de la cuerda − tangente de ENTRADA)
 *     tangente_fin = ángulo de la cuerda + θ/2
 *
 * La continuidad —que es lo que hace que PLINE en modo Arco se sienta como en
 * AutoCAD— es sencillamente usar la tangente de salida del tramo anterior como
 * tangente de entrada del siguiente. Si en vez de eso se toma la dirección de
 * la CUERDA anterior, el resultado sigue siendo una polilínea válida y con la
 * misma silueta aproximada, pero los arcos dejan de empalmar suavemente: se ve
 * un pico en cada unión y no hay ningún error por ninguna parte.
 *
 * θ se normaliza a (−180°, 180°]. Sin normalizar, `tan(θ/4)` se dispara al
 * acercarse θ a ±360° y un arco casi cerrado sale con un bulge enorme.
 *
 * ## El grosor
 *
 * `Ancho` y `Media-anchura` fijan el grosor de los tramos que se dibujen A
 * PARTIR de ese momento, como en AutoCAD: los ya trazados no cambian. Un
 * grosor de cero se deja AUSENTE en vez de escribirse: en el modelo canónico
 * la ausencia significa «traza fina», y materializar ceros ensancharía el
 * serializado de toda polilínea que no use la opción.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const CLOSE = { keyword: "Cerrar", shortcut: "C" } as const;
const UNDO = { keyword: "desHacer", shortcut: "H" } as const;
const ARC = { keyword: "Arco", shortcut: "A" } as const;
const LINE = { keyword: "Línea", shortcut: "L" } as const;
const WIDTH = { keyword: "Ancho", shortcut: "N" } as const;
const HALFWIDTH = { keyword: "Media-anchura", shortcut: "M" } as const;
const LENGTH = { keyword: "Longitud", shortcut: "T" } as const;
const ANGLE = { keyword: "Ángulo", shortcut: "G" } as const;

/** Vértice en construcción. `bulge` describe el tramo que ARRANCA aquí. */
interface DraftVertex {
  point: CadPoint2;
  bulge: number;
  startWidth: number;
  endWidth: number;
}

/** Qué número espera el paso actual, cuando espera un número y no un punto. */
type PlinePending =
  | "none"
  | "width-start"
  | "width-end"
  | "halfwidth-start"
  | "halfwidth-end"
  | "arc-angle"
  | "length";

interface PlineState {
  vertices: DraftVertex[];
  mode: "line" | "arc";
  /** Grosor que se aplicará a los PRÓXIMOS tramos. */
  startWidth: number;
  endWidth: number;
  pending: PlinePending;
  /** Primer número ya recibido de un par ancho-inicial/ancho-final. */
  pendingWidthStart: number;
  /** Ángulo incluido fijado para el próximo tramo de arco, en grados. */
  arcAngleDeg: number | null;
}

function initialState(): PlineState {
  return {
    vertices: [],
    mode: "line",
    startWidth: 0,
    endWidth: 0,
    pending: "none",
    pendingWidthStart: 0,
    arcAngleDeg: null,
  };
}

/**
 * Radianes en `[−π, π]`, AMBOS extremos incluidos.
 *
 * El intervalo es cerrado a propósito. Media vuelta exacta puede ser +180° o
 * −180° y NO son el mismo arco: uno comba a un lado de la cuerda y el otro al
 * contrario. Plegar −π sobre +π —que es lo que hace la normalización habitual a
 * (−π, π]— invierte el arco justo en el caso más frecuente: seguir recto y
 * cerrar con un semicírculo. Sale una polilínea válida, cerrada, con el arco
 * del lado equivocado y sin un solo error por ningún sitio.
 */
function normalizeSigned(radians: number): number {
  const twoPi = Math.PI * 2;
  let value = radians % twoPi;
  if (value < -Math.PI) value += twoPi;
  if (value > Math.PI) value -= twoPi;
  return value;
}

function chordAngle(from: CadPoint2, to: CadPoint2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Tangente de SALIDA del último tramo trazado, en radianes.
 *
 * `null` cuando todavía no hay ningún tramo: el primer arco de una polilínea no
 * tiene nada a lo que empalmar. En ese caso el llamador usa 0 rad, que es el
 * mismo valor por defecto que aplica AutoCAD cuando no hay dirección previa.
 */
function outgoingTangent(vertices: readonly DraftVertex[]): number | null {
  if (vertices.length < 2) return null;
  const start = vertices[vertices.length - 2];
  const end = vertices[vertices.length - 1];
  return chordAngle(start.point, end.point) + 2 * Math.atan(start.bulge);
}

/** `bulge` del tramo que va del último vértice a `target`, con continuidad. */
function continuityBulge(state: PlineState, target: CadPoint2): number {
  const last = state.vertices[state.vertices.length - 1];
  if (!last) return 0;
  if (state.arcAngleDeg !== null) {
    const theta = normalizeSigned((state.arcAngleDeg * Math.PI) / 180);
    return Math.tan(theta / 4);
  }
  const incoming = outgoingTangent(state.vertices) ?? 0;
  const theta = normalizeSigned(2 * (chordAngle(last.point, target) - incoming));
  return Math.tan(theta / 4);
}

function pushVertex(state: PlineState, target: CadPoint2): PlineState {
  const bulge = state.mode === "arc" ? continuityBulge(state, target) : 0;
  const vertices = state.vertices.map((vertex, index) =>
    index === state.vertices.length - 1
      ? { ...vertex, bulge, startWidth: state.startWidth, endWidth: state.endWidth }
      : vertex,
  );
  vertices.push({ point: target, bulge: 0, startWidth: state.startWidth, endWidth: state.endWidth });
  return { ...state, vertices, arcAngleDeg: null, pending: "none" };
}

function polylineEntity(
  state: PlineState,
  closed: boolean,
  context: CadCommandContext,
): CadNativeEntity {
  const count = state.vertices.length;
  return {
    id: context.newEntityId(),
    type: "polyline",
    vertices: state.vertices.map((vertex, index) => ({
      x: vertex.point.x,
      y: vertex.point.y,
      z: 0,
      // El último vértice de una polilínea ABIERTA no arranca ningún tramo, así
      // que no lleva ni bulge ni grosor: escribírselos sería describir un tramo
      // que no existe.
      ...(vertex.bulge !== 0 && (closed || index < count - 1) ? { bulge: vertex.bulge } : {}),
      ...(vertex.startWidth > 0 && (closed || index < count - 1)
        ? { startWidth: vertex.startWidth }
        : {}),
      ...(vertex.endWidth > 0 && (closed || index < count - 1)
        ? { endWidth: vertex.endWidth }
        : {}),
    })),
    closed,
    layer: context.activeLayer,
  };
}

function finish(
  state: PlineState,
  closed: boolean,
  context: CadCommandContext,
): CadCommandStep<PlineState> {
  // Cerrar el tramo final necesita su propio bulge cuando se cierra en modo
  // arco: si no, el cierre saldría recto y la silueta no coincidiría con la
  // previsualización que el usuario estaba viendo.
  const prepared =
    closed && state.mode === "arc" && state.vertices.length >= 3
      ? {
          ...state,
          vertices: state.vertices.map((vertex, index) =>
            index === state.vertices.length - 1
              ? { ...vertex, bulge: continuityBulge(state, state.vertices[0].point) }
              : vertex,
          ),
        }
      : state;
  const enough = closed ? prepared.vertices.length >= 3 : prepared.vertices.length >= 2;
  return {
    state: prepared,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: enough
      ? {
          kind: "document",
          commands: [{ type: "insert", entity: polylineEntity(prepared, closed, context) }],
          label: "PLINE",
        }
      : { kind: "none" },
  };
}

function numberPrompt(state: PlineState): CadCommandStep<PlineState> {
  const messages: Record<Exclude<PlinePending, "none">, string> = {
    "width-start": "Precise el ancho inicial",
    "width-end": "Precise el ancho final",
    "halfwidth-start": "Precise la media-anchura inicial",
    "halfwidth-end": "Precise la media-anchura final",
    "arc-angle": "Precise el ángulo incluido",
    length: "Precise la longitud del segmento",
  };
  const pending = state.pending as Exclude<PlinePending, "none">;
  return {
    state,
    prompt: {
      message: messages[pending],
      options: [],
      defaultValue:
        pending === "width-end"
          ? String(state.pendingWidthStart)
          : pending === "halfwidth-end"
            ? String(state.pendingWidthStart / 2)
            : undefined,
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

function plineStep(state: PlineState, context: CadCommandContext): CadCommandStep<PlineState> {
  if (state.pending !== "none") return numberPrompt(state);
  if (state.vertices.length === 0)
    return {
      state,
      prompt: { message: "Precise el punto inicial", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  const options = [
    state.mode === "arc" ? LINE : ARC,
    ...(state.mode === "arc" ? [ANGLE] : [LENGTH]),
    HALFWIDTH,
    WIDTH,
    ...(state.vertices.length >= 2 ? [CLOSE] : []),
    UNDO,
  ];
  const outline = state.vertices.map((vertex) => vertex.point);
  return {
    state,
    prompt: {
      message: state.mode === "arc" ? "Precise el extremo del arco" : "Precise el punto siguiente",
      options,
    },
    // Igual que LINE: un número suelto es entrada directa sobre la dirección
    // del cursor y de eso se encarga el pipeline, así que no se declara
    // `CAD_ACCEPT_DISTANCE` aquí — se la comería antes de que llegue.
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: [{ points: context.cursor ? [...outline, context.cursor] : outline }],
  };
}

/** Continúa recto en la dirección del último tramo, a la distancia dada. */
function extendByLength(state: PlineState, length: number): CadPoint2 | null {
  const last = state.vertices[state.vertices.length - 1];
  if (!last) return null;
  const direction = outgoingTangent(state.vertices);
  if (direction === null) return null;
  return {
    x: last.point.x + Math.cos(direction) * length,
    y: last.point.y + Math.sin(direction) * length,
  };
}

const plineCommand: CadCommandDescriptor<PlineState> = {
  name: "PLINE",
  aliases: ["PL"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => plineStep(initialState(), context),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") {
      // Enter dentro de una pregunta de grosor acepta el valor propuesto; fuera
      // de ella termina la polilínea, como en AutoCAD.
      if (state.pending === "width-end")
        return plineStep(
          { ...state, startWidth: state.pendingWidthStart, endWidth: state.pendingWidthStart, pending: "none" },
          context,
        );
      if (state.pending === "halfwidth-end")
        return plineStep(
          { ...state, startWidth: state.pendingWidthStart, endWidth: state.pendingWidthStart, pending: "none" },
          context,
        );
      if (state.pending !== "none") return plineStep({ ...state, pending: "none" }, context);
      return finish(state, false, context);
    }

    if (input.kind === "keyword") {
      if (input.keyword === CLOSE.keyword) return finish(state, true, context);
      if (input.keyword === ARC.keyword) return plineStep({ ...state, mode: "arc" }, context);
      if (input.keyword === LINE.keyword)
        return plineStep({ ...state, mode: "line", arcAngleDeg: null }, context);
      if (input.keyword === WIDTH.keyword) return plineStep({ ...state, pending: "width-start" }, context);
      if (input.keyword === HALFWIDTH.keyword)
        return plineStep({ ...state, pending: "halfwidth-start" }, context);
      if (input.keyword === LENGTH.keyword) return plineStep({ ...state, pending: "length" }, context);
      if (input.keyword === ANGLE.keyword) return plineStep({ ...state, pending: "arc-angle" }, context);
      if (input.keyword === UNDO.keyword) {
        const vertices = state.vertices.slice(0, -1);
        return plineStep({ ...state, vertices, pending: "none" }, context);
      }
      return plineStep(state, context);
    }

    if (input.kind === "angle" && state.pending === "arc-angle")
      return plineStep({ ...state, arcAngleDeg: input.degrees, pending: "none" }, context);

    if (input.kind === "distance") {
      const value = input.value;
      if (state.pending === "width-start")
        return plineStep({ ...state, pendingWidthStart: Math.abs(value), pending: "width-end" }, context);
      if (state.pending === "width-end")
        return plineStep(
          { ...state, startWidth: state.pendingWidthStart, endWidth: Math.abs(value), pending: "none" },
          context,
        );
      // Media-anchura es la MITAD del grosor: es la distancia del eje al borde.
      // Confundirla con el ancho dibuja el doble de grueso de lo pedido, que es
      // el error silencioso clásico de esta opción.
      if (state.pending === "halfwidth-start")
        return plineStep(
          { ...state, pendingWidthStart: Math.abs(value) * 2, pending: "halfwidth-end" },
          context,
        );
      if (state.pending === "halfwidth-end")
        return plineStep(
          { ...state, startWidth: state.pendingWidthStart, endWidth: Math.abs(value) * 2, pending: "none" },
          context,
        );
      if (state.pending === "arc-angle")
        return plineStep({ ...state, arcAngleDeg: value, pending: "none" }, context);
      if (state.pending === "length") {
        const target = extendByLength(state, value);
        return target
          ? plineStep(pushVertex(state, target), context)
          : plineStep({ ...state, pending: "none" }, context);
      }
      return plineStep(state, context);
    }

    if (input.kind !== "point") return plineStep(state, context);
    const last = state.vertices[state.vertices.length - 1];
    // Un clic repetido en el mismo sitio no debe crear un tramo de longitud
    // cero: rompe normales, offset, OSNAP y el propio DXF.
    if (last && Math.hypot(input.point.x - last.point.x, input.point.y - last.point.y) < 1e-9)
      return plineStep(state, context);
    if (!last)
      return plineStep(
        {
          ...state,
          vertices: [{ point: input.point, bulge: 0, startWidth: state.startWidth, endWidth: state.endWidth }],
        },
        context,
      );
    return plineStep(pushVertex(state, input.point), context);
  },
};

export const CAD_DRAW_PLINE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(plineCommand)];

export const __testables = { continuityBulge, normalizeSigned, outgoingTangent };
