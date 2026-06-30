/** Pure CAD measurement smoke tests. */
import { strict as assert } from "node:assert";
import {
  formatDistance,
  measureBoxes,
  measurePoints,
  measurementLabel,
} from "./measurements";

const a = { id: "a", label: "SMT", x: 0, y: 0, w: 100, h: 100 };
const b = { id: "b", label: "AOI", x: 300, y: 400, w: 100, h: 100 };
const sideBySide = { id: "b", label: "AOI", x: 300, y: 20, w: 100, h: 100 };

const direct = measureBoxes(a, b);
assert.equal(
  Math.round(direct.distanceMm),
  500,
  "direct center distance uses hypotenuse",
);
assert.equal(
  measureBoxes(a, b, "horizontal").distanceMm,
  300,
  "horizontal distance uses dx",
);
assert.equal(
  measureBoxes(a, b, "vertical").distanceMm,
  400,
  "vertical distance uses dy",
);
const horizontalClearance = measureBoxes(a, sideBySide, "edge-horizontal");
assert.equal(
  horizontalClearance.distanceMm,
  200,
  "edge-horizontal measures the gap between facing vertical edges",
);
assert.equal(
  horizontalClearance.relation,
  "clearance",
  "edge-horizontal reports a clearance relation for separated boxes",
);
assert.deepEqual(
  horizontalClearance.from,
  { x: 100, y: 60 },
  "edge-horizontal starts on the right edge of the left box",
);
assert.deepEqual(
  horizontalClearance.to,
  { x: 300, y: 60 },
  "edge-horizontal ends on the left edge of the right box",
);
const verticalClearance = measureBoxes(a, b, "edge-vertical");
assert.equal(
  verticalClearance.distanceMm,
  300,
  "edge-vertical measures the gap between facing horizontal edges",
);
const overlap = measureBoxes(
  a,
  { id: "c", label: "Overlap", x: 80, y: 0, w: 100, h: 100 },
  "edge-horizontal",
);
assert.equal(overlap.relation, "overlap", "edge dimensions flag overlaps");
assert.equal(overlap.overlapMm, 20, "edge dimensions quantify overlap");
assert.equal(
  formatDistance(1200),
  "1200 mm (1.2 m)",
  "large mm distance includes metres",
);
assert.equal(formatDistance(1200, "m"), "1.2 m", "metre display works");
assert.equal(
  measurementLabel(
    a,
    b,
    measurePoints({ x: 0, y: 0 }, { x: 0, y: 250 }, "vertical"),
  ),
  "V SMT ↔ AOI: 250 mm",
  "label includes mode and objects",
);
assert.equal(
  measurementLabel(a, sideBySide, horizontalClearance),
  "EDGE H SMT ↔ AOI: 200 mm clearance",
  "edge measurement labels describe clearance dimensions",
);

console.log("cad measurement specs passed");
