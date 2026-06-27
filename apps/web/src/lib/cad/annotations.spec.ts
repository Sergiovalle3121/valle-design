import { strict as assert } from "node:assert";
import {
  annotationBounds,
  createMeasurementAnnotation,
  createTextAnnotation,
  filterAnnotationsByLayer,
} from "./annotations";

const note = createTextAnnotation(
  "n1",
  "Keep clear",
  { x: 10, y: 20 },
  "Safety",
);
assert.equal(note.kind, "text", "creates text annotation");
const measure = createMeasurementAnnotation(
  "m1",
  { x: 0, y: 0 },
  { x: 3, y: 4 },
);
assert.equal(
  measure.distance,
  5,
  "creates measurement annotation with distance",
);
assert.deepEqual(
  annotationBounds(measure),
  { x: 1.5, y: 2, width: 3, height: 4 },
  "computes annotation bounds",
);
assert.equal(
  filterAnnotationsByLayer([note, measure], ["Safety"]).length,
  1,
  "filters by visible layer",
);
console.log("cad annotations specs passed");
