/**
 * TEXT, MTEXT y DDEDIT contra el registro del PRODUCTO.
 *
 * No se monta un registro de juguete: se pide `TEXT` al mismo
 * `CAD_COMMAND_REGISTRY_V2` que lee la línea de comandos, porque una orden con
 * la spec verde y sin registrar no existe para nadie.
 *
 * Y no basta con mirar el lote emitido: se aplica por la ÚNICA ruta de mutación,
 * se serializa, se reabre y se comprueba que el rótulo sigue ahí. Una orden que
 * produce entidades bonitas y no sobrevive al guardado no ha hecho nada.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import { layoutCadMText } from "../../mtext-layout";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const close = (actual: number, expected: number, message: string, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
  checks += 1;
};

const layer = "ROTULOS";

function document(entities: CadEntity[] = []): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Rótulos", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(doc: CadDocument, selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc = document(),
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(doc, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function commandsOf(result: CadCommandResult | undefined): readonly CadEntityCommand[] {
  assert.ok(result?.kind === "document", `debía escribir; dio ${result?.kind}`);
  if (result?.kind !== "document") throw new Error("tipo");
  checks += 1;
  return result.commands;
}

function insertedEntity(result: CadCommandResult | undefined) {
  const command = commandsOf(result).find((item) => item.type === "insert");
  assert.ok(command?.type === "insert", "debía insertar una entidad");
  if (command?.type !== "insert") throw new Error("tipo");
  checks += 1;
  return command.entity;
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const enter: CadCommandInput = { kind: "enter" };

// --- los alias del vocabulario resuelven -------------------------------------------
{
  for (const [alias, canonical] of [
    ["DT", "TEXT"],
    ["T", "MTEXT"],
    ["MT", "MTEXT"],
    ["ED", "DDEDIT"],
  ] as const)
    eq(CAD_COMMAND_REGISTRY_V2.get(alias)?.name, canonical, `${alias} debe llevar a ${canonical}`);
}

// --- TEXT: camino feliz, con anclas absolutas ---------------------------------------
{
  const entity = insertedEntity(
    run("TEXT", [point(1_000, 500), distance(250), distance(30), text("SALA DE MÁQUINAS")]),
  );
  eq(entity.type, "mtext", "TEXT materializa un MTEXT (el tipo `text` heredado no es nativo)");
  if (entity.type !== "mtext") throw new Error("tipo");
  eq(entity.insertion, { x: 1_000, y: 500, z: 0 }, "punto de inserción exacto");
  eq(entity.text, "SALA DE MÁQUINAS", "el texto se guarda tal cual");
  eq(entity.height, 250, "altura tecleada");
  eq(entity.rotation, 30, "rotación tecleada");
  eq(entity.layer, layer, "nace en la capa activa");
  // Ancla absoluta del ancho: la caja de un TEXT se ajusta al texto para que
  // NUNCA se parta. Con `width` ausente la maqueta usaría 20 × la altura y un
  // rótulo largo se partiría en dos líneas.
  const layout = layoutCadMText(entity);
  eq(layout.lines.length, 1, "un TEXT es UNA línea, no se ajusta");
  ok((entity.width ?? 0) >= 250, "el ancho medido cubre al menos la altura");
}

// --- TEXT: Enter acepta lo propuesto --------------------------------------------------
{
  const entity = insertedEntity(run("TEXT", [point(0, 0), enter, enter, text("EJE")]));
  if (entity.type !== "mtext") throw new Error("tipo");
  eq(entity.height, 120, "altura por defecto");
  eq(entity.rotation, undefined, "sin rotación no se materializa el campo");
}

// --- TEXT: justificación ---------------------------------------------------------------
{
  const entity = insertedEntity(
    run("TEXT", [keyword("Justificar"), keyword("Centro"), point(0, 0), enter, enter, text("N")]),
  );
  if (entity.type !== "mtext") throw new Error("tipo");
  eq(entity.alignment, "top-center", "Centro alinea arriba al centro");
}

// --- TEXT: rechazo. Un rótulo vacío no es un rótulo -------------------------------------
{
  const result = run("TEXT", [point(0, 0), enter, enter, text("   ")]);
  eq(result?.kind, "none", "un texto en blanco no escribe nada");
  const cancelled = run("TEXT", [point(0, 0), { kind: "cancel" }]);
  eq(cancelled?.kind, "none", "Esc no deja nada");
}

// --- MTEXT: la caja se normaliza aunque se marque al revés --------------------------------
{
  // Se marca la esquina INFERIOR DERECHA primero. El punto de inserción de un
  // MTEXT alineado arriba a la izquierda es la SUPERIOR IZQUIERDA: si se tomara
  // la primera esquina tal cual, el párrafo saldría fuera del recuadro dibujado.
  const entity = insertedEntity(
    run("MTEXT", [point(5_000, 0), point(1_000, 3_000), text("Muro cortafuego 2 h"), enter]),
  );
  if (entity.type !== "mtext") throw new Error("tipo");
  eq(entity.insertion, { x: 1_000, y: 3_000, z: 0 }, "esquina superior izquierda");
  eq(entity.width, 4_000, "ancho = |Δx| de las dos esquinas");
  eq(entity.alignment, "top-left", "alineación por defecto");
}

// --- MTEXT: opciones antes de la segunda esquina -------------------------------------------
{
  const entity = insertedEntity(
    run("MTEXT", [
      point(0, 0),
      keyword("Altura"),
      distance(300),
      keyword("Columnas"),
      distance(2),
      keyword("Interlineado"),
      distance(1.5),
      point(6_000, -2_000),
      // Cada línea tecleada es un párrafo: se acumulan y Enter remata. Es el
      // gesto del editor en sitio, y lo que distingue MTEXT de TEXT.
      text("uno"),
      text("dos"),
      text("tres"),
      text("cuatro"),
      enter,
    ]),
  );
  if (entity.type !== "mtext") throw new Error("tipo");
  eq(entity.height, 300, "altura por opción");
  eq(entity.columns, 2, "dos columnas");
  eq(entity.lineSpacing, 1.5, "interlineado");
  const layout = layoutCadMText(entity);
  eq(layout.lines.length, 4, "cuatro párrafos, cuatro líneas");
  eq(layout.lines.map((line) => line.column), [0, 0, 1, 1], "dos por columna");
}

// --- MTEXT: rechazo razonado de un número de columnas imposible ------------------------------
{
  const result = run("MTEXT", [point(0, 0), keyword("Columnas"), distance(40)]);
  eq(result?.kind, "message", "se niega en vez de crear 40 columnas");
  ok(
    result?.kind === "message" && result.text.includes("40"),
    "y dice cuántas se pidieron, no un genérico",
  );
}

// --- MTEXT: Apilar compone la tolerancia sin saberse la sintaxis --------------------------------
{
  const entity = insertedEntity(
    run("MTEXT", [
      point(0, 0),
      point(4_000, -1_000),
      text("Ø25"),
      // El texto anterior queda pendiente hasta que se remata: `Apilar` no
      // cierra el párrafo, lo continúa.
      keyword("Apilar"),
      text("+0.05"),
      text("-0.02"),
      enter,
    ]),
  );
  if (entity.type !== "mtext") throw new Error("tipo");
  // Ancla absoluta de la cadena generada: si el constructor cambiara de sintaxis
  // el apilado dejaría de dibujarse y nadie se enteraría.
  eq(entity.text, "Ø25\\S+0.05^-0.02;", "el código de apilado, exacto");
  eq(layoutCadMText(entity).lines[0].text, "Ø25+0.05/-0.02", "y la maqueta ya no ve el código");
}

// --- DDEDIT: reedita el texto de una anotación ------------------------------------------------
{
  const doc = document([
    {
      id: "m1",
      type: "mtext",
      insertion: { x: 0, y: 0, z: 0 },
      text: "ANTES",
      height: 120,
      layer,
    },
  ]);
  const result = run("DDEDIT", [{ kind: "entityPick", entityId: "m1", point: { x: 0, y: 0 } }, text("DESPUÉS")], doc);
  const commands = commandsOf(result);
  eq(commands.length, 1, "un solo comando");
  eq(commands[0], { type: "properties", entityId: "m1", patch: { text: "DESPUÉS" } }, "escribe la propiedad `text`");

  // Y de verdad cambia el documento por la ruta canónica.
  const applied = executeCadEntityCommandBatch(doc, commands, "DDEDIT");
  const edited = applied.document.entities.find((entity) => entity.id === "m1");
  eq(edited?.type === "mtext" ? edited.text : "", "DESPUÉS", "el documento lleva el texto nuevo");
  eq(applied.document.meta.version, 2, "un solo paso de deshacer");
}

// --- DDEDIT: se niega con motivo sobre lo que no lleva texto -------------------------------------
{
  const doc = document([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer },
  ]);
  const result = run("DDEDIT", [{ kind: "entityPick", entityId: "l1", point: { x: 0, y: 0 } }], doc);
  eq(result?.kind, "message", "una LINE no se puede reeditar como texto");
  ok(
    result?.kind === "message" && result.text.includes("LINE"),
    "y el mensaje NOMBRA el tipo, en vez de decir «no se puede»",
  );
}

// --- DDEDIT: arranca sobre la selección previa ------------------------------------------------------
{
  const doc = document([
    { id: "m2", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "X", height: 120, layer },
  ]);
  const result = run("DDEDIT", [text("Y")], doc, ["m2"]);
  eq(commandsOf(result)[0], { type: "properties", entityId: "m2", patch: { text: "Y" } }, "usa lo designado");
}

// --- definición de terminado: guardar, reabrir, y el rótulo sigue ahí ---------------------------------
{
  const doc = document();
  const commands = commandsOf(
    run("MTEXT", [point(0, 0), point(3_000, -900), text("PLANTA BAJA"), text("Cota +0,00"), enter], doc),
  );
  const applied = executeCadEntityCommandBatch(doc, commands, "MTEXT");
  const reopened = parseCadDocument(serializeCadDocument(applied.document));
  const survivor = reopened.entities.find((entity) => entity.type === "mtext");
  eq(
    survivor?.type === "mtext" ? survivor.text : "",
    "PLANTA BAJA\\PCota +0,00",
    "los dos párrafos sobreviven al guardado, con su \\P",
  );
  close(
    survivor?.type === "mtext" ? (survivor.width ?? 0) : 0,
    3_000,
    "y el ancho también",
  );
}

console.log(
  `annotate-text: ${checks} comprobaciones · TEXT/MTEXT/DDEDIT en el registro del producto, ` +
    "apilado \\S componible, rechazos con motivo, y round-trip de guardado",
);
