import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { cadAuditReferenceRepairCommands, detectCadAuditReferenceDefects } from "./references";

let checks = 0;

function doc(entities: CadEntity[], blocks: CadDocument["blocks"] = []): Pick<CadDocument, "entities" | "blocks"> {
  return { entities, blocks };
}

// --- DIMENSION con referencia a una entidad borrada ---------------------------
{
  const dimension: CadEntity = {
    id: "d1",
    type: "dimension",
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    dimensionKind: "linear",
    axis: "x",
    associative: true,
    associationStatus: "associated",
    references: [
      { entityId: "gone", anchor: "start" },
      { entityId: "gone2", anchor: "end" },
    ],
    layer: "0",
  };
  const defects = detectCadAuditReferenceDefects(doc([dimension]));
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "broken-dimension");
  assert.equal(defects[0].entityId, "d1");
  assert.match(defects[0].detail, /gone/);
  checks += 4;
}

// --- DIMENSION ya marcada rota, aunque no tenga referencias -------------------
{
  const dimension: CadEntity = {
    id: "d1", type: "dimension", a: { x: 0, y: 0 }, b: { x: 10, y: 0 },
    dimensionKind: "linear", axis: "x", associationStatus: "broken", layer: "0",
  };
  const defects = detectCadAuditReferenceDefects(doc([dimension]));
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "broken-dimension");
  checks += 2;
}

// --- DIMENSION cuyas referencias sí existen: no se reporta --------------------
{
  const line: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" };
  const dimension: CadEntity = {
    id: "d1", type: "dimension", a: { x: 0, y: 0 }, b: { x: 10, y: 0 },
    dimensionKind: "linear", axis: "x", associative: true, associationStatus: "associated",
    references: [{ entityId: "l1", anchor: "start" }, { entityId: "l1", anchor: "end" }],
    layer: "0",
  };
  assert.deepEqual(detectCadAuditReferenceDefects(doc([line, dimension])), []);
  checks += 1;
}

// --- OPENING sin muro anfitrión -----------------------------------------------
{
  const opening = { id: "o1", type: "opening", hostId: "missing-wall", layer: "0" } as unknown as CadEntity;
  const defects = detectCadAuditReferenceDefects(doc([opening]));
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "orphan-opening");
  assert.equal(defects[0].entityId, "o1");
  checks += 3;
}

// --- INSERT a un bloque no declarado -------------------------------------------
{
  const insert: CadEntity = {
    id: "i1", type: "insert", block: "no-existe", insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0",
  };
  const defects = detectCadAuditReferenceDefects(doc([insert]));
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "missing-block-insert");
  checks += 2;
}

// --- INSERT a un bloque declarado, por id o por nombre: no se reporta ---------
{
  const block: CadDocument["blocks"][number] = {
    id: "blk-1", name: "SILLA", basePoint: { x: 0, y: 0, z: 0 }, entities: [],
  };
  const byId: CadEntity = {
    id: "i1", type: "insert", block: "blk-1", insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0",
  };
  const byName: CadEntity = {
    id: "i2", type: "insert", block: "SILLA", insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0",
  };
  assert.deepEqual(detectCadAuditReferenceDefects(doc([byId, byName], [block])), []);
  checks += 1;
}

// --- cadAuditReferenceRepairCommands: un delete por defecto -------------------
{
  const opening = { id: "o1", type: "opening", hostId: "missing-wall", layer: "0" } as unknown as CadEntity;
  const defects = detectCadAuditReferenceDefects(doc([opening]));
  assert.deepEqual(cadAuditReferenceRepairCommands(defects), [{ type: "delete", entityId: "o1" }]);
  checks += 1;
}

console.log(`audit/references.spec: ${checks} comprobaciones OK`);
