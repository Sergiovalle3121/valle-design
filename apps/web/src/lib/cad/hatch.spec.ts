/** Achurado (hatch) de regiones cerradas (AXOS-CAD-DEPTH-A4). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import { crossHatchPolygon, hatchPolygon, type HatchSegment } from "./hatch";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function length(s: HatchSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

const square: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

// --- achurado horizontal ---------------------------------------------------
const h = hatchPolygon(square, { angle: 0, spacing: 2 });
assert.equal(h.length, 4, "cuadrado 10×10 a paso 2 → 4 líneas interiores (y=2,4,6,8)");
assert.ok(
  h.every((s) => near(s.a.y, s.b.y)),
  "líneas horizontales: mismos y en ambos extremos",
);
assert.ok(
  h.every((s) => near(length(s), 10)),
  "cada línea cruza todo el ancho (10)",
);

// --- achurado vertical -----------------------------------------------------
const shifted = hatchPolygon(square, { angle: 0, spacing: 2, origin: { x: 0, y: 1 } });
assert.deepEqual(
  shifted.map((segment) => segment.a.y),
  [1, 3, 5, 7, 9],
  "el origen desplaza la rejilla del patrÃ³n sin mover el boundary",
);

const v = hatchPolygon(square, { angle: 90, spacing: 2 });
assert.equal(v.length, 4, "achurado a 90° también da 4 líneas");
assert.ok(
  v.every((s) => near(s.a.x, s.b.x)),
  "líneas verticales: mismos x en ambos extremos",
);

// --- achurado a 45° (ANSI31) ----------------------------------------------
const diag = hatchPolygon(square, { angle: 45, spacing: 2 });
assert.ok(diag.length > 0, "45° produce líneas");
assert.ok(
  diag.every((s) => near((s.b.y - s.a.y) / (s.b.x - s.a.x), 1, 1e-6)),
  "cada línea a 45° tiene pendiente 1",
);

// --- polígono cóncavo (U): varios tramos por línea de barrido --------------
const u: CadVec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 7, y: 10 },
  { x: 7, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 10 },
  { x: 0, y: 10 },
];
const hu = hatchPolygon(u, { angle: 0, spacing: 1 });
const atSix = hu.filter((s) => near(s.a.y, 6)).sort((a, b) => a.a.x - b.a.x);
assert.equal(atSix.length, 2, "sobre la muesca (y=6) hay dos tramos");
assert.ok(
  near(atSix[0].a.x, 0) && near(atSix[0].b.x, 3),
  "tramo izquierdo [0,3]",
);
assert.ok(
  near(atSix[1].a.x, 7) && near(atSix[1].b.x, 10),
  "tramo derecho [7,10]",
);
const atTwo = hu.filter((s) => near(s.a.y, 2));
assert.equal(atTwo.length, 1, "bajo la muesca (y=2) hay un solo tramo");
assert.ok(near(length(atTwo[0]), 10), "y=2 cruza todo el ancho");

// --- rayado cruzado --------------------------------------------------------
const cross = crossHatchPolygon(square, { angle: 0, spacing: 2 });
assert.equal(
  cross.length,
  hatchPolygon(square, { angle: 0, spacing: 2 }).length +
    hatchPolygon(square, { angle: 90, spacing: 2 }).length,
  "rayado cruzado = pasada a 0° + pasada a 90°",
);

// --- degenerados -----------------------------------------------------------
assert.equal(
  hatchPolygon(square, { angle: 0, spacing: 0 }).length,
  0,
  "espaciado no positivo → sin líneas",
);
assert.equal(
  hatchPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }], { angle: 0, spacing: 1 }).length,
  0,
  "menos de 3 vértices → sin líneas",
);

console.log("cad hatch specs passed");
