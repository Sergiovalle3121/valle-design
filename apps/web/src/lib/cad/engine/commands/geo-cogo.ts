/**
 * COGO y CUADROCONSTRUCCION: del cuaderno de campo a la lámina que se
 * protocoliza (Ola I, 3er entregable, 2026-09-04).
 *
 * Medido antes (`distancia-autocad-completo-20260903.md`, §4 3º MAP 3D): no
 * existía ningún COGO en los doscientos archivos de `engine/commands/`, y el
 * cuadro de construcción —las siete columnas que el Registro Público de la
 * Propiedad lee: `EST · PV · RUMBO · DISTANCIA · V · X · Y` y la superficie—
 * se tecleaba a mano en una tabla vacía. AutoCAD sin Civil 3D tampoco lo hace.
 *
 * Dos órdenes con un solo módulo de cuentas detrás (`lib/cad/geo-cogo.ts`):
 *
 *   - **COGO** dibuja la POLILÍNEA a partir de los rumbos y distancias
 *     tecleados, o pegados en bloque con un tramo por renglón. Enseña el plan
 *     —cada lado, el perímetro, la superficie por Gauss, el error de cierre y
 *     su precisión 1:N— y sólo escribe al confirmar, igual que MAPIMPORT y
 *     VECTORIZE. **No cierra la poligonal a la fuerza**: el último vértice
 *     queda donde las cuentas lo dejan y el cierre se DECLARA. Cerrarla es
 *     una decisión del topógrafo, y cuando la toma se hace por la regla del
 *     compás y se dice cuánto se movió cada vértice.
 *   - **CUADROCONSTRUCCION** designa una polilínea cerrada y emite una entidad
 *     TABLE canónica con esas siete columnas y el renglón de superficie. Si el
 *     dibujo está georreferenciado (marcador de la capa GEO, Ola G), las
 *     columnas X e Y son el ESTE y el NORTE de verdad —vía
 *     `cadGeoreferenceWorld`— y no coordenadas locales disfrazadas de UTM.
 *
 * ## Las distancias se leen en METROS
 *
 * Un cuadro de construcción viene en metros y el dibujo suele estar en
 * milímetros. Si «25.40» se leyera en unidades del documento, un cuadro
 * pegado levantaría un predio de diez centímetros sin que nada avisara. Así
 * que COGO lee metros, lo DICE en el prompt y en el plan, y `Unidades` cambia
 * a las del documento para quien dibuja en pies o en unidades sin sistema.
 *
 * ## Todavía no, dicho en el propio aviso
 *
 * Las distancias son las del DIBUJO: no se aplica el factor de escala de la
 * proyección (0,9996 en el meridiano central de una zona UTM) ni la reducción
 * al nivel del mar. Una poligonal medida con cinta y una calculada sobre la
 * cuadrícula no miden lo mismo, y el cuadro dice cuál de las dos publica.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadTableCell, CadTextAnchor } from "../../cad-entities-v4";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_CONSTRUCTION_TABLE_HEADER,
  cadCompensateTraverse,
  cadConstructionTable,
  cadFormatBearing,
  cadFormatPrecision,
  cadParseCourses,
  cadTraverse,
  type CadConstructionTable,
  type CadCourse,
  type CadTraverseResult,
} from "../../geo-cogo";
import { cadGeoreferenceOf, cadGeoreferenceWorld, cadUnitsPerMetre, type CadGeoreference } from "../../georeference";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";

const YES = { keyword: "Sí", shortcut: "S" } as const;
const NO = { keyword: "No", shortcut: "N" } as const;
const UNDO = { keyword: "Deshacer", shortcut: "D" } as const;
const FINISH = { keyword: "Terminar", shortcut: "T" } as const;
const COMPENSATE = { keyword: "Compensar", shortcut: "C" } as const;
const UNITS = { keyword: "Unidades", shortcut: "U" } as const;
const HEIGHT = { keyword: "Altura", shortcut: "A" } as const;
const REVERSE = { keyword: "Invertir", shortcut: "I" } as const;

/** Lo que el cuadro no promete, y va escrito en los dos avisos. */
const NOT_YET_GRID =
  "Todavía no: las distancias son las del dibujo — no se aplica el factor de escala de la proyección ni la reducción al nivel del mar.";

function stop<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancel<S>(state: S): CadCommandStep<S> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

/** Tres decimales, que es el milímetro de un levantamiento. */
function metres(value: number): string {
  return value.toFixed(3);
}

// ---------------------------------------------------------------------------
// COGO
// ---------------------------------------------------------------------------

export interface CadCogoPlan {
  traverse: CadTraverseResult;
  /** Unidades de dibujo por metro: lo que traduce el plan a metros. */
  unitsPerMetre: number;
  lines: string[];
  notice: string;
}

interface CogoState {
  phase: "start" | "courses" | "confirm";
  start: CadPoint2 | null;
  courses: CadCourse[];
  /** ¿Las distancias vienen en metros? De fábrica sí: un cuadro viene así. */
  metres: boolean;
  /** Lo último que no se entendió, para decirlo en el prompt sin cortar la orden. */
  complaint: string;
  plan: CadCogoPlan | null;
}

const COGO_EMPTY: CogoState = { phase: "start", start: null, courses: [], metres: true, complaint: "", plan: null };

/**
 * El plan de COGO: la poligonal levantada, con todo en unidades de dibujo y
 * todo lo que se lee en metros.
 *
 * Las cuentas van en unidades del DOCUMENTO —los vértices se van a escribir
 * así— y el informe en metros, que es como se lee un levantamiento. Tener las
 * dos escalas en un solo sitio es lo que evita que la superficie salga en
 * milímetros cuadrados.
 */
export function planCadCogo(start: CadPoint2, courses: readonly CadCourse[], context: CadCommandContext, readAsMetres: boolean): CadCogoPlan {
  const unitsPerMetre = cadUnitsPerMetre(context.unit);
  const scale = readAsMetres ? unitsPerMetre : 1;
  const scaled = courses.map((course) => ({ ...course, distance: course.distance * scale }));
  const traverse = cadTraverse(start, scaled);
  const unit = context.unit ?? "mm";
  const toMetres = (value: number) => value / unitsPerMetre;
  const closureMillimetres = toMetres(traverse.closure.distance) * 1000;
  const lines = [
    `Poligonal de ${scaled.length} lado(s) desde (${Math.round(start.x)}, ${Math.round(start.y)}):`,
    ...scaled.map((course, index) => `  · ${index + 1}-${((index + 1) % scaled.length) + 1}  ${cadFormatBearing(course.bearing)}  ${metres(toMetres(course.distance))} m`),
    `  · perímetro ${metres(toMetres(traverse.perimeter))} m; superficie ${traverse.area === null ? "—" : (toMetres(toMetres(traverse.area))).toFixed(2)} m² (Gauss)`,
    `  · cierre ${closureMillimetres.toFixed(3)} mm${traverse.closure.bearing ? ` en rumbo ${cadFormatBearing(traverse.closure.bearing)}` : ""}; precisión ${cadFormatPrecision(traverse.closure.precision)}`,
    `  · recorrido en sentido ${traverse.orientation === "cw" ? "horario" : "antihorario"}; la poligonal NO se cierra a la fuerza (Compensar la cierra por la regla del compás)`,
    readAsMetres
      ? `  · las distancias se leyeron en METROS: 1 m = ${unitsPerMetre} ${unit} del dibujo`
      : `  · las distancias se leyeron en unidades del dibujo (${unit})`,
    `  · ${NOT_YET_GRID}`,
  ];
  const notice =
    `COGO: poligonal de ${scaled.length} lado(s), perímetro ${metres(toMetres(traverse.perimeter))} m y superficie ` +
    `${traverse.area === null ? "—" : toMetres(toMetres(traverse.area)).toFixed(2)} m². Cierre ${closureMillimetres.toFixed(3)} mm, precisión ` +
    `${cadFormatPrecision(traverse.closure.precision)}. ${NOT_YET_GRID}`;
  return { traverse, unitsPerMetre, lines, notice };
}

function cogoVertices(points: readonly CadPoint2[]): { x: number; y: number; z: number }[] {
  return points.map((point) => ({ x: point.x, y: point.y, z: 0 }));
}

function cogoAsk(state: CogoState, context: CadCommandContext): CadCommandStep<CogoState> {
  if (state.phase === "start")
    return {
      state,
      prompt: {
        message: `Precise la estación 1 de la poligonal (las distancias se leen en ${state.metres ? "metros" : `unidades del dibujo (${context.unit ?? "mm"})`})`,
        options: [UNITS],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  if (state.phase === "courses") {
    const next = state.courses.length + 1;
    const complaint = state.complaint ? `${state.complaint}\n` : "";
    return {
      state,
      prompt: {
        message: `${complaint}Tramo ${next}: teclee rumbo y distancia («N 45°30'20" E 25.40»), o pegue el cuadro completo con un tramo por renglón`,
        options: state.courses.length > 0 ? [UNDO, FINISH] : [UNITS, FINISH],
        ...(state.courses.length >= 2 ? { defaultOption: FINISH.keyword } : {}),
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
    };
  }
  const plan = state.plan!;
  return {
    state,
    prompt: { message: `${plan.lines.join("\n")}\n¿Dibujar la poligonal?`, options: [YES, NO, COMPENSATE], defaultOption: YES.keyword },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/** Escribe la poligonal tal y como salió: abierta, con su cierre declarado. */
function cogoDraw(state: CogoState, context: CadCommandContext): CadCommandStep<CogoState> {
  const plan = state.plan!;
  const traverse = plan.traverse;
  const toMetres = (value: number) => value / plan.unitsPerMetre;
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "polyline",
    vertices: cogoVertices(traverse.points),
    closed: false,
    layer: context.activeLayer,
    context: {
      metadata: {
        origen: "COGO",
        tramos: traverse.courses.length,
        cierre_m: Number(toMetres(traverse.closure.distance).toFixed(6)),
        precision: cadFormatPrecision(traverse.closure.precision),
        superficie_m2: traverse.area === null ? null : Number(toMetres(toMetres(traverse.area)).toFixed(3)),
        compensada: false,
      },
    },
  } as CadNativeEntity;
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [{ type: "insert", entity }], label: "COGO", notice: plan.notice },
  };
}

/** Escribe la poligonal COMPENSADA: cierra exacto, y se dice cuánto se movió. */
function cogoCompensate(state: CogoState, context: CadCommandContext): CadCommandStep<CogoState> {
  const plan = state.plan!;
  const compensated = cadCompensateTraverse(plan.traverse);
  if (!compensated)
    return stop(state, "COGO: hacen falta al menos tres lados para compensar por la regla del compás; con dos no hay figura que cerrar.");
  const toMetres = (value: number) => value / plan.unitsPerMetre;
  const shiftMillimetres = toMetres(compensated.maxShift) * 1000;
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "polyline",
    vertices: cogoVertices(compensated.stations),
    closed: true,
    layer: context.activeLayer,
    context: {
      metadata: {
        origen: "COGO",
        tramos: compensated.courses.length,
        cierre_m: 0,
        precision: cadFormatPrecision(plan.traverse.closure.precision),
        superficie_m2: Number(toMetres(toMetres(compensated.area)).toFixed(3)),
        compensada: true,
        desplazamiento_max_mm: Number(shiftMillimetres.toFixed(3)),
      },
    },
  } as CadNativeEntity;
  const notice =
    `COGO: poligonal de ${compensated.courses.length} lado(s) COMPENSADA por la regla del compás; cierra exacto. ` +
    `El error de ${(toMetres(plan.traverse.closure.distance) * 1000).toFixed(3)} mm (precisión ${cadFormatPrecision(plan.traverse.closure.precision)}) se repartió ` +
    `en proporción a la longitud de cada lado: el vértice que más se movió lo hizo ${shiftMillimetres.toFixed(3)} mm. ` +
    `Superficie ${toMetres(toMetres(compensated.area)).toFixed(2)} m², perímetro ${metres(toMetres(compensated.perimeter))} m. ${NOT_YET_GRID}`;
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [{ type: "insert", entity }], label: "COGO", notice },
  };
}

/** Lee lo tecleado o lo pegado. Un renglón que no se entiende NO se descarta. */
function cogoRead(state: CogoState, text: string): CogoState {
  const block = cadParseCourses(text);
  if (block.errors.length > 0) {
    const detail = block.errors.map((error) => `  · renglón ${error.line}: ${error.reason}`).join("\n");
    return { ...state, complaint: `COGO no entendió ${block.errors.length} renglón(es) y NO los va a dibujar:\n${detail}`, courses: [...state.courses, ...block.courses] };
  }
  if (block.courses.length === 0) return { ...state, complaint: "COGO: no hay ningún tramo en lo que se pegó." };
  return { ...state, complaint: "", courses: [...state.courses, ...block.courses] };
}

const cogoCommand: CadCommandDescriptor<CogoState> = {
  name: "COGO",
  aliases: ["POLIGONAL", "RUMBOS", "MAPCOGO"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => cogoAsk(COGO_EMPTY, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancel(state);
    if (state.phase === "start") {
      if (input.kind === "keyword" && input.keyword === UNITS.keyword) return cogoAsk({ ...state, metres: !state.metres }, context);
      if (input.kind !== "point") return cogoAsk(state, context);
      return cogoAsk({ ...state, phase: "courses", start: input.point }, context);
    }
    if (state.phase === "courses") {
      if (input.kind === "text") return cogoAsk(cogoRead(state, input.value), context);
      if (input.kind === "keyword" && input.keyword === UNITS.keyword && state.courses.length === 0)
        return cogoAsk({ ...state, metres: !state.metres }, context);
      if (input.kind === "keyword" && input.keyword === UNDO.keyword)
        return cogoAsk({ ...state, complaint: "", courses: state.courses.slice(0, -1) }, context);
      const finishing = input.kind === "enter" || (input.kind === "keyword" && input.keyword === FINISH.keyword);
      if (!finishing) return cogoAsk(state, context);
      if (state.courses.length === 0) return stop(state, "COGO: no se tecleó ningún tramo, así que no hay poligonal que dibujar.");
      if (state.complaint)
        return stop(state, `${state.complaint}\nCOGO: corrija esos renglones y vuelva a pegarlos. Dibujar una poligonal a la que le falta un lado la cierra sola y con la superficie equivocada.`);
      return cogoAsk({ ...state, phase: "confirm", plan: planCadCogo(state.start!, state.courses, context, state.metres) }, context);
    }
    if (input.kind !== "keyword") return input.kind === "enter" ? cogoDraw(state, context) : cogoAsk(state, context);
    if (input.keyword === NO.keyword) return stop(state, "COGO: no se dibujó nada.");
    if (input.keyword === COMPENSATE.keyword) return cogoCompensate(state, context);
    return cogoDraw(state, context);
  },
};

// ---------------------------------------------------------------------------
// CUADROCONSTRUCCION
// ---------------------------------------------------------------------------

/** Ancho de cada columna en alturas de texto, en el orden del encabezado. */
const COLUMN_FACTORS: readonly number[] = [4, 4, 18, 10, 4, 14, 14];
/** Altura de fila en alturas de texto. Dos deja el texto respirado, como TABLE. */
const ROW_FACTOR = 2;

export interface CadCuadroPlan {
  table: CadConstructionTable;
  /** Los vértices en metros, ya en el sistema en que se publican. */
  coordinates: CadPoint2[];
  georeference: CadGeoreference | null;
  /** Por qué las coordenadas son las que son. Va en el plan y en el aviso. */
  source: string;
  textHeight: number;
  lines: string[];
  notice: string;
  commands: CadEntityCommand[];
}

interface CuadroState {
  phase: "target" | "insertion" | "confirm" | "height";
  ring: CadPoint2[];
  entityId: string;
  insertion: CadPoint2 | null;
  textHeight: number;
  reversed: boolean;
  plan: CadCuadroPlan | null;
}

/** El anillo de una polilínea cerrada, o el motivo por el que no sirve. */
export function cadCuadroRing(entity: CadEntity | undefined, entityId: string): { ring: CadPoint2[] } | { reason: string } {
  if (!entity) return { reason: `${entityId} ya no existe.` };
  if (entity.type !== "polyline")
    return { reason: `se designó ${entity.type.toUpperCase()}; el cuadro de construcción describe un predio, y eso es una POLILÍNEA cerrada.` };
  const vertices = entity.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
  if (vertices.length < 3) return { reason: `la polilínea tiene ${vertices.length} vértice(s): un predio necesita tres o más.` };
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  const doubled = Math.hypot(last.x - first.x, last.y - first.y) < 1e-9;
  // Una polilínea que vuelve al primer vértice ES cerrada aunque no lleve la
  // marca: es como la deja COGO sin compensar y como llega de un shapefile.
  if (!entity.closed && !doubled)
    return {
      reason:
        "la polilínea designada no está cerrada, y un lindero abierto no encierra superficie. Ciérrela (Cerrar de PLINE, o Compensar de COGO) y repita.",
    };
  if (entity.vertices.some((vertex) => typeof vertex.bulge === "number" && Math.abs(vertex.bulge) > 1e-12))
    return {
      reason:
        "la polilínea trae tramos en ARCO (bulge), y un cuadro de construcción publica rumbos y distancias de lados RECTOS. Todavía no se emiten lados curvos con su radio y su desarrollo.",
    };
  return { ring: doubled ? vertices.slice(0, -1) : vertices };
}

/** El plan del cuadro: la tabla escrita, la entidad lista y por qué X e Y son eso. */
export function planCadCuadro(ring: readonly CadPoint2[], insertion: CadPoint2, textHeight: number, context: CadCommandContext): CadCuadroPlan | { reason: string } {
  const unitsPerMetre = cadUnitsPerMetre(context.unit);
  const view = context.document?.();
  const georeference = view ? cadGeoreferenceOf(view) : null;
  const projected = georeference && georeference.crs.kind !== "geographic" ? georeference : null;
  const coordinates = ring.map((vertex) =>
    projected ? cadGeoreferenceWorld(projected, vertex, context.unit) : { x: vertex.x / unitsPerMetre, y: vertex.y / unitsPerMetre },
  );
  const table = cadConstructionTable(coordinates);
  if (!table) return { reason: "los vértices designados no forman un polígono con lados: hay puntos repetidos." };
  const source = projected
    ? `X e Y son el ESTE y el NORTE de ${projected.crs.name} (${projected.crs.id}), por el marcador de la capa GEO.`
    : georeference
      ? `X e Y son coordenadas LOCALES en metros: el marcador de la capa GEO es geográfico (${georeference.crs.name}) y un cuadro en grados no es un cuadro. Georreferencie en UTM con GEOGRAPHICLOCATION.`
      : "X e Y son coordenadas LOCALES en metros: el dibujo no está georreferenciado. GEOGRAPHICLOCATION pone el marcador y entonces son el este y el norte de verdad.";

  const rows = table.rows.length + 3;
  const cells: CadTableCell[] = [];
  const put = (row: number, column: number, text: string, alignment: CadTextAnchor, columnSpan?: number) => {
    cells.push({ row, column, text, alignment, textHeight, ...(columnSpan && columnSpan > 1 ? { columnSpan } : {}) });
  };
  put(0, 0, "CUADRO DE CONSTRUCCIÓN", "middle-center", CAD_CONSTRUCTION_TABLE_HEADER.length);
  CAD_CONSTRUCTION_TABLE_HEADER.forEach((title, column) => put(1, column, title, "middle-center"));
  table.rows.forEach((row, index) => {
    row.forEach((text, column) => put(index + 2, column, text, column === 3 || column === 5 || column === 6 ? "middle-right" : "middle-center"));
  });
  put(rows - 1, 0, "SUPERFICIE", "middle-right", 4);
  put(rows - 1, 4, table.areaLabel, "middle-center", 3);

  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "table",
    insertion: { x: insertion.x, y: insertion.y, z: 0 },
    rows,
    columns: CAD_CONSTRUCTION_TABLE_HEADER.length,
    rowHeights: Array.from({ length: rows }, () => textHeight * ROW_FACTOR),
    columnWidths: COLUMN_FACTORS.map((factor) => factor * textHeight),
    cells,
    layer: context.activeLayer,
    context: {
      metadata: {
        origen: "CUADROCONSTRUCCION",
        lados: table.rows.length,
        superficie_m2: Number(table.area.toFixed(3)),
        perimetro_m: Number(table.perimeter.toFixed(3)),
        sistema: projected ? projected.crs.id : "local",
      },
    },
  } as CadNativeEntity;

  const lines = [
    `Cuadro de construcción de ${table.rows.length} lados:`,
    `  ${CAD_CONSTRUCTION_TABLE_HEADER.join("  ")}`,
    ...table.rows.map((row) => `  ${row.join("  ")}`),
    `  · superficie ${table.areaLabel}; perímetro ${table.perimeterLabel}; recorrido ${table.orientation === "cw" ? "horario" : "antihorario"}`,
    `  · ${source}`,
    `  · ${NOT_YET_GRID}`,
  ];
  const notice =
    `CUADROCONSTRUCCION: cuadro de ${table.rows.length} lados con superficie ${table.areaLabel} y perímetro ${table.perimeterLabel}, ` +
    `recorrido ${table.orientation === "cw" ? "horario" : "antihorario"}. ${source} ${NOT_YET_GRID}`;
  return { table, coordinates, georeference, source, textHeight, lines, notice, commands: [{ type: "insert", entity }] };
}

/** Altura de texto de fábrica, la misma escala que estrena TABLE. */
export const CAD_CUADRO_TEXT_HEIGHT = 100;

const CUADRO_EMPTY: CuadroState = { phase: "target", ring: [], entityId: "", insertion: null, textHeight: CAD_CUADRO_TEXT_HEIGHT, reversed: false, plan: null };

function cuadroAsk(state: CuadroState): CadCommandStep<CuadroState> {
  if (state.phase === "target")
    return { state, prompt: { message: "Designe la polilínea cerrada del predio", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
  if (state.phase === "insertion")
    return {
      state,
      prompt: { message: `Predio de ${state.ring.length} lados. Precise el punto de inserción del cuadro (esquina superior izquierda)`, options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.phase === "height")
    return { state, prompt: { message: "Precise la altura de texto del cuadro", options: [], defaultValue: String(state.textHeight) }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD };
  const plan = state.plan!;
  return {
    state,
    prompt: { message: `${plan.lines.join("\n")}\n¿Emitir el cuadro?`, options: [YES, NO, HEIGHT, REVERSE], defaultOption: YES.keyword },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/** Rehace el plan sin escribir: cambiar la altura o el sentido no toca el dibujo. */
function cuadroPlan(state: CuadroState, context: CadCommandContext): CadCommandStep<CuadroState> {
  const ring = state.reversed ? [state.ring[0], ...state.ring.slice(1).reverse()] : state.ring;
  const plan = planCadCuadro(ring, state.insertion!, state.textHeight, context);
  if ("reason" in plan) return stop(state, `CUADROCONSTRUCCION: ${plan.reason}`);
  return cuadroAsk({ ...state, phase: "confirm", plan });
}

function cuadroPick(input: CadCommandInput): { id: string } | null {
  const id = input.kind === "entityPick" ? input.entityId : input.kind === "selection" ? input.entityIds[0] : null;
  return id ? { id } : null;
}

const cuadroCommand: CadCommandDescriptor<CuadroState> = {
  name: "CUADROCONSTRUCCION",
  aliases: ["CUADRODECONSTRUCCION", "COGOTABLE", "MAPCOGOTABLE"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => {
    if (context.selection.length === 1) {
      const picked = cadCuadroRing(context.entity?.(context.selection[0]), context.selection[0]);
      if ("ring" in picked) return cuadroAsk({ ...CUADRO_EMPTY, phase: "insertion", ring: picked.ring, entityId: context.selection[0] });
    }
    return cuadroAsk(CUADRO_EMPTY);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancel(state);
    if (state.phase === "target") {
      const picked = cuadroPick(input);
      if (!picked) return cuadroAsk(state);
      const ring = cadCuadroRing(context.entity?.(picked.id), picked.id);
      if ("reason" in ring) return stop(state, `CUADROCONSTRUCCION: ${ring.reason}`);
      return cuadroAsk({ ...state, phase: "insertion", ring: ring.ring, entityId: picked.id });
    }
    if (state.phase === "insertion") {
      if (input.kind !== "point") return cuadroAsk(state);
      return cuadroPlan({ ...state, insertion: input.point }, context);
    }
    if (state.phase === "height") {
      if (input.kind === "distance" && input.value > 0) return cuadroPlan({ ...state, phase: "confirm", textHeight: input.value }, context);
      return cuadroPlan({ ...state, phase: "confirm" }, context);
    }
    if (input.kind !== "keyword" && input.kind !== "enter") return cuadroAsk(state);
    if (input.kind === "keyword" && input.keyword === NO.keyword) return stop(state, "CUADROCONSTRUCCION: no se emitió nada.");
    if (input.kind === "keyword" && input.keyword === HEIGHT.keyword) return cuadroAsk({ ...state, phase: "height" });
    if (input.kind === "keyword" && input.keyword === REVERSE.keyword) return cuadroPlan({ ...state, reversed: !state.reversed }, context);
    const plan = state.plan!;
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: { kind: "document", commands: plan.commands, label: "CUADROCONSTRUCCION", notice: plan.notice },
    };
  },
};

export const CAD_GEO_COGO_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(cogoCommand), asCadCommand(cuadroCommand)];
