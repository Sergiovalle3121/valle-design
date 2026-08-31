import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import {
  CadLayerTranslationMapError,
  parseCadLayerTranslationMap,
  planCadLayerTranslation,
  serializeCadLayerTranslationMap,
} from "./laytrans";

let checks = 0;

function doc(): Pick<CadDocument, "entities" | "layers"> {
  return {
    entities: [
      { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "CAPA_1" },
      { id: "b", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 10, z: 0 }, layer: "CAPA_1" },
      { id: "c", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 10, z: 0 }, layer: "0" },
    ],
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "CAPA_1", name: "CAPA_1", color: "#123456", visible: true, locked: false },
    ],
  };
}

function throws(fn: () => unknown, matcher: RegExp | (new (...args: never[]) => Error)): void {
  assert.throws(fn, matcher as never);
  checks += 1;
}

// --- serializar / interpretar: ida y vuelta -----------------------------------
{
  const map = { name: "estructurista→despacho", entries: [{ from: "CAPA_1", to: "MURO" }] };
  assert.deepEqual(parseCadLayerTranslationMap(serializeCadLayerTranslationMap(map)), map);
  checks += 1;
}

// --- se niega con un error tipado ante JSON roto o mal formado ----------------
throws(() => parseCadLayerTranslationMap("no es json"), CadLayerTranslationMapError);
throws(() => parseCadLayerTranslationMap("{}"), /entries/);
throws(() => parseCadLayerTranslationMap(JSON.stringify({ entries: [{ from: "A" }] })), /correspondencia #1/);

// --- mueve las entidades de origen y crea el destino de la norma mexicana -----
{
  const plan = planCadLayerTranslation(doc(), { entries: [{ from: "CAPA_1", to: "MURO" }] });
  assert.deepEqual(plan.createdLayers, ["MURO"]);
  const layerCommand = plan.commands.find((command) => command.type === "layer");
  assert.ok(layerCommand && layerCommand.type === "layer" && layerCommand.op === "upsert" && layerCommand.layer.id === "MURO" && layerCommand.layer.color === "#ffffff");
  assert.ok(plan.commands.some((command) => JSON.stringify(command) === JSON.stringify({ type: "properties", entityId: "a", patch: { layer: "MURO" } })));
  assert.ok(plan.commands.some((command) => JSON.stringify(command) === JSON.stringify({ type: "properties", entityId: "b", patch: { layer: "MURO" } })));
  assert.deepEqual(plan.movedCounts, { "CAPA_1→MURO": 2 });
  assert.deepEqual(plan.missingSourceLayers, []);
  checks += 5;
}

// --- no crea el destino si ya existe en el documento --------------------------
{
  const plan = planCadLayerTranslation(doc(), { entries: [{ from: "CAPA_1", to: "0" }] });
  assert.deepEqual(plan.createdLayers, []);
  assert.ok(!plan.commands.some((command) => command.type === "layer"));
  checks += 2;
}

// --- declara, sin aplicar nada, la capa de origen que no existe ---------------
{
  const plan = planCadLayerTranslation(doc(), { entries: [{ from: "NO-EXISTE", to: "MURO" }] });
  assert.deepEqual(plan.missingSourceLayers, ["NO-EXISTE"]);
  assert.deepEqual(plan.commands, []);
  checks += 2;
}

// --- declara, sin aplicar nada, un destino con caracteres inválidos -----------
{
  const plan = planCadLayerTranslation(doc(), { entries: [{ from: "CAPA_1", to: "MAL<NOMBRE>" }] });
  assert.equal(plan.invalidDestinations.length, 1);
  assert.equal(plan.invalidDestinations[0].to, "MAL<NOMBRE>");
  assert.deepEqual(plan.commands, []);
  checks += 3;
}

// --- una capa de destino repetida en varias correspondencias se crea una vez --
{
  const document = doc();
  document.layers = [
    { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    { id: "CAPA_1", name: "CAPA_1", color: "#000", visible: true, locked: false },
    { id: "CAPA_2", name: "CAPA_2", color: "#000", visible: true, locked: false },
  ];
  document.entities = [
    ...document.entities,
    { id: "d", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "CAPA_2" },
  ];
  const plan = planCadLayerTranslation(document, {
    entries: [
      { from: "CAPA_1", to: "MURO" },
      { from: "CAPA_2", to: "MURO" },
    ],
  });
  assert.deepEqual(plan.createdLayers, ["MURO"]);
  assert.equal(plan.commands.filter((command) => command.type === "layer").length, 1);
  checks += 2;
}

console.log(`standards/laytrans.spec: ${checks} comprobaciones OK`);
