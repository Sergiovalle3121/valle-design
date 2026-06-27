import { strict as assert } from "node:assert";
import {
  createAisleBetweenBoxes,
  equipmentInvadesZone,
  evaluateSafetyZones,
} from "./safety-zones";

const a = { id: "a", label: "SMT", x: 0, y: 0, width: 10, height: 10 };
const b = { id: "b", label: "AOI", x: 30, y: 0, width: 10, height: 10 };
const aisle = createAisleBetweenBoxes("aisle-1", a, b, 12);
assert.equal(aisle.kind, "aisle", "creates aisle zone");
assert.equal(aisle.layer, "Aisles", "aisle uses aisle layer");
const noGo = {
  id: "ng",
  kind: "no_go" as const,
  label: "No Go",
  x: 0,
  y: 0,
  width: 5,
  height: 5,
};
assert.equal(equipmentInvadesZone(a, noGo), true, "detects zone invasion");
assert.equal(
  evaluateSafetyZones([a], [noGo]).length,
  1,
  "reports no-go invasion",
);
console.log("cad safety zones specs passed");
