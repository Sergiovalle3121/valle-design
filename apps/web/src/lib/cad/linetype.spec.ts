/** Tipos de línea / linetypes (VD-CAD-DEPTH-A5). */
import { strict as assert } from "node:assert";
import {
  applyLinetype,
  isDot,
  LINETYPES,
  type LinetypeSegment,
} from "./linetype";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function length(s: LinetypeSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

// --- guiones en un segmento recto -----------------------------------------
const dashed = applyLinetype(
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  [2, -2],
);
assert.equal(dashed.length, 3, "patrón 2-2 en 10 → 3 guiones ([0,2],[4,6],[8,10])");
assert.ok(dashed.every((s) => near(length(s), 2)), "cada guión mide 2");
assert.ok(near(dashed[0].a.x, 0) && near(dashed[1].a.x, 4) && near(dashed[2].a.x, 8), "guiones en fase");
assert.ok(!dashed.some(isDot), "ningún punto en un patrón de guiones");

// --- continuidad y quiebre en la esquina ----------------------------------
// Guión (4) más largo que la primera arista (3): debe cruzar la esquina y
// partirse en dos tramos (uno horizontal de 3, otro vertical de 1).
const corner = applyLinetype(
  [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 3 },
  ],
  [4, -2],
);
assert.equal(corner.length, 2, "el guión que cruza la esquina se parte en dos");
assert.ok(near(length(corner[0]), 3) && near(corner[0].a.y, corner[0].b.y), "primer tramo horizontal de 3");
assert.ok(near(length(corner[1]), 1) && near(corner[1].a.x, corner[1].b.x), "segundo tramo vertical de 1");

// --- puntos -----------------------------------------------------------------
const dots = applyLinetype(
  [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
  ],
  [0, -2],
);
assert.equal(dots.length, 3, "patrón punto-hueco2 en 6 → puntos en 0,2,4");
assert.ok(dots.every(isDot), "todos los trazos son puntos (longitud cero)");
assert.ok(
  near(dots[0].a.x, 0) && near(dots[1].a.x, 2) && near(dots[2].a.x, 4),
  "puntos en fase",
);

// --- continuo (patrón vacío) → sólido -------------------------------------
const solid = applyLinetype(
  [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
  ],
  LINETYPES.CONTINUOUS,
);
assert.equal(solid.length, 2, "continuo devuelve una arista sólida por tramo");
assert.ok(near(length(solid[0]), 5) && near(length(solid[1]), 5), "aristas completas");

// --- escala no positiva → sólido -------------------------------------------
const noScale = applyLinetype(
  [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ],
  [1, -1],
  0,
);
assert.equal(noScale.length, 1, "escala 0 devuelve la línea sólida");

// --- escala aplica al patrón -----------------------------------------------
const scaled = applyLinetype(
  [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ],
  [2, -2],
  2, // guión 4, hueco 4
);
assert.ok(scaled.every((s) => near(length(s), 4)), "la escala 2 duplica el guión a 4");

// --- catálogo de linetypes -------------------------------------------------
assert.ok(Array.isArray(LINETYPES.DASHED) && LINETYPES.DASHED.length > 0, "DASHED definido");
assert.equal(LINETYPES.CONTINUOUS.length, 0, "CONTINUOUS es patrón vacío");

console.log("cad linetype specs passed");
