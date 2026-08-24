/**
 * Cubre el bucketing de instancing de asset-instancing.ts a través de
 * `buildAssetGroup()` — la fachada real que usa Layout3DEditor.tsx —, sin
 * WebGL: sólo grafo de objetos THREE y matrices, que corre en Node liso.
 *
 * La aserción central es la que pide la tarea: el número de `InstancedMesh`
 * (proxy de draw calls) escala con las CLAVES de instancing distintas, no con
 * el número de activos. Se prueba construyendo el mismo conjunto de mesas a
 * 3, 30 y 300 unidades y comprobando que el conteo de mallas compartidas NO
 * se mueve mientras el conteo de instancias sí.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildAssetGroup, disposeObject, type Asset } from "./scene-objects";
import { resetAssetInstancePool } from "./asset-instancing";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function workbench(id: string, index: number): Asset {
  return {
    id,
    kind: "workbench",
    x: (index % 40) * 1500,
    y: Math.floor(index / 40) * 1500,
    w: 1200,
    h: 800,
    rotation: (index % 4) * 90,
  };
}

/** Todas las `InstancedMesh` colgadas bajo `root`, en cualquier profundidad. */
function collectInstancedMeshes(root: THREE.Object3D): THREE.InstancedMesh[] {
  const found: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) found.push(o as THREE.InstancedMesh);
  });
  return found;
}

/** Mallas NO instanciadas con geometría real (hitboxes incluidas). */
function collectPlainMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o as THREE.InstancedMesh).isInstancedMesh) found.push(o);
  });
  return found;
}

/**
 * Simula una pasada de `rebuildAssets()`: demuele el grupo anterior (si lo
 * hay, disparando `resetAssetInstancePool()` vía `disposeObject`) y
 * reconstruye `count` mesas desde cero. Reusar el mismo `THREE.Group` entre
 * llamadas reproduce el patrón real — el pool es un singleton de módulo que
 * vive ENTRE llamadas de `buildAssetGroup` dentro de una pasada y se resetea
 * en la demolición, no en cada build.
 */
function buildScene(count: number, previous?: THREE.Group): { assetsGroup: THREE.Group; s: number } {
  const s = 0.001; // mm de documento -> metros de escena, igual que el editor
  const W = 60_000,
    H = 60_000;
  const assetsGroup = previous ?? new THREE.Group();
  while (assetsGroup.children.length) {
    const child = assetsGroup.children[assetsGroup.children.length - 1];
    assetsGroup.remove(child);
    disposeObject(child);
  }
  for (let i = 0; i < count; i++) {
    const a = workbench(`bench-${i}`, i);
    const g = buildAssetGroup(a, s, W, H, false, false);
    assetsGroup.add(g);
  }
  return { assetsGroup, s };
}

// ---- El conteo de InstancedMesh (draw calls) NO escala con el número de activos ----
{
  const shared = new THREE.Group();
  const keys3 = collectInstancedMeshes(buildScene(3, shared).assetsGroup).length;
  const keys30 = collectInstancedMeshes(buildScene(30, shared).assetsGroup).length;
  const keys300 = collectInstancedMeshes(buildScene(300, shared).assetsGroup).length;
  ok(keys3 > 0, "3 mesas ya deberían compartir al menos un InstancedMesh");
  ok(
    keys3 === keys30 && keys30 === keys300,
    `el conteo de InstancedMesh debe ser constante frente al número de activos: 3→${keys3} 30→${keys30} 300→${keys300}`,
  );
  // "table" hornea el tablero (1 clave) + 4 patas en posiciones fijas
  // (índice-de-parte distinto por esquina, tal como pide la clave): 5 claves.
  ok(keys3 === 5, `una mesa reparte en 5 claves (tablero + 4 patas por esquina), no ${keys3}`);
}

// ---- Las instancias SÍ crecen 1:1 con los activos, dentro de cada clave ----
{
  resetAssetInstancePool();
  const { assetsGroup } = buildScene(50);
  const meshes = collectInstancedMeshes(assetsGroup);
  const totalInstances = meshes.reduce((sum, m) => sum + m.count, 0);
  // 1 tablero + 4 patas por mesa = 5 partes instanciadas por activo.
  ok(
    totalInstances === 50 * 5,
    `50 mesas deberían sumar 250 instancias entre las 2 claves, no ${totalInstances}`,
  );
}

// ---- La hitbox de selección se queda SIN instanciar, una por activo ----
{
  resetAssetInstancePool();
  const { assetsGroup } = buildScene(12);
  const plainMeshes = collectPlainMeshes(assetsGroup);
  const hitboxes = plainMeshes.filter((m) => typeof m.userData.assetId === "string");
  ok(hitboxes.length === 12, `debe haber una hitbox por activo, no ${hitboxes.length}`);
}

// ---- Cada instancia lleva su posición absoluta propia, no la del "anfitrión" ----
{
  resetAssetInstancePool();
  const s = 0.001;
  const W = 60_000,
    H = 60_000;
  const assetsGroup = new THREE.Group();
  const a1 = workbench("a1", 0);
  const a2: Asset = { ...workbench("a2", 1), x: 30_000, y: 30_000, rotation: 0 };
  const g1 = buildAssetGroup(a1, s, W, H, false, false);
  const g2 = buildAssetGroup(a2, s, W, H, false, false);
  assetsGroup.add(g1);
  assetsGroup.add(g2);
  const [topMesh] = collectInstancedMeshes(assetsGroup);
  ok(!!topMesh, "debe existir al menos un InstancedMesh compartido");
  const m0 = new THREE.Matrix4();
  const m1 = new THREE.Matrix4();
  topMesh.getMatrixAt(0, m0);
  topMesh.getMatrixAt(1, m1);
  const p0 = new THREE.Vector3().setFromMatrixPosition(m0);
  const p1 = new THREE.Vector3().setFromMatrixPosition(m1);
  ok(
    Math.abs(p0.x - p1.x) > 1 || Math.abs(p0.z - p1.z) > 1,
    `las dos instancias no pueden compartir posición absoluta: ${JSON.stringify(p0)} vs ${JSON.stringify(p1)}`,
  );
  // Arrastrar en vivo el "anfitrión" (repositionItem muta group.position sin
  // rebuild) NO debe mover las instancias horneadas de la otra mesa.
  g1.position.x += 500;
  const afterDrag = new THREE.Matrix4();
  topMesh.getMatrixAt(1, afterDrag);
  const p1After = new THREE.Vector3().setFromMatrixPosition(afterDrag);
  ok(
    Math.abs(p1.x - p1After.x) < 1e-6,
    "arrastrar el activo anfitrión no debe desplazar instancias de otros activos",
  );
}

// ---- Reset de pasada: una segunda pasada de rebuild no acumula instancias viejas ----
{
  resetAssetInstancePool();
  const { assetsGroup } = buildScene(20);
  const before = collectInstancedMeshes(assetsGroup).reduce((sum, m) => sum + m.count, 0);
  ok(before === 20 * 5, "línea base de 100 instancias antes de reciclar");
  while (assetsGroup.children.length) {
    const child = assetsGroup.children[assetsGroup.children.length - 1];
    assetsGroup.remove(child);
    disposeObject(child);
  }
  for (let i = 0; i < 7; i++) {
    const g = buildAssetGroup(workbench(`bench2-${i}`, i), 0.001, 60_000, 60_000, false, false);
    assetsGroup.add(g);
  }
  const after = collectInstancedMeshes(assetsGroup).reduce((sum, m) => sum + m.count, 0);
  ok(
    after === 7 * 5,
    `tras demoler y reconstruir, sólo deben quedar las instancias de la pasada nueva (35), no ${after}`,
  );
}

// ---- Dimensiones que caen fuera del paso de cuantización abren una clave nueva ----
{
  resetAssetInstancePool();
  const s = 0.001;
  const W = 60_000,
    H = 60_000;
  const assetsGroup = new THREE.Group();
  const small = workbench("small", 0);
  const big: Asset = { ...workbench("big", 1), w: 2400, h: 1600 }; // el doble, no un redondeo de 5cm
  assetsGroup.add(buildAssetGroup(small, s, W, H, false, false));
  assetsGroup.add(buildAssetGroup(big, s, W, H, false, false));
  ok(
    collectInstancedMeshes(assetsGroup).length === 10,
    "dos tamaños claramente distintos deben abrir sus propias 5+5 claves, no fundirse",
  );
}

console.log(`asset-instancing.spec: ${checks} aserciones ok`);
