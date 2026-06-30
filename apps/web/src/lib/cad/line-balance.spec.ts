/** Pure CAD line-balance smoke tests. Run: node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' --project apps/web/tsconfig.json apps/web/src/lib/cad/line-balance.spec.ts */
import { strict as assert } from "node:assert";
import {
  buildCadLineBalanceReport,
  cycleTimeSecondsFromLabel,
} from "./line-balance";

assert.equal(cycleTimeSecondsFromLabel("AOI CT=42s"), 42);
assert.equal(cycleTimeSecondsFromLabel("Packing (1.5min)"), 90);
assert.equal(cycleTimeSecondsFromLabel("Inspection"), undefined);

const report = buildCadLineBalanceReport({
  taktTimeSec: 45,
  stations: [
    { id: "printer", label: "Printer CT=38s" },
    { id: "aoi", label: "AOI", cycleTimeSec: 52 },
    { id: "pack", label: "Packing CT=40s" },
    { id: "rework", label: "Rework" },
  ],
});

assert.equal(report.stationCount, 4, "counts all stations");
assert.equal(report.measuredStationCount, 3, "counts stations with cycle times");
assert.equal(report.bottleneck?.id, "aoi", "detects the bottleneck station");
assert.deepEqual(report.overloadedStationIds, ["aoi"], "flags over-takt station");
assert.deepEqual(
  report.missingStationIds,
  ["rework"],
  "reports missing cycle time metadata",
);
assert.equal(report.maxLoadPercent, 116, "calculates max station load");
assert.equal(
  report.stations.find((station) => station.id === "aoi")?.slackSec,
  -7,
  "reports negative slack for overloaded stations",
);
assert.equal(
  report.recommendations.some((item) => item.includes("above takt")),
  true,
  "recommends rebalancing overloaded stations",
);

const noTakt = buildCadLineBalanceReport({
  stations: [
    { id: "smt", label: "SMT CT=50s" },
    { id: "test", label: "Test CT=45s" },
  ],
});

assert.equal(noTakt.effectiveTaktSec, 50, "uses bottleneck as reference");
assert.equal(
  noTakt.recommendations.some((item) => item.includes("Define takt time")),
  true,
  "asks for takt time when missing",
);

console.log("cad line balance specs passed");
