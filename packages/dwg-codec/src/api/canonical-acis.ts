/**
 * Proyección de un objeto ACIS (3DSOLID/REGION/BODY) al documento canónico —
 * extraído de `canonical.ts` por presupuesto de líneas (800), no por
 * fragmentación artificial: es la única rama de `mapEntity` que necesita su
 * propia forma de payload (bit-exacto, no el `JSON.stringify` genérico del
 * `default`), así que aísla limpio en su propia responsabilidad.
 *
 * ACIS es formato de Spatial/Dassault, no de ODA/DWG: este módulo no lo
 * interpreta, sólo lo preserva. El nombre de clase real (ya decodificado
 * por el llamador) se usa como `sourceType` legible, y el payload conserva
 * sólo lo que hace falta para reconstruir el rango de bits exacto — nada
 * de la cabecera común, que el mapeo de `mapEntity` ya cubre aparte.
 */
import type { DwgAcisOpaqueEntity } from "../model/entity-geometry.js";
import type { CanonicalLossEntry, CanonicalOpaqueEntity } from "./canonical.js";

export interface AcisOpaqueProjection {
  readonly loss: CanonicalLossEntry;
  readonly opaque: CanonicalOpaqueEntity;
}

export function projectAcisOpaqueEntity(
  entity: DwgAcisOpaqueEntity,
  id: string,
  layer: string,
  provider: string,
  className: string,
): AcisOpaqueProjection {
  return {
    loss: {
      code: "acis-preserved-opaque",
      entityId: id,
      sourceType: className,
      detail:
        `El objeto ACIS "${className}" se conserva opaco: el laboratorio no interpreta ACIS ` +
        "(formato de Spatial/Dassault), sólo preserva sus bytes intactos.",
      severity: "info",
    },
    opaque: {
      id,
      provider,
      sourceType: className,
      layer,
      raw: JSON.stringify({
        dataBitLength: entity.dataBitLength,
        leadingBitOffset: entity.leadingBitOffset,
        rawBytes: entity.rawBytes,
      }),
      editable: false,
    },
  };
}
