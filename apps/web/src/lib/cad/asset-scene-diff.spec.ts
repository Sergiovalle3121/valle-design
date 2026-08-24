/**
 * `diffAssetScene()`: sólo lo que cambió entra en create/update/remove.
 *
 * La aserción central es la que pide A.2: editar UN activo entre 5.000 no
 * debe marcar los otros 4.999 como "update" — eso es lo que convierte
 * `rebuildAssets()` en O(editado) en vez de O(documento).
 */
import assert from "node:assert/strict";
import { diffAssetScene } from "./asset-scene-diff";
import type { Asset } from "@/components/cad/viewport/scene-objects";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function bench(id: string, index: number): Asset {
  return {
    id,
    kind: "workbench",
    x: index * 1000,
    y: 0,
    w: 1200,
    h: 800,
    rotation: 0,
  };
}

// ---- primera pasada: todo es "create" ----
{
  const next = [bench("a", 0), bench("b", 1), bench("c", 2)];
  const diff = diffAssetScene([], next);
  ok(diff.create.length === 3, "primera pasada: los 3 activos son alta");
  ok(diff.update.length === 0 && diff.remove.length === 0, "primera pasada: nada que actualizar ni borrar");
}

// ---- sin cambios: nada entra en ningún bucket ----
{
  const assets = [bench("a", 0), bench("b", 1)];
  const diff = diffAssetScene(assets, assets.map((a) => ({ ...a })));
  ok(
    diff.create.length === 0 && diff.update.length === 0 && diff.remove.length === 0,
    "mismo valor, referencia nueva: no debe moverse nada",
  );
}

// ---- editar UN activo entre miles no toca a los demás ----
{
  const N = 5_000;
  const previous = Array.from({ length: N }, (_, i) => bench(`bench-${i}`, i));
  const next = previous.map((a) => (a.id === "bench-2500" ? { ...a, x: a.x + 500 } : { ...a }));
  const diff = diffAssetScene(previous, next);
  ok(diff.update.length === 1 && diff.update[0]?.id === "bench-2500", `sólo el editado debe salir en update, no ${diff.update.length}`);
  ok(diff.create.length === 0 && diff.remove.length === 0, "editar uno no crea ni borra ninguno");
}

// ---- alta + baja simultáneas ----
{
  const previous = [bench("a", 0), bench("b", 1), bench("c", 2)];
  const next = [bench("a", 0), bench("d", 3)]; // b y c se borran, d es nuevo
  const diff = diffAssetScene(previous, next);
  ok(diff.create.length === 1 && diff.create[0]?.id === "d", "d es alta");
  ok(
    diff.remove.length === 2 && diff.remove.includes("b") && diff.remove.includes("c"),
    "b y c son baja",
  );
  ok(diff.update.length === 0, "a no cambió de valor: no es update");
}

// ---- un campo cualquiera que cambie basta para marcar update ----
{
  const previous = [bench("a", 0)];
  const next = [{ ...previous[0]!, label: "Mesa 1", tags: ["nuevo"] }];
  const diff = diffAssetScene(previous, next);
  ok(diff.update.length === 1, "un cambio de label/tags cuenta como update");
}

console.log(`asset-scene-diff.spec: ${checks} aserciones ok`);
