/** Restricciones geométricas paramétricas sobre segmentos (CAD-NEXT-110). */
import { strict as assert } from "node:assert";
import {
  makeHorizontal,
  makeVertical,
  makeParallel,
  makePerpendicular,
  makeEqualLength,
  makeCollinear,
  segmentAngle,
  type Segment,
} from "./geom-constraints";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const len = (s: Segment) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const mid = (s: Segment) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });

// --- horizontal: pivota en el medio, conserva longitud --------------------
{
  const s: Segment = { a: { x: 0, y: 0 }, b: { x: 3, y: 4 } }; // largo 5, medio (1.5,2)
  const h = makeHorizontal(s);
  assert.ok(near(h.a.y, h.b.y), "horizontal: mismos y");
  assert.ok(near(len(h), 5), "horizontal: conserva longitud");
  assert.ok(near(mid(h).x, 1.5) && near(mid(h).y, 2), "horizontal: conserva punto medio");
  assert.ok(h.b.x > h.a.x, "horizontal: conserva orientación a→b (b a la derecha)");
}

// --- horizontal conserva sentido cuando b está a la izquierda -------------
{
  const s: Segment = { a: { x: 10, y: 0 }, b: { x: 0, y: 2 } }; // apunta a la izquierda
  const h = makeHorizontal(s);
  assert.ok(h.b.x < h.a.x, "horizontal: si a→b iba a la izquierda, se conserva");
}

// --- vertical --------------------------------------------------------------
{
  const s: Segment = { a: { x: 0, y: 0 }, b: { x: 4, y: 3 } }; // largo 5
  const v = makeVertical(s);
  assert.ok(near(v.a.x, v.b.x), "vertical: mismos x");
  assert.ok(near(len(v), 5), "vertical: conserva longitud");
  assert.ok(v.b.y > v.a.y, "vertical: conserva sentido ascendente");
}

// --- paralelo --------------------------------------------------------------
{
  const ref: Segment = { a: { x: 0, y: 0 }, b: { x: 2, y: 2 } }; // 45°
  const tgt: Segment = { a: { x: 0, y: 10 }, b: { x: 0, y: 14 } }; // vertical, largo 4
  const p = makeParallel(tgt, ref);
  const da = ((segmentAngle(p) - segmentAngle(ref)) % Math.PI + Math.PI) % Math.PI;
  assert.ok(near(da, 0) || near(da, Math.PI), "paralelo: misma dirección que la referencia");
  assert.ok(near(len(p), 4), "paralelo: conserva longitud del objetivo");
  assert.ok(near(mid(p).x, 0) && near(mid(p).y, 12), "paralelo: pivota en el medio");
}

// --- perpendicular ---------------------------------------------------------
{
  const ref: Segment = { a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }; // horizontal
  const tgt: Segment = { a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }; // horizontal, largo 3
  const perp = makePerpendicular(tgt, ref);
  const dot = (perp.b.x - perp.a.x) * (ref.b.x - ref.a.x) + (perp.b.y - perp.a.y) * (ref.b.y - ref.a.y);
  assert.ok(near(dot, 0), "perpendicular: producto punto cero con la referencia");
  assert.ok(near(len(perp), 3), "perpendicular: conserva longitud");
}

// --- igualar longitud ------------------------------------------------------
{
  const ref: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }; // largo 10
  const tgt: Segment = { a: { x: 0, y: 5 }, b: { x: 3, y: 9 } }; // largo 5, medio (1.5,7)
  const eq = makeEqualLength(tgt, ref);
  assert.ok(near(len(eq), 10), "igualar: longitud = la de referencia");
  assert.ok(near(segmentAngle(eq), segmentAngle(tgt)), "igualar: conserva dirección");
  assert.ok(near(mid(eq).x, 1.5) && near(mid(eq).y, 7), "igualar: pivota en el medio");
}

// --- colineal: proyecta ambos extremos sobre la recta de la referencia -----
{
  const ref: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }; // eje X
  const tgt: Segment = { a: { x: 2, y: 3 }, b: { x: 6, y: 7 } };
  const c = makeCollinear(tgt, ref);
  assert.ok(near(c.a.y, 0) && near(c.b.y, 0), "colineal: cae sobre la recta soporte (y=0)");
  assert.ok(near(c.a.x, 2) && near(c.b.x, 6), "colineal: proyección ortogonal preserva la x");
}

// --- colineal con referencia degenerada devuelve el objetivo sin cambio ----
{
  const ref: Segment = { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } };
  const tgt: Segment = { a: { x: 2, y: 3 }, b: { x: 6, y: 7 } };
  assert.deepEqual(makeCollinear(tgt, ref), tgt, "colineal: referencia degenerada = sin cambio");
}

// --- determinismo ----------------------------------------------------------
{
  const s: Segment = { a: { x: 1, y: 2 }, b: { x: 7, y: 3 } };
  assert.deepEqual(makeHorizontal(s), makeHorizontal(s), "determinista");
}

console.log("cad geom-constraints specs passed");
