/**
 * El UNIVERSO de la selección profesional — extraído del monolito.
 *
 * Es la lista completa de todo lo designable: puntos colocados y activos del
 * modelo heredado más las entidades nativas del documento canónico. La paleta
 * de selección lo usa para «Todo», «Invertir» y quick-select, y sus listas de
 * tipos y capas salen de él.
 *
 * Vive fuera de `Layout3DEditor.tsx` por dos razones: el presupuesto del
 * monolito (una pasada de ~40 líneas menos ahí) y porque construirlo es una
 * pasada COMPLETA sobre el documento —con lectura de propiedades por entidad—
 * que a 100.000 entidades cuesta lo bastante como para que quien lo llame
 * tenga que memoizarlo por documento, no recalcularlo por render. Tenerlo como
 * función pura de entradas explícitas es lo que hace esa memoización honesta.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import { CAD_ENTITY_REGISTRY } from "@/lib/cad/entity-runtime";
import type { CadSelectableItem } from "@/lib/cad/selection-controller";
import { assetMeta } from "@/components/cad/viewport/asset-catalog";

/** Lo que el universo necesita saber de un punto colocado del modelo legado. */
export interface CadUniverseStation {
  station: string;
  line: string;
  ctq: boolean;
}

/** Lo que el universo necesita saber de un activo del modelo legado. */
export interface CadUniverseAsset {
  kind: string;
  label?: string;
}

export interface CadSelectionUniverseInputs {
  /** Ids de los puntos colocados (el valor de la colocación no participa). */
  placedIds: Iterable<string>;
  stationsById: ReadonlyMap<string, CadUniverseStation>;
  assets: ReadonlyMap<string, CadUniverseAsset>;
  layerAssignments: Readonly<Record<string, string | undefined>>;
  objectTags: Readonly<Record<string, string | undefined>>;
  objectNotes: Readonly<Record<string, string | undefined>>;
  document: CadDocument | null;
  defaultLayerForAsset: (assetId: string) => string;
}

export function buildCadSelectionUniverse(
  inputs: CadSelectionUniverseInputs,
): CadSelectableItem[] {
  const result: CadSelectableItem[] = [];
  for (const id of inputs.placedIds) {
    const station = inputs.stationsById.get(id);
    result.push({
      key: `station:${id}`,
      type: "station",
      layer: inputs.layerAssignments[id] ?? "layout",
      label: station?.station ?? id,
      properties: { line: station?.line ?? "", ctq: station?.ctq ?? false },
    });
  }
  inputs.assets.forEach((asset, id) => {
    result.push({
      key: `asset:${id}`,
      type: "asset",
      layer: inputs.layerAssignments[id] ?? inputs.defaultLayerForAsset(id),
      label: asset.label || assetMeta(asset.kind).label,
      properties: {
        kind: asset.kind,
        tags: inputs.objectTags[id] ?? "",
        notes: inputs.objectNotes[id] ?? "",
      },
    });
  });
  for (const entity of inputs.document?.entities ?? []) {
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    result.push({
      key: `native:${entity.id}`,
      type: entity.type,
      layer: entity.layer,
      label: `${entity.type.toUpperCase()} ${entity.id}`,
      properties: CAD_ENTITY_REGISTRY.adapter(entity).properties.read(entity),
    });
  }
  return result;
}
