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
 *
 * LA COTA Y EL MONTANTE (Ola G, 2026-09-04). Lo que se fija aquí son cuatro
 * cosas, y la tercera es la que protege a las otras:
 *
 *   - La MISMA traza en planta, con y sin cota: teclear 2.000 a mitad de trazo
 *     mete el tramo vertical en el sitio y el cuadro suma 2.000 mm MÁS. Medida
 *     en planta —como se medía— esa tubería seguiría midiendo 3.000: el
 *     montante valía cero y el número salía redondo.
 *   - El ducto con montante: el eje sube y se cuenta en tres dimensiones; el
 *     contorno a doble línea se queda a la cota de arranque y NO se cuenta.
 *   - Un trazo a cota cero sale idéntico —los mismos vértices, los mismos
 *     metadatos y el mismo aviso palabra por palabra— y el golden
 *     `81-cad-instalaciones` se teclea entero aquí, contra el registro real,
 *     porque en este entorno no hay navegador con el que correrlo.
 *   - La misma tubería a 1.500 atraviesa el muro y a 3.500 pasa por encima: la
 *     interferencia con la arquitectura sale también para las instalaciones, y
 *     se dice al tenderla.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity, CadLayerDef } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { cadDoubleLineOutline, cadMepLayerDefinition, cadMepServiceFor, cadPathLength, cadRingAreaOf } from "./mep-support";
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

/* ── La cota y el montante: lo que el cuadro perdía ─────────────────────── */
{
  // La MISMA traza en planta, con y sin cota. Es la comparación que da el
  // número: el montante no se ve en planta y por eso valía cero.
  const llano = written(drive("PIPE", [point(0, 0), point(3000, 0), enter]), "PIPE");
  const conCota = written(drive("PIPE", [point(0, 0), keyword("Elevación"), distance(2000), point(3000, 0), enter]), "PIPE");
  const plana = llano.inserted[0];
  const montante = conCota.inserted[0];
  assert.ok(plana.type === "polyline" && montante.type === "polyline");
  eq(plana.vertices, [{ x: 0, y: 0, z: 0 }, { x: 3000, y: 0, z: 0 }], "sin cota, la tubería sigue en el suelo");
  eq(
    montante.vertices,
    [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2000 }, { x: 3000, y: 0, z: 2000 }],
    "teclear la cota a mitad de trazo mete el tramo vertical EN EL SITIO: mismo punto en planta, cota nueva",
  );
  eq(conCota.notice, "PIPE: 2 tramo(s) de agua fría Ø19 mm, 5,000 mm en la capa IH-AF. 1 montante(s), 2,000 mm verticales.", "y el aviso dice los metros que sube");

  // Lo que el cuadro contaba ayer y lo que cuenta hoy, sobre la misma tubería.
  ok(near(cadPathLength(montante.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }))), 3000), "medida en PLANTA, la tubería con montante mide 3.000: los 2.000 verticales no existían");
  ok(near(cadPathLength(montante.vertices), 5000), "medida en tres dimensiones, mide 5.000");

  const cuadroLlano = buildCadMepSchedule(makeContext([plana]).document!());
  const cuadroConCota = buildCadMepSchedule(makeContext([montante]).document!());
  ok(near(cuadroLlano.runs[0].length, 3000) && near(cuadroConCota.runs[0].length, 5000), "el cuadro suma 2.000 mm MÁS por el montante: 5.000 contra 3.000");
  eq([cuadroConCota.runs[0].risers, Math.round(cuadroConCota.runs[0].rise), cuadroConCota.runs[0].elbows], [1, 2000, 1], "un montante, 2.000 mm verticales y el codo que implica el giro");
  eq([cuadroLlano.runs[0].risers, cuadroLlano.runs[0].rise, cuadroLlano.runs[0].elbows], [0, 0, 0], "y una tubería recta en planta no inventa ni montantes ni codos");

  const tabla = buildCadMepScheduleTable(cuadroConCota, { x: 0, y: 0 }, "0", () => "t9", "mm");
  const renglon = (index: number) => tabla.cells.filter((cell) => cell.row === index).sort((a, b) => a.column - b.column).map((cell) => cell.text);
  eq(renglon(2), ["Agua fría", "IH-AF", "Tubería", "19", "2", "5.00", "-"], "el renglón de la corrida, con sus 5,00 m");
  eq(renglon(3), ["Agua fría", "IH-AF", "Montante", "19", "1", "2.00", "-"], "el de los montantes, en las mismas siete columnas");
  eq(renglon(4), ["Agua fría", "IH-AF", "Codo", "19", "-", "-", "1"], "y el de los codos deducidos de la geometría");
}

/* ── Un trazo a cota cero no cambia ni un vértice ni una palabra ────────── */
{
  // Ésta es la traza del golden `81-cad-instalaciones`, tecleada igual. Lo que
  // se fija aquí no es que funcione: es que salga IDÉNTICA a la de antes de la
  // cota, porque ese golden no se puede correr en este entorno y comprueba
  // subcadenas exactas.
  const igual = written(drive("PIPE", [point(0, 0), point(3000, 0), point(3000, 4000), enter]), "PIPE");
  const tubo = igual.inserted[0];
  assert.ok(tubo.type === "polyline");
  eq(tubo.vertices, [{ x: 0, y: 0, z: 0 }, { x: 3000, y: 0, z: 0 }, { x: 3000, y: 4000, z: 0 }], "los mismos tres vértices a cota cero que escribía la Ola F");
  eq(tubo.context?.metadata, { mep: "pipe", service: "AF", size: 19 }, "y los mismos tres metadatos: ni uno nuevo, que el golden los compara con igualdad exacta");
  eq(igual.notice, "PIPE: 2 tramo(s) de agua fría Ø19 mm, 7,000 mm en la capa IH-AF.", "el aviso, palabra por palabra: sin montantes no hay nada que añadir");
}

/* ── El golden 81, tecleado aquí para poder correrlo ────────────────────── */
{
  // `e2e/golden/81-cad-instalaciones.spec.ts` comprueba subcadenas exactas
  // contra un navegador y no corre en este entorno. Aquí se teclea la MISMA
  // secuencia contra el registro real y se afirman las mismas cadenas, para
  // que romperlas se note en segundos y no en la ventana de integración.
  const entidades: CadEntity[] = [];
  const capas: CadLayerDef[] = [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }];
  const bloques: CadBlockDefinition[] = [];
  let ids = 0;
  const contexto = (): CadCommandContext => ({
    entityIds: entidades.map((entity) => entity.id),
    entity: (id) => entidades.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "0",
    unit: "mm",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `g${++ids}`,
    layers: () => capas,
    blocks: () => bloques,
    document: () => ({ meta: { version: 1, schema: 9, unit: "mm" }, entities: entidades, layers: capas, blocks: bloques, styles: { text: {}, dimension: {}, table: {}, plot: {} }, externalReferences: [], modelSpace: { entityIds: entidades.map((entity) => entity.id) }, unsupportedEntities: [], lossManifest: [] }) as never,
  });
  const aplicar = (driven: ReturnType<typeof written>) => {
    for (const command of driven.commands) {
      if (command.type === "insert") entidades.push(command.entity as CadEntity);
      else if (command.type === "layer" && command.op === "upsert") capas.push(command.layer);
      else if (command.type === "block" && command.op === "define") bloques.push(command.definition);
    }
  };

  const tuberia = drive("PIPE", [point(0, 0), point(3000, 0), point(3000, 4000), enter], contexto());
  ok(tuberia.prompts[0].includes("Agua fría Ø19 mm en IH-AF"), `«Agua fría Ø19 mm en IH-AF» sigue en el prompt: ${tuberia.prompts[0]}`);
  const escritaTuberia = written(tuberia, "PIPE");
  ok(escritaTuberia.notice.includes("PIPE: 2 tramo(s) de agua fría Ø19 mm, 7,000 mm en la capa IH-AF."), `y la frase entera del registro: ${escritaTuberia.notice}`);
  aplicar(escritaTuberia);

  const ducto = drive("DUCT", [point(0, 6000), point(4000, 6000), enter], contexto());
  ok(ducto.prompts[0].includes("Inyección de aire, ancho 300 mm en AA-INY"), `la receta del ducto: ${ducto.prompts[0]}`);
  const escritoDucto = written(ducto, "DUCT");
  ok(escritoDucto.notice.includes("DUCT: 1 tramo(s) de inyección de aire, ancho 300 mm, 4,000 mm por el eje en la capa AA-INY."), `y su frase entera: ${escritoDucto.notice}`);
  aplicar(escritoDucto);

  const valvula = written(drive("MEPSYMBOL", [keyword("Válvula"), point(1500, 0), enter], contexto()), "MEPSYMBOL");
  ok(valvula.notice.includes("bloque MEP-VALVULA definido en el dibujo"), valvula.notice);
  aplicar(valvula);

  const cuadro = drive("DATAEXTRACTION", [keyword("Instalaciones"), point(8000, 0)], contexto());
  ok(cuadro.prompts.some((mensaje) => mensaje.includes("cuadro de instalaciones")), "DX Instalaciones se anuncia como el cuadro de instalaciones");
  const escritoCuadro = written(cuadro, "DATAEXTRACTION Instalaciones");
  const tabla = escritoCuadro.inserted[0];
  assert.ok(tabla.type === "table");
  const renglon = (index: number) => tabla.cells.filter((cell) => cell.row === index).sort((a, b) => a.column - b.column).map((cell) => cell.text);
  eq(renglon(1), ["Servicio", "Capa", "Tipo", "Diám. / ancho (mm)", "Tramos", "Longitud (m)", "Cantidad"], "la cabecera del golden, con sus siete columnas de siempre");
  eq(renglon(2), ["Inyección de aire", "AA-INY", "Ducto", "300", "1", "4.00", "-"], "el renglón 2 del golden");
  eq(renglon(3), ["Agua fría", "IH-AF", "Tubería", "19", "2", "7.00", "-"], "el renglón 3 del golden: 7,00 m, los mismos de la Ola F");
  eq(renglon(4), ["Válvula de compuerta", "IH-AF", "Equipo", "-", "-", "-", "1"], "y el renglón 4, la válvula");
  eq(renglon(5), ["Agua fría", "IH-AF", "Codo", "19", "-", "-", "1"], "lo nuevo va DESPUÉS: el codo del giro en (3000, 0)");
  eq(capas.map((capa) => capa.name).filter((nombre) => nombre === "IH-AF" || nombre === "AA-INY"), ["IH-AF", "AA-INY"], "y las dos capas nacieron, como afirma el golden");
}

/* ── El ducto con montante: el eje cuenta, el contorno no ───────────────── */
{
  const driven = written(drive("DUCT", [point(0, 0), point(4000, 0), keyword("Elevación"), distance(2500), enter]), "DUCT");
  const [contorno, eje] = driven.inserted;
  assert.ok(contorno.type === "polyline" && eje.type === "polyline");
  eq(eje.vertices.map((vertex) => vertex.z), [0, 0, 2500], "el eje sube al plafón: la cota está en cada vértice");
  eq([...new Set(contorno.vertices.map((vertex) => vertex.z))], [0], "el contorno se queda a la cota de arranque: es la proyección del ancho, no una sección");
  ok(near(cadRingAreaOf(contorno.vertices), 300 * 4000), "y sigue siendo el rectángulo de 300 × 4.000 en planta");
  ok(driven.notice.includes("6,500 mm por el eje"), `el eje mide 4.000 + 2.500 = 6.500: ${driven.notice}`);
  ok(driven.notice.includes("El contorno queda a la cota de arranque (0 mm): la doble línea es planta."), "y el aviso declara dónde quedó el contorno");

  const cuadro = buildCadMepSchedule(makeContext([contorno, eje]).document!());
  eq(cuadro.runs.length, 1, "un solo renglón: el contorno no es una corrida");
  ok(near(cuadro.runs[0].length, 6500), `el cuadro cuenta el EJE en tres dimensiones y no el perímetro del contorno (${cuadro.runs[0].length})`);
  eq([cuadro.runs[0].risers, Math.round(cuadro.runs[0].rise), cuadro.runs[0].elbows], [1, 2500, 1], "con su montante y su codo");
}

/* ── Lo que sólo sube: la tubería sí, el ducto no y lo dice ─────────────── */
{
  // Una bajada del plafón al mueble es tubo que se compra aunque en planta sea
  // un punto: PIPE la escribe.
  const bajada = written(drive("PIPE", [point(1000, 1000), keyword("Elevación"), distance(-900), enter]), "PIPE");
  const tubo = bajada.inserted[0];
  assert.ok(tubo.type === "polyline");
  eq(tubo.vertices, [{ x: 1000, y: 1000, z: 0 }, { x: 1000, y: 1000, z: -900 }], "una bajada de 900 bajo el nivel de piso: la cota es un dato, no un error, y no se toma en valor absoluto");
  ok(bajada.notice.includes("900 mm verticales"), `y se cuenta entera: ${bajada.notice}`);

  // El ducto NO: su contorno es planta, y en planta eso es un punto.
  const soloSube = messageOf(drive("DUCT", [point(0, 0), keyword("Elevación"), distance(2500), enter]));
  ok(soloSube.startsWith("DUCT necesita un ancho mayor que cero y dos puntos distintos."), `la frase de siempre sigue delante: ${soloSube}`);
  ok(soloSube.includes("Un tramo que sólo sube no tiene contorno en planta"), "y detrás, la causa nueva que la cota trajo");
}

/* ── La interferencia con la arquitectura, también para las instalaciones ─ */
{
  // Muro de 10 m, 200 de grueso y 3 m de alto, como en `plant/clash.spec.ts`.
  const muro = { id: "w1", type: "wall", start: { x: 0, y: 0, z: 0 }, end: { x: 10_000, y: 0, z: 0 }, thickness: 200, height: 3_000, layer: "MUROS" } as unknown as CadEntity;
  const dentro = written(drive("PIPE", [keyword("Elevación"), distance(1500), point(2000, -1000), point(2000, 1000), enter], makeContext([muro])), "PIPE");
  ok(/CHOQUE contra w1 con 109\.5 de calado/.test(dentro.notice), `la tubería a media altura atraviesa el muro y se dice al tenderla: ${dentro.notice}`);
  ok(dentro.notice.includes("Distancia medida con el diámetro NOMINAL"), "con su límite al lado, como en PIDROUTE");
  ok(!/montante/.test(dentro.notice), "y elevar ANTES del primer punto no inventa un montante: no hay de dónde subir");

  const encima = written(drive("PIPE", [keyword("Elevación"), distance(3500), point(2000, -1000), point(2000, 1000), enter], makeContext([muro])), "PIPE");
  eq(encima.notice, "PIPE: 1 tramo(s) de agua fría Ø19 mm, 2,000 mm en la capa IH-AF.", "la MISMA traza en planta, medio metro por encima del muro, no choca con nada: el aviso queda como el de siempre");

  const sinMuros = written(drive("PIPE", [point(2000, -1000), point(2000, 1000), enter]), "PIPE");
  eq(sinMuros.notice, "PIPE: 1 tramo(s) de agua fría Ø19 mm, 2,000 mm en la capa IH-AF.", "y un dibujo sin nada construido no inventa choques");
}

console.log(`mep-tracing: ${checks} comprobaciones · codo de ducto 300 × (2.000 + 2.000) = 1.200.000 en papel; PIPE, DUCT, CABLETRAY, MEPSYMBOL y el cuadro de instalaciones por servicio y tamaño; el montante de 2.000 suma 2.000 mm al cuadro que en planta valían cero, un trazo a cota cero sale idéntico —golden 81 tecleado entero— y la tubería que atraviesa el muro lo dice al tenderla`);
