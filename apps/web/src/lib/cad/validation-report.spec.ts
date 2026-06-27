import { strict as assert } from "node:assert";
import { buildCadValidationReport } from "./validation-report";

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
assert.equal(report.collisions.length, 1, "includes collision findings");
assert.equal(report.severity, "critical", "collisions mark report critical");
assert.ok(report.flow, "includes flow score when flow nodes are provided");
console.log("cad validation report specs passed");
