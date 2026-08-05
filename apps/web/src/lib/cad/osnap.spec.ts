/** Referencia a objetos / OSNAP (VD-CAD-DEPTH-A9). */
import { strict as assert } from "node:assert";
import type { CadPrimitive, CadVec2 } from "./primitives";
import { primitiveOsnaps, resolveOsnap } from "./osnap";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}

const line: CadPrimitive = { kind: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };

// --- extremo gana cerca del vértice ----------------------------------------
const end = resolveOsnap([line], { x: 0.1, y: 0.1 }, 1);
assert.ok(end && end.type === "endpoint" && pointNear(end.point, { x: 0, y: 0 }), "engancha al extremo");

// --- punto medio gana sobre cercano/perpendicular a igual distancia --------
const midCase = resolveOsnap([line], { x: 5, y: 0.2 }, 1);
assert.ok(midCase && midCase.type === "midpoint" && pointNear(midCase.point, { x: 5, y: 0 }), "prioriza el punto medio");

// --- perpendicular filtrado -------------------------------------------------
const per = resolveOsnap([line], { x: 3, y: 5 }, 10, ["perpendicular"]);
assert.ok(per && per.type === "perpendicular" && pointNear(per.point, { x: 3, y: 0 }), "pie de la perpendicular");

// --- cercano filtrado -------------------------------------------------------
const nearest = resolveOsnap([line], { x: 5, y: 0.2 }, 1, ["nearest"]);
assert.ok(nearest && nearest.type === "nearest" && pointNear(nearest.point, { x: 5, y: 0 }), "cercano sobre el segmento");

// --- círculo: centro, cuadrante, cercano -----------------------------------
const circle: CadPrimitive = { kind: "circle", center: { x: 0, y: 0 }, radius: 5 };
const quad = resolveOsnap([circle], { x: 5.1, y: 0 }, 1);
assert.ok(quad && quad.type === "quadrant" && pointNear(quad.point, { x: 5, y: 0 }), "engancha al cuadrante derecho");
const center = resolveOsnap([circle], { x: 0.1, y: 0.1 }, 1);
assert.ok(center && center.type === "center" && pointNear(center.point, { x: 0, y: 0 }), "engancha al centro");

// --- intersección gana sobre punto medio -----------------------------------
const lineV: CadPrimitive = { kind: "line", a: { x: 5, y: -5 }, b: { x: 5, y: 5 } };
const inter = resolveOsnap([line, lineV], { x: 5.1, y: 0.1 }, 1);
assert.ok(inter && inter.type === "intersection" && pointNear(inter.point, { x: 5, y: 0 }), "engancha a la intersección");

// --- fuera de tolerancia → null --------------------------------------------
assert.equal(resolveOsnap([line], { x: 100, y: 100 }, 1), null, "nada dentro de tolerancia → null");

// --- arco: extremos y medio -------------------------------------------------
const arc: CadPrimitive = { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: 90 };
const arcEnd = resolveOsnap([arc], { x: 10.1, y: 0.1 }, 1);
assert.ok(arcEnd && arcEnd.type === "endpoint" && pointNear(arcEnd.point, { x: 10, y: 0 }), "extremo del arco a 0°");
const snaps = primitiveOsnaps(arc, { x: 7, y: 7 });
assert.ok(
  snaps.some((s) => s.type === "midpoint" && pointNear(s.point, { x: Math.SQRT1_2 * 10, y: Math.SQRT1_2 * 10 })),
  "punto medio del arco a 45°",
);
assert.ok(
  snaps.some((s) => s.type === "quadrant" && pointNear(s.point, { x: 0, y: 10 })),
  "cuadrante superior dentro del barrido",
);

console.log("cad osnap specs passed");
