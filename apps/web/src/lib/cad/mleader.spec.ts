/** Directriz con nota (MLEADER) — CAD-NEXT-111. */
import { strict as assert } from "node:assert";
import { buildMleader, DEFAULT_MLEADER_STYLE } from "./mleader";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- caso base: punta a la izquierda del codo -------------------------------
{
  const g = buildMleader({ x: 0, y: 0 }, { x: 1000, y: 800 }, { arrowSize: 200, doglegLength: 600 });
  // punta de flecha: primer vértice es exactamente la punta
  assert.ok(near(g.arrow[0].x, 0) && near(g.arrow[0].y, 0), "el primer vértice de la flecha es la punta");
  assert.equal(g.arrow.length, 3, "la flecha es un triángulo");
  // línea directriz de la punta al codo
  assert.deepEqual(g.leaderLine, [{ x: 0, y: 0 }, { x: 1000, y: 800 }], "directriz punta→codo");
  // el codo se extiende a la DERECHA porque la punta está a la izquierda
  assert.equal(g.textDir, 1, "punta a la izquierda → texto a la derecha");
  assert.ok(near(g.textAnchor.x, 1600) && near(g.textAnchor.y, 800), "ancla del texto a codo+dogleg, misma y");
  assert.deepEqual(g.dogleg, [{ x: 1000, y: 800 }, { x: 1600, y: 800 }], "codo horizontal");
}

// --- punta a la derecha del codo → texto a la izquierda ---------------------
{
  const g = buildMleader({ x: 2000, y: 0 }, { x: 500, y: 500 }, { arrowSize: 200, doglegLength: 600 });
  assert.equal(g.textDir, -1, "punta a la derecha → texto a la izquierda");
  assert.ok(near(g.textAnchor.x, -100) && near(g.textAnchor.y, 500), "ancla a la izquierda del codo");
}

// --- la base de la flecha está a `arrowSize` de la punta --------------------
{
  const g = buildMleader({ x: 0, y: 0 }, { x: 1000, y: 0 }, { arrowSize: 200, doglegLength: 600 });
  // dirección codo→punta es (−1,0); la base está a 200 hacia el codo: (200,0)
  const baseMid = { x: (g.arrow[1].x + g.arrow[2].x) / 2, y: (g.arrow[1].y + g.arrow[2].y) / 2 };
  assert.ok(near(baseMid.x, 200) && near(baseMid.y, 0), "el centro de la base está a arrowSize de la punta");
  // el ancho de la base es 2 * 0.35 * arrowSize = 140
  const w = Math.hypot(g.arrow[1].x - g.arrow[2].x, g.arrow[1].y - g.arrow[2].y);
  assert.ok(near(w, 140), "ancho de base = 0.7 · arrowSize");
}

// --- degenerado: punta = codo no revienta -----------------------------------
{
  const g = buildMleader({ x: 5, y: 5 }, { x: 5, y: 5 }, DEFAULT_MLEADER_STYLE);
  assert.ok(Number.isFinite(g.arrow[0].x) && Number.isFinite(g.textAnchor.x), "sin NaN cuando punta=codo");
  assert.equal(g.textDir, 1, "punta=codo (tip.x<=elbow.x) → texto a la derecha por convención");
}

// --- estilo por defecto se aplica cuando se omite ---------------------------
{
  const g = buildMleader({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.ok(near(g.textAnchor.x, 100 + DEFAULT_MLEADER_STYLE.doglegLength), "usa doglegLength por defecto");
}

// --- determinismo -----------------------------------------------------------
{
  const a = buildMleader({ x: 3, y: 7 }, { x: 40, y: 9 });
  const b = buildMleader({ x: 3, y: 7 }, { x: 40, y: 9 });
  assert.deepEqual(a, b, "determinista");
}

console.log("cad mleader specs passed");
