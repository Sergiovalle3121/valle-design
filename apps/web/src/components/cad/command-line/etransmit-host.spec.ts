import { strict as assert } from "node:assert";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import { CAD_ZIP_MIME_TYPE, handleCadEtransmitHostRequest } from "./etransmit-host";

const downloads: Array<{ fileName: string; bytes: Uint8Array; mimeType: string }> = [];
const bridge = {
  download: (fileName: string, bytes: Uint8Array, mimeType: string) =>
    void downloads.push({ fileName, bytes, mimeType }),
};

// --- entrega los bytes exactos y cuenta lo incluido y lo que falta ---------
{
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9]);
  const line = handleCadEtransmitHostRequest(
    {
      kind: "etransmit",
      fileName: "entrega.zip",
      bytes,
      included: ["Entrega.json", "cimentación"],
      missing: ["instalaciones", "textura-piso"],
    },
    bridge,
  );
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].fileName, "entrega.zip");
  assert.equal(downloads[0].mimeType, CAD_ZIP_MIME_TYPE);
  assert.equal(downloads[0].bytes, bytes, "los bytes descargados son EXACTAMENTE los que trajo la petición");
  assert.ok(line?.includes("2 activo(s) incluido(s)"), line ?? "");
  assert.ok(line?.includes("SIN incluir: instalaciones, textura-piso"), line ?? "");
}

// --- sin ausencias, el renglón no inventa una línea vacía -------------------
{
  const before = downloads.length;
  const line = handleCadEtransmitHostRequest(
    { kind: "etransmit", fileName: "todo.zip", bytes: new Uint8Array(4), included: ["A"], missing: [] },
    bridge,
  );
  assert.equal(downloads.length, before + 1);
  assert.ok(!line?.includes("SIN incluir"), line ?? "");
}

// --- no contesta a lo que no es suyo ---------------------------------------
{
  const before = downloads.length;
  const foreign: CadHostRequest = { kind: "space", space: "paper", layoutId: "A-101" };
  assert.equal(handleCadEtransmitHostRequest(foreign, bridge), null);
  assert.equal(downloads.length, before, "y no descarga nada");
}

console.log("etransmit-host: entrega los bytes exactos, cuenta lo que falta y deja pasar lo ajeno");
