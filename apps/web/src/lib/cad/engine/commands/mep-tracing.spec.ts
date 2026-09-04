/**
 * PIPE, DUCT, CABLETRAY, MEPSYMBOL y el cuadro de instalaciones contra papel
 * (Ola F, 2026-09-02).
 *
 *   - Un codo de ducto de 300 de ancho con dos tramos de 2.000: el contorno a
 *     inglete tiene área EXACTA 300 × 4.000 = 1.200.000 (la unión de los dos
 *     rectángulos hasta la esquina); el eje mide 4.000.
 *   - Una tubería de agua fría de 3 tramos (3.000 + 4.000 + 3.000) se cuenta
 *     10,00 m en el cuadro con Ø19; una dibujada a mano en IH-AF sin diámetro
 *     cuenta aparte, con «-».
 *   - MEPSYMBOL define el bloque UNA vez y lo inserta dos; el cuadro cuenta 2.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity, CadLayerDef } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { cadDoubleLineOutline, cadMepLayerDefinition, cadMepServiceFor, cadRingAreaOf } from "./mep-support";
import { buildCadMepSchedule } from "../../mep-schedule";
import { buildCadMepScheduleTable } from "../../data-extraction/mep-schedule-table";

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
const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/* ── Los nombres ────────────────────────────────────────────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  for (const [alias, name] of [["PIPEADD", "PIPE"], ["tuberia", "PIPE"], ["DUCTADD", "DUCT"], ["ducto", "DUCT"], ["CABLETRAYADD", "CABLETRAY"], ["charola", "CABLETRAY"], ["DEVICEADD", "MEPSYMBOL"], ["simbolomep", "MEPSYMBOL"]])
    eq(resolveCadCommandAlias(alias, known), name, `${alias} → ${name}`);
}

/* ── La doble línea a inglete, en papel ─────────────────────────────────── */
{
  const elbow = cadDoubleLineOutline([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }], 300)!;
  eq(elbow.length, 6, "un codo: 3 vértices por lado");
  ok(near(cadRingAreaOf(elbow), 300 * 4000), `área = ancho × (L₁ + L₂) = 1.200.000 (medido ${cadRingAreaOf(elbow)})`);
  ok(elbow.some((point) => near(point.x, 2150) && near(point.y, -150)) && elbow.some((point) => near(point.x, 1850) && near(point.y, 150)), "esquina exterior en (2150, −150) y esquina interior en (1850, 150): el inglete");
  const straight = cadDoubleLineOutline([{ x: 0, y: 0 }, { x: 3000, y: 0 }], 300)!;
  ok(near(cadRingAreaOf(straight), 900_000), "un tramo recto es su rectángulo");
  eq(cadDoubleLineOutline([{ x: 0, y: 0 }, { x: 0, y: 0 }], 300), null, "dos puntos iguales: nada");
  eq(cadDoubleLineOutline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0), null, "ancho cero: nada");
  const collinear = cadDoubleLineOutline([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }], 200)!;
  ok(near(cadRingAreaOf(collinear), 400_000), "dos tramos alineados: sin inglete que calcular, el mismo rectángulo");
}

/* ── El contexto de las órdenes ─────────────────────────────────────────── */
const layers: CadLayerDef[] = [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }];
const blocks: CadBlockDefinition[] = [];
function makeContext(entities: CadEntity[] = [], unit = "mm"): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "0",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `m${++ids}`,
    layers: () => layers,
    blocks: () => blocks,
    document: () => ({ meta: { version: 1, schema: 9, unit }, entities, layers, blocks, styles: { text: {}, dimension: {}, table: {}, plot: {} }, externalReferences: [], modelSpace: { entityIds: entities.map((entity) => entity.id) }, unsupportedEntities: [], lossManifest: [] }) as never,
  };
}
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
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
  return { commands: result.commands, notice: result.notice ?? "", inserted: result.commands.flatMap((command) => (command.type === "insert" ? [command.entity as CadEntity] : [])) };
}
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}

/* ── PIPE ───────────────────────────────────────────────────────────────── */
const drawn: CadEntity[] = [];
{
  const driven = drive("PIPE", [point(0, 0), point(3000, 0), point(3000, 4000), point(6000, 4000), enter]);
  ok(driven.prompts[0].startsWith("Agua fría Ø19 mm en IH-AF. Precise el punto inicial de la tubería"), `el prompt dice la receta: ${driven.prompts[0]}`);
  const { commands, notice, inserted } = written(driven, "PIPE");
  eq(commands[0], { type: "layer", op: "upsert", layer: cadMepLayerDefinition(cadMepServiceFor("AF")!) }, "da de alta IH-AF con su color y AGUA_FRIA porque no existía");
  eq(inserted.length, 1, "UNA polilínea por tramo continuo");
  const pipe = inserted[0];
  assert.ok(pipe.type === "polyline");
  eq(pipe.layer, "IH-AF", "en la capa del servicio");
  eq(pipe.vertices.length, 4, "con sus cuatro vértices");
  eq(pipe.context?.metadata, { mep: "pipe", service: "AF", size: 19 }, "y la receta en metadatos, que el formato ya tiene");
  eq(notice, "PIPE: 3 tramo(s) de agua fría Ø19 mm, 10,000 mm en la capa IH-AF.", "la orden dice sus números");
  drawn.push(pipe);
  layers.push(cadMepLayerDefinition(cadMepServiceFor("AF")!));

  const gas = written(drive("PIPE", [keyword("Gas"), keyword("Diámetro"), distance(25), point(0, 5000), point(2000, 5000), enter]), "PIPE");
  const gasPipe = gas.inserted[0];
  assert.ok(gasPipe.type === "polyline");
  ok(gasPipe.layer === "IG-GAS" && gasPipe.context?.metadata?.size === 25, "Gas con Diámetro 25");
  ok(gas.commands[0].type === "layer" && gas.commands[0].op === "upsert" && gas.commands[0].layer.linetype === "GAS_LINE", "IG-GAS nace con GAS_LINE: el texto en planta");
  drawn.push(gasPipe);

  const again = written(drive("PIPE", [point(0, 0), point(1000, 0), enter]), "PIPE");
  ok(again.commands.every((command) => command.type === "insert"), "con IH-AF ya en el documento no se toca la capa");
  eq(messageOf(drive("PIPE", [point(0, 0), enter])), "PIPE necesita al menos dos puntos.", "un punto no es una tubería");
  eq(drive("PIPE", [enter]).result?.kind, "none", "Intro sin nada: nada");
  eq(messageOf(drive("PIPE", [keyword("Diámetro"), distance(0)])), "PIPE: el diámetro tiene que ser mayor que cero.", "diámetro cero");
  const undone = written(drive("PIPE", [point(0, 0), point(1000, 0), point(1000, 1000), keyword("desHacer"), enter]), "PIPE");
  const undonePipe = undone.inserted[0];
  assert.ok(undonePipe.type === "polyline");
  eq(undonePipe.vertices.length, 2, "desHacer retira el último vértice");
}

/* ── DUCT y CABLETRAY ───────────────────────────────────────────────────── */
{
  const driven = drive("DUCT", [point(0, 0), point(2000, 0), point(2000, 2000), enter]);
  ok(driven.prompts[0].startsWith("Inyección de aire, ancho 300 mm en AA-INY."), `receta por defecto: ${driven.prompts[0]}`);
  const { inserted, notice } = written(driven, "DUCT");
  eq(inserted.length, 2, "contorno + eje");
  const [ring, axis] = inserted;
  assert.ok(ring.type === "polyline" && axis.type === "polyline");
  ok(ring.closed && near(cadRingAreaOf(ring.vertices), 300 * 4000), "el contorno es el codo a inglete de 1.200.000");
  ok(!axis.closed && axis.vertices.length === 3 && axis.context?.presentation?.linetype?.value === "CENTER", "el eje es la polilínea de 3 vértices con CENTER");
  eq(axis.context?.metadata, { mep: "duct", service: "INY", size: 300, axis: true }, "el eje lleva la receta");
  eq(ring.context?.metadata?.outline, true, "y el contorno se marca para que el cuadro no lo cuente");
  eq(notice, "DUCT: 2 tramo(s) de inyección de aire, ancho 300 mm, 4,000 mm por el eje en la capa AA-INY.", "los números");
  drawn.push(ring, axis);

  const wide = written(drive("DUCT", [keyword("Retorno"), keyword("aNcho"), distance(500), point(0, 0), point(1000, 0), enter]), "DUCT");
  const wideRing = wide.inserted[0];
  assert.ok(wideRing.type === "polyline");
  ok(near(cadRingAreaOf(wideRing.vertices), 500_000) && wideRing.layer === "AA-RET", "Retorno de 500 de ancho en AA-RET");

  const metres = written(drive("DUCT", [point(0, 0), point(2, 0), enter], makeContext([], "m")), "DUCT");
  const metresRing = metres.inserted[0];
  assert.ok(metresRing.type === "polyline");
  ok(near(cadRingAreaOf(metresRing.vertices), 0.3 * 2), "en metros, 0,3 de ancho, no 300");

  const tray = written(drive("CABLETRAY", [point(0, 0), point(3000, 0), enter]), "CABLETRAY");
  ok(tray.inserted[0].layer === "IE-CHAROLA" && tray.inserted[1].context?.metadata?.mep === "tray", "la charola en IE-CHAROLA");
  drawn.push(...tray.inserted);
}

/* ── MEPSYMBOL ──────────────────────────────────────────────────────────── */
{
  const first = written(drive("MEPSYMBOL", [keyword("Válvula"), point(1000, 0), enter]), "MEPSYMBOL");
  eq(first.commands[0].type, "block", "la primera vez define el bloque");
  const definition = first.commands[0].type === "block" && first.commands[0].op === "define" ? first.commands[0].definition : null;
  assert.ok(definition && definition.id === "MEP-VALVULA" && definition.entities.length === 4);
  checks += 1;
  ok(first.notice.includes("bloque MEP-VALVULA definido en el dibujo"), first.notice);
  blocks.push(definition);
  const insert = first.inserted.find((entity) => entity.type === "insert");
  assert.ok(insert && insert.type === "insert" && insert.block === "MEP-VALVULA" && insert.layer === "IH-AF");
  checks += 1;
  drawn.push(insert);

  const second = written(drive("MEPSYMBOL", [keyword("Válvula"), point(2000, 0), distance(90)]), "MEPSYMBOL");
  ok(second.commands.every((command) => command.type === "insert"), "la segunda vez el bloque ya está y no se redefine");
  const rotated = second.inserted[0];
  assert.ok(rotated.type === "insert" && rotated.rotation === 90);
  checks += 1;
  drawn.push(rotated);

  const lamp = written(drive("MEPSYMBOL", [keyword("Luminaria"), point(0, 0), enter]), "MEPSYMBOL");
  ok(lamp.commands.some((command) => command.type === "layer" && command.op === "upsert" && command.layer.name === "IE-ILUM"), "una luminaria da de alta IE-ILUM");
  eq(messageOf(drive("MEPSYMBOL", [keyword("Difusor"), enter])), "MEPSYMBOL necesita un punto de inserción.", "sin punto, se dice");
}

/* ── El cuadro de instalaciones ─────────────────────────────────────────── */
{
  const handDrawn: CadEntity = { id: "mano", type: "line", start: { x: 0, y: 9000, z: 0 }, end: { x: 2500, y: 9000, z: 0 }, layer: "IH-AF" };
  const view = makeContext([...drawn, handDrawn]).document!();
  const schedule = buildCadMepSchedule(view);
  eq(schedule.runs.map((row) => [row.service.id, row.kind, row.size, Math.round(row.length), row.segments]), [
    ["INY", "duct", 300, 4000, 2],
    ["AF", "pipe", null, 2500, 1],
    ["AF", "pipe", 19, 10000, 3],
    ["GAS", "pipe", 25, 2000, 1],
    ["CHAROLA", "tray", 300, 3000, 1],
  ], "longitudes por servicio y tamaño; el contorno del ducto no cuenta, la línea a mano en IH-AF sí (sin diámetro)");
  eq(schedule.devices.map((row) => [row.blockId, row.count]), [["MEP-VALVULA", 2]], "dos válvulas");

  const table = buildCadMepScheduleTable(schedule, { x: 0, y: 0 }, "0", () => "t1", "mm");
  const row = (index: number) => table.cells.filter((cell) => cell.row === index).sort((a, b) => a.column - b.column).map((cell) => cell.text);
  eq(row(1), ["Servicio", "Capa", "Tipo", "Diám. / ancho (mm)", "Tramos", "Longitud (m)", "Cantidad"], "la cabecera");
  eq(row(4), ["Agua fría", "IH-AF", "Tubería", "19", "3", "10.00", "-"], "la de agua fría Ø19: 10,00 m");
  eq(row(3), ["Agua fría", "IH-AF", "Tubería", "-", "1", "2.50", "-"], "la dibujada a mano, sin diámetro");
  eq(row(7), ["Válvula de compuerta", "IH-AF", "Equipo", "-", "-", "-", "2"], "y las válvulas");

  const typed = drive("DATAEXTRACTION", [keyword("Instalaciones"), point(0, -5000)], makeContext([...drawn]));
  const built = written(typed, "DATAEXTRACTION Instalaciones");
  ok(built.inserted[0].type === "table", "DATAEXTRACTION Instalaciones inserta la TABLE");
  ok(messageOf(drive("DATAEXTRACTION", [keyword("Instalaciones"), point(0, 0)], makeContext([]))).includes("no hay cuadro de instalaciones que insertar"), "sin instalaciones, se niega diciéndolo");
}

console.log(`mep-tracing: ${checks} comprobaciones · codo de ducto 300 × (2.000 + 2.000) = 1.200.000 en papel; PIPE, DUCT, CABLETRAY, MEPSYMBOL y el cuadro de instalaciones por servicio y tamaño`);
