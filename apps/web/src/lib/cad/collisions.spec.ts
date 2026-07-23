import { strict as assert } from "node:assert";
import {
  boxesOverlap,
  detectCadCollisions,
  edgeDistance,
  findClearanceIssues,
} from "./collisions";

const a = { id: "a", label: "AOI", x: 0, y: 0, width: 10, height: 10 };
const b = { id: "b", label: "Pack", x: 5, y: 0, width: 10, height: 10 };
const c = { id: "c", x: 30, y: 0, width: 5, height: 5 };
assert.equal(boxesOverlap(a, b)?.area, 50, "overlap area is computed");
assert.equal(detectCadCollisions([a, b, c]).length, 1, "detects one collision");
assert.equal(edgeDistance(a, c), 22.5, "edge distance is computed");
assert.equal(
  findClearanceIssues([a, c], 25).length,
  1,
  "clearance issue is detected",
);

// --- broad phase compartido ≡ fuerza bruta (CAD-NEXT-101) -------------------
// 300 cajas pseudoaleatorias deterministas: los resultados con el índice
// espacial deben ser EXACTAMENTE los del doble bucle de referencia.
{
  let seed = 777 >>> 0;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 0x100000000);
  const crowd = Array.from({ length: 300 }, (_, i) => ({
    id: `c${i}`,
    x: Math.floor(rng() * 4000),
    y: Math.floor(rng() * 4000),
    width: 60 + Math.floor(rng() * 300),
    height: 60 + Math.floor(rng() * 300),
  }));
  const REQUIRED = 50;
  const bruteHits: string[] = [];
  const bruteIssues: string[] = [];
  for (let i = 0; i < crowd.length; i++) {
    for (let j = i + 1; j < crowd.length; j++) {
      if (boxesOverlap(crowd[i], crowd[j])) bruteHits.push(`${crowd[i].id}|${crowd[j].id}`);
      if (edgeDistance(crowd[i], crowd[j]) < REQUIRED) bruteIssues.push(`${crowd[i].id}|${crowd[j].id}`);
    }
  }
  assert.ok(bruteHits.length > 10, `la multitud tiene colisiones reales (${bruteHits.length})`);
  const indexedHits = detectCadCollisions(crowd).map((h) => `${h.aId}|${h.bId}`);
  assert.deepEqual(indexedHits.sort(), bruteHits.sort(), "colisiones: índice ≡ fuerza bruta");
  const indexedIssues = findClearanceIssues(crowd, REQUIRED).map((issue) => `${issue.aId}|${issue.bId}`);
  assert.deepEqual(indexedIssues, bruteIssues, "holguras: índice ≡ fuerza bruta (mismo orden)");
}

console.log("cad collision specs passed");
