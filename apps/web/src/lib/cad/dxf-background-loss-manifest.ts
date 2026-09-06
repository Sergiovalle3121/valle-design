/**
 * Manifiesto de pérdidas del DXF DE FONDO (el plano de sólo lectura para
 * calcar, subido con `PUT layout/dxf`) — T-11(c).
 *
 * Antes de esta ficha, `importDxfPrimitives` calculaba estas advertencias al
 * subir el archivo y el editor las guardaba sólo en estado de React
 * (`dxfWarnings`): se veían una vez y se perdían en cuanto se recargaba el
 * documento, sin que nadie lo avisara. Este módulo las convierte a la misma
 * forma (`CadLossManifestEntry`) que ya usa `lossManifest` para que puedan
 * viajar en el campo opcional `CadDocument.dxfBackgroundLossManifest` y
 * sobrevivir a una recarga.
 *
 * Pura: sin THREE, sin DOM, sin estado.
 */
import type { CadLossManifestEntry } from "./cad-document";
import type { CadDxfImportWarning } from "./dxf-import";

/**
 * `CadDxfImportWarning` no declara severidad — todas se mostraban como
 * advertencia en el panel del editor — así que todas se declaran `"warning"`
 * aquí: subir la severidad inventaría una urgencia que la fuente nunca tuvo.
 */
export function cadDxfBackgroundLossManifest(
  warnings: readonly CadDxfImportWarning[],
): CadLossManifestEntry[] {
  return warnings.map((warning) => ({
    code: warning.code,
    severity: "warning",
    ...(warning.entityType ? { sourceType: warning.entityType } : {}),
    detail: warning.layer
      ? `${warning.message} (capa "${warning.layer}").`
      : warning.message,
  }));
}
