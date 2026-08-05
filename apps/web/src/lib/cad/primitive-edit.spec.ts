/** Fillet, chamfer y offset de primitivas (VD-CAD-DEPTH-A2). */
import { strict as assert } from "node:assert";
import { arcPoint, arcSweepDeg, type CadVec2 } from "./primitives";
import {
  chamferCorner,
  filletCorner,
  offsetCircle,
  offsetPolyline,
  offsetSegment,
} from "./primitive-edit";

function near(actual: number, expected: number, tol = 1e-6): boolean {
  return Math.abs(actual - expected) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}

// --- fillet en esquina recta (90°) ----------------------------------------
// Esquina en (0,0): prev arriba (0,10), next a la derecha (10,0), radio 2.
const f = filletCorner({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 2);
assert.ok(f, "fillet de 90° produce arco");
if (f) {
  assert.equal(f.arc.kind, "arc", "el empalme es un arco real");
  assert.ok(near(f.arc.radius, 2), "radio del arco = radio pedido");
  // Tangencia: a distancia r (r/tan45 = r) del corner sobre cada lado.
  assert.ok(pointNear(f.tangentPrev, { x: 0, y: 2 }), "tangente lado previo");
  assert.ok(pointNear(f.tangentNext, { x: 2, y: 0 }), "tangente lado siguiente");
  assert.ok(pointNear(f.arc.center, { x: 2, y: 2 }), "centro sobre la bisectriz");
  // El barrido del arco de 90° debe ser 90° (arco menor, no el mayor).
  assert.ok(
    near(arcSweepDeg(f.arc.startAngle, f.arc.endAngle), 90),
    "el empalme recorre el arco menor (90°)",
  );
  // El arco pasa por el punto medio del redondeo, cerca de la esquina.
  const mid = arcPoint(
    f.arc.center,
    f.arc.radius,
    f.arc.startAngle + arcSweepDeg(f.arc.startAngle, f.arc.endAngle) / 2,
  );
  assert.ok(
    mid.x > 0 && mid.y > 0 && mid.x < 2 && mid.y < 2,
    "el arco bulge hacia la esquina",
  );
  // Los extremos del arco coinciden con los puntos de tangencia.
  const start = arcPoint(f.arc.center, f.arc.radius, f.arc.startAngle);
  const end = arcPoint(f.arc.center, f.arc.radius, f.arc.endAngle);
  const endpoints = [start, end];
  assert.ok(
    endpoints.some((p) => pointNear(p, f.tangentPrev)) &&
      endpoints.some((p) => pointNear(p, f.tangentNext)),
    "los extremos del arco son los puntos de tangencia",
  );
}

// --- fillet obtuso (120°): barrido 60° ------------------------------------
const obtuse = filletCorner(
  { x: 10, y: 0 },
  { x: 0, y: 0 },
  { x: -5, y: 8.660254 }, // 120° respecto a +X
  1,
);
assert.ok(obtuse, "fillet obtuso produce arco");
if (obtuse) {
  assert.ok(
    near(arcSweepDeg(obtuse.arc.startAngle, obtuse.arc.endAngle), 60, 1e-3),
    "empalme de esquina de 120° recorre 60°",
  );
}

// --- fillet degenerado -----------------------------------------------------
assert.equal(
  filletCorner({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 1),
  null,
  "esquina colineal no admite fillet",
);
assert.equal(
  filletCorner({ x: 0, y: 3 }, { x: 0, y: 0 }, { x: 3, y: 0 }, 100),
  null,
  "radio que no cabe en los segmentos devuelve null",
);
assert.equal(
  filletCorner({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 0),
  null,
  "radio no positivo devuelve null",
);

// --- chamfer ---------------------------------------------------------------
const ch = chamferCorner(
  { x: 0, y: 10 },
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  3,
  4,
);
assert.ok(ch, "chamfer produce dos puntos");
if (ch) {
  assert.ok(pointNear(ch.a, { x: 0, y: 3 }), "corte a 3 sobre el lado previo");
  assert.ok(pointNear(ch.b, { x: 4, y: 0 }), "corte a 4 sobre el lado siguiente");
}
assert.equal(
  chamferCorner({ x: 0, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 5, 1),
  null,
  "distancia que excede el segmento devuelve null",
);

// --- offset de segmento ----------------------------------------------------
// Segmento horizontal (0,0)->(10,0): offset +2 va a y=+2 (normal (-dy,dx)=(0,1)).
const os = offsetSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
assert.ok(os, "offsetSegment devuelve segmento");
if (os) {
  assert.ok(pointNear(os.a, { x: 0, y: 2 }), "offset lado izquierdo a");
  assert.ok(pointNear(os.b, { x: 10, y: 2 }), "offset lado izquierdo b");
}
const osNeg = offsetSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, -2);
assert.ok(osNeg && pointNear(osNeg.a, { x: 0, y: -2 }), "offset negativo al otro lado");

// --- offset de polilínea (esquina en inglete) ------------------------------
// L: (0,10)->(0,0)->(10,0). Offset +2 hacia el interior debe cruzarse en (2,2).
const poly = offsetPolyline(
  [
    { x: 0, y: 10 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  2,
);
assert.equal(poly.length, 3, "offset de polilínea preserva número de vértices");
assert.ok(
  pointNear(poly[1], { x: 2, y: 2 }),
  "el vértice interior se resuelve por intersección (inglete)",
);

// Offset de rectángulo cerrado hacia adentro reduce el área.
const closed = offsetPolyline(
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  1,
  true,
);
assert.equal(closed.length, 4, "offset cerrado conserva 4 vértices");
assert.ok(
  pointNear(closed[0], { x: 1, y: 1 }),
  "esquina del rectángulo desplazada 1 hacia adentro",
);

// --- offset de círculo -----------------------------------------------------
const oc = offsetCircle({ x: 0, y: 0 }, 5, 2);
assert.ok(oc && near(oc.radius, 7), "offset de círculo hacia afuera suma al radio");
const ocIn = offsetCircle({ x: 0, y: 0 }, 5, -2);
assert.ok(ocIn && near(ocIn.radius, 3), "offset hacia adentro resta del radio");
assert.equal(
  offsetCircle({ x: 0, y: 0 }, 5, -5),
  null,
  "offset que colapsa el radio devuelve null",
);

console.log("cad primitive-edit specs passed");
