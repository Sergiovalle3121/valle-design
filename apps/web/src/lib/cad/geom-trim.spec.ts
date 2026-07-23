/** Recortar/extender/partir segmentos (AXOS-CAD-DEPTH-A8). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  breakSegment,
  breakSegmentBetween,
  extendSegment,
  trimSegment,
  type Segment,
} from "./geom-trim";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}
function segNear(s: Segment, a: CadVec2, b: CadVec2): boolean {
  return pointNear(s.a, a) && pointNear(s.b, b);
}

// --- TRIM ------------------------------------------------------------------
const trimLeft = trimSegment(
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: 0, y: 0 },
);
assert.ok(trimLeft && segNear(trimLeft, { x: 0, y: 0 }, { x: 5, y: 0 }), "trim conserva el lado izquierdo");
const trimRight = trimSegment(
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: 10, y: 0 },
);
assert.ok(trimRight && segNear(trimRight, { x: 5, y: 0 }, { x: 10, y: 0 }), "trim conserva el lado derecho");
assert.equal(
  trimSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: -5 }, { x: 20, y: 5 }, { x: 0, y: 0 }),
  null,
  "sin cruce interior no hay recorte",
);
assert.equal(
  trimSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }, { x: 5, y: 20 }, { x: 0, y: 0 }),
  null,
  "el cruce debe caer dentro del borde",
);

// --- EXTEND ----------------------------------------------------------------
const extB = extendSegment({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: -5 }, { x: 10, y: 5 });
assert.ok(extB && segNear(extB, { x: 0, y: 0 }, { x: 10, y: 0 }), "extiende el extremo b hasta el borde");
const extA = extendSegment({ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 });
assert.ok(extA && segNear(extA, { x: 0, y: 0 }, { x: 10, y: 0 }), "extiende el extremo a hasta el borde");
assert.equal(
  extendSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 }),
  null,
  "si ab ya cruza el borde no se extiende",
);
assert.equal(
  extendSegment({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: -5 }, { x: 10, y: -1 }),
  null,
  "si el borde no alcanza la línea de ab no se extiende",
);

// --- BREAK -----------------------------------------------------------------
const parts = breakSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 3 });
assert.ok(parts, "break parte en dos");
if (parts) {
  assert.ok(segNear(parts[0], { x: 0, y: 0 }, { x: 4, y: 0 }), "primer tramo hasta la proyección");
  assert.ok(segNear(parts[1], { x: 4, y: 0 }, { x: 10, y: 0 }), "segundo tramo desde la proyección");
}
assert.equal(
  breakSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }),
  null,
  "partir en un extremo no da dos tramos",
);

const between = breakSegmentBetween(
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 3, y: 1 },
  { x: 7, y: -1 },
);
assert.ok(between, "break-between quita el tramo central");
if (between) {
  assert.ok(segNear(between[0], { x: 0, y: 0 }, { x: 3, y: 0 }), "tramo exterior izquierdo");
  assert.ok(segNear(between[1], { x: 7, y: 0 }, { x: 10, y: 0 }), "tramo exterior derecho");
}
// El orden de los puntos no importa (se ordenan por posición sobre ab).
const betweenRev = breakSegmentBetween(
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 7, y: -1 },
  { x: 3, y: 1 },
);
assert.ok(
  betweenRev && segNear(betweenRev[0], { x: 0, y: 0 }, { x: 3, y: 0 }),
  "break-between es indiferente al orden de los puntos",
);

console.log("cad geom-trim specs passed");
