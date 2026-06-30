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

const forkliftPath = {
  id: "fp",
  kind: "forklift_path" as const,
  label: "Forklift main aisle",
  x: 0,
  y: 0,
  width: 20,
  height: 6,
};
const forkliftIssues = evaluateSafetyZones([a], [forkliftPath]);
assert.equal(forkliftIssues.length, 1, "reports blocked forklift paths");
assert.equal(
  forkliftIssues[0].code,
  "zone_invasion",
  "forklift path obstruction is a blocker",
);

const esdZone = {
  id: "esd",
  kind: "esd_zone" as const,
  label: "ESD controlled area",
  x: 0,
  y: 0,
  width: 30,
  height: 30,
};
assert.equal(
  evaluateSafetyZones([{ ...a, tags: ["esd"] }], [esdZone]).length,
  0,
  "accepts ESD-tagged objects inside ESD zones",
);
const esdIssues = evaluateSafetyZones([a], [esdZone]);
assert.equal(esdIssues.length, 1, "warns on unclassified objects in ESD zones");
assert.equal(
  esdIssues[0].code,
  "esd_control_warning",
  "ESD classification issue is a warning code",
);
console.log("cad safety zones specs passed");
