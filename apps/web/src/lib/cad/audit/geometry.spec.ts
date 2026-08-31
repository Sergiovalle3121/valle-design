import { strict as assert } from "node:assert";
import type { CadEntity } from "../cad-document";
import { cadAuditGeometryRepairCommands, detectCadAuditGeometryDefects } from "./geometry";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer: "0",
});

// --- LINE de longitud cero ---------------------------------------------------
{
  const defects = detectCadAuditGeometryDefects([line("l1", 5, 5, 5, 5)]);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "zero-length-line");
  assert.equal(defects[0].entityId, "l1");
  checks += 3;
}
{
  ok(detectCadAuditGeometryDefects([line("l1", 0, 0, 10, 0)]).length === 0, "una LINE con longitud real no se reporta");
}

// --- POLYLINE sin tramos -----------------------------------------------------
{
  const entity: CadEntity = {
    id: "p1",
    type: "polyline",
    vertices: [{ x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }],
    closed: true,
    layer: "0",
  };
  const defects = detectCadAuditGeometryDefects([entity]);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "degenerate-polyline");
  checks += 2;
}
{
  const entity: CadEntity = {
    id: "p1",
    type: "polyline",
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
    closed: false,
    layer: "0",
  };
  ok(detectCadAuditGeometryDefects([entity]).length === 0, "una POLYLINE con dos posiciones distintas no se reporta");
}

// --- CIRCLE y ARC de radio cero ----------------------------------------------
{
  const circle: CadEntity = { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 0, layer: "0" };
  const arc: CadEntity = {
    id: "a1", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 0, startAngle: 0, endAngle: 90, layer: "0",
  };
  const okCircle: CadEntity = { id: "c2", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 5, layer: "0" };
  const defects = detectCadAuditGeometryDefects([circle, arc, okCircle]);
  assert.deepEqual(defects.map((defect) => defect.entityId).sort(), ["a1", "c1"]);
  checks += 1;
}

// --- ELLIPSE colapsada --------------------------------------------------------
{
  const zeroAxis: CadEntity = {
    id: "e1", type: "ellipse", center: { x: 0, y: 0, z: 0 }, majorAxis: { x: 0, y: 0, z: 0 },
    ratio: 0.5, startParameter: 0, endParameter: 360, layer: "0",
  };
  const zeroRatio: CadEntity = {
    id: "e2", type: "ellipse", center: { x: 0, y: 0, z: 0 }, majorAxis: { x: 10, y: 0, z: 0 },
    ratio: 0, startParameter: 0, endParameter: 360, layer: "0",
  };
  const defects = detectCadAuditGeometryDefects([zeroAxis, zeroRatio]);
  assert.deepEqual(defects.map((defect) => defect.entityId).sort(), ["e1", "e2"]);
  checks += 1;
}

// --- SPLINE sin curva ---------------------------------------------------------
{
  const entity: CadEntity = {
    id: "s1", type: "spline", degree: 3,
    controlPoints: [{ x: 500, y: 500, z: 0 }], knots: [], layer: "0",
  };
  const defects = detectCadAuditGeometryDefects([entity]);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "degenerate-spline");
  checks += 2;
}

// --- NaN se trata como no finito ----------------------------------------------
{
  const defects = detectCadAuditGeometryDefects([line("l1", 0, 0, NaN, 0)]);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].kind, "zero-length-line");
  checks += 2;
}

// --- cadAuditGeometryRepairCommands: un delete por defecto, en orden ----------
{
  const defects = detectCadAuditGeometryDefects([line("l1", 3, 3, 3, 3), line("l2", 0, 0, 10, 0)]);
  assert.deepEqual(cadAuditGeometryRepairCommands(defects), [{ type: "delete", entityId: "l1" }]);
  checks += 1;
}

console.log(`audit/geometry.spec: ${checks} comprobaciones OK`);
