/** Pure CAD line-balance assignment tests. Run: node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' --project apps/web/tsconfig.json apps/web/src/lib/cad/line-balance-assignment.spec.ts */
import { strict as assert } from "node:assert";
import {
  assignCadLineBalanceTasks,
  type CadLineBalanceTask,
} from "./line-balance-assignment";

const manualLine: CadLineBalanceTask[] = [
  { id: "A", label: "Prep", timeSec: 2 },
  { id: "B", label: "Place", timeSec: 4, predecessors: ["A"] },
  { id: "C", label: "Inspect", timeSec: 3, predecessors: ["A"] },
  { id: "D", label: "Fasten", timeSec: 2, predecessors: ["B"] },
  { id: "E", label: "Label", timeSec: 3, predecessors: ["C"] },
  { id: "F", label: "Pack", timeSec: 2, predecessors: ["D", "E"] },
];

const rpw = assignCadLineBalanceTasks({
  tasks: manualLine,
  cycleTimeSec: 6,
  method: "ranked-positional-weight",
});

assert.deepEqual(
  rpw.positionalWeights,
  { A: 16, B: 8, C: 8, D: 4, E: 5, F: 2 },
  "manual RPW weights include each task plus all transitive successors",
);
assert.deepEqual(
  rpw.stations.map((station) => station.tasks.map((task) => task.id)),
  [
    ["A", "B"],
    ["C", "E"],
    ["D", "F"],
  ],
  "RPW assigns the hand-solved six-task line to the expected stations",
);
assert.deepEqual(
  rpw.stations.map((station) => station.workloadSec),
  [6, 6, 4],
  "station workloads match the hand calculation",
);
assert.deepEqual(
  rpw.stations.map((station) => station.idleSec),
  [0, 0, 2],
  "idle time is cycle time minus station workload",
);
assert.equal(rpw.stationCount, 3, "manual case uses three stations");
assert.equal(rpw.totalWorkSec, 16, "total work is 2+4+3+2+3+2 seconds");
assert.equal(
  rpw.totalIdleSec,
  2,
  "total idle is 18 seconds available minus 16 seconds work",
);
assert.equal(
  rpw.lineEfficiencyPercent,
  88.889,
  "efficiency is 16 / (3 * 6) = 88.889%",
);
assert.deepEqual(rpw.unassignedTaskIds, [], "manual line is fully assignable");
assert.deepEqual(rpw.warnings, [], "manual line has no validation warnings");

const lcr = assignCadLineBalanceTasks({
  tasks: manualLine,
  cycleTimeSec: 6,
  method: "largest-candidate-rule",
});
assert.deepEqual(
  lcr.stations.map((station) => station.tasks.map((task) => task.id)),
  [
    ["A", "B"],
    ["C", "E"],
    ["D", "F"],
  ],
  "LCR remains deterministic and respects all precedences on the same hand case",
);

const infeasible = assignCadLineBalanceTasks({
  cycleTimeSec: 5,
  tasks: [
    { id: "base", timeSec: 2 },
    { id: "oversize", timeSec: 7, predecessors: ["base"] },
  ],
});
assert.deepEqual(
  infeasible.infeasibleTaskIds,
  ["oversize"],
  "flags tasks longer than cycle time",
);
assert.deepEqual(
  infeasible.unassignedTaskIds,
  ["oversize"],
  "does not hide infeasible work",
);
assert.equal(
  infeasible.warnings.some(
    (warning) => warning.code === "task_exceeds_cycle_time",
  ),
  true,
  "emits an explicit infeasible-task warning",
);

const cyclic = assignCadLineBalanceTasks({
  cycleTimeSec: 10,
  tasks: [
    { id: "a", timeSec: 2, predecessors: ["c"] },
    { id: "b", timeSec: 2, predecessors: ["a"] },
    { id: "c", timeSec: 2, predecessors: ["b"] },
  ],
});
assert.deepEqual(
  cyclic.stations,
  [],
  "cycle input is not assigned into fake stations",
);
assert.deepEqual(
  cyclic.unassignedTaskIds,
  ["a", "b", "c"],
  "cycle tasks remain unassigned",
);
assert.equal(
  cyclic.warnings.some((warning) => warning.code === "precedence_cycle"),
  true,
  "detects precedence cycles",
);

console.log("cad line balance assignment specs passed");
