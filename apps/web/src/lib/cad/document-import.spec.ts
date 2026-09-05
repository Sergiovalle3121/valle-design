import { strict as assert } from "node:assert";
import {
  importDocumentText,
  MAX_DWG_IMPORT_BYTES,
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
// Los DOS fracasos distintos, cada uno con su mensaje. «esto no es DXF» no
// tiene ni una sección, así que se le dice que mire qué archivo eligió; un
// texto CON estructura de DXF que el analizador no digiere es fallo NUESTRO y
// no se le llama «corrupto» al remitente (ver `document-import.ts`).
assert.throws(
  () => importDocumentText("broken.dxf", "esto no es DXF"),
  /no parece un DXF/i,
);
assert.throws(
  () => importDocumentText("raro.dxf", "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n"),
  /no pudo analizar el DXF/i,
);
assert.throws(() => validateImportFile("drawing.dwg", 100), /no soportado/i);
assert.throws(
  () => validateImportFile("drawing.dxf", MAX_DXF_IMPORT_BYTES + 1),
  /límite/i,
);

// ─── Fase 2: fronteras exactas del tope de bytes DWG (16 MiB) ─────────────
// `dwgBetaEnabled: true` en las tres llamadas para aislar el chequeo de
// TAMAÑO del chequeo de formato (que ya tiene su propia prueba, línea 69).
assert.doesNotThrow(
  () => validateImportFile("plano.dwg", MAX_DWG_IMPORT_BYTES, true),
  "exactamente en el tope, el archivo entra",
);
assert.doesNotThrow(
  () => validateImportFile("plano.dwg", MAX_DWG_IMPORT_BYTES - 1, true),
  "un byte por debajo del tope, el archivo entra",
);
assert.throws(
  () => validateImportFile("plano.dwg", MAX_DWG_IMPORT_BYTES + 1, true),
  /límite/i,
  "un byte por encima del tope, la UI ya lo rechaza — antes de este arreglo el códec " +
    "aceptaba hasta 24.000.000 y el códec sólo hasta 16.777.216: esta prueba fija el número " +
    "real, no uno sintético",
);

console.log("document-import: extensión, tamaño y límites de importación");
