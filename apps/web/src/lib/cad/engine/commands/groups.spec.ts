/**
 * El diálogo de GROUP, UNGROUP y PURGE.
 *
 * Lo que se prueba aquí, y que la aritmética de `blocks/` no puede probar:
 *
 *   1. PURGE **no borra a la primera**. Enseña qué se iría y pide confirmación.
 *      Un PURGE que borra al teclearlo es la orden más peligrosa del producto.
 *   2. PURGE sin acceso al documento se NIEGA en voz alta, en vez de responder
 *      «no hay nada que purgar», que es una mentira con forma de éxito.
 *   3. UNGROUP acepta el nombre o un objeto del grupo, y se planta cuando el
 *      objeto está en varios: adivinar cuál deshacer sería peor que preguntar.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../../cad-document";
import { migrateCadDocument } from "../../cad-document";
import type { CadAnyCommandDescriptor, CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_GROUP_COMMANDS } from "./groups";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const byName = new Map(CAD_GROUP_COMMANDS.map((entry) => [entry.name, entry]));
const command = (name: string): CadAnyCommandDescriptor => {
  const found = byName.get(name);
  assert.ok(found, `${name} debería estar en la familia`);
  return found;
};

const line = (id: string, layer = "0"): CadEntity => ({
  id,
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 100, y: 0, z: 0 },
  layer,
});

function contextFor(document: CadDocument, options: { selection?: readonly string[]; withDocument?: boolean } = {}): CadCommandContext {
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (id) => byId.get(id),
    blocks: () => document.blocks,
    ...(options.withDocument === false ? {} : { document: () => document }),
    selection: options.selection ?? [],
    activeLayer: "0",
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
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });

// --- 1. GROUP con selección previa no vuelve a pedirla -----------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [line("a"), line("b")],
  });
  const result = run(
    command("GROUP"),
    [text("MESA")],
    contextFor(document, { selection: ["a", "b"] }),
  ).result;
  assert.ok(result && result.kind === "document", "sale el lote directamente");
  assert.deepEqual(
    result.commands.map((entry) => entry.type),
    ["metadata", "metadata"],
    "la pertenencia se escribe en los metadatos, por la ruta canónica",
  );
  checks += 2;
}

// --- 2. GROUP sin selección la pide, y un nombre repetido se rechaza ---------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      { ...line("a"), context: { metadata: { "cad:groups": "MESA" } } },
      line("b"),
    ],
  });
  const context = contextFor(document);
  const asking = run(command("GROUP"), [text("SILLA")], context);
  ok(!asking.result, "sin selección previa, GROUP pide objetos");
  assert.match(asking.prompt.message, /Designe/);
  const repeated = run(command("GROUP"), [text("MESA")], context).result;
  assert.ok(repeated && repeated.kind === "message" && /Ya hay un grupo/.test(repeated.text));
  const listed = run(command("GROUP"), [keyword("?")], context).result;
  assert.ok(listed && listed.kind === "message" && /MESA \(1\)/.test(listed.text), "«?» lista los grupos con su tamaño");
  checks += 3;
}

// --- 3. UNGROUP: por objeto, y se planta si está en varios grupos ------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      { ...line("a"), context: { metadata: { "cad:groups": "MESA,PATAS" } } },
      { ...line("b"), context: { metadata: { "cad:groups": "MESA" } } },
    ],
  });
  const context = contextFor(document);
  const ambiguous = run(
    command("UNGROUP"),
    [{ kind: "entityPick", entityId: "a", point: { x: 0, y: 0 } }],
    context,
  ).result;
  assert.ok(
    ambiguous && ambiguous.kind === "message" && /varios grupos/.test(ambiguous.text),
    "no adivina cuál de los dos deshacer",
  );
  const single = run(
    command("UNGROUP"),
    [{ kind: "entityPick", entityId: "b", point: { x: 0, y: 0 } }],
    context,
  ).result;
  assert.ok(single && single.kind === "document", "con un solo grupo, lo deshace");
  assert.equal(single.commands.length, 2, "y saca a los DOS miembros de MESA, no sólo al designado");
  const named = run(command("UNGROUP"), [text("PATAS")], context).result;
  assert.ok(named && named.kind === "document" && named.commands.length === 1);
  checks += 4;
}

// --- 4. PURGE enseña antes de borrar ------------------------------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "VACIA", name: "VACIA", color: "#ff0000", visible: true, locked: false },
    ],
    entities: [line("a")],
    blocks: [
      {
        id: "block:huerfano",
        name: "HUERFANO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [line("block:huerfano:entity:0")],
      },
    ],
  });
  const context = contextFor(document);
  const first = command("PURGE").begin(context);
  ok(!first.result, "PURGE no borra al teclearlo");
  assert.match(first.prompt.message, /HUERFANO/, "la previsualización nombra el bloque");
  assert.match(first.prompt.message, /VACIA/, "y la capa");
  assert.equal(first.prompt.defaultOption, "No", "y el defecto de la confirmación es NO");
  checks += 3;

  const cancelled = command("PURGE").step(first.state as never, keyword("No"), context).result;
  assert.ok(cancelled && cancelled.kind === "message" && /cancelado/.test(cancelled.text));
  const confirmed = command("PURGE").step(first.state as never, keyword("Sí"), context).result;
  assert.ok(confirmed && confirmed.kind === "document");
  assert.deepEqual(
    confirmed.commands.map((entry) => entry.type),
    ["layer", "block"],
    "capas antes que bloques",
  );
  checks += 3;
}

// --- 5. PURGE sin documento se niega diciéndolo -------------------------------
{
  const document = migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" }, entities: [] });
  const result = command("PURGE").begin(contextFor(document, { withDocument: false })).result;
  assert.ok(
    result && result.kind === "message" && /no expone el documento/.test(result.text),
    "no puede mirar, y lo dice: responder «no hay nada» sería mentir",
  );
  checks += 1;
}

// --- 6. PURGE en un dibujo limpio ---------------------------------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [line("a")],
  });
  const result = command("PURGE").begin(contextFor(document)).result;
  assert.ok(result && result.kind === "message" && /nada que purgar/.test(result.text));
  checks += 1;
}

console.log(`engine/commands/groups.spec: ${checks} comprobaciones OK`);
