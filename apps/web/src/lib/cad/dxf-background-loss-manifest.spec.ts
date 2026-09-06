import assert from "node:assert/strict";
import { cadDxfBackgroundLossManifest } from "./dxf-background-loss-manifest";

// T-11(c): la conversión no inventa severidad ni pierde la capa/tipo de origen.
{
  const manifest = cadDxfBackgroundLossManifest([
    { code: "dxf_unsupported_entity", message: "SOLID3D sin traducción.", entityType: "SOLID3D" },
    { code: "dxf_layer_frozen", message: "Capa congelada omitida.", layer: "OCULTA" },
    { code: "dxf_parse_error", message: "Bloque sin BLOCK_RECORD." },
  ]);

  assert.equal(manifest.length, 3);
  assert.equal(manifest[0].severity, "warning");
  assert.equal(manifest[0].sourceType, "SOLID3D");
  assert.equal(manifest[0].detail, "SOLID3D sin traducción.");

  assert.equal(manifest[1].detail, 'Capa congelada omitida. (capa "OCULTA").');
  assert.equal(manifest[1].sourceType, undefined);

  assert.equal(manifest[2].detail, "Bloque sin BLOCK_RECORD.");
}

// Sin advertencias, manifiesto vacío — nunca `undefined` ni un array con huecos.
{
  assert.deepEqual(cadDxfBackgroundLossManifest([]), []);
}

console.log(
  "dxf-background-loss-manifest: CadDxfImportWarning[] se convierte a CadLossManifestEntry[] " +
    "con severidad warning, sin inventar sourceType y sin perder la capa",
);
