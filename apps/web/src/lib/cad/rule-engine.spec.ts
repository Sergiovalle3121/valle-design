/** Motor de reglas transversal sobre el documento canónico (CAD-NEXT-100). */
import { strict as assert } from "node:assert";
import { layoutToCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import {
  aabbGap,
  boxAabb,
  createDefaultRuleEngine,
  duplicateIdsRule,
  minClearanceRule,
  overlapRule,
  RuleEngine,
  withinBoundsRule,
} from "./rule-engine";

function box(id: string, x: number, y: number, w: number, h: number, rotation = 0, label?: string): Extract<CadEntity, { type: "box" }> {
  return { id, type: "box", kind: "zone", x, y, w, h, rotation, layer: "0", shape: "rect", ...(label ? { label } : {}) };
}
function doc(entities: CadEntity[]): CadDocument {
  return { meta: { version: 1, schema: 1, unit: "mm" }, layers: [], entities, history: [] };
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

// --- AABB con rotación ------------------------------------------------------
const flat = boxAabb(box("a", 0, 0, 100, 100));
assert.deepEqual(flat, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, "AABB sin rotar");
const turned = boxAabb(box("b", 0, 0, 100, 40, 90));
assert.ok(near(turned.maxX - turned.minX, 40) && near(turned.maxY - turned.minY, 100), "90° intercambia ancho/alto en la AABB");

// --- separación entre AABB --------------------------------------------------
assert.ok(aabbGap(boxAabb(box("a", 0, 0, 100, 100)), boxAabb(box("b", 50, 50, 100, 100))) < 0, "solape → separación negativa");
assert.ok(near(aabbGap(boxAabb(box("a", 0, 0, 100, 100)), boxAabb(box("d", 105, 0, 50, 100))), 5), "separados 5 en X");

// --- ids duplicados ---------------------------------------------------------
const dup = duplicateIdsRule.evaluate(doc([box("x", 0, 0, 10, 10), box("x", 20, 20, 10, 10)]));
assert.equal(dup.length, 1, "un hallazgo de id duplicado");
assert.equal(dup[0].level, "error");

// --- solape ------------------------------------------------------------------
const ov = overlapRule.evaluate(doc([box("a", 0, 0, 100, 100, 0, "A"), box("b", 50, 50, 100, 100, 0, "B"), box("c", 400, 400, 20, 20)]));
assert.equal(ov.length, 1, "sólo A y B solapan");
assert.deepEqual(ov[0].entityIds.sort(), ["a", "b"], "referencia a las dos entidades");

// --- fuera de límites -------------------------------------------------------
const bounds = withinBoundsRule({ w: 200, h: 200 });
assert.equal(bounds.evaluate(doc([box("in", 10, 10, 50, 50)])).length, 0, "dentro no marca");
assert.equal(bounds.evaluate(doc([box("out", 180, 10, 50, 50)])).length, 1, "sobresale por la derecha → error");

// --- holgura mínima ---------------------------------------------------------
const clr = minClearanceRule(20);
assert.equal(clr.evaluate(doc([box("a", 0, 0, 100, 100), box("d", 105, 0, 50, 100)])).length, 1, "gap 5 < 20 → aviso");
assert.equal(clr.evaluate(doc([box("a", 0, 0, 100, 100), box("f", 200, 0, 50, 100)])).length, 0, "gap 100 ≥ 20 → sin aviso");
assert.equal(clr.evaluate(doc([box("a", 0, 0, 100, 100), box("b", 50, 50, 100, 100)])).length, 0, "los que solapan no cuentan como holgura");

// --- motor: orden por severidad y resumen -----------------------------------
const engine = createDefaultRuleEngine({ footprint: { w: 120, h: 120 }, minClearance: 20 });
// A y B solapan (warning); B sobresale de 120×120 (error).
const findings = engine.run(doc([box("a", 0, 0, 100, 100, 0, "A"), box("b", 50, 50, 100, 100, 0, "B")]));
assert.ok(findings.length >= 2, "hay hallazgos");
assert.equal(findings[0].level, "error", "los errores van primero");
const sum = engine.summary(doc([box("a", 0, 0, 100, 100, 0, "A"), box("b", 50, 50, 100, 100, 0, "B")]));
assert.ok(sum.error >= 1 && sum.warning >= 1, "el resumen cuenta por severidad");

// --- una regla que revienta no tumba el motor -------------------------------
const boom = new RuleEngine([{ id: "boom", label: "revienta", evaluate: () => { throw new Error("x"); } }]);
const boomFindings = boom.run(doc([]));
assert.equal(boomFindings[0].ruleId, "boom", "la regla fallida se reporta como error, no propaga");
assert.equal(boomFindings[0].level, "error");

// --- documento limpio no genera hallazgos -----------------------------------
assert.equal(engine.run(doc([box("a", 0, 0, 30, 30), box("b", 60, 60, 30, 30)])).length, 0, "diseño limpio → sin hallazgos");

// --- equivalencia del índice espacial vs fuerza bruta (CAD-NEXT-102) --------
// 250 cajas pseudoaleatorias deterministas con solapes y vecinos cercanos: los
// hallazgos con el grid hash deben ser EXACTAMENTE los del doble bucle O(n²).
{
  let seed = 12345 >>> 0;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 0x100000000);
  const crowd: ReturnType<typeof box>[] = [];
  for (let i = 0; i < 250; i++) {
    crowd.push(box(`r${i}`, Math.floor(rng() * 3000), Math.floor(rng() * 3000), 80 + Math.floor(rng() * 220), 80 + Math.floor(rng() * 220), rng() < 0.3 ? 45 : 0));
  }
  const crowdDoc = doc(crowd);
  const aabbs = crowd.map(boxAabb);
  const key = (i: number, j: number) => `${crowd[i].id}|${crowd[j].id}`;
  const bruteOverlap = new Set<string>();
  const bruteClearance = new Set<string>();
  const MIN_GAP = 40;
  for (let i = 0; i < crowd.length; i++) {
    for (let j = i + 1; j < crowd.length; j++) {
      const gap = aabbGap(aabbs[i], aabbs[j]);
      if (gap < -1e-6) bruteOverlap.add(key(i, j));
      else if (gap >= 0 && gap < MIN_GAP - 1e-6) bruteClearance.add(key(i, j));
    }
  }
  assert.ok(bruteOverlap.size > 20, `la multitud tiene solapes reales (${bruteOverlap.size})`);
  assert.ok(bruteClearance.size > 5, `y vecinos con holgura corta (${bruteClearance.size})`);
  const indexedOverlap = new Set(overlapRule.evaluate(crowdDoc).map((f) => f.entityIds.join("|")));
  assert.deepEqual([...indexedOverlap].sort(), [...bruteOverlap].sort(), "solape: índice ≡ fuerza bruta");
  const indexedClearance = new Set(minClearanceRule(MIN_GAP).evaluate(crowdDoc).map((f) => f.entityIds.join("|")));
  assert.deepEqual([...indexedClearance].sort(), [...bruteClearance].sort(), "holgura: índice ≡ fuerza bruta");
}

// --- las estaciones también son geometría (CAD-NEXT-101 pieza 2) -------------
{
  const stationDoc = layoutToCadDocument({
    assets: [{ id: "mesa", kind: "workbench", x: 0, y: 0, w: 1000, h: 1000, rotation: 0, label: "Mesa" }],
    stations: [
      // Solapa con la mesa Y sobresale del footprint de 5000×5000.
      { id: "st-fuera", x: 4500, y: 0, w: 1200, h: 800, rotation: 0 },
      { id: "st-encima", x: 500, y: 500, w: 1000, h: 700, rotation: 0 },
    ],
  });
  const overlaps = overlapRule.evaluate(stationDoc);
  assert.ok(
    overlaps.some((f) => f.entityIds.includes("st-encima") && f.entityIds.includes("mesa")),
    "una estación encima de un asset se detecta como solape",
  );
  const bounds = withinBoundsRule({ w: 5000, h: 5000 }).evaluate(stationDoc);
  assert.ok(
    bounds.some((f) => f.entityIds.includes("st-fuera")),
    "una estación fuera del área se detecta",
  );
}

console.log("cad rule-engine specs passed");
