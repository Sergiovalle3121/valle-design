import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../cad-document";
import { cadBurstCommands } from "./cad-burst";

let checks = 0;

function contextWith(blocks: CadBlockDefinition[]) {
  let ids = 0;
  return { blocks: () => blocks, newEntityId: () => `new-${++ids}` };
}

// --- conserva el VALOR real del atributo como TEXT, con geometría posicionada -
{
  const block: CadBlockDefinition = {
    id: "blk-1",
    name: "TITULO",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: [{ id: "attr-def", type: "attdef", tag: "NOMBRE", insertion: { x: 0, y: 0, z: 0 }, layer: "0" }],
    attributes: { NOMBRE: { defaultValue: "SIN NOMBRE" } },
  };
  const insert: Extract<CadEntity, { type: "insert" }> = {
    id: "i1",
    type: "insert",
    block: "TITULO",
    insertion: { x: 100, y: 200, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    attributes: { NOMBRE: "Cocina" },
    positionedAttributes: [{ tag: "NOMBRE", value: "Cocina", insertion: { x: 100, y: 195, z: 0 }, height: 3 }],
    layer: "0",
  };
  const outcome = cadBurstCommands(insert, contextWith([block]));
  assert.ok(typeof outcome !== "string", `no se esperaba una negativa: ${outcome}`);
  if (typeof outcome === "string") throw new Error("unreachable");
  assert.equal(outcome.degradedAttributePlacement, false);
  assert.equal(outcome.attributeTexts, 1);
  const attributeCommand = outcome.commands.find((command) => command.type === "insert" && command.entity.type === "text");
  assert.ok(attributeCommand && attributeCommand.type === "insert" && attributeCommand.entity.type === "text");
  if (attributeCommand?.type === "insert" && attributeCommand.entity.type === "text") {
    assert.equal(attributeCommand.entity.text, "Cocina");
    assert.equal(attributeCommand.entity.x, 100);
    assert.equal(attributeCommand.entity.y, 195);
    assert.equal(attributeCommand.entity.height, 3);
  }
  assert.ok(!outcome.commands.some((command) => command.type === "insert" && command.entity.type === "attdef"));
  assert.deepEqual(outcome.commands.at(-1), { type: "delete", entityId: "i1" });
  checks += 7;
}

// --- degrada apilando bajo el punto de inserción sin geometría posicionada ----
{
  const block: CadBlockDefinition = {
    id: "blk-1", name: "TITULO", basePoint: { x: 0, y: 0, z: 0 }, entities: [],
    attributes: { NOMBRE: { defaultValue: "SIN NOMBRE" } },
  };
  const insert: Extract<CadEntity, { type: "insert" }> = {
    id: "i1", type: "insert", block: "TITULO", insertion: { x: 10, y: 20, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, rotation: 0, attributes: { NOMBRE: "Cocina" }, layer: "0",
  };
  const outcome = cadBurstCommands(insert, contextWith([block]));
  if (typeof outcome === "string") throw new Error(outcome);
  assert.equal(outcome.degradedAttributePlacement, true);
  assert.equal(outcome.attributeTexts, 1);
  checks += 2;
}

// --- se niega cuando el bloque no existe ---------------------------------------
{
  const insert: Extract<CadEntity, { type: "insert" }> = {
    id: "i1", type: "insert", block: "NO-EXISTE", insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0",
  };
  const outcome = cadBurstCommands(insert, contextWith([]));
  assert.equal(typeof outcome, "string");
  assert.match(outcome as string, /no existe/);
  checks += 2;
}

console.log(`blocks/cad-burst.spec: ${checks} comprobaciones OK`);
