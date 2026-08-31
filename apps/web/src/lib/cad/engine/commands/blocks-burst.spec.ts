import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_BURST_COMMANDS } from "./blocks-burst";

let checks = 0;
const burstCommand = CAD_BURST_COMMANDS[0];

function contextFor(entities: CadEntity[], blocks: CadBlockDefinition[] = []): CadCommandContext {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => byId.get(id),
    blocks: () => blocks,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function run(context: CadCommandContext, inputs: readonly CadCommandInput[]) {
  let step = burstCommand.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = burstCommand.step(step.state as never, input, context);
  }
  return step;
}

// --- se niega, con motivo, cuando lo designado no es un INSERT -----------------
{
  const line: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" };
  const result = run(contextFor([line]), [{ kind: "selection", entityIds: ["l1"] }, { kind: "enter" }]).result;
  assert.ok(result && result.kind === "message" && /sólo aplica a bloques/.test(result.text));
  checks += 1;
}

// --- estalla un INSERT y conserva su atributo como texto, en un solo lote -----
{
  const block: CadBlockDefinition = {
    id: "blk-1", name: "TITULO", basePoint: { x: 0, y: 0, z: 0 },
    entities: [{ id: "attr-def", type: "attdef", tag: "NOMBRE", insertion: { x: 0, y: 0, z: 0 }, layer: "0" }],
    attributes: { NOMBRE: { defaultValue: "SIN NOMBRE" } },
  };
  const insert: CadEntity = {
    id: "i1", type: "insert", block: "TITULO", insertion: { x: 100, y: 200, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, rotation: 0,
    positionedAttributes: [{ tag: "NOMBRE", value: "Cocina", insertion: { x: 100, y: 195, z: 0 } }],
    attributes: { NOMBRE: "Cocina" }, layer: "0",
  };
  const result = run(contextFor([insert], [block]), [{ kind: "selection", entityIds: ["i1"] }, { kind: "enter" }]).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.ok(result.commands.some((command) => command.type === "insert" && command.entity.type === "text" && command.entity.text === "Cocina"));
    assert.deepEqual(result.commands.at(-1), { type: "delete", entityId: "i1" });
    assert.match(result.label, /BURST estalló 1 bloque/);
  }
  checks += 3;
}

console.log(`engine/commands/blocks-burst.spec: ${checks} comprobaciones OK`);
