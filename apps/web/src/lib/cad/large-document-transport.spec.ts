import assert from "node:assert/strict";
import test from "node:test";
import {
  CAD_ARCHIVE_UPLOAD_THRESHOLD_BYTES,
  serializeCadDocumentForTransport,
} from "./large-document-transport";

test("measures UTF-8 bytes rather than JavaScript code units", () => {
  const serialized = serializeCadDocumentForTransport({ note: "áéíóú" });
  assert.equal(serialized.bytes, Buffer.byteLength(serialized.json, "utf8"));
});

test("selects multipart archive transport only beyond the safe JSON budget", () => {
  const small = serializeCadDocumentForTransport({ meta: { schema: 3 } });
  const large = serializeCadDocumentForTransport({
    meta: { schema: 3 },
    recoveryNotes: "x".repeat(CAD_ARCHIVE_UPLOAD_THRESHOLD_BYTES),
  });
  assert.equal(small.useArchive, false);
  assert.equal(large.useArchive, true);
});
