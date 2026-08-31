import { strict as assert } from "node:assert";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import { CAD_DATA_EXTRACTION_CSV_MIME_TYPE, handleCadDataExtractionHostRequest } from "./data-extraction-host";

const downloads: Array<{ fileName: string; bytes: Uint8Array; mimeType: string }> = [];
const bridge = {
  download: (fileName: string, bytes: Uint8Array, mimeType: string) =>
    void downloads.push({ fileName, bytes, mimeType }),
};

// --- el CSV se entrega con BOM UTF-8 y el texto exacto detrás ---------------
{
  const content = "MUROS\r\nCapa,Cant.\r\nMUROS,4\r\n";
  const line = handleCadDataExtractionHostRequest(
    { kind: "data-extraction-csv", fileName: "cuadro-de-cantidades.csv", content },
    bridge,
  );
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].fileName, "cuadro-de-cantidades.csv");
  assert.equal(downloads[0].mimeType, CAD_DATA_EXTRACTION_CSV_MIME_TYPE);
  const bytes = downloads[0].bytes;
  assert.equal(bytes[0], 0xef, "BOM: primer byte");
  assert.equal(bytes[1], 0xbb, "BOM: segundo byte");
  assert.equal(bytes[2], 0xbf, "BOM: tercer byte");
  assert.equal(new TextDecoder().decode(bytes.slice(3)), content, "detrás del BOM va el CSV exacto");
  assert.ok(line?.includes("cuadro de cantidades exportado"), line ?? "");
}

// --- no contesta a lo que no es suyo ---------------------------------------
{
  const before = downloads.length;
  const foreign: CadHostRequest = { kind: "space", space: "paper", layoutId: "A-101" };
  assert.equal(handleCadDataExtractionHostRequest(foreign, bridge), null);
  assert.equal(downloads.length, before, "y no descarga nada");
}

console.log("data-extraction-host: entrega el CSV con BOM y deja pasar lo ajeno");
