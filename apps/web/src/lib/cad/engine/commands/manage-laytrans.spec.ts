import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_LAYTRANS_COMMANDS } from "./manage-laytrans";

let checks = 0;
const laytransCommand = CAD_LAYTRANS_COMMANDS[0];

function contextFor(document: CadDocument): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (id) => document.entities.find((entity) => entity.id === id),
    blocks: () => document.blocks,
    layers: () => document.layers,
    document: () => document,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "new-1",
  };
}

function run(context: CadCommandContext, inputs: readonly CadCommandInput[]) {
  let step = laytransCommand.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = laytransCommand.step(step.state as never, input, context);
  }
  return step;
}

function sampleDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CAPA_1", name: "CAPA_1", color: "#123456", visible: true, locked: false },
    ],
    entities: [{ id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layer: "CAPA_1" }],
  });
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });

// --- se niega ante una capa de origen que no existe, sin pedir el destino -----
{
  const result = run(contextFor(sampleDocument()), [text("NO-EXISTE")]).result;
  assert.ok(result && result.kind === "message" && /no existe en el dibujo/.test(result.text));
  checks += 1;
}

// --- cancela sin mover nada ------------------------------------------------------
{
  const result = run(contextFor(sampleDocument()), [{ kind: "cancel" }]).result;
  assert.ok(result && result.kind === "message" && /cancelado/.test(result.text));
  checks += 1;
}

// --- con Fin y ninguna correspondencia, no hace nada ---------------------------
{
  const result = run(contextFor(sampleDocument()), [{ kind: "keyword", keyword: "Fin" }]).result;
  assert.ok(result && result.kind === "message" && /no tiene ninguna correspondencia/.test(result.text));
  checks += 1;
}

// --- captura origen→destino y aplica al terminar con Fin -----------------------
{
  const document = sampleDocument();
  const result = run(contextFor(document), [text("CAPA_1"), text("MURO"), { kind: "keyword", keyword: "Fin" }]).result;
  assert.ok(result && result.kind === "document");
  if (result?.kind === "document") {
    assert.ok(result.commands.some((command) => JSON.stringify(command) === JSON.stringify({ type: "properties", entityId: "a", patch: { layer: "MURO" } })));
    assert.ok(result.commands.some((command) => command.type === "layer" && command.op === "upsert" && command.layer.id === "MURO"));
  }
  checks += 2;
}

console.log(`engine/commands/manage-laytrans.spec: ${checks} comprobaciones OK`);
