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
console.log("cad validation report specs passed");
