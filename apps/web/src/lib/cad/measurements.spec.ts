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

console.log("cad measurement specs passed");
