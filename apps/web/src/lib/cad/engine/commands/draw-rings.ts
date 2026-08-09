/**
 * DONUT y REVCLOUD — dos órdenes que son polilíneas con `bulge`, no entidades
 * nuevas.
 *
 * ## DONUT es literalmente una polilínea de DOS vértices
 *
 * La representación de AutoCAD no es «dos circunferencias concéntricas»: es una
 * LWPOLYLINE cerrada con dos vértices diametralmente opuestos, `bulge = 1` en
 * los dos (media vuelta cada uno) y grosor constante `(exterior − interior)/2`.
 * El eje de esa polilínea es la circunferencia de radio medio.
 *
 * Esa forma es la que hace que un donut se COMPORTE como un donut: se rellena
 * solo, PEDIT le cambia el grosor y OFFSET lo desplaza como una unidad. Dos
 * circunferencias sueltas darían el mismo dibujo y ninguna de las tres cosas —
 * y es justo el atajo que este archivo NO toma. Por eso DONUT no existía: sin
 * grosor por tramo en el modelo no había forma de expresarlo, y ese grosor lo
 * estrena el esquema 4.
 *
 * ## REVCLOUD es una polilínea de arcos hacia FUERA
 *
 * Cada lado del contorno se subdivide en festones de la CUERDA pedida —así
 * define AutoCAD el parámetro, «arc chord length»— y todos comban hacia el
 * mismo lado. El signo de ese bulge es lo único que separa una nube de revisión
 * de una cadena de mordiscos hacia dentro: el dibujo sale cerrado y plausible
 * en los dos casos, y sólo uno significa «revísese esto».
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

// ---------------------------------------------------------------------------
// DONUT
// ---------------------------------------------------------------------------

interface DonutState {
  inside: number | null;
  outside: number | null;
  /** Cuántos donuts se han colocado: la orden se repite hasta Enter. */
  placed: number;
  commands: { type: "insert"; entity: CadNativeEntity }[];
}

/**
 * Donut canónico: polilínea CERRADA de dos vértices opuestos sobre la
 * circunferencia media, `bulge = 1` (media vuelta) y grosor constante.
 */
export function donutEntity(
  id: string,
  center: CadPoint2,
  inside: number,
  outside: number,
  layer: string,
): CadNativeEntity {
  const outer = Math.max(inside, outside);
  const inner = Math.min(inside, outside);
  const middle = (outer + inner) / 4;
  const width = (outer - inner) / 2;
  return {
    id,
    type: "polyline",
    vertices: [
      { x: center.x - middle, y: center.y, z: 0, bulge: 1, startWidth: width, endWidth: width },
      { x: center.x + middle, y: center.y, z: 0, bulge: 1, startWidth: width, endWidth: width },
    ],
    closed: true,
    layer,
  };
}

function donutStep(state: DonutState, context: CadCommandContext): CadCommandStep<DonutState> {
  if (state.inside === null)
    return {
      state,
      prompt: { message: "Precise el diámetro interior del donut", options: [], defaultValue: "0.5" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.outside === null)
    return {
      state,
      prompt: { message: "Precise el diámetro exterior del donut", options: [], defaultValue: "1" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: { message: "Precise el centro del donut", options: [] },
    accepts: CAD_ACCEPT_POINT,
    preview: context.cursor ? [{ points: [context.cursor], closed: false }] : [],
  };
}

function donutFinish(state: DonutState): CadCommandStep<DonutState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: state.commands.length
      ? { kind: "document", commands: state.commands, label: "DONUT" }
      : { kind: "none" },
  };
}

const donutCommand: CadCommandDescriptor<DonutState> = {
  name: "DONUT",
  aliases: ["DO", "DONUTS"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => donutStep({ inside: null, outside: null, placed: 0, commands: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return donutFinish(state);
    // Enter con los diámetros ya fijados TERMINA la orden emitiendo todo lo
    // colocado en UN lote: N donuts, un solo paso de deshacer.
    if (input.kind === "enter") {
      if (state.inside === null) return donutStep({ ...state, inside: 0.5 }, context);
      if (state.outside === null) return donutStep({ ...state, outside: 1 }, context);
      return donutFinish(state);
    }
    if (input.kind === "distance") {
      if (state.inside === null) return donutStep({ ...state, inside: Math.abs(input.value) }, context);
      if (state.outside === null) return donutStep({ ...state, outside: Math.abs(input.value) }, context);
      return donutStep(state, context);
    }
    if (input.kind !== "point") return donutStep(state, context);
    // Un donut de diámetro exterior nulo no es geometría. Se rechaza en vez de
    // escribir una polilínea de longitud cero que rompería OSNAP y el DXF.
    if (!(Math.max(state.inside!, state.outside!) > 1e-9)) return donutFinish(state);
    return donutStep(
      {
        ...state,
        placed: state.placed + 1,
        commands: [
          ...state.commands,
          {
            type: "insert",
            entity: donutEntity(
              context.newEntityId(),
              input.point,
              state.inside!,
              state.outside!,
              context.activeLayer,
            ),
          },
        ],
      },
      context,
    );
  },
};

// ---------------------------------------------------------------------------
// REVCLOUD
// ---------------------------------------------------------------------------

const REVCLOUD_ARC = { keyword: "Arco", shortcut: "A" } as const;
const REVCLOUD_STYLE = { keyword: "Estilo", shortcut: "E" } as const;
const REVCLOUD_RECTANGULAR = { keyword: "Rectangular", shortcut: "R" } as const;

type RevcloudPending = "none" | "arc-length" | "style";

interface RevcloudState {
  arcLength: number;
  points: CadPoint2[];
  rectangular: boolean;
  calligraphy: boolean;
  pending: RevcloudPending;
}

/** Longitud de cuerda por defecto de cada festón, en unidades de dibujo. */
const DEFAULT_ARC_LENGTH = 500;

/**
 * Curvatura de cada festón: `bulge = 0,5`.
 *
 * El parámetro que pide la orden es la **cuerda** de cada arco —así lo define
 * AutoCAD, «arc chord length»—, no su longitud recorrida. La curvatura es
 * aparte, y aquí se fija: `flecha = (cuerda/2) · bulge`, así que con 0,5 cada
 * festón sobresale un CUARTO de su cuerda. Es la proporción del festón clásico
 * de AutoCAD (θ = 4·arctan(0,5) ≈ 106°).
 *
 * Se fija en vez de derivarla de la longitud de arco porque, subdividiendo cada
 * lado en tramos de la cuerda pedida, la longitud recorrida y la cuerda
 * coincidirían y el «arco» saldría RECTO: una nube de revisión que es un
 * rectángulo. Es el resultado que se obtiene al confundir los dos parámetros, y
 * se dibuja sin un solo error.
 */
export const REVCLOUD_BULGE = 0.5;

/**
 * Contorno de la nube: cada lado se subdivide en festones de la cuerda pedida y
 * todos comban hacia el MISMO lado del recorrido.
 */
export function revcloudVertices(
  outline: readonly CadPoint2[],
  chordLength: number,
): (CadPoint2 & { bulge: number })[] {
  const vertices: (CadPoint2 & { bulge: number })[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const from = outline[index];
    const to = outline[(index + 1) % outline.length];
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (span < 1e-9) continue;
    // Al menos un festón por lado: un lado más corto que la cuerda pedida sigue
    // teniendo que ondularse, o la nube tendría lados rectos.
    const steps = Math.max(1, Math.round(span / chordLength));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      vertices.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        bulge: REVCLOUD_BULGE,
      });
    }
  }
  return vertices;
}

/** Orientación del recorrido; decide hacia qué lado comban los arcos. */
function isCounterClockwise(points: readonly CadPoint2[]): boolean {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total > 0;
}

function revcloudFinish(
  state: RevcloudState,
  outline: readonly CadPoint2[],
  context: CadCommandContext,
): CadCommandStep<RevcloudState> {
  const vertices = revcloudVertices(outline, state.arcLength);
  // Hacia FUERA: en un recorrido antihorario un bulge POSITIVO comba hacia el
  // interior, así que se niega. Es la única línea que separa una nube de
  // revisión de una cadena de mordiscos, y las dos se dibujan igual de bien.
  const outward = isCounterClockwise(outline) ? -1 : 1;
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: vertices.length >= 3
      ? {
          kind: "document",
          commands: [
            {
              type: "insert",
              entity: {
                id: context.newEntityId(),
                type: "polyline",
                vertices: vertices.map((vertex) => ({
                  x: vertex.x,
                  y: vertex.y,
                  z: 0,
                  bulge: vertex.bulge * outward,
                  // El estilo caligráfico de AutoCAD engorda el trazo hacia el
                  // final de cada arco; se expresa con el grosor por tramo que
                  // estrena el esquema 4.
                  ...(state.calligraphy
                    ? { startWidth: 0, endWidth: state.arcLength * 0.06 }
                    : {}),
                })),
                closed: true,
                layer: context.activeLayer,
              },
            },
          ],
          label: "REVCLOUD",
        }
      : { kind: "none" },
  };
}

function revcloudStep(state: RevcloudState, context: CadCommandContext): CadCommandStep<RevcloudState> {
  if (state.pending === "arc-length")
    return {
      state,
      prompt: {
        message: "Precise la longitud de cuerda de cada arco",
        options: [],
        defaultValue: String(DEFAULT_ARC_LENGTH),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.pending === "style")
    return {
      state,
      prompt: {
        message: "Precise el estilo de la nube",
        options: [
          { keyword: "Normal", shortcut: "N" },
          { keyword: "Caligrafía", shortcut: "C" },
        ],
        defaultOption: "Normal",
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.points.length === 0)
    return {
      state,
      prompt: {
        message: "Precise la primera esquina de la nube",
        options: [REVCLOUD_ARC, REVCLOUD_STYLE, REVCLOUD_RECTANGULAR],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message: state.rectangular ? "Precise la esquina opuesta" : "Precise el punto siguiente",
      options: state.rectangular ? [] : [{ keyword: "Cerrar", shortcut: "C" }],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: [{ points: context.cursor ? [...state.points, context.cursor] : state.points }],
  };
}

const revcloudCommand: CadCommandDescriptor<RevcloudState> = {
  name: "REVCLOUD",
  aliases: ["REVC"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    revcloudStep(
      { arcLength: DEFAULT_ARC_LENGTH, points: [], rectangular: true, calligraphy: false, pending: "none" },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") {
      if (state.pending === "arc-length") return revcloudStep({ ...state, pending: "none" }, context);
      if (state.pending === "style")
        return revcloudStep({ ...state, calligraphy: false, pending: "none" }, context);
      if (!state.rectangular && state.points.length >= 3)
        return revcloudFinish(state, state.points, context);
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    }

    if (input.kind === "keyword") {
      if (input.keyword === REVCLOUD_ARC.keyword)
        return revcloudStep({ ...state, pending: "arc-length" }, context);
      if (input.keyword === REVCLOUD_STYLE.keyword)
        return revcloudStep({ ...state, pending: "style" }, context);
      if (input.keyword === "Caligrafía")
        return revcloudStep({ ...state, calligraphy: true, pending: "none" }, context);
      if (input.keyword === "Normal")
        return revcloudStep({ ...state, calligraphy: false, pending: "none" }, context);
      if (input.keyword === REVCLOUD_RECTANGULAR.keyword)
        return revcloudStep({ ...state, rectangular: true, pending: "none" }, context);
      if (input.keyword === "Cerrar" && state.points.length >= 3)
        return revcloudFinish(state, state.points, context);
      return revcloudStep(state, context);
    }

    if (input.kind === "distance" && state.pending === "arc-length")
      return revcloudStep(
        { ...state, arcLength: Math.max(1e-6, Math.abs(input.value)), pending: "none" },
        context,
      );

    if (input.kind !== "point") return revcloudStep(state, context);
    if (state.points.length === 0)
      return revcloudStep({ ...state, points: [input.point] }, context);
    if (!state.rectangular) {
      const last = state.points[state.points.length - 1];
      if (Math.hypot(input.point.x - last.x, input.point.y - last.y) < 1e-9)
        return revcloudStep(state, context);
      return revcloudStep({ ...state, points: [...state.points, input.point] }, context);
    }
    const [first] = state.points;
    if (Math.abs(input.point.x - first.x) < 1e-9 || Math.abs(input.point.y - first.y) < 1e-9)
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    return revcloudFinish(
      state,
      [
        first,
        { x: input.point.x, y: first.y },
        input.point,
        { x: first.x, y: input.point.y },
      ],
      context,
    );
  },
};

export const CAD_DRAW_RING_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(donutCommand),
  asCadCommand(revcloudCommand),
];
