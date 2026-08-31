import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import type { CadCommandContext } from "../command-types";
import { CAD_RECOVER_COMMANDS } from "./manage-recover";

let checks = 0;
const recoverCommand = CAD_RECOVER_COMMANDS[0];

function contextFor(): CadCommandContext {
  let ids = 0;
  const document: CadDocument = migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" } });
  return {
    entityIds: [],
    entity: () => undefined,
    blocks: () => document.blocks,
    layers: () => document.layers,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

// --- declara un límite honesto cuando el texto no es JSON ----------------------
{
  const context = contextFor();
  const begun = recoverCommand.begin(context);
  const result = recoverCommand.step(begun.state as never, { kind: "text", value: "no es json" }, context).result;
  assert.ok(result && result.kind === "message" && /no pudo interpretar el texto como JSON/.test(result.text));
  checks += 1;
}

// --- dice que no pudo salvar nada cuando el candidato no es interpretable ------
{
  const context = contextFor();
  const result = recoverCommand.step(null as never, { kind: "text", value: JSON.stringify("solo una cadena") }, context).result;
  assert.ok(result && result.kind === "message" && /no pudo salvar nada/.test(result.text));
  checks += 1;
}

// --- trae las entidades salvadas con ids nuevos, y declara lo perdido ----------
{
  const context = contextFor();
  const candidate = {
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "FANTASMA" },
      { id: "bad", type: "line", start: { x: 0, y: 0 }, layer: "0" },
    ],
  };
  const result = recoverCommand.step(null as never, { kind: "text", value: JSON.stringify(candidate) }, context).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.ok(result.commands.some((command) => command.type === "layer" && command.op === "upsert" && command.layer.id === "FANTASMA"));
    const inserted = result.commands.find((command) => command.type === "insert");
    assert.ok(inserted);
    if (inserted?.type === "insert") assert.equal(inserted.entity.id, "new-1");
    assert.match(result.label, /RECOVER trajo 1 de 2/);
    assert.match(result.label, /perdida/);
  }
  checks += 4;
}

// --- no trae INSERT recuperados, y lo dice -------------------------------------
{
  const context = contextFor();
  const candidate = {
    meta: { version: 1, schema: 4, unit: "mm" },
    blocks: [{ id: "blk-1", name: "SILLA", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
    entities: [
      { id: "i1", type: "insert", block: "SILLA", insertion: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, layer: "0" },
      { id: "bad", type: "line", start: { x: 0, y: 0 }, layer: "0" },
    ],
  };
  const result = recoverCommand.step(null as never, { kind: "text", value: JSON.stringify(candidate) }, context).result;
  assert.ok(result && result.kind === "message" && /no hay nada que traer|no pudo traer ninguna/.test(result.text));
  checks += 1;
}

console.log(`engine/commands/manage-recover.spec: ${checks} comprobaciones OK`);
