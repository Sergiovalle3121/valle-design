/**
 * Las siete órdenes del toolset Mechanical y DIMSTYLE → Familia, contra
 * papel (Ola I). npx tsx src/lib/cad/engine/commands/mechanical.spec.ts
 *
 *   - STDPART: Intro toma Tornillo M10 × 40; la inserción se escala a la
 *     unidad del documento (0,001 en metros); M11 se rechaza enumerando.
 *   - STEELSHAPE: PTR con los defaults, IPR tecleado, medidas imposibles.
 *   - BALLOON sobre un INSERT se queda con su bloque y numera solo; BOM la
 *     cuenta; sin normalizados se niega diciéndolo.
 *   - WELDSYMBOL y SURFACESYMBOL con todas sus opciones y con Intro.
 *   - DIMTOLERANCE: Ajuste H7 sobre una cota de 40 → «40.00 +0.025/0 mm»;
 *     simétrica, desviaciones, límites, Quitar; los rechazos.
 *   - DIMSTYLE Familia: ISO-25$4 con sólo lo que difiere del padre; Aplicar
 *     hornea cada cota con su familia; el padre con subestilos no se borra.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity, CadLayerDef, CadStyleTable } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { cadDimensionToleranceOf } from "../../dimension-tolerance";
import { buildCadDimensionGeometry } from "../../associative-dimension";
import { cadBalloonMetadata } from "../../mechanical-symbols";
import { cadMechanicalBlockDefinition, cadMechanicalBolt } from "../../mechanical-parts";
import { cadParseSignedNumber } from "./dimension-tolerance";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

/* ── Los nombres ────────────────────────────────────────────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  for (const [alias, name] of [
    ["TORNILLO", "STDPART"], ["amcontentlib", "STDPART"], ["PERFIL", "STEELSHAPE"], ["AMSTLSHAP2D", "STEELSHAPE"],
    ["GLOBO", "BALLOON"], ["AMBALLOON", "BALLOON"], ["AMBOM", "BOM"], ["LISTAMATERIALES", "BOM"],
    ["SOLDADURA", "WELDSYMBOL"], ["AMWELDSYM", "WELDSYMBOL"], ["ACABADO", "SURFACESYMBOL"], ["AMSURFSYM", "SURFACESYMBOL"],
    ["TOLERANCIA", "DIMTOLERANCE"], ["DTOL", "DIMTOLERANCE"], ["TOL", "TOLERANCE"],
  ])
    eq(resolveCadCommandAlias(alias, known), name, `${alias} → ${name}`);
}

/* ── El contexto ────────────────────────────────────────────────────────── */
const baseLayer: CadLayerDef = { id: "0", name: "0", color: "#ffffff", visible: true, locked: false };
interface Options {
  entities?: CadEntity[];
  blocks?: CadBlockDefinition[];
  styles?: Partial<CadStyleTable>;
  selection?: string[];
  unit?: string;
  document?: boolean;
}
function makeContext(options: Options = {}): CadCommandContext {
  let ids = 0;
  const entities = options.entities ?? [];
  const blocks = options.blocks ?? [];
  const styles = { text: {}, dimension: {}, mleader: {}, table: {}, plot: {}, ...(options.styles ?? {}) };
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection: options.selection ?? [],
    activeLayer: "PIEZAS",
    unit: options.unit ?? "mm",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
    layers: () => [baseLayer],
    blocks: () => blocks,
    ...(options.document === false
      ? {}
      : { document: () => ({ meta: { version: 1, schema: 9, unit: options.unit ?? "mm" }, entities, layers: [baseLayer], blocks, styles, externalReferences: [], modelSpace: { entityIds: entities.map((entity) => entity.id) }, unsupportedEntities: [], lossManifest: [] }) as never }),
  };
}
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const pick = (entityId: string, x = 0, y = 0): CadCommandInput => ({ kind: "entityPick", entityId, point: { x, y } });
const selection = (...entityIds: string[]): CadCommandInput => ({ kind: "selection", entityIds });
const enter: CadCommandInput = { kind: "enter" };

function drive(name: string, inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name)!;
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts };
}
function written(driven: ReturnType<typeof drive>, label: string) {
  const result = driven.result;
  assert.ok(result && result.kind === "document", `debía escribir, dio ${result?.kind}${result?.kind === "message" ? `: ${result.text}` : ""}`);
  eq(result.label, label, "la etiqueta de deshacer");
  return { commands: result.commands, notice: result.notice ?? "" };
}
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}
const insertOf = (commands: readonly { type: string }[]) => {
  const command = commands.find((candidate) => candidate.type === "insert") as { type: "insert"; entity: CadEntity } | undefined;
  assert.ok(command && command.entity.type === "insert", "hay una inserción");
  return command.entity as Extract<CadEntity, { type: "insert" }>;
};

/* ── STDPART ────────────────────────────────────────────────────────────── */
{
  const driven = drive("STDPART", [enter, enter, enter, point(100, 200), enter]);
  eq(driven.prompts.slice(0, 5), ["Indique el normalizado", "Precise la métrica (M6, M8, M10, M12, M16, M20, M24)", "Precise la longitud del tornillo (mm)", "Tornillo hexagonal M10 × 40 (ISO 4017). Precise el punto de inserción", "Ángulo de rotación"], "los cinco prompts, con Intro en cada uno");
  const { commands, notice } = written(driven, "STDPART");
  eq(commands[0].type, "block", "primero la definición, que el documento no tenía");
  const inserted = insertOf(commands);
  eq([inserted.block, inserted.insertion, inserted.scale, inserted.rotation, inserted.layer], ["MECH-TORNILLO-M10x40", { x: 100, y: 200, z: 0 }, { x: 1, y: 1, z: 1 }, 0, "PIEZAS"], "M10 × 40 en el punto, a escala 1 en milímetros, en la capa activa");
  eq(notice, "STDPART: Tornillo hexagonal M10 × 40 (ISO 4017) en (100, 200); bloque MECH-TORNILLO-M10x40 definido en el dibujo.", "la orden dice sus números");

  const metres = written(drive("STDPART", [keyword("tueRca"), distance(12), point(1, 2), distance(90)], makeContext({ unit: "m" })), "STDPART");
  const nut = insertOf(metres.commands);
  ok(nut.block === "MECH-TUERCA-M12" && near(nut.scale.x, 0.001) && nut.rotation === 90, "en metros la tuerca se inserta a 0,001, girada 90°");

  const existing = makeContext({ blocks: [cadMechanicalBlockDefinition(cadMechanicalBolt(10, 40)!)] });
  const again = written(drive("STDPART", [enter, enter, enter, point(0, 0), enter], existing), "STDPART");
  ok(!again.commands.some((command) => command.type === "block") && !again.notice.includes("definido"), "un bloque ya definido no se pisa");

  ok(messageOf(drive("STDPART", [enter, distance(11)])).includes("M11 no está en el catálogo: admite M6"), "M11 se rechaza enumerando");
  ok(messageOf(drive("STDPART", [keyword("rOndana"), distance(8), enter])).includes("necesita un punto"), "Intro en el punto se niega");
  ok(messageOf(drive("STDPART", [enter, enter, distance(0)])).includes("mayor que cero"), "largo cero se niega");
  const washer = written(drive("STDPART", [keyword("rOndana"), distance(8), point(0, 0), enter]), "STDPART");
  eq(insertOf(washer.commands).block, "MECH-RONDANA-M8", "la rondana no pide largo");
}

/* ── STEELSHAPE ─────────────────────────────────────────────────────────── */
{
  const driven = drive("STEELSHAPE", [enter, enter, enter, enter, point(0, 0), enter]);
  eq(driven.prompts[1], "Precise el ancho b (mm)", "PTR por Intro, luego sus medidas");
  const { commands, notice } = written(driven, "STEELSHAPE");
  eq(insertOf(commands).block, "MECH-PTR-50.8x50.8x3", "PTR 2\" × 2\" cal. 11 con los defaults");
  eq(notice, "STEELSHAPE: PTR 50.8 × 50.8 × 3 (ASTM A500 / IMCA), sección 5.74 cm², 4.50 kg/m en (0, 0); bloque MECH-PTR-50.8x50.8x3 definido en el dibujo.", "sección y peso lineal en el aviso");
  const ipr = written(drive("STEELSHAPE", [keyword("Ipr"), distance(150), distance(100), distance(5), distance(7), point(10, 10), enter]), "STEELSHAPE");
  eq(insertOf(ipr.commands).block, "MECH-IPR-150x100x5x7", "IPR tecleado");
  ok(ipr.notice.includes("20.80 cm²"), "2 080 mm² = 20,80 cm²");
  ok(messageOf(drive("STEELSHAPE", [enter, enter, enter, distance(30), point(0, 0), enter])).includes("no deja hueco"), "una pared de 30 en un PTR de 50,8 se niega al rematar");
  ok(messageOf(drive("STEELSHAPE", [enter, distance(0)])).includes("mayor que cero"), "una medida cero se niega");
}

/* ── BALLOON y BOM ──────────────────────────────────────────────────────── */
const bolt = cadMechanicalBlockDefinition(cadMechanicalBolt(10, 40)!);
const insertEntity = (id: string, block: string): CadEntity => ({ id, type: "insert", block, insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0" });
{
  const context = makeContext({ entities: [insertEntity("i1", bolt.id)], blocks: [bolt] });
  const driven = drive("BALLOON", [pick("i1", 20, 5), point(500, 500)], context);
  eq(driven.prompts, ["Designe la pieza o precise el punto de la flecha", "Precise el centro del globo", ""], "designar y centrar");
  const { commands, notice } = written(driven, "BALLOON");
  eq(commands.map((command) => (command.type === "insert" ? command.entity.type : command.type)), ["line", "polyline", "circle", "mtext"], "cuatro entidades");
  const circle = (commands[2] as { entity: Extract<CadEntity, { type: "circle" }> }).entity;
  eq([circle.center, circle.radius, circle.layer], [{ x: 500, y: 500, z: 0 }, 120, "PIEZAS"], "el círculo en el centro, radio = DIMTXT de Standard (120)");
  eq(circle.context?.metadata, cadBalloonMetadata({ item: 1, part: bolt.id, targetId: "i1" }), "el globo se queda con el bloque designado y numera 1");
  eq(notice, "BALLOON: globo 1 sobre MECH-TORNILLO-M10x40 en (500, 500).", "el aviso");

  const balloonCircle: CadEntity = { id: "g1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 120, layer: "0", context: { metadata: cadBalloonMetadata({ item: 4, part: bolt.id }) } };
  const second = written(drive("BALLOON", [point(0, 0), point(300, 300)], makeContext({ entities: [balloonCircle] })), "BALLOON");
  eq((second.commands[2] as { entity: CadEntity }).entity.context?.metadata?.balloon, 5, "el siguiente al mayor globo del dibujo");
  eq((second.commands[2] as { entity: CadEntity }).entity.context?.metadata?.balloonPart, "", "sobre un punto, sin bloque");
  const numbered = written(drive("BALLOON", [keyword("Número"), distance(7), point(0, 0), keyword("Altura"), distance(50), point(100, 100)]), "BALLOON");
  const numberedCircle = (numbered.commands[2] as { entity: Extract<CadEntity, { type: "circle" }> }).entity;
  eq([numberedCircle.context?.metadata?.balloon, numberedCircle.radius], [7, 50], "Número y Altura tecleados");
  const styled = makeContext({ styles: { dimension: { Standard: { textHeight: 35 } } } as Partial<CadStyleTable> });
  eq((written(drive("BALLOON", [point(0, 0), point(9, 9)], styled), "BALLOON").commands[2] as { entity: Extract<CadEntity, { type: "circle" }> }).entity.radius, 35, "la altura sale del DIMTXT del estilo Standard del documento");
  const preselected = drive("BALLOON", [point(700, 700)], makeContext({ entities: [insertEntity("i1", bolt.id)], blocks: [bolt], selection: ["i1"] }));
  eq(preselected.prompts[0], "Precise el centro del globo", "con la pieza ya designada (Ctrl+A y GLOBO), va directo al centro");
  eq((written(preselected, "BALLOON").commands[2] as { entity: CadEntity }).entity.context?.metadata, cadBalloonMetadata({ item: 1, part: bolt.id, targetId: "i1" }), "…y se queda con su bloque");
  ok(messageOf(drive("BALLOON", [enter])).includes("necesita la pieza"), "Intro sin pieza se niega");
  ok(messageOf(drive("BALLOON", [point(0, 0), enter])).includes("necesita el centro"), "Intro sin centro se niega");
  ok(messageOf(drive("BALLOON", [keyword("Número"), distance(0)])).includes("entero mayor que cero"), "globo 0 se niega");
}
{
  const balloon: CadEntity = { id: "g1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 120, layer: "0", context: { metadata: cadBalloonMetadata({ item: 2, part: bolt.id }) } };
  const context = makeContext({ entities: [insertEntity("i1", bolt.id), insertEntity("i2", bolt.id), balloon], blocks: [bolt] });
  const driven = drive("BOM", [point(5000, 0)], context);
  eq(driven.prompts[0], "Precise el punto de inserción de la lista de materiales", "un solo prompt");
  const { commands, notice } = written(driven, "BOM");
  const table = (commands[0] as { entity: CadEntity }).entity;
  assert.ok(table.type === "table");
  eq([table.rows, table.columns, table.insertion.x], [3, 5, 5000], "cabecera, título y una fila");
  eq(table.cells.filter((cell) => cell.row === 2).map((cell) => cell.text), ["2", "2", "Tornillo hexagonal M10 × 40", "ISO 4017", "MECH-TORNILLO-M10x40"], "posición 2 (la del globo), cantidad 2");
  eq(notice, "BOM: 1 posición(es), 2 unidad(es), 1 globo(s) en (5000, 0).", "el aviso");
  ok(messageOf(drive("BOM", [point(0, 0)])).includes("no tiene normalizados"), "sin normalizados ni globos se niega diciéndolo");
  ok(messageOf(drive("BOM", [point(0, 0)], makeContext({ document: false }))).includes("no expone el documento"), "sin vista del documento se dice");
  ok(messageOf(drive("BOM", [enter])).includes("necesita un punto"), "Intro se niega");
}

/* ── WELDSYMBOL ─────────────────────────────────────────────────────────── */
{
  const driven = drive("WELDSYMBOL", [point(0, 0), point(1000, 500), keyword("V"), keyword("Ambos"), distance(6), distance(100), keyword("Sí"), enter, text("E7018")]);
  eq(driven.prompts.slice(0, 9), [
    "Precise la junta (punta de la flecha)", "Precise el arranque de la línea de referencia", "Indique el tipo de soldadura", "Indique el lado",
    "Precise el tamaño (cateto o garganta; 0 = sin tamaño)", "Precise la longitud del cordón (0 = continuo)", "¿Todo alrededor?", "¿Soldadura en obra?",
    "Escriba la nota de la cola (proceso o norma; Intro = sin cola)",
  ], "los nueve prompts");
  const { commands, notice } = written(driven, "WELDSYMBOL");
  eq(commands.length, 11, "referencia, flecha, punta, dos V, tamaño, longitud, círculo y cola de tres");
  eq(notice, "WELDSYMBOL: soldadura en V de ambos lados, tamaño 6, 100 de largo, todo alrededor, cola «E7018» en (0, 0).", "el aviso");
  const plain = written(drive("WELDSYMBOL", [point(0, 0), point(1000, 500), enter, enter, enter, enter, enter, enter, enter]), "WELDSYMBOL");
  eq(plain.commands.length, 4, "con Intro en todo: filete del lado de la flecha, sin más");
  eq(plain.notice, "WELDSYMBOL: soldadura filete del lado de la flecha en (0, 0).", "…y el aviso lo dice");
  const tall = written(drive("WELDSYMBOL", [keyword("Altura"), distance(50), point(0, 0), point(1000, 500), enter, enter, enter, enter, enter, enter, enter]), "WELDSYMBOL");
  const reference = (tall.commands[0] as { entity: Extract<CadEntity, { type: "line" }> }).entity;
  ok(near(reference.end.x, 1400), "con Altura 50 la referencia mide 8 h = 400");
  ok(messageOf(drive("WELDSYMBOL", [point(1, 1), point(1, 1), enter, enter, enter, enter, enter, enter, enter])).includes("mismo punto"), "flecha y unión iguales se niegan");
  ok(messageOf(drive("WELDSYMBOL", [enter])).includes("necesita el punto de la junta"), "Intro sin junta se niega");
}

/* ── SURFACESYMBOL ──────────────────────────────────────────────────────── */
{
  const driven = drive("SURFACESYMBOL", [enter, enter, keyword("peRpendicular"), point(10, 20), enter]);
  eq(driven.prompts.slice(0, 5), ["Indique el acabado", "Precise la rugosidad Ra en µm (0 = sin valor)", "Indique la dirección de las estrías", "Precise el punto de apoyo sobre la superficie", "Ángulo de rotación"], "los cinco prompts");
  const { commands, notice } = written(driven, "SURFACESYMBOL");
  eq(commands.length, 6, "mecanizado con Ra 3,2 y estrías: dos patas, barra, línea, Ra y símbolo");
  eq(notice, "SURFACESYMBOL: acabado con arranque de material, Ra 3.2 µm, estrías perpendicular en (10, 20).", "el aviso");
  const basic = written(drive("SURFACESYMBOL", [keyword("Básico"), distance(0), enter, point(0, 0), distance(45)]), "SURFACESYMBOL");
  eq(basic.commands.length, 2, "básico sin Ra ni estrías: las dos patas");
  eq(basic.notice, "SURFACESYMBOL: acabado básico (cualquier proceso) en (0, 0).", "…y el aviso");
  const prohibited = written(drive("SURFACESYMBOL", [keyword("Prohibido"), distance(1.6), enter, point(0, 0), enter]), "SURFACESYMBOL");
  eq(prohibited.commands.map((command) => (command as { entity: CadEntity }).entity.type), ["line", "line", "circle", "line", "mtext"], "prohibido con Ra: el círculo y el valor");
  ok(messageOf(drive("SURFACESYMBOL", [enter, enter, enter, enter])).includes("necesita el punto de apoyo"), "Intro sin punto se niega");
}

/* ── DIMTOLERANCE ───────────────────────────────────────────────────────── */
const dimension = (id: string, b: number, extra: Partial<Extract<CadEntity, { type: "dimension" }>> = {}): CadEntity => ({
  id, type: "dimension", dimensionKind: "linear", a: { x: 0, y: 0 }, b: { x: b, y: 0 }, axis: "x", offset: 10, layer: "COTAS", sourceUnit: "mm", precision: 2, ...extra,
} as CadEntity);
const toleranceOf = (commands: readonly { type: string }[], index = 0) => {
  const command = commands[index] as { type: "replace"; entityId: string; entity: CadEntity };
  assert.ok(command.type === "replace" && command.entity.type === "dimension");
  return { entity: command.entity, tolerance: cadDimensionToleranceOf(command.entity), label: buildCadDimensionGeometry(command.entity as Extract<CadEntity, { type: "dimension" }>)?.label };
};
{
  eq([cadParseSignedNumber("+0.025"), cadParseSignedNumber("−0.010"), cadParseSignedNumber("-0,5"), cadParseSignedNumber("x"), cadParseSignedNumber("")], [0.025, -0.01, -0.5, null, null], "el número con signo, con menos tipográfico y coma");

  const line: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" };
  const context = makeContext({ entities: [dimension("d1", 40), dimension("d2", 25, { context: { metadata: { sourceType: "DIMENSION" } } }), line], selection: ["d1", "d2", "l1"] });
  const fit = drive("DIMTOLERANCE", [keyword("Ajuste"), text("H7")], context);
  eq(fit.prompts[0], "2 cota(s). Indique la tolerancia", "con dos cotas designadas, va al modo");
  ok(fit.prompts[1].startsWith("Escriba el ajuste ISO 286"), "Ajuste pide el código");
  const fitted = written(fit, "DIMTOLERANCE");
  eq(fitted.commands.length, 2, "dos reemplazos: la línea no es cota");
  const d1 = toleranceOf(fitted.commands, 0);
  eq(d1.tolerance, { mode: "deviation", upper: 0.025, lower: 0, decimals: 3, fit: "H7" }, "40H7 = +0.025/0");
  eq(d1.label, "40.00 +0.025/0 mm", "…y la cota lo rotula");
  const d2 = toleranceOf(fitted.commands, 1);
  eq(d2.tolerance?.upper, 0.021, "25H7 = +0.021/0: cada cota con SU nominal");
  eq(d2.entity.context?.metadata?.sourceType, "DIMENSION", "las demás claves del bolsillo se conservan");
  eq(fitted.notice, "DIMTOLERANCE: 2 cota(s) con el ajuste H7; la primera rotula «40.00 +0.025/0 mm».", "el aviso");

  const symmetric = written(drive("DIMTOLERANCE", [enter, distance(0.05)], context), "DIMTOLERANCE");
  eq(toleranceOf(symmetric.commands).label, "40.00 ±0.05 mm", "Intro = simétrica; ±0,05 con sus dos decimales");
  const deviation = written(drive("DIMTOLERANCE", [keyword("Desviación"), text("+0.05"), text("−0.01")], context), "DIMTOLERANCE");
  eq(toleranceOf(deviation.commands).label, "40.00 +0.05/−0.01 mm", "desviaciones con signo");
  eq(deviation.notice, "DIMTOLERANCE: 2 cota(s) por desviaciones +0.05/-0.01; la primera rotula «40.00 +0.05/−0.01 mm».", "el aviso de las desviaciones");
  const limits = written(drive("DIMTOLERANCE", [keyword("Límites"), distance(0.05), text("-0.01")], context), "DIMTOLERANCE");
  eq(toleranceOf(limits.commands).label, "40.05 / 39.99 mm", "límites: máximo y mínimo");
  const removed = written(drive("DIMTOLERANCE", [keyword("Quitar")], makeContext({ entities: [d1.entity], selection: ["d1"] })), "DIMTOLERANCE");
  eq([toleranceOf(removed.commands).tolerance, toleranceOf(removed.commands).entity.context], [null, {}], "Quitar borra las claves (y el bolsillo queda vacío)");
  const fitPreserves = written(drive("DIMTOLERANCE", [keyword("Ajuste"), enter], makeContext({ entities: [d1.entity], selection: ["d1"] })), "DIMTOLERANCE");
  eq(toleranceOf(fitPreserves.commands).tolerance?.fit, "H7", "Intro en el ajuste toma H7");

  ok(messageOf(drive("DIMTOLERANCE", [keyword("Desviación"), text("+0.01"), text("+0.02")], context)).includes("no puede superar"), "inferior mayor que superior se niega");
  ok(messageOf(drive("DIMTOLERANCE", [enter, distance(0)], context)).includes("mayor que cero"), "±0 se niega");
  ok(messageOf(drive("DIMTOLERANCE", [keyword("Ajuste"), text("K7")], context)).includes("corrección Δ"), "K7 se niega por la Δ");
  ok(messageOf(drive("DIMTOLERANCE", [keyword("Ajuste"), text("H7")], makeContext({ entities: [dimension("a1", 90, { dimensionKind: "angular", c: { x: 0, y: 90 } })], selection: ["a1"] }))).includes("angular no lo admite"), "un ajuste sobre una angular se niega");

  const unselected = drive("DIMTOLERANCE", [selection("l1"), enter], makeContext({ entities: [line] }));
  eq(unselected.prompts[0], "Designe las cotas", "sin designación previa, la pide");
  ok(messageOf(unselected).includes("no contiene cotas"), "una designación sin cotas se niega");
  const picked = written(drive("DIMTOLERANCE", [pick("d1"), enter, distance(0.1)], makeContext({ entities: [dimension("d1", 40)] })), "DIMTOLERANCE");
  eq(toleranceOf(picked.commands).label, "40.00 ±0.1 mm", "designar una cota con el ratón vale");
  ok(messageOf(drive("DIMTOLERANCE", [enter], makeContext({ entities: [line] }))).includes("necesita cotas"), "Intro sin designar se niega");
}

/* ── DIMSTYLE → Familia y Aplicar por familia ──────────────────────────── */
{
  const styles = { dimension: { "ISO-25": { arrowSize: 250, precision: 2, textHeight: 35 } } } as unknown as Partial<CadStyleTable>;
  const context = makeContext({ styles });
  const driven = drive("DIMSTYLE", [keyword("Familia"), keyword("Radio"), text("ISO-25"), enter, enter, enter, text("dot"), enter, enter, enter], context);
  eq(driven.prompts.slice(0, 4), ["Escriba el nombre del estilo de cota", "Indique la familia del subestilo", "Escriba el estilo PADRE del subestilo radial", "Precise el estilo de texto (DIMTXSTY)"], "Familia → familia → padre → campos");
  const { commands } = written(driven, "DIMSTYLE subestilo");
  eq(commands, [{ type: "style", op: "upsert", family: "dimension", name: "ISO-25$4", values: { arrowhead: "dot" } }], "el subestilo radial declara SÓLO lo que cambia");
  ok(messageOf(drive("DIMSTYLE", [keyword("Familia"), keyword("Radio"), text("NADIE")], context)).includes("no existe"), "un padre que no existe se niega");
  ok(messageOf(drive("DIMSTYLE", [keyword("Familia"), keyword("Radio"), text("ISO-25"), enter, enter, enter, enter, enter, enter, enter], context)).includes("no cambia nada"), "un subestilo idéntico al padre no se escribe");
  const standardSub = written(drive("DIMSTYLE", [keyword("Familia"), keyword("Angular"), text("Standard"), enter, enter, enter, enter, distance(1), enter, enter], context), "DIMSTYLE subestilo");
  eq(standardSub.commands, [{ type: "style", op: "upsert", family: "dimension", name: "Standard$2", values: { precision: 1 } }], "Standard también tiene subestilos");

  const withSub = makeContext({
    styles: { dimension: { "ISO-25": { arrowSize: 250, precision: 2 }, "ISO-25$4": { arrowhead: "dot" } } } as unknown as Partial<CadStyleTable>,
    entities: [
      dimension("r1", 40, { dimensionKind: "radius", radius: 20, style: "ISO-25" }),
      dimension("l1", 40, { style: "ISO-25" }),
      dimension("x1", 40, { style: "OTRO" }),
    ],
  });
  const applied = written(drive("DIMSTYLE", [keyword("Aplicar"), text("ISO-25")], withSub), "DIMSTYLE aplicar «ISO-25» (2 cota(s))");
  const byId = new Map(applied.commands.map((command) => [(command as { entityId: string }).entityId, (command as { entity: Extract<CadEntity, { type: "dimension" }> }).entity]));
  eq([byId.get("r1")?.arrowhead, byId.get("r1")?.arrowSize], ["dot", 250], "la radial hornea la flecha de ISO-25$4 y el tamaño del padre");
  eq(byId.get("l1")?.arrowhead, "closed-filled", "la lineal, sin $0, hornea la flecha de fábrica");
  ok(!byId.has("x1"), "una cota de otro estilo no se toca");
  ok(messageOf(drive("DIMSTYLE", [keyword("Suprimir"), text("ISO-25")], withSub)).includes("tiene 1 subestilo(s) (ISO-25$4)"), "un padre con subestilos no se borra");
}

console.log(`✅ engine/commands/mechanical.spec: ${checks} comprobaciones`);
