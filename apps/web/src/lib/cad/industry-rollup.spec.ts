/** Resumen / BOM de objetos inteligentes por industria (CAD-NEXT-098). */
import { strict as assert } from "node:assert";
import { createDefaultIndustryRegistry } from "./industry-pack";
import { summarizeIndustryObjects, type PlacedIndustryObject } from "./industry-rollup";

const registry = createDefaultIndustryRegistry();

// Un almacén con dos racks (distinto tamaño) + una góndola de retail + una
// caja no-inteligente (sin objectId de pack, se ignora).
const items: PlacedIndustryObject[] = [
  { objectId: "logistics.pallet-rack", w: 8400, h: 1100 }, // 24 posiciones
  { objectId: "logistics.pallet-rack", w: 5200, h: 1100 }, // 16 posiciones
  { objectId: "retail.gondola", w: 3600, h: 600 }, // 60 facings
  { objectId: "no.soy-pack", w: 1000, h: 1000 }, // ignorado
];

const summary = summarizeIndustryObjects(items, registry);

// --- por objeto --------------------------------------------------------------
assert.equal(summary.objects.length, 2, "dos tipos de objeto inteligente");
const rack = summary.objects.find((o) => o.objectId === "logistics.pallet-rack");
assert.ok(rack, "el rack aparece en el resumen");
assert.equal(rack!.count, 2, "dos racks contados");
assert.equal(rack!.industry, "logistica", "industria del rack");
// AutoCAD no puede dar este número: 24 + 16 = 40 posiciones de pallet totales.
assert.equal(rack!.metrics.palletPositions, 40, "posiciones de pallet SUMADAS en vivo");
assert.equal(rack!.metrics.slotsPerLevel, 6 + 4, "slots por nivel sumados (6+4)");

const gondola = summary.objects.find((o) => o.objectId === "retail.gondola");
assert.equal(gondola!.metrics.totalFacings, 60, "facings de la góndola");

// --- orden determinista ------------------------------------------------------
assert.deepEqual(
  summary.objects.map((o) => o.objectId),
  ["logistics.pallet-rack", "retail.gondola"],
  "objetos ordenados por id de forma estable",
);

// --- por industria -----------------------------------------------------------
assert.equal(summary.industries.length, 2, "dos industrias representadas");
const logistica = summary.industries.find((i) => i.industry === "logistica");
assert.equal(logistica!.objectCount, 1, "logística: un tipo de objeto");
assert.equal(logistica!.instanceCount, 2, "logística: dos instancias");
assert.deepEqual(
  summary.industries.map((i) => i.industry),
  ["logistica", "retail"],
  "industrias ordenadas alfabéticamente",
);

// --- totales -----------------------------------------------------------------
assert.equal(summary.totalInstances, 3, "3 instancias inteligentes (la caja ajena no cuenta)");

// --- determinismo: mismo input → mismo resultado -----------------------------
assert.deepEqual(
  summarizeIndustryObjects(items, registry),
  summary,
  "el resumen es determinista",
);

// --- vacío / sin objetos inteligentes ----------------------------------------
const empty = summarizeIndustryObjects([{ objectId: "nada", w: 1, h: 1 }], registry);
assert.deepEqual(empty.objects, [], "sin objetos de pack → sin filas");
assert.equal(empty.totalInstances, 0, "sin instancias inteligentes");

// --- métricas que dependen del tamaño se recalculan, no se leen de defaults ---
const single = summarizeIndustryObjects(
  [{ objectId: "logistics.pallet-rack", w: 2600, h: 1100 }],
  registry,
);
assert.equal(
  single.objects[0].metrics.palletPositions,
  8,
  "rack de 2600 → 2 slots × 4 niveles por defecto = 8, recalculado por geometría",
);

console.log("cad industry-rollup specs passed");
