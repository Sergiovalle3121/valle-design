import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_ANNOTATE_QUICK_COMMANDS } from "./annotate-quick";

let checks = 0;
const [qdimCommand, textAlignCommand] = CAD_ANNOTATE_QUICK_COMMANDS;

function contextFor(entities: CadEntity[]): CadCommandContext {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => byId.get(id),
    blocks: () => [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function run(descriptor: (typeof CAD_ANNOTATE_QUICK_COMMANDS)[number], inputs: readonly CadCommandInput[], context: CadCommandContext) {
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
  }
  return step;
}

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer: "0",
});

// --- QDIM: acota una cadena continua entre tres posiciones distintas ----------
{
  const entities = [line("l1", 0, 0, 100, 0), line("l2", 50, -20, 50, 60)];
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["l1", "l2"] },
    { kind: "enter" },
    { kind: "point", point: { x: 50, y: 80 }, source: "typed" },
  ], contextFor(entities)).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.equal(result.commands.length, 2);
    for (const command of result.commands) {
      assert.equal(command.type, "insert");
      if (command.type === "insert") {
        assert.equal(command.entity.type, "dimension");
        if (command.entity.type === "dimension") assert.equal(command.entity.axis, "x");
      }
    }
  }
  checks += 2;
}

// --- QDIM: se niega cuando nada tiene extremos acotables -----------------------
{
  const text: CadEntity = { id: "t1", type: "text", x: 0, y: 0, text: "hola", layer: "0" };
  const result = run(qdimCommand, [
    { kind: "selection", entityIds: ["t1"] },
    { kind: "enter" },
  ], contextFor([text])).result;
  assert.ok(result && result.kind === "message" && /tiene extremos acotables/.test(result.text));
  checks += 1;
}

// --- QDIM: no se hizo nada sin designar ningún objeto --------------------------
{
  const result = run(qdimCommand, [{ kind: "enter" }], contextFor([])).result;
  assert.ok(result && result.kind === "message" && /no se hizo nada/.test(result.text));
  checks += 1;
}

// --- TEXTALIGN: proyecta el texto sobre la recta y le da su ángulo ------------
{
  const text: CadEntity = { id: "t1", type: "text", x: 5, y: 5, text: "NOTA", layer: "0" };
  const result = run(textAlignCommand, [
    { kind: "selection", entityIds: ["t1"] },
    { kind: "enter" },
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
    { kind: "point", point: { x: 10, y: 0 }, source: "typed" },
  ], contextFor([text])).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.equal(result.commands.length, 1);
    const [command] = result.commands;
    assert.equal(command.type, "replace");
    if (command.type === "replace") {
      assert.equal(command.entityId, "t1");
      assert.equal((command.entity as { x: number }).x, 5);
      assert.equal((command.entity as { y: number }).y, 0);
      assert.equal((command.entity as { rotation: number }).rotation, 0);
    }
  }
  checks += 4;
}

// --- TEXTALIGN: se niega cuando la selección no tiene ningún texto ------------
{
  const result = run(textAlignCommand, [
    { kind: "selection", entityIds: ["l1"] },
    { kind: "enter" },
  ], contextFor([line("l1", 0, 0, 10, 0)])).result;
  assert.ok(result && result.kind === "message" && /no tiene ningún texto/.test(result.text));
  checks += 1;
}

console.log(`engine/commands/annotate-quick.spec: ${checks} comprobaciones OK`);
