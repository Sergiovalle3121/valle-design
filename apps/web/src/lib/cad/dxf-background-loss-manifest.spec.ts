import assert from "node:assert/strict";
import {
  cadDxfBackgroundLossManifest,
  cadDxfWarningsFromBackgroundLossManifest,
  cadWithDxfBackgroundLossManifest,
} from "./dxf-background-loss-manifest";
import type { CadDocument } from "./cad-document";

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

// F4 petición #2: la vuelta reconstruye lo que el panel del editor enseña —
// código, mensaje sin el sufijo de capa, capa y tipo de origen— para que al
// reabrir el documento las advertencias del fondo sigan ahí.
{
  const warnings = [
    { code: "dxf_unsupported_entity", message: "SOLID3D sin traducción.", entityType: "SOLID3D" },
    { code: "dxf_layer_frozen", message: "Capa congelada omitida.", layer: "OCULTA" },
    { code: "dxf_parse_error", message: "Bloque sin BLOCK_RECORD." },
  ];
  assert.deepEqual(
    cadDxfWarningsFromBackgroundLossManifest(cadDxfBackgroundLossManifest(warnings)),
    warnings,
  );
  assert.deepEqual(cadDxfWarningsFromBackgroundLossManifest(undefined), []);
}

// El manifiesto se escribe en el documento como cambio versionado, y se quita
// —no se deja vacío— cuando el fondo se retira o no perdió nada.
{
  const base = {
    meta: { version: 3, schema: 9, unit: "mm" },
    layers: [],
    blocks: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {} },
    entities: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    history: [],
  } as unknown as CadDocument;
  const withManifest = cadWithDxfBackgroundLossManifest(base, [
    { code: "dxf_layer_frozen", message: "Capa congelada omitida.", layer: "OCULTA" },
  ]);
  assert.equal(withManifest.dxfBackgroundLossManifest?.length, 1);
  assert.equal(withManifest.meta.version, base.meta.version + 1);
  assert.equal(withManifest.history.at(-1)?.label, "dxf-fondo:manifiesto");
  const cleared = cadWithDxfBackgroundLossManifest(withManifest, []);
  assert.equal("dxfBackgroundLossManifest" in cleared, false);
  assert.equal(cleared.meta.version, withManifest.meta.version + 1);
}

console.log(
  "dxf-background-loss-manifest: CadDxfImportWarning[] se convierte a CadLossManifestEntry[] " +
    "con severidad warning, sin inventar sourceType y sin perder la capa",
);
