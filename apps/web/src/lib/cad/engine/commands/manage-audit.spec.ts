import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_AUDIT_COMMANDS } from "./manage-audit";

let checks = 0;
const auditCommand = CAD_AUDIT_COMMANDS[0];

function contextFor(document: CadDocument, withDocument = true): CadCommandContext {
  let ids = 0;
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (id) => document.entities.find((entity) => entity.id === id),
    blocks: () => document.blocks,
    layers: () => document.layers,
    ...(withDocument ? { document: () => document } : {}),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function step(document: CadDocument, inputs: readonly CadCommandInput[], withDocument = true) {
  const context = contextFor(document, withDocument);
  let current = auditCommand.begin(context);
  for (const input of inputs) {
    if (current.result) break;
    current = auditCommand.step(current.state as never, input, context);
  }
  return current;
}

// --- se niega en voz alta cuando el anfitrión no expone el documento ----------
{
  const document = migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" } });
  const result = step(document, [], false).result;
  assert.ok(result && result.kind === "message" && /no expone el documento/.test(result.text));
  checks += 1;
}

// --- un dibujo sano no encuentra nada ------------------------------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [{ id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" }],
  });
  const result = step(document, []).result;
  assert.ok(result && result.kind === "message" && /no se encontró ningún defecto/.test(result.text));
  checks += 1;
}

// --- previsualiza y NO repara hasta confirmar ----------------------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [{ id: "l1", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: "0" }],
  });
  const begun = step(document, []);
  assert.ok(!begun.result);
  assert.match(begun.prompt.message, /AUDIT encontró/);
  const declined = step(document, [{ kind: "enter" }]).result;
  assert.ok(declined && declined.kind === "message" && /no reparó nada/.test(declined.text));
  checks += 3;
}

// --- repara al confirmar Sí, y lo dice -----------------------------------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [{ id: "l1", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: "0" }],
  });
  const result = step(document, [{ kind: "keyword", keyword: "Sí" }]).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.deepEqual(result.commands, [{ type: "delete", entityId: "l1" }]);
    assert.match(result.label, /AUDIT/);
  }
  checks += 2;
}

console.log(`engine/commands/manage-audit.spec: ${checks} comprobaciones OK`);
