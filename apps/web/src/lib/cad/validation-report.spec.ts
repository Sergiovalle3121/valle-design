import { buildCadValidationReport } from "./validation-report";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected)
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertOk(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const report = buildCadValidationReport({
  boxes: [
    { id: "a", x: 0, y: 0, width: 10, height: 10 },
    { id: "b", x: 5, y: 0, width: 10, height: 10 },
  ],
  flowNodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 5, y: 0 },
  ],
});
assertEqual(report.collisions.length, 1, "includes collision findings");
assertEqual(report.severity, "critical", "collisions mark report critical");
assertOk(report.flow, "includes flow score when flow nodes are provided");
assertEqual(report.issues.length, 1, "normalizes collisions into issue rows");
assertEqual(
  report.issues[0]?.severity,
  "critical",
  "collision issue rows are critical",
);
assertEqual(
  report.issues[0]?.actionLabel,
  "Select collision pair",
  "collision issue rows expose a selection action",
);

const clearanceReport = buildCadValidationReport({
  boxes: [
    { id: "a", label: "Printer", x: 0, y: 0, width: 10, height: 10 },
    { id: "b", label: "AOI", x: 18, y: 0, width: 10, height: 10 },
  ],
  requiredClearance: 12,
});
assertEqual(
  clearanceReport.clearances.length,
  1,
  "includes clearance findings when objects are too close",
);
assertEqual(
  clearanceReport.severity,
  "warning",
  "clearance findings mark report warning",
);
assertEqual(
  clearanceReport.issues[0]?.category,
  "clearance",
  "clearance findings become actionable issue rows",
);
assertOk(
  clearanceReport.issues[0]?.suggestedFix.includes("minimum clearance"),
  "clearance issue rows include a suggested fix",
);

const safetyReport = buildCadValidationReport({
  boxes: [{ id: "press", label: "Press", x: 0, y: 0, width: 10, height: 10 }],
  zones: [
    {
      id: "no-go",
      kind: "no_go",
      label: "Maintenance no-go",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    },
  ],
});
assertEqual(
  safetyReport.issues[0]?.category,
  "safety",
  "safety findings become actionable issue rows",
);
assertEqual(
  safetyReport.issues[0]?.affectedObjectIds.includes("press"),
  true,
  "safety issue rows include affected object ids",
);

const architectureReport = buildCadValidationReport({
  boxes: [],
  architectureObjects: [
    {
      id: "room-1",
      kind: "room",
      x: 0,
      y: 0,
      width: 2_000,
      height: 2_000,
      tags: "room",
    },
    {
      id: "door-1",
      kind: "door",
      label: "Shipping door",
      x: 100,
      y: 100,
      width: 900,
      height: 120,
      tags: "door",
    },
    {
      id: "eq-1",
      kind: "station",
      label: "Pack station",
      x: 150,
      y: 80,
      width: 700,
      height: 500,
      tags: "requires:power",
    },
  ],
  unit: "mm",
  dimensionCount: 0,
});
assertEqual(
  architectureReport.severity,
  "critical",
  "blocked doors mark architecture validation critical",
);
assertOk(
  architectureReport.architecture.some((issue) => issue.code === "room_missing_label"),
  "architecture validation flags unlabeled rooms",
);
assertOk(
  architectureReport.architecture.some((issue) => issue.code === "door_blocked"),
  "architecture validation flags blocked doors",
);
assertOk(
  architectureReport.architecture.some((issue) => issue.code === "utility_missing"),
  "architecture validation flags missing explicit utility requirements",
);
assertOk(
  architectureReport.issues.some((issue) => issue.category === "architecture"),
  "architecture findings become normalized issue rows",
);

const wallReport = buildCadValidationReport({
  boxes: [],
  architectureObjects: [
    {
      id: "wall-1",
      kind: "wall",
      label: "North wall",
      x: 0,
      y: 0,
      width: 4_000,
      height: 150,
      tags: "wall, architecture",
    },
    {
      id: "station-1",
      kind: "station",
      label: "ICT",
      x: 1_000,
      y: 20,
      width: 800,
      height: 600,
      tags: "",
    },
  ],
});
assertEqual(
  wallReport.architecture[0]?.code,
  "wall_crosses_equipment",
  "architecture validation flags walls crossing equipment",
);
console.log("cad validation report specs passed");
