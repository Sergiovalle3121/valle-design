import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_QLEADER_COMMANDS } from "./annotate-quickleader";

let checks = 0;
const qleaderCommand = CAD_QLEADER_COMMANDS[0];

function contextFor(): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    blocks: () => [],
    selection: [],
    activeLayer: "COTAS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[]) {
  const context = contextFor();
  let step = qleaderCommand.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = qleaderCommand.step(step.state as never, input, context);
  }
  return step;
}

// --- crea una directriz NO asociativa de un tramo con su texto -----------------
{
  const result = run([
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
    { kind: "point", point: { x: 10, y: 10 }, source: "typed" },
    { kind: "text", value: "Revisar acabado" },
  ]).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.equal(result.commands.length, 1);
    const [command] = result.commands;
    assert.equal(command.type, "insert");
    if (command.type === "insert" && command.entity.type === "mleader") {
      assert.equal(command.entity.text, "Revisar acabado");
      assert.equal(command.entity.associative, false);
      assert.equal(command.entity.associationStatus, "detached");
      assert.equal(command.entity.layer, "COTAS");
    }
  }
  checks += 5;
}

// --- se niega ante un texto vacío -----------------------------------------------
{
  const result = run([
    { kind: "point", point: { x: 0, y: 0 }, source: "typed" },
    { kind: "point", point: { x: 10, y: 10 }, source: "typed" },
    { kind: "text", value: "   " },
  ]).result;
  assert.ok(result && result.kind === "message" && /necesita un texto/.test(result.text));
  checks += 1;
}

// --- cancela sin crear nada -------------------------------------------------------
{
  const result = run([{ kind: "cancel" }]).result;
  assert.deepEqual(result, { kind: "none" });
  checks += 1;
}

console.log(`engine/commands/annotate-quickleader.spec: ${checks} comprobaciones OK`);
