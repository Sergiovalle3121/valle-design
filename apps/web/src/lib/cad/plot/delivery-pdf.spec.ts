import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { inspectCadPdf } from "./plot-pdf";
import { isEducationalDeliveryPlan, renderCadDeliveryPdf } from "./delivery-pdf";
import { readPrintedQr } from "./delivery-pdf-qr-oracle";

const drawing: CadDocument = {
  meta: { version: 1, schema: 7, unit: "mm" },
  layers: [{ id: "0", name: "0", color: "#111827", visible: true, locked: false }],
  entities: [{
    id: "muro", type: "wall", layer: "0", thickness: 250, height: 2_400,
    start: { x: 0, y: 0, z: 0 }, end: { x: 5_000, y: 0, z: 0 },
  }],
  history: [],
  modelSpace: { entityIds: ["muro"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

assert.equal(isEducationalDeliveryPlan(null), true);
assert.equal(isEducationalDeliveryPlan({ planCode: "standalone-trial", status: "trialing", effective: true }), true);
assert.equal(isEducationalDeliveryPlan({ planCode: "individual", status: "active", effective: true }), false);
assert.equal(isEducationalDeliveryPlan({ planCode: "despacho", status: "cancelled", effective: false }), true);

const input = {
  document: drawing,
  documentName: "Casa Prueba",
  version: 4,
  deliveredAt: "2026-09-30T23:58:00.000Z",
  latestReviewUrl: "https://vallecad.com/revision#cadReview=token-vivo-de-prueba",
  latestReviewExpiresAt: "2026-10-07T23:58:00.000Z",
  compress: false,
};

void (async () => {
  const free = await renderCadDeliveryPdf({ ...input, educational: true });
  const paid = await renderCadDeliveryPdf({ ...input, educational: false });
  const compressed = await renderCadDeliveryPdf({ ...input, educational: false, compress: true });
  assert.equal(free.pageCount, 2, "portada QR y planta vectorial");
  assert.deepEqual(inspectCadPdf(free.bytes).pageSizesMm, [
    { width: 210, height: 297 },
    { width: 420, height: 297 },
  ]);
  const freePdf = Buffer.from(free.bytes).toString("latin1");
  const paidPdf = Buffer.from(paid.bytes).toString("latin1");
  assert.match(freePdf, /Uso educativo/);
  assert.doesNotMatch(paidPdf, /Uso educativo/);
  assert.match(freePdf, /Casa Prueba/);
  assert.match(freePdf, /Versi.n entregada/);
  assert.ok((freePdf.match(/ re\n/g) ?? []).length > 100, "QR y lámina trazados como vectores");
  const printedUrl = readPrintedQr(free.bytes);
  assert.equal(printedUrl, input.latestReviewUrl,
    "el QR del PDF abre el enlace vivo que verá las revisiones posteriores");
  assert.equal(readPrintedQr(compressed.bytes), input.latestReviewUrl,
    "el PDF de descarga conserva el QR al comprimir los flujos");
  assert.notEqual(printedUrl, "https://vallecad.com/revision#cadReview=entrega-congelada",
    "el QR no se confunde con el enlace de entrega congelado");
  console.log("delivery-pdf: portada QR, cajetín, lámina y marca por plan OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
