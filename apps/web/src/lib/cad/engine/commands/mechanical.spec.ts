/**
 * Las siete órdenes del toolset Mechanical y DIMSTYLE → Familia, contra
 * papel (Ola I). npx tsx src/lib/cad/engine/commands/mechanical.spec.ts
 *
 *   - STDPART: Intro toma Tornillo M10 × 40; la inserción se escala a la
 *     unidad del documento (0,001 en metros); M11 se rechaza enumerando.
 *   - STDPART rodamiento y chaveta: el 6204 sale como MECH-RODAMIENTO-6204 y
 *     dice que va con la representación simplificada de ISO 8826-1; un eje de
 *     Ø25 pide 8 × 7 y uno de Ø40, 12 × 8; el 6404 se rechaza enumerando; y los
 *     dos insertados salen como dos posiciones de la lista de materiales.
 *   - STEELSHAPE: PTR con los defaults, IPR tecleado, medidas imposibles.
 *   - BALLOON sobre un INSERT se queda con su bloque y numera solo; BOM la
 *     cuenta; sin normalizados se niega diciéndolo.
 *   - BOM Actualizar: con la tabla de ayer en el dibujo y una pieza más, UN
 *     reemplazo con el id intacto y las celdas de hoy; sin tabla se niega.
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
import { buildCadMechanicalBom, buildCadMechanicalBomTable } from "../../mechanical-bom";
import { cadMechanicalBlockDefinition, cadMechanicalBolt, cadMechanicalNut } from "../../mechanical-parts";
import { cadParseSignedNumber } from "./dimension-tolerance";

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

/* ── STDPART · rodamiento y chaveta ─────────────────────────────────────── */
{
  // El primer prompt: cinco familias, letras de acceso distintas, y Tornillo
  // por defecto — que es lo que el golden 84 teclea a golpe de Intro.
  const begun = CAD_COMMAND_REGISTRY_V2.get("STDPART")!.begin(makeContext());
  eq(begun.prompt.options.map((option) => option.keyword), ["Tornillo", "tueRca", "rOndana", "roDamiento", "Chaveta"], "las cinco familias, en su orden");
  eq(begun.prompt.defaultOption, "Tornillo", "Intro sigue tomando Tornillo: STDPART se completa como antes");
  eq(new Set(begun.prompt.options.map((option) => option.shortcut)).size, 5, "cinco letras de acceso distintas: T, R, O, D, C");

  const driven = drive("STDPART", [keyword("roDamiento"), enter, point(100, 200), enter]);
  eq(driven.prompts.slice(0, 4), [
    "Indique el normalizado",
    "Precise la designación del rodamiento (ISO 15: 6200 a 6212, 6300 a 6312)",
    "Rodamiento rígido de bolas 6204 (20 × 47 × 14) (ISO 15). Precise el punto de inserción",
    "Ángulo de rotación",
  ], "el rodamiento se pide por su designación, no por una métrica");
  const { commands, notice } = written(driven, "STDPART");
  const bearing = insertOf(commands);
  eq([bearing.block, bearing.insertion, bearing.layer], ["MECH-RODAMIENTO-6204", { x: 100, y: 200, z: 0 }, "PIEZAS"], "el 6204 en su punto, con id de bloque estable");
  const definition = (commands.find((command) => command.type === "block") as { definition: CadBlockDefinition }).definition;
  eq(definition.description, "Rodamiento rígido de bolas 6204 (20 × 47 × 14) · ISO 15", "denominación y norma donde la lista de materiales ya sabe leerlas");
  eq(definition.entities.length, 6, "las dos medias secciones simplificadas");
  ok(notice.includes("representación simplificada ISO 8826-1 (el conjunto no dibuja pistas ni bolas)"), "la orden DICE con qué está dibujado en vez de fingir el detalle");

  eq(insertOf(written(drive("STDPART", [keyword("roDamiento"), text("6304"), point(0, 0), enter]), "STDPART").commands).block, "MECH-RODAMIENTO-6304", "la serie media, tecleada");
  eq(insertOf(written(drive("STDPART", [keyword("roDamiento"), text(" 6210 "), point(0, 0), enter]), "STDPART").commands).block, "MECH-RODAMIENTO-6210", "con espacios de sobra, la misma designación");
  const rechazo = messageOf(drive("STDPART", [keyword("roDamiento"), text("6404")]));
  ok(rechazo.includes("El rodamiento 6404 no está en el catálogo"), "una designación fuera de catálogo se rechaza");
  ok(rechazo.includes("6200, 6201, 6202") && rechazo.includes("6312"), "…ENUMERANDO las que hay, mismo criterio que M11");

  const enMetros = written(drive("STDPART", [keyword("roDamiento"), enter, point(1, 2), enter], makeContext({ unit: "m" })), "STDPART");
  ok(near(insertOf(enMetros.commands).scale.x, 0.001), "en un dibujo en metros el rodamiento entra a 0,001: el catálogo está en mm");
}
{
  const driven = drive("STDPART", [keyword("Chaveta"), enter, enter, point(300, 0), enter]);
  eq(driven.prompts.slice(0, 5), [
    "Indique el normalizado",
    "Precise el diámetro del eje (mm); él manda la sección de la chaveta",
    "Precise la longitud de la chaveta (mm)",
    "Chaveta paralela A 8 × 7 × 40 (cuñero: eje t1 4, cubo t2 3.3) (ISO 773 / DIN 6885). Precise el punto de inserción",
    "Ángulo de rotación",
  ], "el eje manda la sección; t1 y t2 salen en la denominación antes de insertar");
  const { commands, notice } = written(driven, "STDPART");
  eq(insertOf(commands).block, "MECH-CHAVETA-8x7x40", "un eje de Ø25 pide chaveta 8 × 7");
  ok(notice.includes("para eje Ø25 (ISO 773 da esta sección de más de 22 y hasta 30 mm)"), "y la orden dice de qué intervalo salió");
  eq((commands.find((command) => command.type === "block") as { definition: CadBlockDefinition }).definition.entities.length, 4, "dos flancos y dos extremos redondeados de la forma A");

  const eje40 = written(drive("STDPART", [keyword("Chaveta"), distance(40), distance(50), point(0, 0), enter]), "STDPART");
  eq(insertOf(eje40.commands).block, "MECH-CHAVETA-12x8x50", "y uno de Ø40 pide 12 × 8");
  eq(insertOf(written(drive("STDPART", [keyword("Chaveta"), distance(30), distance(40), point(0, 0), enter]), "STDPART").commands).block, "MECH-CHAVETA-8x7x40", "«hasta 30» incluye el 30: sigue siendo 8 × 7");

  const fuera = messageOf(drive("STDPART", [keyword("Chaveta"), distance(200)]));
  ok(fuera.includes("Un eje de Ø200 queda fuera de la tabla de chavetas de ISO 773"), "un eje fuera de la tabla se rechaza");
  ok(fuera.includes("más de 6 mm y hasta 130 mm"), "…diciendo hasta dónde llega la tabla");
  ok(messageOf(drive("STDPART", [keyword("Chaveta"), distance(25), distance(8)])).includes("una longitud de 8 no pasa del ancho b = 8"), "una chaveta tan corta como ancha se niega, y se dice por qué");

  const fueraDeSerie = written(drive("STDPART", [keyword("Chaveta"), distance(25), distance(41), point(0, 0), enter]), "STDPART");
  eq(insertOf(fueraDeSerie.commands).block, "MECH-CHAVETA-8x7x41", "una longitud fuera de serie se dibuja: la chaveta se corta a la medida del cuñero");
  ok(fueraDeSerie.notice.includes("aviso: la longitud 41 no es de la serie de ISO 773, cuyas vecinas son 40 y 45"), "…pero se AVISA con las dos vecinas, sin elegir por el proyectista");
}

/* ── …y la lista de materiales los cuenta sin tocar mechanical-bom.ts ───── */
{
  const rodamiento = written(drive("STDPART", [keyword("roDamiento"), enter, point(0, 0), enter]), "STDPART");
  const chaveta = written(drive("STDPART", [keyword("Chaveta"), enter, enter, point(200, 0), enter]), "STDPART");
  const definiciones = [...rodamiento.commands, ...chaveta.commands]
    .filter((command) => command.type === "block")
    .map((command) => (command as { definition: CadBlockDefinition }).definition);
  const insertados: CadEntity[] = [
    { ...insertOf(rodamiento.commands), id: "e1" },
    { ...insertOf(chaveta.commands), id: "e2" },
  ];
  const listado = drive("BOM", [point(9000, 0)], makeContext({ entities: insertados, blocks: definiciones }));
  const { commands, notice } = written(listado, "BOM");
  const table = (commands[0] as { entity: CadEntity }).entity;
  assert.ok(table.type === "table");
  const fila = (row: number) => table.cells.filter((cell) => cell.row === row).sort((a, b) => a.column - b.column).map((cell) => cell.text);
  eq(fila(2), ["1", "1", "Chaveta paralela A 8 × 7 × 40 (cuñero: eje t1 4, cubo t2 3.3)", "ISO 773 / DIN 6885", "MECH-CHAVETA-8x7x40"], "la chaveta, con su cuñero, como posición 1");
  eq(fila(3), ["2", "1", "Rodamiento rígido de bolas 6204 (20 × 47 × 14)", "ISO 15", "MECH-RODAMIENTO-6204"], "y el rodamiento como posición 2");
  eq(notice, "BOM: 2 posición(es), 2 unidad(es), 0 globo(s) en (9000, 0).", "dos posiciones: la lista los cuenta sola, con el mismo prefijo MECH- de siempre");
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

/* ── BOM Actualizar ─────────────────────────────────────────────────────── */
{
  const nut = cadMechanicalBlockDefinition(cadMechanicalNut(10)!);
  // La lista que BOM insertó ayer, cuando el dibujo tenía DOS tornillos y nada más.
  const ayer = { entities: [insertEntity("i1", bolt.id), insertEntity("i2", bolt.id)], blocks: [bolt, nut] };
  const tablaDeAyer = (id: string, insertion = { x: 5000, y: 0 }) =>
    buildCadMechanicalBomTable(buildCadMechanicalBom(ayer), insertion, "LISTA", () => id) as CadEntity;

  // Hoy alguien atornilló una tuerca: dos posiciones y tres unidades.
  const hoy = [...ayer.entities, insertEntity("i3", nut.id)];
  const tabla = tablaDeAyer("t1");
  const driven = drive("BOM", [keyword("Actualizar")], makeContext({ entities: [...hoy, tabla], blocks: [bolt, nut] }));
  eq(driven.prompts[0], "Precise el punto de inserción de la lista de materiales", "el mismo prompt: Actualizar es una opción, no otro comando");
  const { commands, notice } = written(driven, "BOM Actualizar");
  eq(commands.length, 1, "UN comando, no un borrado y una inserción");
  const replaced = commands[0] as { type: "replace"; entityId: string; entity: CadEntity };
  eq([replaced.type, replaced.entityId], ["replace", "t1"], "reemplazo POR SU ID: la tabla sigue siendo la misma entidad");
  assert.ok(replaced.entity.type === "table", "y sigue siendo una tabla");
  const celda = (row: number) => replaced.entity.type === "table" ? replaced.entity.cells.filter((c) => c.row === row).sort((a, b) => a.column - b.column).map((c) => c.text) : [];
  eq([replaced.entity.id, replaced.entity.insertion, replaced.entity.layer], ["t1", { x: 5000, y: 0, z: 0 }, "LISTA"], "id, sitio y capa de la tabla de ayer, no los de la sesión de hoy");
  eq(replaced.entity.rows, 4, "título, cabecera y dos posiciones");
  eq(celda(2), ["1", "2", "Tornillo hexagonal M10 × 40", "ISO 4017", "MECH-TORNILLO-M10x40"], "los dos tornillos siguen siendo dos");
  eq(celda(3), ["2", "1", "Tuerca hexagonal M10", "ISO 4032", "MECH-TUERCA-M10"], "y la tuerca de hoy entra como posición 2");
  eq(notice, "BOM Actualizar: de 1 posición(es) y 2 unidad(es) a 2 posición(es) y 3 unidad(es).", "el renglón dice qué cambió, no «Hecho»");

  // Lo que el dibujante ajustó a mano sobrevive al recálculo.
  const ajustada = { ...(tablaDeAyer("t9") as Extract<CadEntity, { type: "table" }>), columnWidths: [900, 900, 3000, 900, 900], rotation: 15, style: "CUADROS", context: { handle: "2A", metadata: { mechanical: "bom", nota: "cajetín" } } } as CadEntity;
  const conservada = written(drive("BOM", [keyword("Actualizar")], makeContext({ entities: [...hoy, ajustada], blocks: [bolt, nut] })), "BOM Actualizar").commands[0] as { entity: CadEntity };
  assert.ok(conservada.entity.type === "table");
  eq([conservada.entity.columnWidths, conservada.entity.rotation, conservada.entity.style], [[900, 900, 3000, 900, 900], 15, "CUADROS"], "ancho de columna, giro y estilo se conservan: la orden recalcula filas, no rediseña el cuadro");
  eq([conservada.entity.context?.handle, conservada.entity.context?.metadata?.nota], ["2A", "cajetín"], "y el bolsillo de contexto conserva sus otras claves");

  // Se borraron todas las piezas: la lista deja de decir dos.
  const vaciada = written(drive("BOM", [keyword("Actualizar")], makeContext({ entities: [tablaDeAyer("t2")], blocks: [bolt, nut] })), "BOM Actualizar");
  eq(vaciada.notice, "BOM Actualizar: de 1 posición(es) y 2 unidad(es) a 0 posición(es) y 0 unidad(es).", "sin piezas la lista dice cero, no se queda con la de ayer");

  // Varias tablas del mismo dibujo: todas dicen la misma lista o el plano miente en una de ellas.
  const dos = written(drive("BOM", [keyword("Actualizar")], makeContext({ entities: [...hoy, tablaDeAyer("t3"), tablaDeAyer("t4", { x: 9000, y: 0 })], blocks: [bolt, nut] })), "BOM Actualizar");
  eq(dos.commands.map((command) => (command as { entityId: string }).entityId), ["t3", "t4"], "dos tablas, dos reemplazos");
  eq(dos.notice, "BOM Actualizar: de 1 posición(es) y 2 unidad(es) a 2 posición(es) y 3 unidad(es) · 2 tabla(s) actualizada(s).", "…y el renglón las cuenta");

  const alDia = buildCadMechanicalBomTable(buildCadMechanicalBom({ entities: hoy, blocks: [bolt, nut] }), { x: 9000, y: 0 }, "LISTA", () => "t5") as CadEntity;
  const mixta = written(drive("BOM", [keyword("Actualizar")], makeContext({ entities: [...hoy, tablaDeAyer("t6"), alDia], blocks: [bolt, nut] })), "BOM Actualizar");
  eq(mixta.commands.length, 1, "la que ya estaba al día no se reescribe: un paso de deshacer vacío es ruido");
  eq(mixta.notice, "BOM Actualizar: de 1 posición(es) y 2 unidad(es) a 2 posición(es) y 3 unidad(es) · 1 ya al día.", "y se dice cuántas estaban al día");

  const soloUno = { entities: [insertEntity("i1", bolt.id)], blocks: [bolt] };
  const desigual = buildCadMechanicalBomTable(buildCadMechanicalBom(soloUno), { x: 9000, y: 0 }, "LISTA", () => "t7") as CadEntity;
  const dispares = written(drive("BOM", [keyword("Actualizar")], makeContext({ entities: [...hoy, tablaDeAyer("t8"), desigual], blocks: [bolt, nut] })), "BOM Actualizar");
  eq(dispares.notice, "BOM Actualizar: 2 tabla(s) que no decían lo mismo entre sí, ahora 2 posición(es) y 3 unidad(es).", "dos tablas que se contradecían no se resumen en un «antes» falso");

  ok(messageOf(drive("BOM", [keyword("Actualizar")], makeContext({ entities: [...hoy, alDia], blocks: [bolt, nut] }))).includes("ya estaba al día (2 posición(es) y 3 unidad(es))"), "una lista al día no se reescribe, y se dice");
  ok(messageOf(drive("BOM", [keyword("Actualizar")], makeContext({ entities: hoy, blocks: [bolt, nut] }))).includes("no tiene ninguna tabla de lista de materiales"), "sin tabla previa se niega diciendo el motivo");
  ok(messageOf(drive("BOM", [keyword("Actualizar")], makeContext({ document: false }))).includes("no expone el documento"), "sin vista del documento se dice también al actualizar");
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
