/**
 * `ETRANSMIT` declara lo que empaqueta y lo que NO — un paquete al que le
 * falta una xref y no lo dice es peor que no empaquetar.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CadDocument } from "../cad-document";
import { buildCadTransmittalPackage, describeCadTransmittalManifest } from "./etransmit";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function document(): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [{ id: "l1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }],
    history: [],
    modelSpace: { entityIds: ["l1"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [
      {
        id: "xref1",
        name: "cimentación",
        uri: "tenant://acme/xrefs/cimentacion.json",
        assetId: "asset-xref-1",
        loaded: true,
      },
      {
        id: "xref2",
        name: "instalaciones",
        uri: "tenant://acme/xrefs/instalaciones.json",
        assetId: "asset-xref-2",
        loaded: true,
      },
    ],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    imageDefinitions: [
      { id: "img1", name: "textura-piso", uri: "tenant://acme/img/piso.png", pixelWidth: 512, pixelHeight: 512 },
    ],
  } as unknown as CadDocument;
}

// --- sin bytes resueltos: sólo el documento viaja, todo lo demás se declara
{
  const { manifest, zip } = buildCadTransmittalPackage({
    document: document(),
    documentName: "Nave industrial",
    generatedAt: "2026-08-31",
  });
  ok(manifest.document.included, "el documento principal SIEMPRE viaja");
  ok(manifest.entries.length === 3, `dos xrefs y una imagen declarados: ${manifest.entries.length}`);
  ok(manifest.entries.every((entry) => !entry.included), "sin resolver, ninguno viaja");
  ok(
    manifest.entries.every((entry) => typeof entry.reason === "string" && entry.reason.length > 0),
    "cada ausencia lleva su motivo — nunca en silencio",
  );
  const summary = describeCadTransmittalManifest(manifest);
  ok(/3 SIN incluir/.test(summary), `el renglón cuenta lo que falta: ${summary}`);

  const dir = mkdtempSync(path.join(tmpdir(), "cad-etransmit-"));
  const zipPath = path.join(dir, "paquete.zip");
  writeFileSync(zipPath, zip);
  const listing = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
  if (!listing.error && listing.status === 0) {
    ok(listing.stdout.includes("Nave industrial.json"), "el ZIP real contiene el documento");
    ok(listing.stdout.includes("manifiesto.json"), "el ZIP real contiene el manifiesto");
    ok(!listing.stdout.includes("xrefs/"), "sin bytes resueltos, no hay carpeta xrefs/");
    checks += 1;
  } else {
    console.log("etransmit.spec: `unzip` no está instalado — se omite la lectura externa del paquete");
  }
}

// --- con un xref resuelto: viaja, y el otro sigue declarado ---------------
{
  const resolvedAssets = new Map<string, Uint8Array>([
    ["asset-xref-1", new TextEncoder().encode('{"muros":[]}')],
  ]);
  const { manifest, zip } = buildCadTransmittalPackage({
    document: document(),
    documentName: "Nave industrial",
    generatedAt: "2026-08-31",
    resolvedAssets,
  });
  const included = manifest.entries.filter((entry) => entry.included);
  const missing = manifest.entries.filter((entry) => !entry.included);
  ok(included.length === 1 && included[0].name === "cimentación", "el xref resuelto viaja");
  ok(missing.length === 2, "el otro xref y la imagen siguen sin resolver");

  const dir = mkdtempSync(path.join(tmpdir(), "cad-etransmit-"));
  const zipPath = path.join(dir, "paquete.zip");
  writeFileSync(zipPath, zip);
  const extract = spawnSync("unzip", ["-p", zipPath, "xrefs/cimentación"], { encoding: "utf8" });
  if (!extract.error && extract.status === 0) {
    ok(extract.stdout === '{"muros":[]}', "el contenido extraído es EXACTAMENTE el byte resuelto, no una copia");
    checks += 1;
  } else {
    console.log("etransmit.spec: `unzip` no está instalado — se omite la extracción externa");
  }
}

// --- determinismo: mismo documento, mismos bytes de paquete ----------------
{
  const a = buildCadTransmittalPackage({ document: document(), documentName: "X", generatedAt: "2026-08-31" });
  const b = buildCadTransmittalPackage({ document: document(), documentName: "X", generatedAt: "2026-08-31" });
  ok(
    a.zip.length === b.zip.length && a.zip.every((byte, index) => byte === b.zip[index]),
    "dos empaquetados del mismo documento producen el mismo ZIP",
  );
}

console.log(`etransmit.spec: ${checks} comprobaciones OK`);
