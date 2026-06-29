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
console.log("cad validation report specs passed");
