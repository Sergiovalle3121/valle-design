import { strict as assert } from "node:assert";
import {
  importDocumentText,
  MAX_DXF_IMPORT_BYTES,
  validateImportFile,
} from "./document-import";
import { layoutToCadDocument, serializeCadDocument } from "./cad-document";

const canonical = layoutToCadDocument(
  {
    assets: [
      { id: "box-1", kind: "machine", x: 1, y: 2, w: 3, h: 4, rotation: 0 },
    ],
  },
  { unit: "mm" },
);
const json = importDocumentText(
  "drawing.json",
  serializeCadDocument(canonical),
);
assert.equal(json.format, "json");
assert.equal(json.importedEntityCount, 1);
assert.equal(json.document.entities[0].id, "box-1");

const dxf = [
  "0",
  "SECTION",
  "2",
  "ENTITIES",
  "0",
  "LINE",
  "8",
  "A-WALL",
  "10",
  "0",
  "20",
  "0",
  "11",
  "100",
  "21",
  "25",
  "0",
  "ENDSEC",
  "0",
  "EOF",
].join("\n");
const importedDxf = importDocumentText("plan.dxf", dxf);
assert.equal(importedDxf.format, "dxf");
assert.equal(importedDxf.importedEntityCount, 1);
assert.equal(importedDxf.document.entities[0].type, "line");
assert.ok(importedDxf.document.layers.some((layer) => layer.id === "A-WALL"));

assert.throws(
  () => importDocumentText("bad.json", "{not-json"),
  /no se puede analizar/i,
);
assert.throws(
  () =>
    importDocumentText(
      "unsafe.json",
      '{"meta":{"schema":3,"version":1,"unit":"mm"},"entities":[],"__proto__":{}}',
    ),
  /clave insegura/i,
);
assert.throws(
  () => importDocumentText("broken.dxf", "esto no es DXF"),
  /corrupto|válido/i,
);
assert.throws(() => validateImportFile("drawing.dwg", 100), /no soportado/i);
assert.throws(
  () => validateImportFile("drawing.dxf", MAX_DXF_IMPORT_BYTES + 1),
  /límite/i,
);

console.log("document-import: extensión, tamaño y límites de importación");
