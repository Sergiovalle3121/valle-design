/**
 * Anfitrión del grupo de activos (`Asset[]`, editor heredado): reconcilia en
 * vez de demoler.
 *
 * `rebuildAssets()` en Layout3DEditor.tsx vaciaba `assetsGroup` entero y
 * reconstruía TODOS los grupos de activo en cada llamada — ~49 puntos de
 * llamada, casi cada edición discreta (alta, baja, pegar, undo, redo, cambio
 * de propiedad, carga de documento). Este anfitrión aplica el mismo contrato
 * create/update/remove que `CadSceneSynchronizer` (`lib/cad/entity-runtime.ts`)
 * ya usa para las entidades nativas, con el diff puro de
 * `lib/cad/asset-scene-diff.ts` decidiendo QUÉ id cambió y este módulo
 * decidiendo cómo tocar THREE.
 *
 * ## Por qué la selección y el realce de validación no viven en el diff puro
 *
 * `diffAssetScene()` sólo ve `Asset[]` — no sabe qué está seleccionado ni qué
 * está en alerta de validación, exactamente igual que `CadSceneSynchronizer`
 * no sabe de selección nativa (eso lo resuelve aparte
 * `refreshNativeSelectionVisuals`). Aquí se guarda el último `selectedIds`/
 * `alertIds` aplicado y se compara activo por activo: un cambio de selección
 * sin cambio de dato entra al mismo camino de "update" que un cambio de
 * propiedad, sin que el diff puro tenga que saber de selección.
 *
 * ## Por qué el pool de instancing necesita un ancla propia
 *
 * `poolAssetPart()` (asset-instancing.ts) cuelga el `InstancedMesh` compartido
 * del PRIMER activo que pide su clave. Con demolición total eso no importaba
 * — todo se reconstruía junto. Reconciliar por id sí lo vuelve un problema: si
 * ESE activo se actualiza o se borra, su grupo desaparece y con él el
 * `InstancedMesh` que otros activos seguían usando. `instancingHousing` es un
 * `THREE.Group` que este anfitrión crea una vez y nunca borra por un cambio de
 * activo individual — sólo `dispose()` (cierre de documento) lo tira.
 */
import * as THREE from "three";
import { diffAssetScene } from "@/lib/cad/asset-scene-diff";
import { buildAssetGroup, disposeObject, type Asset } from "./scene-objects";
import { releaseAssetInstances } from "./asset-instancing";

export interface CadAssetSceneContext {
  s: number;
  W: number;
  H: number;
}

export class CadAssetSceneHost {
  private readonly instancingHousing = new THREE.Group();
  private previousAssets: Asset[] = [];
  private previousSelected = new Set<string>();
  private previousAlert = new Set<string>();

  constructor(private readonly group: THREE.Group, private readonly built: Map<string, THREE.Group>) {
    this.instancingHousing.name = "cad-assets-instancing-housing";
    // `applyLayers()` (Layout3DEditor.tsx) recorre los hijos DIRECTOS de
    // `assetsGroup` buscando `userData.assetId` para decidir visibilidad por
    // capa; esta bandera es cómo reconoce a este hijo, que no tiene uno — sin
    // ella se quedaría siempre visible pase lo que pase con la capa
    // "Equipment", pooled o no.
    this.instancingHousing.userData.assetInstancingHousing = true;
    this.group.add(this.instancingHousing);
  }

  /** Reconcilia contra el snapshot anterior; devuelve cuántos grupos tocó. */
  sync(
    assets: Asset[],
    ctx: CadAssetSceneContext,
    selectedIds: ReadonlySet<string>,
    alertIds: ReadonlySet<string>,
  ): { created: number; updated: number; removed: number } {
    const diff = diffAssetScene(this.previousAssets, assets);
    const touched = new Set(diff.update.map((asset) => asset.id));
    // `assets` (el snapshot NUEVO) nunca contiene un id de `diff.remove` — por
    // construcción de `diffAssetScene` — así que no hace falta excluirlos aquí.
    for (const asset of assets) {
      if (touched.has(asset.id)) continue;
      const wasSelected = this.previousSelected.has(asset.id);
      const wasAlert = this.previousAlert.has(asset.id);
      if (wasSelected !== selectedIds.has(asset.id) || wasAlert !== alertIds.has(asset.id))
        touched.add(asset.id);
    }

    for (const id of diff.remove) this.remove(id);
    for (const id of touched) this.remove(id);

    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    let created = 0;
    for (const asset of diff.create) {
      this.add(asset, ctx, selectedIds, alertIds);
      created += 1;
    }
    let updated = 0;
    for (const id of touched) {
      const asset = byId.get(id);
      if (!asset) continue; // ya cubierto por diff.remove
      this.add(asset, ctx, selectedIds, alertIds);
      updated += 1;
    }

    this.previousAssets = assets;
    this.previousSelected = new Set(selectedIds);
    this.previousAlert = new Set(alertIds);
    return { created, updated, removed: diff.remove.length };
  }

  private add(
    asset: Asset,
    ctx: CadAssetSceneContext,
    selectedIds: ReadonlySet<string>,
    alertIds: ReadonlySet<string>,
  ): void {
    const built = buildAssetGroup(
      asset,
      ctx.s,
      ctx.W,
      ctx.H,
      selectedIds.has(asset.id),
      alertIds.has(asset.id),
      this.instancingHousing,
    );
    this.group.add(built);
    this.built.set(asset.id, built);
  }

  private remove(id: string): void {
    const existing = this.built.get(id);
    if (!existing) return;
    releaseAssetInstances(id);
    this.group.remove(existing);
    disposeObject(existing);
    this.built.delete(id);
  }

  /** Cierre de documento: tira TODO, incluido el ancla del pool compartido. */
  dispose(): void {
    for (const id of [...this.built.keys()]) this.remove(id);
    this.group.remove(this.instancingHousing);
    disposeObject(this.instancingHousing);
    this.previousAssets = [];
    this.previousSelected = new Set();
    this.previousAlert = new Set();
  }
}
