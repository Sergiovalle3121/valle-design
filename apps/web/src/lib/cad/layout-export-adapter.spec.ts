import { strict as assert } from "node:assert";
import {
  cadLayoutToDxfExportModel,
  exportCadLayoutDxf,
} from "./layout-export-adapter";

const input = {
  boxes: [{ id: "aoi", label: "AOI", x: 10, y: 10, width: 4, height: 2 }],
  connectors: [{ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
  labels: [{ text: "Line 1", x: 1, y: 2 }],
  measurements: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 5 }, label: "5 mm" }],
};
const model = cadLayoutToDxfExportModel(input);
assert.equal(
  model.primitives?.length,
  2,
  "maps boxes and connectors to primitives",
);
assert.equal(model.texts?.[0].text, "Line 1", "maps labels");
const exported = exportCadLayoutDxf(input);
assert.ok(
  exported.content.includes("0\nPOLYLINE"),
  "exports boxes as polylines",
);
assert.ok(exported.content.includes("1\n5 mm"), "exports measurement label");
console.log("cad layout export adapter specs passed");
