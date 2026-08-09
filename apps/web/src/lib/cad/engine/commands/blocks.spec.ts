/**
 * El DIÁLOGO de BLOCK, INSERT, WBLOCK, BASE y ATTEDIT.
 *
 * La aritmética se prueba en `blocks/block-workflow.spec.ts`. Aquí se prueba lo
 * otro: que tecleando lo que un dibujante teclea salga el lote correcto. Es una
 * distinción que importa — un comando puede componer la orden perfecta y pedir
 * los datos en un orden que nadie puede seguir, o comerse un signo menos al
 * leerlo de la línea.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../../cad-document";
import type { CadAnyCommandDescriptor, CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_BLOCK_COMMANDS } from "./blocks";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const byName = new Map(CAD_BLOCK_COMMANDS.map((command) => [command.name, command]));
const command = (name: string): CadAnyCommandDescriptor => {
  const found = byName.get(name);
  assert.ok(found, `${name} debería estar en la familia`);
  return found;
};

const door: CadEntity[] = [
  { id: "leaf", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 }, layer: "0" },
  { id: "swing", type: "line", start: { x: 1_000, y: 0, z: 0 }, end: { x: 1_000, y: 200, z: 0 }, layer: "0" },
];

const doorBlock: CadBlockDefinition = {
  id: "block:puerta",
  name: "PUERTA",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: door,
  attributes: {
    ANCHO: { defaultValue: "800", prompt: "Ancho de paso", position: { x: 500, y: 300, z: 0 } },
  },
};

function makeContext(options: {
  entities?: readonly CadEntity[];
  blocks?: readonly CadBlockDefinition[];
  selection?: readonly string[];
} = {}): CadCommandContext {
  const entities = options.entities ?? door;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => byId.get(id),
    blocks: () => options.blocks ?? [],
    selection: options.selection ?? [],
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function run(
  descriptor: CadAnyCommandDescriptor,
  inputs: readonly CadCommandInput[],
  context: CadCommandContext,
) {
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
  }
  return step;
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

// --- 1. BLOCK: nombre, punto base, designar ---------------------------------
{
  const context = makeContext();
  const result = run(
    command("BLOCK"),
    [text("PUERTA"), point(0, 0), { kind: "selection", entityIds: ["leaf", "swing"] }],
    context,
  ).result;
  assert.ok(result && result.kind === "document", "BLOCK emite un lote");
  const kinds = result.commands.map((entry) => entry.type);
  assert.deepEqual(kinds, ["block", "delete", "delete", "insert"], "definir, borrar lo designado, insertar");
  const definition = result.commands[0];
  assert.ok(definition.type === "block" && definition.op === "define");
  assert.equal(definition.definition.name, "PUERTA");
  assert.equal(definition.definition.library?.scope, "document", "BLOCK se queda en el documento");
  checks += 4;
}

// --- 2. BLOCK no pisa un nombre existente -----------------------------------
{
  const result = run(
    command("BLOCK"),
    [text("PUERTA")],
    makeContext({ blocks: [doorBlock] }),
  ).result;
  assert.ok(result && result.kind === "message" && /ya existe/.test(result.text), "lo dice y no escribe");
  checks += 1;
}

// --- 3. WBLOCK publica al inquilino y CONSERVA la geometría ------------------
{
  const result = run(
    command("WBLOCK"),
    [text("PUERTA-LIB"), point(0, 0), { kind: "selection", entityIds: ["leaf"] }],
    makeContext(),
  ).result;
  assert.ok(result && result.kind === "document");
  const kinds = result.commands.map((entry) => entry.type);
  assert.deepEqual(kinds, ["block"], "sólo define: exportar no altera el dibujo del que se exporta");
  const definition = result.commands[0];
  assert.ok(definition.type === "block" && definition.op === "define");
  assert.equal(definition.definition.library?.scope, "tenant", "y la publica al inquilino");
  checks += 4;
}

// --- 4. INSERT con escala NEGATIVA tecleada ---------------------------------
{
  const result = run(
    command("INSERT"),
    [text("PUERTA"), point(5_000, 0), distance(-1), enter, enter, enter],
    makeContext({ blocks: [doorBlock] }),
  ).result;
  assert.ok(result && result.kind === "document", "INSERT emite un lote");
  const [entry] = result.commands;
  assert.ok(entry.type === "insert" && entry.entity.type === "insert");
  // ANCLA ABSOLUTA: se tecleó −1 en X y Enter en Y, que iguala Y a X.
  assert.deepEqual(
    entry.entity.scale,
    { x: -1, y: -1, z: 1 },
    "el signo llega intacto desde la línea de comandos, y Enter iguala Y a X",
  );
  assert.deepEqual(entry.entity.insertion, { x: 5_000, y: 0, z: 0 });
  assert.equal(entry.entity.layer, "MUROS", "se inserta en la capa activa");
  assert.equal(entry.entity.attributes?.ANCHO, "800", "el atributo tomó su valor por defecto");
  checks += 5;
}

// --- 5. INSERT pregunta los atributos, y lo tecleado gana --------------------
{
  const context = makeContext({ blocks: [doorBlock] });
  const descriptor = command("INSERT");
  let step = descriptor.begin(context);
  for (const input of [text("PUERTA"), point(0, 0), enter, enter, enter])
    step = descriptor.step(step.state as never, input, context);
  ok(!step.result, "tras la rotación todavía queda el atributo por preguntar");
  assert.equal(step.prompt.message, "Ancho de paso", "y se pregunta con SU texto, no con la etiqueta");
  assert.equal(step.prompt.defaultValue, "800", "ofreciendo el valor por defecto");
  checks += 2;
  step = descriptor.step(step.state as never, text("1200"), context);
  assert.ok(step.result && step.result.kind === "document");
  const [entry] = step.result.commands;
  assert.ok(entry.type === "insert" && entry.entity.type === "insert");
  assert.equal(entry.entity.attributes?.ANCHO, "1200", "gana lo tecleado");
  assert.equal(entry.entity.positionedAttributes?.[0].value, "1200", "y el texto dibujado dice lo mismo");
  checks += 3;
}

// --- 6. INSERT: escala cero se rechaza; bloque inexistente se explica --------
{
  const context = makeContext({ blocks: [doorBlock] });
  const zero = run(command("INSERT"), [text("PUERTA"), point(0, 0), distance(0)], context).result;
  assert.ok(zero && zero.kind === "message" && /cero/.test(zero.text), "la escala cero se rechaza diciéndolo");
  const missing = run(command("INSERT"), [text("VENTANA")], context).result;
  assert.ok(missing && missing.kind === "message" && /VENTANA/.test(missing.text), "y el bloque que no existe también");
  const list = run(command("INSERT"), [text("?")], context).result;
  assert.ok(list && list.kind === "message" && /PUERTA/.test(list.text), "«?» lista los bloques del dibujo");
  checks += 3;
}

// --- 7. ATTEDIT sobre la selección previa ------------------------------------
{
  const insert: CadEntity = {
    id: "insert-1",
    type: "insert",
    block: "block:puerta",
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "0",
    attributes: { ANCHO: "800" },
  };
  const context = makeContext({
    entities: [insert],
    blocks: [doorBlock],
    selection: ["insert-1"],
  });
  const descriptor = command("ATTEDIT");
  const first = descriptor.begin(context);
  assert.equal(first.prompt.defaultValue, "800", "ofrece el valor ACTUAL, no el de fábrica");
  const result = descriptor.step(first.state as never, text("950"), context).result;
  assert.ok(result && result.kind === "document");
  const [entry] = result.commands;
  assert.ok(entry.type === "replace" && entry.entity.type === "insert");
  assert.equal(entry.entity.attributes?.ANCHO, "950");
  assert.equal(entry.entity.positionedAttributes?.[0].value, "950", "el valor y el texto van juntos");
  checks += 5;
}

// --- 8. ATTEDIT sobre algo que no es una inserción ---------------------------
{
  const result = run(
    command("ATTEDIT"),
    [{ kind: "entityPick", entityId: "leaf", point: { x: 0, y: 0 } }],
    makeContext({ blocks: [doorBlock] }),
  ).result;
  assert.ok(result && result.kind === "message" && /inserciones/.test(result.text), "se niega diciéndolo");
  checks += 1;
}

// --- 9. BASE ------------------------------------------------------------------
{
  const result = run(command("BASE"), [point(1_500, -250)], makeContext()).result;
  assert.ok(result && result.kind === "document");
  const [entry] = result.commands;
  assert.ok(entry.type === "block" && entry.op === "define");
  assert.deepEqual(entry.definition.basePoint, { x: 1_500, y: -250, z: 0 });
  checks += 3;
}

console.log(`engine/commands/blocks.spec: ${checks} comprobaciones OK`);
