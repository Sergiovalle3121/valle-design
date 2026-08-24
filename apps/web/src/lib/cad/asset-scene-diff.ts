/**
 * Diff PURO de `Asset[]` (editor.legacy, `apps/web/.../viewport/scene-objects.ts`)
 * contra el snapshot anterior, con el mismo contrato create/update/remove que
 * `CadSceneSynchronizer.sync()` ya usa para las entidades nativas
 * (`lib/cad/entity-runtime.ts`): ese sincronizador diferencia por valor
 * (`JSON.stringify(entity)`) porque undo/redo restaura desde snapshots de
 * historia con identidad de referencia NUEVA en cada paso aunque el valor no
 * cambie — comparar por referencia trataría cada undo como "todo cambió". Los
 * activos vienen del mismo tipo de historial (`assetsRef.current = new
 * Map(s.assets.map((a) => [a.id, { ...a }]))`), así que heredan la misma razón.
 *
 * Sin THREE, sin React: sólo Map/array. `rebuildAssets()` en Layout3DEditor.tsx
 * (o el host de escena que lo reemplaza) es quien convierte esto en
 * creación/disposición de grupos THREE.
 */
import type { Asset } from "@/components/cad/viewport/scene-objects";

export interface CadAssetSceneDiff {
  create: Asset[];
  update: Asset[];
  remove: string[];
}

export function diffAssetScene(previous: Asset[], next: Asset[]): CadAssetSceneDiff {
  const previousById = new Map(previous.map((asset) => [asset.id, asset]));
  const nextIds = new Set<string>();
  const create: Asset[] = [];
  const update: Asset[] = [];
  for (const asset of next) {
    nextIds.add(asset.id);
    const before = previousById.get(asset.id);
    if (!before) create.push(asset);
    else if (JSON.stringify(before) !== JSON.stringify(asset)) update.push(asset);
  }
  const remove = previous
    .filter((asset) => !nextIds.has(asset.id))
    .map((asset) => asset.id);
  return { create, update, remove };
}
