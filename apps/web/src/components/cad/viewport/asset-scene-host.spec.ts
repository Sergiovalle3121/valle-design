/**
 * `CadAssetSceneHost.sync()`: sólo el activo editado se demuele y reconstruye.
 *
 * `rebuildAssets()` en Layout3DEditor.tsx llamaba esto ~49 veces por sesión de
 * edición, siempre demoliendo y reconstruyendo TODO el grupo de activos. La
 * aserción que importa aquí no es de valores sino de IDENTIDAD: el `THREE.Group`
 * de un activo que no cambió debe seguir siendo el MISMO objeto tras `sync()`
 * (misma referencia) — si `sync()` lo reconstruyera igual pero con un objeto
 * nuevo, el coste que A.2 existe para eliminar seguiría ahí, sólo que invisible
 * a un test que sólo mirara los valores finales.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { CadAssetSceneHost, type CadAssetSceneContext } from "./asset-scene-host";
import { resetAssetInstancePool } from "./asset-instancing";
import type { Asset } from "./scene-objects";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function bench(id: string, index: number, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: "workbench",
    x: (index % 40) * 1500,
    y: Math.floor(index / 40) * 1500,
    w: 1200,
    h: 800,
    rotation: (index % 4) * 90,
    ...overrides,
  };
}

const ctx: CadAssetSceneContext = { s: 0.001, W: 60_000, H: 60_000 };
const noSelection = new Set<string>();
const noAlert = new Set<string>();

// ---- editar UN activo entre 2.000 no toca los grupos de los demás ----
{
  resetAssetInstancePool();
  const group = new THREE.Group();
  const built = new Map<string, THREE.Group>();
  const host = new CadAssetSceneHost(group, built);

  const N = 2_000;
  const first = Array.from({ length: N }, (_, i) => bench(`bench-${i}`, i));
  host.sync(first, ctx, noSelection, noAlert);
  ok(built.size === N, `primera pasada debe construir ${N} grupos, construyó ${built.size}`);
  const before = new Map(built);

  const edited = first.map((a) => (a.id === "bench-1000" ? { ...a, x: a.x + 500 } : a));
  const stats = host.sync(edited, ctx, noSelection, noAlert);
  ok(stats.updated === 1 && stats.created === 0 && stats.removed === 0, `sólo 1 update, no ${JSON.stringify(stats)}`);

  let untouched = 0;
  let rebuilt = 0;
  for (const [id, g] of built) {
    if (id === "bench-1000") {
      if (g !== before.get(id)) rebuilt += 1;
    } else if (g === before.get(id)) untouched += 1;
  }
  ok(untouched === N - 1, `${N - 1} grupos deben conservar su referencia THREE, ${untouched} la conservaron`);
  ok(rebuilt === 1, "el activo editado sí debe cambiar de referencia (grupo reconstruido)");
}

// ---- alta y baja: sólo esos ids tocan el grupo ----
{
  resetAssetInstancePool();
  const group = new THREE.Group();
  const built = new Map<string, THREE.Group>();
  const host = new CadAssetSceneHost(group, built);
  const first = [bench("a", 0), bench("b", 1), bench("c", 2)];
  host.sync(first, ctx, noSelection, noAlert);
  const before = new Map(built);

  const next = [bench("a", 0), bench("d", 3)]; // b, c se borran; d es nueva
  const stats = host.sync(next, ctx, noSelection, noAlert);
  ok(stats.created === 1 && stats.removed === 2 && stats.updated === 0, `alta+baja: ${JSON.stringify(stats)}`);
  ok(built.get("a") === before.get("a"), "a no se tocó");
  ok(!built.has("b") && !built.has("c"), "b y c se liberaron del mapa");
  ok(built.has("d"), "d entró al mapa");
}

// ---- un cambio de SELECCIÓN sin cambio de dato también reconstruye sólo ese id ----
{
  resetAssetInstancePool();
  const group = new THREE.Group();
  const built = new Map<string, THREE.Group>();
  const host = new CadAssetSceneHost(group, built);
  const assets = [bench("a", 0), bench("b", 1)];
  host.sync(assets, ctx, noSelection, noAlert);
  const before = new Map(built);

  const stats = host.sync(assets, ctx, new Set(["a"]), noAlert);
  ok(stats.updated === 1, `seleccionar "a" sin cambiar su dato debe contar como 1 update, no ${stats.updated}`);
  ok(built.get("a") !== before.get("a"), "el activo recién seleccionado sí se reconstruye (para pintar el contorno)");
  ok(built.get("b") === before.get("b"), "el activo no tocado conserva su referencia");
}

// ---- el pool de instancing se libera cuando su activo se borra, no acumula fantasmas ----
{
  resetAssetInstancePool();
  const group = new THREE.Group();
  const built = new Map<string, THREE.Group>();
  const host = new CadAssetSceneHost(group, built);
  const assets = Array.from({ length: 10 }, (_, i) => bench(`bench-${i}`, i));
  host.sync(assets, ctx, noSelection, noAlert);

  const countInstances = () => {
    let total = 0;
    group.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) total += (o as THREE.InstancedMesh).count;
    });
    return total;
  };
  const full = countInstances();
  ok(full > 0, "10 mesas deben dejar instancias en el pool");

  host.sync(assets.slice(1), ctx, noSelection, noAlert); // borra bench-0
  const afterRemove = countInstances();
  ok(
    afterRemove === Math.round((full * 9) / 10),
    `borrar 1 de 10 mesas idénticas debe liberar 1/10 de las instancias: ${full} → ${afterRemove}`,
  );
}

console.log(`asset-scene-host.spec: ${checks} aserciones ok`);
