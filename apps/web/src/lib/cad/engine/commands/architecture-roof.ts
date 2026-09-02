/**
 * ROOF y SLAB: la cubierta y la losa paramétricas (Ola E, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 1º
 * ARCHITECTURE): no había techos ni cubiertas; un tejado se dibujaba a mano
 * en planta y no existía en 3D. Con STAIR, cierran la fila
 * `toolset-architecture.interiores` de la rúbrica.
 *
 * ## ROOF: cubierta sobre un RECTÁNGULO
 *
 * Se designa una polilínea cerrada de cuatro vértices en ángulo recto (la
 * que dibuja RECTANG, o el perímetro de los muros); cualquier otro contorno
 * se rechaza diciendo por qué. Con la pendiente en % (`Pendiente`, 30 por
 * defecto) y el alero (`Alero`, 600 mm), levanta:
 *
 *   - `Cuatro` aguas: cumbrera de longitud L − W a la altura `s · W/2`,
 *     cuatro limatesas de las esquinas del alero a sus extremos. Sobre un
 *     cuadrado la cumbrera es un punto y la cubierta, una pirámide.
 *   - `Dos` aguas: cumbrera de lado a lado, hastiales verticales.
 *   - `Una` agua: un solo faldón que sube `s · W` de un lado largo al otro.
 *
 * L y W son el rectángulo MÁS el alero por los cuatro lados; el lado largo
 * es siempre el de la cumbrera. La planta lleva el contorno del alero,
 * cumbrera y limatesas como LINE, y por faldón una flecha de pendiente con
 * su TEXT en %, que es como se rotula un plano de cubiertas. El sólido es
 * UN nodo `brep` (esquinas + cumbrera, caras explícitas): el volumen bajo
 * los faldones, macizo — no una losa inclinada con espesor —, cuyo volumen
 * es `h · W · ((L − W)/2 + W/3)` a cuatro aguas y `L · W · h / 2` a dos y a
 * una. La spec lo contrasta contra esas fórmulas.
 *
 * ## SLAB: losa por contorno cerrado
 *
 * Se designan uno o más contornos cerrados (polilínea, círculo, REGION...) y
 * un espesor (150 mm por defecto). La CARA SUPERIOR queda a la cota del
 * contorno —o a la tecleada con `Elevación`— y el espesor cuelga hacia
 * abajo, que es como se acota un forjado: el nivel es el del piso
 * terminado. UN nodo `extrude` por contorno; el contorno NO se borra (es el
 * perímetro de la planta, no un perfil de usar y tirar como en EXTRUDE).
 *
 * ## Lo que NO hacen, dicho aquí
 *
 *   - ROOF: ni cubiertas sobre polígonos que no sean rectángulos, ni con
 *     faldones de pendientes distintas, ni buhardillas, ni limahoyas.
 *   - SLAB: sin huecos tecleados (un contorno con agujeros entra como
 *     REGION con interiores), sin pendiente, sin cantos.
 *   - No hay entidad `roof` ni `slab` persistida: sería tocar el formato,
 *     decisión del titular. La receta viaja en el nombre del sólido.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolidNode } from "../../cad-entities-v5";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { planeFrameAt, profileFromEntity, type CadExtractedProfile } from "../../solid3d-profiles";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  cadCubicMetresLabel,
  cadFromMillimetres,
  cadMillimetresLabel,
  cadRingArea,
  cadSquareMetresLabel,
} from "./architecture-support";
import { finishedSolid, formatMagnitude, makeSolidEntity, selectedEntities, solidCancelled, solidMessage } from "./solids-support";

/** Pendiente por defecto, en %. */
export const CAD_ROOF_DEFAULT_SLOPE_PERCENT = 30;
/** Alero por defecto, en mm. */
export const CAD_ROOF_DEFAULT_OVERHANG_MM = 600;
/** Espesor de losa por defecto, en mm. */
export const CAD_SLAB_DEFAULT_THICKNESS_MM = 150;

export type CadRoofForm = "cuatro" | "dos" | "una";

const SLOPE = { keyword: "Pendiente", shortcut: "P" } as const;
const OVERHANG = { keyword: "Alero", shortcut: "A" } as const;
const HIP = { keyword: "Cuatro", shortcut: "C", label: "Cuatro aguas" } as const;
const GABLE = { keyword: "Dos", shortcut: "D", label: "Dos aguas" } as const;
const SHED = { keyword: "Una", shortcut: "U", label: "Un agua" } as const;
const ELEVATION = { keyword: "Elevación", shortcut: "E" } as const;
const ROOF_OPTIONS = [SLOPE, OVERHANG, HIP, GABLE, SHED] as const;

const FORM_LABEL: Record<CadRoofForm, string> = { cuatro: "a cuatro aguas", dos: "a dos aguas", una: "a un agua" };
const FALDONES: Record<CadRoofForm, number> = { cuatro: 4, dos: 2, una: 1 };

// ---------------------------------------------------------------------------
// El rectángulo designado
// ---------------------------------------------------------------------------

export interface CadRoofRectangle {
  center: CadPoint2;
  /** Unitario del lado LARGO (donde va la cumbrera). */
  along: CadPoint2;
  /** Perpendicular a la izquierda de `along`. */
  left: CadPoint2;
  halfLength: number;
  halfWidth: number;
  elevation: number;
  sourceId: string;
}

const RECT_TOLERANCE = 1e-6;

/** El rectángulo de una entidad, o el motivo por el que no lo es. */
export function cadRoofRectangle(entity: CadEntity): CadRoofRectangle | { refused: string } {
  const extracted = profileFromEntity(entity);
  if (!extracted)
    return { refused: `ROOF necesita un rectángulo: una polilínea CERRADA de cuatro vértices en ángulo recto; lo designado (${entity.type}) no encierra un área.` };
  const ring = extracted.profile.outer;
  if (ring.length !== 4)
    return { refused: `ROOF necesita un rectángulo de cuatro vértices; el contorno designado tiene ${ring.length}.` };
  const edges = ring.map((point, index) => {
    const next = ring[(index + 1) % 4];
    return { x: next.x - point.x, y: next.y - point.y };
  });
  const lengths = edges.map((edge) => Math.hypot(edge.x, edge.y));
  for (let index = 0; index < 4; index += 1) {
    const a = edges[index];
    const b = edges[(index + 1) % 4];
    if (Math.abs(a.x * b.x + a.y * b.y) > RECT_TOLERANCE * lengths[index] * lengths[(index + 1) % 4])
      return { refused: "ROOF necesita un rectángulo; el contorno designado no tiene los cuatro ángulos rectos." };
  }
  const longFirst = lengths[0] >= lengths[1];
  const long = longFirst ? edges[0] : edges[1];
  const longLength = longFirst ? lengths[0] : lengths[1];
  const along = { x: long.x / longLength, y: long.y / longLength };
  return {
    center: { x: ring.reduce((sum, point) => sum + point.x, 0) / 4, y: ring.reduce((sum, point) => sum + point.y, 0) / 4 },
    along,
    // El anillo viene antihorario, así que el lado siguiente cae a la izquierda.
    left: { x: -along.y, y: along.x },
    halfLength: longLength / 2,
    halfWidth: (longFirst ? lengths[1] : lengths[0]) / 2,
    elevation: extracted.elevation,
    sourceId: extracted.sourceId,
  };
}

// ---------------------------------------------------------------------------
// La geometría de la cubierta
// ---------------------------------------------------------------------------

export interface CadRoofRequest {
  form: CadRoofForm;
  slopePercent: number;
  overhang: number;
}

export interface CadRoofSlopeArrow {
  tail: CadPoint2;
  head: CadPoint2;
  /** Ángulo legible del rótulo, en grados. */
  degrees: number;
}

export interface CadRoofGeometry {
  /** Altura de la cumbrera (o del borde alto) sobre la cota del contorno. */
  ridgeHeight: number;
  /** L y W del alero, de fuera a fuera. */
  length: number;
  width: number;
  node: CadSolidNode;
  outline: CadPoint2[];
  /** Cumbrera y limatesas. */
  lines: [CadPoint2, CadPoint2][];
  arrows: CadRoofSlopeArrow[];
}

function readableDegrees(direction: CadPoint2): number {
  let degrees = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  if (degrees > 90 + 1e-9 || degrees <= -90 - 1e-9) degrees += degrees > 0 ? -180 : 180;
  return Math.abs(degrees) < 1e-9 ? 0 : degrees;
}

/** Una cubierta sobre el rectángulo con el alero, la pendiente y la forma dadas. */
export function cadRoofGeometry(rectangle: CadRoofRectangle, request: CadRoofRequest): CadRoofGeometry {
  const A = rectangle.halfLength + request.overhang;
  const B = rectangle.halfWidth + request.overhang;
  const slope = request.slopePercent / 100;
  const flat = (x: number, y: number): CadPoint2 => ({
    x: rectangle.center.x + rectangle.along.x * x + rectangle.left.x * y,
    y: rectangle.center.y + rectangle.along.y * x + rectangle.left.y * y,
  });
  const lift = (point: CadPoint2, z: number): CadPoint3 => ({ x: point.x, y: point.y, z: rectangle.elevation + z });
  const corners2 = [flat(-A, -B), flat(A, -B), flat(A, B), flat(-A, B)];
  const corners = corners2.map((corner) => lift(corner, 0));
  const arrow = (fromX: number, fromY: number, toX: number, toY: number): CadRoofSlopeArrow => {
    const tail = flat(fromX, fromY);
    const head = flat(toX, toY);
    return { tail, head, degrees: readableDegrees({ x: head.x - tail.x, y: head.y - tail.y }) };
  };
  const bottom = { outer: [3, 2, 1, 0] };
  if (request.form === "una") {
    const h = slope * 2 * B;
    const tops = [flat(A, B), flat(-A, B)].map((top) => lift(top, h));
    return {
      ridgeHeight: h,
      length: 2 * A,
      width: 2 * B,
      node: {
        id: "cubierta",
        op: "brep",
        points: [...corners, ...tops],
        // Bajo, faldón (sube de −B a +B), pared trasera, dos hastiales laterales.
        faces: [bottom, { outer: [0, 1, 4, 5] }, { outer: [2, 3, 5, 4] }, { outer: [1, 2, 4] }, { outer: [3, 0, 5] }],
      },
      outline: corners2,
      lines: [],
      arrows: [arrow(0, B * 0.4, 0, -B * 0.4)],
    };
  }
  const h = slope * B;
  const ridgeHalf = request.form === "dos" ? A : A - B;
  const arrows = [arrow(0, -B * 0.3, 0, -B * 0.8), arrow(0, B * 0.3, 0, B * 0.8)];
  if (request.form === "cuatro") {
    arrows.push(arrow(ridgeHalf + (A - ridgeHalf) * 0.3, 0, ridgeHalf + (A - ridgeHalf) * 0.8, 0));
    arrows.push(arrow(-ridgeHalf - (A - ridgeHalf) * 0.3, 0, -ridgeHalf - (A - ridgeHalf) * 0.8, 0));
  }
  if (ridgeHalf < 1e-9) {
    // Cuadrado a cuatro aguas: la cumbrera es un punto y el sólido, una pirámide.
    const apex = lift(flat(0, 0), h);
    return {
      ridgeHeight: h,
      length: 2 * A,
      width: 2 * B,
      node: { id: "cubierta", op: "brep", points: [...corners, apex], faces: [bottom, { outer: [0, 1, 4] }, { outer: [1, 2, 4] }, { outer: [2, 3, 4] }, { outer: [3, 0, 4] }] },
      outline: corners2,
      lines: corners2.map((corner): [CadPoint2, CadPoint2] => [corner, flat(0, 0)]),
      arrows,
    };
  }
  const ridge2: [CadPoint2, CadPoint2] = [flat(-ridgeHalf, 0), flat(ridgeHalf, 0)];
  const ridge = ridge2.map((end) => lift(end, h));
  const lines: [CadPoint2, CadPoint2][] = [ridge2];
  if (request.form === "cuatro")
    lines.push([corners2[0], ridge2[0]], [corners2[1], ridge2[1]], [corners2[2], ridge2[1]], [corners2[3], ridge2[0]]);
  return {
    ridgeHeight: h,
    length: 2 * A,
    width: 2 * B,
    node: {
      id: "cubierta",
      op: "brep",
      points: [...corners, ...ridge],
      // Bajo, faldón sur, hastial/faldón este, faldón norte, hastial/faldón oeste:
      // el mismo cosido que la pirámide (arista de la base en su sentido y arriba).
      faces: [bottom, { outer: [0, 1, 5, 4] }, { outer: [1, 2, 5] }, { outer: [2, 3, 4, 5] }, { outer: [3, 0, 4] }],
    },
    outline: corners2,
    lines,
    arrows,
  };
}

/** Volumen bajo los faldones, en papel: lo que la spec y MASSPROP deben coincidir en dar. */
export function cadRoofVolume(geometry: CadRoofGeometry, form: CadRoofForm): number {
  const { length: L, width: W, ridgeHeight: h } = geometry;
  return form === "cuatro" ? h * W * ((L - W) / 2 + W / 3) : (L * W * h) / 2;
}

// ---------------------------------------------------------------------------
// ROOF
// ---------------------------------------------------------------------------

interface RoofState {
  selection: readonly string[];
  form: CadRoofForm;
  slopePercent: number;
  overhang: number;
  pending: "none" | "slope" | "overhang";
}

function ask<S>(state: S, message: string, options: readonly { keyword: string; shortcut: string; label?: string }[], accepts: number, defaultValue?: string): CadCommandStep<S> {
  return { state, prompt: { message, options: [...options], ...(defaultValue ? { defaultValue } : {}) }, accepts };
}

function roofStep(state: RoofState, context: CadCommandContext): CadCommandStep<RoofState> {
  if (state.pending === "slope") return ask(state, "Precise la pendiente en %", [], CAD_ACCEPT_DISTANCE, String(state.slopePercent));
  if (state.pending === "overhang") return ask(state, "Precise el alero", [], CAD_ACCEPT_DISTANCE, String(state.overhang));
  const recipe = `Cubierta ${FORM_LABEL[state.form]}, pendiente ${formatMagnitude(state.slopePercent)} %, alero ${cadMillimetresLabel(state.overhang, context.unit)} mm.`;
  if (state.selection.length === 0)
    return ask(state, `${recipe} Designe el rectángulo de la cubierta`, ROOF_OPTIONS, CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD);
  return ask(state, `${recipe} Intro para construirla`, ROOF_OPTIONS, CAD_ACCEPT_KEYWORD);
}

function roofPlan(geometry: CadRoofGeometry, slopePercent: number, elevation: number, context: CadCommandContext): CadEntityCommand[] {
  const layer = context.activeLayer;
  const lift = (point: CadPoint2): CadPoint3 => ({ x: point.x, y: point.y, z: elevation });
  const textHeight = Math.min(geometry.length, geometry.width) * 0.05;
  const entities: CadNativeEntity[] = [
    { id: context.newEntityId(), type: "polyline", vertices: geometry.outline.map(lift), closed: true, layer },
    ...geometry.lines.map(([a, b]): CadNativeEntity => ({ id: context.newEntityId(), type: "line", start: lift(a), end: lift(b), layer })),
  ];
  for (const arrow of geometry.arrows) {
    const dx = arrow.head.x - arrow.tail.x;
    const dy = arrow.head.y - arrow.tail.y;
    const length = Math.hypot(dx, dy);
    const u = { x: dx / length, y: dy / length };
    const barb = length * 0.15;
    entities.push({ id: context.newEntityId(), type: "polyline", vertices: [arrow.tail, arrow.head].map(lift), closed: false, layer });
    entities.push({
      id: context.newEntityId(),
      type: "polyline",
      vertices: [
        { x: arrow.head.x - u.x * barb - u.y * barb * 0.5, y: arrow.head.y - u.y * barb + u.x * barb * 0.5 },
        arrow.head,
        { x: arrow.head.x - u.x * barb + u.y * barb * 0.5, y: arrow.head.y - u.y * barb - u.x * barb * 0.5 },
      ].map(lift),
      closed: false,
      layer,
    });
    // El rótulo va junto al medio de la flecha, a su izquierda, y se lee derecho.
    const middle = { x: (arrow.tail.x + arrow.head.x) / 2, y: (arrow.tail.y + arrow.head.y) / 2 };
    const offset = textHeight * 0.4;
    entities.push({
      id: context.newEntityId(),
      type: "text",
      x: middle.x - u.y * offset,
      y: middle.y + u.x * offset,
      text: `${formatMagnitude(slopePercent)} %`,
      height: textHeight,
      ...(Math.abs(arrow.degrees) > 1e-9 ? { rotation: arrow.degrees } : {}),
      layer,
    });
  }
  return entities.map((entity) => ({ type: "insert", entity }));
}

function finishRoof(state: RoofState, context: CadCommandContext): CadCommandStep<RoofState> {
  const entities = selectedEntities(context, state.selection);
  if (entities.length === 0) return solidMessage(state, "ROOF necesita un rectángulo designado.");
  if (entities.length > 1) return solidMessage(state, `ROOF necesita UN rectángulo; hay ${entities.length} objetos designados.`);
  const rectangle = cadRoofRectangle(entities[0]);
  if ("refused" in rectangle) return solidMessage(state, rectangle.refused);
  if (!(state.slopePercent > 1e-9)) return solidMessage(state, "ROOF necesita una pendiente mayor que cero.");
  const geometry = cadRoofGeometry(rectangle, { form: state.form, slopePercent: state.slopePercent, overhang: state.overhang });
  const mm = (value: number) => cadMillimetresLabel(value, context.unit);
  const solid = makeSolidEntity(
    context.newEntityId(),
    [geometry.node],
    "cubierta",
    context.activeLayer,
    `Cubierta ${FORM_LABEL[state.form]} ${formatMagnitude(state.slopePercent)} %`,
  );
  const notice =
    `ROOF: cubierta ${FORM_LABEL[state.form]} sobre ${mm(2 * rectangle.halfLength)} × ${mm(2 * rectangle.halfWidth)} mm con alero ${mm(state.overhang)} mm ` +
    `(${mm(geometry.length)} × ${mm(geometry.width)}), pendiente ${formatMagnitude(state.slopePercent)} %: ` +
    `${state.form === "una" ? "borde alto" : "cumbrera"} a +${mm(geometry.ridgeHeight)} mm sobre la cota ${mm(rectangle.elevation)}; ` +
    `${FALDONES[state.form]} ${FALDONES[state.form] === 1 ? "faldón" : "faldones"}, ${cadCubicMetresLabel(cadRoofVolume(geometry, state.form), context.unit)} m³ bajo cubierta.`;
  return finishedSolid(solid, { state, label: "ROOF", before: roofPlan(geometry, state.slopePercent, rectangle.elevation, context), notice });
}

function roofKeyword(state: RoofState, keyword: string, context: CadCommandContext): CadCommandStep<RoofState> {
  if (keyword === SLOPE.keyword) return roofStep({ ...state, pending: "slope" }, context);
  if (keyword === OVERHANG.keyword) return roofStep({ ...state, pending: "overhang" }, context);
  if (keyword === HIP.keyword) return roofStep({ ...state, form: "cuatro" }, context);
  if (keyword === GABLE.keyword) return roofStep({ ...state, form: "dos" }, context);
  if (keyword === SHED.keyword) return roofStep({ ...state, form: "una" }, context);
  return roofStep(state, context);
}

const roofCommand: CadCommandDescriptor<RoofState> = {
  name: "ROOF",
  aliases: ["ROOFADD", "CUBIERTA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    roofStep(
      { selection: context.selection, form: "cuatro", slopePercent: CAD_ROOF_DEFAULT_SLOPE_PERCENT, overhang: cadFromMillimetres(CAD_ROOF_DEFAULT_OVERHANG_MM, context.unit), pending: "none" },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (state.pending !== "none") {
      if (input.kind === "enter") return roofStep({ ...state, pending: "none" }, context);
      if (input.kind !== "distance") return roofStep(state, context);
      if (state.pending === "slope") {
        if (!(input.value > 1e-9)) return solidMessage(state, "ROOF necesita una pendiente mayor que cero.");
        return roofStep({ ...state, slopePercent: input.value, pending: "none" }, context);
      }
      if (input.value < 0) return solidMessage(state, "ROOF: el alero no puede ser negativo; sin alero, teclee 0.");
      return roofStep({ ...state, overhang: input.value, pending: "none" }, context);
    }
    if (input.kind === "keyword") return roofKeyword(state, input.keyword, context);
    if (input.kind === "selection") return roofStep({ ...state, selection: input.entityIds }, context);
    if (input.kind === "entityPick") return roofStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] }, context);
    if (input.kind === "enter") return finishRoof(state, context);
    return roofStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// SLAB
// ---------------------------------------------------------------------------

interface SlabState {
  selection: readonly string[];
  thickness: number;
  /** Cota de la cara superior tecleada; `null` = la del contorno. */
  elevation: number | null;
  pending: "none" | "elevation";
}

const NO_CONTOUR = "No hay ningún contorno cerrado entre lo designado. SLAB necesita polilíneas CERRADAS, círculos, elipses completas, splines cerradas o REGION.";

function slabStep(state: SlabState): CadCommandStep<SlabState> {
  if (state.pending === "elevation")
    return ask(state, "Precise la cota de la cara superior de la losa", [], CAD_ACCEPT_DISTANCE, state.elevation === null ? undefined : String(state.elevation));
  if (state.selection.length === 0)
    return ask(state, "Designe el contorno cerrado de la losa", [], CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK);
  return ask(state, "Precise el espesor de la losa", [ELEVATION], CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD, String(state.thickness));
}

/** Los perfiles cerrados de la designación. */
function slabProfiles(context: CadCommandContext, ids: readonly string[]): CadExtractedProfile[] {
  const profiles: CadExtractedProfile[] = [];
  for (const entity of selectedEntities(context, ids)) {
    const extracted = profileFromEntity(entity);
    if (extracted) profiles.push(extracted);
  }
  return profiles;
}

function finishSlab(state: SlabState, thickness: number, context: CadCommandContext): CadCommandStep<SlabState> {
  if (!(thickness > 1e-9)) return solidMessage(state, "SLAB necesita un espesor mayor que cero.");
  const profiles = slabProfiles(context, state.selection);
  if (profiles.length === 0) return solidMessage(state, NO_CONTOUR);
  const commands: CadEntityCommand[] = [];
  let area = 0;
  const name = `Losa ${cadMillimetresLabel(thickness, context.unit)} mm`;
  for (const extracted of profiles) {
    const top = state.elevation ?? extracted.elevation;
    const node: CadSolidNode = { id: "losa", op: "extrude", profile: extracted.profile, height: thickness, frame: planeFrameAt(top - thickness) };
    const finished = finishedSolid(makeSolidEntity(context.newEntityId(), [node], "losa", context.activeLayer, name), { state, label: "SLAB" });
    // Un contorno que no da sólido aborta la orden entera, como en EXTRUDE.
    if (finished.result?.kind !== "document") return finished;
    commands.push(...finished.result.commands);
    area += Math.abs(cadRingArea(extracted.profile.outer)) - (extracted.profile.inners ?? []).reduce((sum, ring) => sum + Math.abs(cadRingArea(ring)), 0);
  }
  const top = state.elevation ?? profiles[0].elevation;
  const notice =
    `SLAB: ${profiles.length === 1 ? "losa" : `${profiles.length} losas`} de ${cadMillimetresLabel(thickness, context.unit)} mm sobre ${cadSquareMetresLabel(area, context.unit)} m², ` +
    `cara superior a la cota ${cadMillimetresLabel(top, context.unit)}; ${cadCubicMetresLabel(area * thickness, context.unit)} m³.`;
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands, label: "SLAB", notice } };
}

const slabCommand: CadCommandDescriptor<SlabState> = {
  name: "SLAB",
  aliases: ["SLABADD", "LOSA"],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    slabStep({ selection: context.selection, thickness: cadFromMillimetres(CAD_SLAB_DEFAULT_THICKNESS_MM, context.unit), elevation: null, pending: "none" }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidCancelled(state);
    if (state.pending === "elevation") {
      if (input.kind === "enter") return slabStep({ ...state, pending: "none" });
      if (input.kind !== "distance") return slabStep(state);
      return slabStep({ ...state, elevation: input.value, pending: "none" });
    }
    if (input.kind === "selection") return slabStep({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick") return slabStep({ ...state, selection: [...new Set([...state.selection, input.entityId])] });
    if (state.selection.length === 0) {
      if (input.kind === "enter") return solidMessage(state, "SLAB necesita al menos un contorno cerrado designado.");
      return slabStep(state);
    }
    if (input.kind === "keyword" && input.keyword === ELEVATION.keyword) return slabStep({ ...state, pending: "elevation" });
    if (input.kind === "enter") return finishSlab(state, state.thickness, context);
    if (input.kind === "distance") return finishSlab(state, Math.abs(input.value), context);
    return slabStep(state);
  },
};

export const CAD_ARCHITECTURE_ROOF_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(roofCommand), asCadCommand(slabCommand)];
