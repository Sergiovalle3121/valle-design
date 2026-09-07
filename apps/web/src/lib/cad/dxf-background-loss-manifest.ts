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
import { commitChange, type CadDocument, type CadLossManifestEntry } from "./cad-document";
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

const LAYER_SUFFIX = /\s\(capa "([^"]*)"\)\.$/u;

/**
 * El camino de VUELTA (F4 petición #2): al reabrir el documento, el panel del
 * editor sigue hablando en `CadDxfImportWarning`, así que lo persistido se
 * traduce de regreso. La capa se recupera del sufijo que escribió la ida;
 * `sourceType` vuelve a ser `entityType`. `undefined` o vacío ⇒ sin avisos.
 */
export function cadDxfWarningsFromBackgroundLossManifest(
  manifest: readonly CadLossManifestEntry[] | undefined,
): CadDxfImportWarning[] {
  return (manifest ?? []).map((entry) => {
    const layer = LAYER_SUFFIX.exec(entry.detail)?.[1];
    return {
      code: entry.code,
      message: layer ? entry.detail.replace(LAYER_SUFFIX, "") : entry.detail,
      ...(entry.sourceType ? { entityType: entry.sourceType } : {}),
      ...(layer ? { layer } : {}),
    };
  });
}

/**
 * Deja el manifiesto del fondo ESCRITO en el documento —o lo quita, si ya no
 * hay fondo o no hubo pérdidas— con un cambio versionado, para que viaje en el
 * siguiente guardado igual que cualquier otro campo del documento.
 */
export function cadWithDxfBackgroundLossManifest(
  document: CadDocument,
  warnings: readonly CadDxfImportWarning[],
): CadDocument {
  const manifest = cadDxfBackgroundLossManifest(warnings);
  const { dxfBackgroundLossManifest: _previous, ...rest } = document;
  void _previous;
  return commitChange(
    manifest.length > 0 ? { ...rest, dxfBackgroundLossManifest: manifest } : rest,
    manifest.length > 0 ? "dxf-fondo:manifiesto" : "dxf-fondo:sin-manifiesto",
  );
}
