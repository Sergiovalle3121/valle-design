/**
 * COGO y CUADROCONSTRUCCION de punta a punta (Ola I, 3er entregable).
 *
 * El recorrido completo, sin atajos: el cuadro de cinco lados de un predio se
 * PEGA en COGO, un tramo por renglón; sale una polilínea de seis vértices en
 * milímetros del dibujo con el cierre declarado y sin cerrar a la fuerza; con
 * `Compensar` sale la misma poligonal cerrada exacta y el aviso dice cuánto se
 * movió el vértice que más se movió. Esa polilínea se designa después en
 * CUADROCONSTRUCCION, que emite la entidad TABLE con las siete columnas del
 * Registro Público —`EST · PV · RUMBO · DISTANCIA · V · X · Y`— y el renglón
 * de superficie.
 *
 * Y la comprobación que da sentido a todo: con el marcador GEO de la zona 14N
 * puesto en el origen del dibujo, la columna X del vértice 1 es el ESTE UTM
 * que le corresponde, no una coordenada local disfrazada.
 */
// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "../../cad-document";
import type { CadTableCell } from "../../cad-entities-v4";
import type { CadAnyCommandDescriptor, CadCommandContext, CadCommandInput } from "../command-types";
import { cadGeoreferenceMarker } from "../../georeference";
import { geoUtmCrs } from "../../../geo/crs";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_GEO_COGO_COMMANDS, CAD_CUADRO_TEXT_HEIGHT, cadCuadroRing } from "./geo-cogo";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} (era ${actual}, se esperaba ${expected} ± ${tolerance})`);
  checks += 1;
};

/* ── Los dos descriptores ───────────────────────────────────────────────── */
const byName = new Map(CAD_GEO_COGO_COMMANDS.map((command) => [command.name, command]));
eq([...byName.keys()], ["COGO", "CUADROCONSTRUCCION"], "el módulo trae las dos órdenes");
for (const command of CAD_GEO_COGO_COMMANDS) {
  ok(command.mutates && command.repeatable, `${command.name} escribe y se repite con Espacio`);
  ok(command.aliases.length > 0, `${command.name} tiene alias en español`);
}

/* ── El contexto ────────────────────────────────────────────────────────── */
const baseLayer: CadLayerDef = { id: "0", name: "0", color: "#ffffff", visible: true, locked: false };
function makeContext(entities: CadEntity[] = [], unit = "mm", selection: string[] = []): CadCommandContext {
  let ids = 0;
  const layers = [baseLayer];
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection,
    activeLayer: "TOPOGRAFIA",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `c${++ids}`,
    layers: () => layers,
    blocks: () => [],
    document: () =>
      ({
        meta: { version: 1, schema: 9, unit },
        entities,
        layers,
        blocks: [],
        styles: { text: {}, dimension: {}, table: {}, plot: {} },
        externalReferences: [],
        modelSpace: { entityIds: entities.map((entity) => entity.id) },
        unsupportedEntities: [],
        lossManifest: [],
      }) as never,
  };
}
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });

function drive(command: CadAnyCommandDescriptor, inputs: readonly CadCommandInput[], context = makeContext()) {
  let step = command.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = command.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts };
}

const COGO = byName.get("COGO")!;
const CUADRO = byName.get("CUADROCONSTRUCCION")!;

/* ── El cuadro que se pega, el mismo de `geo-cogo.spec.ts` ──────────────── */
const CUADRO_PEGADO = [
  '1 N 89°58\'20" E 42.150',
  '2 S 12°04\'10" E 28.300',
  '3 S 78°22\'45" W 24.860',
  '4 N 62°15\'30" W 21.400',
  '5 N 11°53\'00" W 23.197',
].join("\n");

/* ── 1. COGO: el cuadro pegado sale como polilínea, sin cerrarse a la fuerza ── */
let openPolyline: CadEntity;
{
  const driven = drive(COGO, [point(0, 0), text(CUADRO_PEGADO), keyword("Terminar"), keyword("Sí")]);
  ok(driven.prompts[0].includes("las distancias se leen en metros"), `el primer prompt dice en qué unidad lee: ${driven.prompts[0]}`);
  ok(driven.prompts[1].includes("pegue el cuadro completo"), "y el segundo invita a pegar el cuadro entero");
  const plan = driven.prompts[3];
  ok(plan.includes('1-2  N 89°58\'20" E  42.150 m'), `el plan enseña cada lado con su rumbo y su distancia:\n${plan}`);
  ok(plan.includes("perímetro 139.907 m"), "el perímetro");
  ok(plan.includes("superficie 1231.53 m² (Gauss)"), `la superficie por Gauss: ${plan}`);
  ok(plan.includes("cierre 0.401 mm"), "el error de cierre en milímetros");
  ok(plan.includes("precisión 1:348,787"), "y su precisión 1:N");
  ok(plan.includes("NO se cierra a la fuerza"), "y dice, con todas sus letras, que no lo cierra");
  ok(plan.includes("1 m = 1000 mm del dibujo"), "y qué escala aplicó");
  ok(plan.includes("no se aplica el factor de escala de la proyección"), "y lo que todavía no hace");

  const result = driven.result;
  assert.ok(result && result.kind === "document", `COGO debía escribir, dio ${result?.kind}`);
  eq(result.label, "COGO", "la etiqueta de deshacer");
  eq(result.commands.length, 1, "UN lote con UNA polilínea: la frontera de deshacer es la orden");
  const inserted = result.commands[0];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "polyline");
  const polyline = inserted.entity;
  eq(polyline.vertices.length, 6, "seis vértices: la estación 1 y el punto de cada uno de los cinco tramos");
  eq(polyline.closed, false, "abierta: el cierre se declara, no se fuerza");
  eq(polyline.layer, "TOPOGRAFIA", "en la capa activa, como cualquier orden de dibujo");
  // Las distancias se leyeron en METROS y el dibujo está en milímetros.
  near(polyline.vertices[1].x, 42_150, 0.5, "el primer lado mide 42.150 m = 42 150 mm hacia el este");
  near(polyline.vertices[1].y, 20.4, 0.5, "y sube 20 mm: N 89°58'20\" E casi no sube");
  const last = polyline.vertices[5];
  near(Math.hypot(last.x, last.y), 0.401, 0.01, "el último vértice queda a 0.401 mm del primero, y ahí se queda");
  eq(polyline.context?.metadata?.compensada, false, "la procedencia dice que NO está compensada");
  eq(polyline.context?.metadata?.precision, "1:348,787", "y lleva su precisión escrita");
  near(polyline.context?.metadata?.superficie_m2 as number, 1231.526, 1e-3, "y la superficie en metros cuadrados");
  ok((result.notice ?? "").includes("Cierre 0.401 mm"), `el aviso registrado dice el cierre: ${result.notice}`);
  openPolyline = { ...(polyline as CadEntity), id: "predio-abierto" };
}

/* ── 2. COGO Compensar: cierra exacto y dice cuánto movió ───────────────── */
let closedPolyline: CadEntity;
{
  const driven = drive(COGO, [point(0, 0), text(CUADRO_PEGADO), keyword("Terminar"), keyword("Compensar")]);
  const result = driven.result;
  assert.ok(result && result.kind === "document", "Compensar también escribe");
  const inserted = result.commands[0];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "polyline");
  const polyline = inserted.entity;
  eq(polyline.vertices.length, 5, "compensada son CINCO vértices: el de retorno ya es el primero");
  eq(polyline.closed, true, "y la polilínea sí está cerrada");
  eq(polyline.context?.metadata?.compensada, true, "la procedencia lo dice");
  near(polyline.context?.metadata?.desplazamiento_max_mm as number, 0.4, 0.1, "y cuánto se movió el vértice que más se movió");
  ok((result.notice ?? "").includes("regla del compás"), `el aviso nombra la regla que aplicó: ${result.notice}`);
  ok((result.notice ?? "").includes("se repartió"), "y dice que repartió el error, no que lo escondió");
  closedPolyline = { ...(polyline as CadEntity), id: "predio" };
}

/* ── 3. COGO no dibuja lo que no entendió ───────────────────────────────── */
{
  const roto = ['1 N 89°58\'20" E 42.150', '2 X 12°04\'10" E 28.300'].join("\n");
  const driven = drive(COGO, [point(0, 0), text(roto), keyword("Terminar")]);
  assert.ok(driven.result?.kind === "message", "se para en seco");
  const message = driven.result.kind === "message" ? driven.result.text : "";
  ok(message.includes("renglón 2"), `dice QUÉ renglón: ${message}`);
  ok(message.includes("empieza por N o por S"), "y por qué");
  ok(message.includes("le falta un lado la cierra sola"), "y por qué no dibuja el resto");

  const vacio = drive(COGO, [point(0, 0), keyword("Terminar")]);
  assert.ok(vacio.result?.kind === "message" && vacio.result.text.includes("no se tecleó ningún tramo"), "sin tramos no hay poligonal");

  const noDibuja = drive(COGO, [point(0, 0), text(CUADRO_PEGADO), keyword("Terminar"), keyword("No")]);
  assert.ok(noDibuja.result?.kind === "message" && noDibuja.result.text === "COGO: no se dibujó nada.", "y «No» no escribe nada");
}

/* ── 4. Unidades: quien dibuja en unidades del documento lo dice ────────── */
{
  const driven = drive(COGO, [keyword("Unidades"), point(0, 0), text('N 90°00\'00" E 42.150'), keyword("Terminar"), keyword("Sí")]);
  const result = driven.result;
  assert.ok(result && result.kind === "document");
  const inserted = result.commands[0];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "polyline");
  near(inserted.entity.vertices[1].x, 42.15, 1e-9, "en unidades del dibujo, 42.150 son 42.15 unidades y no 42 150");
}

/* ── 5. CUADROCONSTRUCCION: la TABLE con las siete columnas ─────────────── */
{
  const context = makeContext([closedPolyline], "mm");
  const driven = drive(CUADRO, [{ kind: "entityPick", entityId: "predio", point: { x: 0, y: 0 } }, point(100_000, 50_000), keyword("Sí")], context);
  ok(driven.prompts[1].includes("Predio de 5 lados"), `reconoce el predio: ${driven.prompts[1]}`);
  const plan = driven.prompts[2];
  ok(plan.includes("EST  PV  RUMBO  DISTANCIA  V  X  Y"), `el plan enseña el encabezado del Registro:\n${plan}`);
  ok(plan.includes("no está georreferenciado"), "y avisa de que las coordenadas son locales");

  const result = driven.result;
  assert.ok(result && result.kind === "document", `debía emitir la tabla, dio ${result?.kind}`);
  eq(result.label, "CUADROCONSTRUCCION", "la etiqueta de deshacer");
  const inserted = result.commands[0];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "table");
  const table = inserted.entity;
  eq(table.rows, 8, "ocho filas: el título, el encabezado, los cinco lados y la superficie");
  eq(table.columns, 7, "siete columnas: EST · PV · RUMBO · DISTANCIA · V · X · Y");
  eq(table.insertion, { x: 100_000, y: 50_000, z: 0 }, "la inserción es la esquina superior izquierda que se precisó");
  eq(table.rowHeights.length, 8, "una altura por fila");
  eq(table.rowHeights[0], CAD_CUADRO_TEXT_HEIGHT * 2, "la fila mide dos alturas de texto");
  eq(table.columnWidths, [4, 4, 18, 10, 4, 14, 14].map((factor) => factor * CAD_CUADRO_TEXT_HEIGHT), "y cada columna, lo que su contenido pide");
  eq(table.cells.length, 1 + 7 + 35 + 2, "45 celdas: título, encabezado, 5 × 7 y las dos de la superficie");

  const cellAt = (row: number, column: number): CadTableCell | undefined => table.cells.find((cell) => cell.row === row && cell.column === column);
  eq(cellAt(0, 0)?.text, "CUADRO DE CONSTRUCCIÓN", "el título");
  eq(cellAt(0, 0)?.columnSpan, 7, "que ocupa las siete columnas");
  eq([0, 1, 2, 3, 4, 5, 6].map((column) => cellAt(1, column)?.text), ["EST", "PV", "RUMBO", "DISTANCIA", "V", "X", "Y"], "el encabezado, celda a celda");
  eq(cellAt(2, 0)?.text, "1", "EST del primer lado");
  eq(cellAt(2, 1)?.text, "2", "PV del primer lado");
  // Un segundo menos que el rumbo tecleado, y es correcto: compensar movió el
  // vértice 2 cuatro décimas de milímetro, y sobre un lado de 42 m eso es
  // justo un segundo de arco. Por eso un cuadro publica los rumbos
  // RECALCULADOS sobre las coordenadas que publica: así la lámina es
  // consistente consigo misma, que es lo que el Registro comprueba.
  eq(cellAt(2, 2)?.text, "N 89°58'19\" E", "y su rumbo, recalculado sobre los vértices ya compensados");
  eq(cellAt(2, 3)?.text, "42.150", "y su distancia en metros, al milímetro");
  eq(cellAt(2, 4)?.text, "1", "V del primer renglón es la propia estación");
  eq(cellAt(2, 5)?.text, "0.000", "X local del vértice 1");
  eq(cellAt(2, 6)?.text, "0.000", "Y local del vértice 1");
  eq(cellAt(6, 1)?.text, "1", "el quinto lado vuelve a la estación 1: el cuadro cierra la figura");
  eq(cellAt(7, 0)?.text, "SUPERFICIE", "el renglón de superficie");
  eq(cellAt(7, 0)?.columnSpan, 4, "que ocupa hasta la columna de la distancia");
  eq(cellAt(7, 4)?.text, "1,231.52 m²", "y la superficie por Gauss del predio compensado, en metros cuadrados");
  eq(cellAt(2, 3)?.alignment, "middle-right", "los números van a la derecha, como en una tabla de verdad");
  eq(cellAt(2, 0)?.alignment, "middle-center", "y las estaciones, centradas");
  eq(table.cells.every((cell) => cell.textHeight === CAD_CUADRO_TEXT_HEIGHT), true, "cada celda lleva su altura de texto");
  eq(table.context?.metadata?.sistema, "local", "la procedencia dice en qué sistema están las coordenadas");
  near(table.context?.metadata?.superficie_m2 as number, 1231.518, 1e-3, "y la superficie: ocho milímetros cuadrados menos que la poligonal cruda, que es lo que costó compensarla");
  ok((result.notice ?? "").includes("1,231.52 m²"), `el aviso registrado lleva la superficie: ${result.notice}`);
  ok((result.notice ?? "").includes("factor de escala de la proyección"), "y lo que todavía no hace");
}

/* ── 6. Con el marcador GEO, X e Y son el este y el norte de verdad ─────── */
{
  const marker = cadGeoreferenceMarker("geo-1", { x: 0, y: 0 }, geoUtmCrs(14), 660_000, 2_140_000) as unknown as CadEntity;
  const context = makeContext([closedPolyline, marker], "mm");
  const driven = drive(CUADRO, [{ kind: "entityPick", entityId: "predio", point: { x: 0, y: 0 } }, point(0, 0), keyword("Sí")], context);
  const result = driven.result;
  assert.ok(result && result.kind === "document");
  const inserted = result.commands[0];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "table");
  const table = inserted.entity;
  const cellAt = (row: number, column: number) => table.cells.find((cell) => cell.row === row && cell.column === column);
  // El vértice 1 está en el origen del dibujo, que es donde se clavó el
  // marcador: su ESTE es exactamente el del marcador.
  eq(cellAt(2, 5)?.text, "660,000.000", "la X del vértice 1 es el este UTM de la zona 14N, no una coordenada local");
  eq(cellAt(2, 6)?.text, "2,140,000.000", "y la Y, su norte");
  // Y el vértice 2 está 42.150 m al este: el este crece exactamente eso.
  eq(cellAt(3, 5)?.text, "660,042.150", "el vértice 2 está 42.150 m al este del 1, y el cuadro lo dice en coordenadas UTM");
  eq(cellAt(2, 3)?.text, "42.150", "la distancia no cambia por georreferenciar: trasladar no estira nada");
  eq(cellAt(7, 4)?.text, "1,231.52 m²", "ni la superficie");
  eq(table.context?.metadata?.sistema, "EPSG:32614", "la procedencia nombra el sistema");
  ok((result.notice ?? "").includes("WGS 84 / UTM zona 14N"), `y el aviso también: ${result.notice}`);
  ok(driven.prompts[2].includes("por el marcador de la capa GEO"), "el plan dice de dónde salen las coordenadas");
}

/* ── 7. Altura e Invertir rehacen el plan sin tocar el dibujo ───────────── */
{
  const context = makeContext([closedPolyline], "mm");
  const driven = drive(
    CUADRO,
    [{ kind: "entityPick", entityId: "predio", point: { x: 0, y: 0 } }, point(0, 0), keyword("Altura"), distance(250), keyword("Sí")],
    context,
  );
  const result = driven.result;
  assert.ok(result && result.kind === "document");
  const inserted = result.commands[0];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "table");
  eq(inserted.entity.rowHeights[0], 500, "la altura de texto 250 hace filas de 500");
  eq(inserted.entity.cells[0].textHeight, 250, "y celdas de 250");

  const reversed = drive(
    CUADRO,
    [{ kind: "entityPick", entityId: "predio", point: { x: 0, y: 0 } }, point(0, 0), keyword("Invertir"), keyword("Sí")],
    makeContext([closedPolyline], "mm"),
  );
  const reversedResult = reversed.result;
  assert.ok(reversedResult && reversedResult.kind === "document");
  const reversedTable = reversedResult.commands[0];
  assert.ok(reversedTable.type === "insert" && reversedTable.entity.type === "table");
  const first = reversedTable.entity.cells.find((cell) => cell.row === 2 && cell.column === 2);
  eq(first?.text, "S 11°53'00\" E", "invertido, el primer lado es el recíproco del último: mismo predio, otro sentido");
  const area = reversedTable.entity.cells.find((cell) => cell.row === 7 && cell.column === 4);
  eq(area?.text, "1,231.52 m²", "y la superficie no cambia por recorrerlo al revés");
}

/* ── 8. Lo que no es un predio se rechaza con su motivo ─────────────────── */
{
  const line: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" } as CadEntity;
  const driven = drive(CUADRO, [{ kind: "entityPick", entityId: "l1", point: { x: 0, y: 0 } }], makeContext([line]));
  assert.ok(driven.result?.kind === "message" && driven.result.text.includes("se designó LINE"), `una LINE no es un predio: ${JSON.stringify(driven.result)}`);

  const abierta = cadCuadroRing(openPolyline, "predio-abierto");
  ok("reason" in abierta && abierta.reason.includes("no está cerrada"), `la poligonal SIN compensar no está cerrada y se dice: ${JSON.stringify(abierta)}`);

  const conArco: CadEntity = {
    id: "arco",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 0.5 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    closed: true,
    layer: "0",
  } as CadEntity;
  const arco = cadCuadroRing(conArco, "arco");
  ok("reason" in arco && arco.reason.includes("ARCO"), "un lado curvo se rechaza diciendo que todavía no se publican lados curvos");

  const corta = cadCuadroRing({ id: "p", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], closed: true, layer: "0" } as CadEntity, "p");
  ok("reason" in corta && corta.reason.includes("tres o más"), "dos vértices no son un predio");

  // Una polilínea que vuelve al primer vértice ES cerrada aunque no lleve la marca.
  const duplicada = cadCuadroRing(
    { id: "d", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }], closed: false, layer: "0" } as CadEntity,
    "d",
  );
  ok("ring" in duplicada && duplicada.ring.length === 3, "y el vértice repetido del final no se cuenta dos veces");
}

/* ── 9. La selección previa se aprovecha, como en cualquier orden ───────── */
{
  const context = makeContext([closedPolyline], "mm", ["predio"]);
  const step = CUADRO.begin(context);
  ok(step.prompt.message.includes("Precise el punto de inserción"), `con el predio ya designado, CUADROCONSTRUCCION pide directamente la inserción: ${step.prompt.message}`);
}

/* ── 10. Tecleadas LLEGAN: el registro y la tabla de alias ──────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  ok(CAD_COMMAND_REGISTRY_V2.get("COGO") !== undefined, "COGO está en el registro: se puede teclear");
  ok(CAD_COMMAND_REGISTRY_V2.get("CUADROCONSTRUCCION") !== undefined, "CUADROCONSTRUCCION también");
  // El pipeline de ENTRADA resuelve por `alias-table.ts` y no por el
  // descriptor (medido en la Ola E con DX): sin su línea en la tabla,
  // «poligonal» tecleado no llega aunque el descriptor lo declare.
  eq(resolveCadCommandAlias("poligonal", known), "COGO", "«poligonal» tecleado llega a COGO");
  eq(resolveCadCommandAlias("rumbos", known), "COGO", "«rumbos» tecleado llega a COGO");
  eq(resolveCadCommandAlias("cuadro", known), "CUADROCONSTRUCCION", "«cuadro» tecleado llega a CUADROCONSTRUCCION");
  eq(resolveCadCommandAlias("cogotable", known), "CUADROCONSTRUCCION", "y «cogotable», el nombre de AutoCAD Map");
}

console.log(`engine/commands/geo-cogo.spec.ts: ${checks} comprobaciones en verde.`);
