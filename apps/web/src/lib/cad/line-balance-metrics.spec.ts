/** Pure CAD line-balance metric tests. Run: node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' --project apps/web/tsconfig.json apps/web/src/lib/cad/line-balance-metrics.spec.ts */
import { strict as assert } from "node:assert";
import { buildCadLineBalanceMetrics } from "./line-balance-metrics";

const handSolved = buildCadLineBalanceMetrics({
  cycleTimeSec: 45,
  stations: [
    { id: "s1", label: "Load", workloadSec: 40 },
    { id: "s2", label: "Build", workloadSec: 35 },
    { id: "s3", label: "Inspect", workloadSec: 25 },
  ],
});

assert.equal(handSolved.stationCount, 3, "counts measured stations");
assert.equal(handSolved.totalWorkSec, 100, "total work is 40 + 35 + 25");
assert.equal(handSolved.totalIdleSec, 35, "total idle is (3 * 45) - 100");
assert.equal(handSolved.lineEfficiencyPercent, 74.074, "efficiency is 100 / 135 = 74.074%");
assert.equal(handSolved.balanceDelayPercent, 25.926, "balance delay is 100% - 74.074%");
assert.equal(
  handSolved.smoothnessIndexSec,
  22.913,
  "smoothness is sqrt((45-40)^2 + (45-35)^2 + (45-25)^2)",
);
assert.equal(handSolved.workloadRangeSec, 15, "range is bottleneck 40 minus lightest station 25");
assert.equal(
  handSolved.coefficientOfVariationPercent,
  18.708,
  "CV is population standard deviation divided by average workload",
);
assert.deepEqual(handSolved.bottleneckStationIds, ["s1"], "highest workload is bottleneck");
assert.deepEqual(
  handSolved.stations.map((station) => station.idleSec),
  [5, 10, 20],
  "station idle values are cycle time minus station workload",
);
assert.deepEqual(
  handSolved.stations.map((station) => station.utilizationPercent),
  [88.889, 77.778, 55.556],
  "station utilization is workload divided by cycle time",
);
assert.equal(
  handSolved.recommendations.some((item) => item.code === "redistribute_idle_time"),
  true,
  "high balance delay plus underloaded stations recommends redistributing idle capacity",
);

const overCycle = buildCadLineBalanceMetrics({
  cycleTimeSec: 45,
  stations: [
    { id: "prep", workloadSec: 30 },
    { id: "test", workloadSec: 52 },
  ],
});

assert.deepEqual(overCycle.overCycleStationIds, ["test"], "flags over-cycle bottleneck stations");
assert.equal(
  overCycle.recommendations.some((item) => item.code === "add_capacity_or_split_work"),
  true,
  "over-cycle work creates a critical capacity recommendation",
);

const inferredCycle = buildCadLineBalanceMetrics({
  stations: [
    { id: "a", workloadSec: 12 },
    { id: "b", workloadSec: 10 },
  ],
});
assert.equal(inferredCycle.cycleTimeSec, 12, "defaults cycle time to bottleneck workload when target is absent");
assert.equal(inferredCycle.lineEfficiencyPercent, 91.667, "inferred bottleneck cycle still reports efficiency");

const invalid = buildCadLineBalanceMetrics({
  cycleTimeSec: 0,
  stations: [{ id: "bad", workloadSec: 0 }],
});
assert.equal(invalid.recommendations[0]?.code, "invalid_input", "invalid data returns an explicit warning report");
assert.equal(invalid.stationCount, 1, "invalid report still preserves input station count");

console.log("cad line balance metrics specs passed");
