/**
 * Pool de `THREE.InstancedMesh` para las partes de los arquetipos de activos.
 *
 * `buildCadAssetArchetype()` (asset-archetypes.ts) sigue devolviendo mallas
 * THREE normales, ya posicionadas — esa fábrica no sabe nada de otros activos
 * ni de instancing, y sigue sin saberlo. Este módulo es un paso posterior que
 * `buildAssetGroup()` (scene-objects.ts) aplica malla por malla: si la parte es
 * una caja/cilindro/esfera con `MeshStandardMaterial` (el patrón de TODOS los
 * arquetipos actuales), la desvía a un `InstancedMesh` compartido en vez de
 * añadirla como hijo propio. La CLAVE de ese reparto agrupa por arquetipo,
 * índice de parte, forma del footprint, dimensiones cuantizadas a 5cm y
 * material — así que dos mesas del mismo tamaño/color comparten un único
 * draw call para su tablero y otro para sus patas, sin que ningún arquetipo
 * nuevo (sofá, cama, escalera...) tenga que enterarse de este módulo: basta
 * con que siga construyendo sus partes con `cadAssetPart()` como las demás.
 *
 * Las piezas que NO seguían ese patrón (el arco de la puerta, el relleno
 * translúcido de zona/andador) no se tocan: siguen siendo un objeto propio
 * por activo, exactamente como antes.
 */
import * as THREE from "three";
import type { AssetArchetype } from "./asset-catalog";

const DIM_STEP = 0.05; // 5 cm en unidades de escena (metros)
const INITIAL_CAPACITY = 8;

function quantize(value: number, step = DIM_STEP): number {
  return Math.round(value / step) * step;
}

type PoolableKind = "box" | "cylinder" | "sphere";

function poolableKind(geometry: THREE.BufferGeometry): PoolableKind | null {
  if (geometry instanceof THREE.BoxGeometry) return "box";
  if (geometry instanceof THREE.CylinderGeometry) return "cylinder";
  if (geometry instanceof THREE.SphereGeometry) return "sphere";
  return null;
}

/** Token de las dimensiones que definen la geometría, con lo continuo cuantizado. */
function geometryDimsToken(kind: PoolableKind, geometry: THREE.BufferGeometry): string {
  switch (kind) {
    case "box": {
      const p = (geometry as THREE.BoxGeometry).parameters;
      return [
        quantize(p.width),
        quantize(p.height),
        quantize(p.depth),
        p.widthSegments,
        p.heightSegments,
        p.depthSegments,
      ].join(":");
    }
    case "cylinder": {
      const p = (geometry as THREE.CylinderGeometry).parameters;
      return [
        quantize(p.radiusTop),
        quantize(p.radiusBottom),
        quantize(p.height),
        p.radialSegments,
        p.heightSegments,
        p.openEnded,
      ].join(":");
    }
    case "sphere": {
      const p = (geometry as THREE.SphereGeometry).parameters;
      return [quantize(p.radius), p.widthSegments, p.heightSegments].join(":");
    }
  }
}

/** Token del material: sin mapas de textura en `cadAssetMaterial`, color+rough+metal+emissive lo describen entero. */
function materialToken(material: THREE.MeshStandardMaterial): string {
  return [
    material.color.getHexString(),
    Math.round(material.roughness * 100),
    Math.round(material.metalness * 100),
    material.emissive.getHexString(),
  ].join(":");
}

interface PoolEntry {
  mesh: THREE.InstancedMesh;
  count: number;
  capacity: number;
  /** `owners[i]` es el id del activo dueño de la instancia activa `i` (< count). */
  owners: string[];
}

let pool = new Map<string, PoolEntry>();

/**
 * `rebuildAssets()` (Layout3DEditor.tsx) ya NO tira `assetsGroup` entero en
 * cada pasada — reconcilia por diff (`asset-scene-diff.ts`) y llama a
 * `releaseAssetInstances()` para lo que cambia o se borra. Este reset sigue
 * existiendo para la pasada de carga completa (documento nuevo) y para que los
 * specs que reusan un mismo `THREE.Group` entre llamadas (ver
 * `asset-instancing.spec.ts`) puedan reproducir una demolición total sin
 * arrastrar instancias de la corrida anterior.
 */
export function resetAssetInstancePool(): void {
  pool = new Map();
}

/**
 * Libera todas las instancias de `ownerId` en TODAS las claves del pool, con
 * swap-remove: la última instancia activa de la clave ocupa el hueco que deja
 * la que se libera, así el `InstancedMesh` nunca tiene huecos entre `0` y
 * `count`. Es lo que permite que actualizar o borrar UN activo no obligue a
 * reconstruir el pool entero — la contraparte de `poolAssetPart` que
 * `rebuildAssets()` necesita para reconciliar en vez de demoler.
 */
export function releaseAssetInstances(ownerId: string): void {
  for (const entry of pool.values()) {
    let index = entry.owners.indexOf(ownerId);
    while (index !== -1) {
      const last = entry.count - 1;
      if (index !== last) {
        const matrix = new THREE.Matrix4();
        entry.mesh.getMatrixAt(last, matrix);
        entry.mesh.setMatrixAt(index, matrix);
        if (entry.mesh.instanceColor) {
          const color = new THREE.Color();
          entry.mesh.getColorAt(last, color);
          entry.mesh.setColorAt(index, color);
        }
        entry.owners[index] = entry.owners[last];
      }
      entry.count = last;
      entry.owners.length = entry.count;
      entry.mesh.count = entry.count;
      entry.mesh.instanceMatrix.needsUpdate = true;
      if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true;
      index = entry.owners.indexOf(ownerId);
    }
  }
}

/**
 * Sin `housing` propio (llamador que no reconcilia — specs, o el `group` del
 * propio activo por defecto en `buildAssetGroup`) el `InstancedMesh` se cuelga
 * de un `THREE.Group` que SIGUE moviéndose en vivo durante el arrastre
 * (`repositionItem()` muta `.position` sin rebuild). Si el `InstancedMesh`
 * heredara esa transformación, arrastrar CUALQUIER activo que resultara ser el
 * "anfitrión" de una clave desplazaría a todas las demás instancias de esa
 * clave con él. `matrixWorldAutoUpdate = false` saca al mesh de esa herencia:
 * su `matrixWorld` se queda en la identidad para siempre, y cada instancia ya
 * lleva su posición absoluta en su propia matriz (ver `poolAssetPart`).
 */
function anchorToWorldSpace(mesh: THREE.InstancedMesh): void {
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  // El bounding volume por defecto sólo cubriría UNA instancia; sin recalcularlo
  // por instancia en cada pasada es más simple no depender del frustum culling.
  mesh.frustumCulled = false;
  // La selección sigue resolviendo contra la hitbox sin instanciar de cada
  // activo (barata, cubre todo el volumen). Raycastear también este mesh
  // compartido resolvería siempre al activo "anfitrión", no al que se tocó.
  mesh.raycast = () => {};
}

function growPoolEntry(key: string, entry: PoolEntry): PoolEntry {
  const housing = entry.mesh.parent as THREE.Object3D;
  const capacity = entry.capacity * 2;
  const mesh = new THREE.InstancedMesh(entry.mesh.geometry, entry.mesh.material, capacity);
  mesh.instanceMatrix.array.set(entry.mesh.instanceMatrix.array);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
  if (entry.mesh.instanceColor) mesh.instanceColor.array.set(entry.mesh.instanceColor.array);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.count = entry.count;
  mesh.userData.assetInstancePool = true;
  anchorToWorldSpace(mesh);
  // La geometría/material vienen del entry viejo y siguen en uso por el
  // nuevo mesh: no se disponen aquí, sólo se descarta el InstancedMesh que
  // los envolvía (nunca llegó a renderizarse — la pasada entera es síncrona).
  housing.remove(entry.mesh);
  housing.add(mesh);
  const grown: PoolEntry = { mesh, count: entry.count, capacity, owners: entry.owners.slice() };
  pool.set(key, grown);
  return grown;
}

function acquireInstance(
  housing: THREE.Object3D,
  ownerId: string,
  key: string,
  geometry: THREE.BufferGeometry,
  makeMaterial: () => THREE.Material,
): { mesh: THREE.InstancedMesh; index: number } {
  let entry = pool.get(key);
  if (!entry) {
    const mesh = new THREE.InstancedMesh(geometry, makeMaterial(), INITIAL_CAPACITY);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(INITIAL_CAPACITY * 3).fill(1),
      3,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.userData.assetInstancePool = true;
    anchorToWorldSpace(mesh);
    housing.add(mesh);
    entry = { mesh, count: 0, capacity: INITIAL_CAPACITY, owners: [] };
    pool.set(key, entry);
  }
  if (entry.count >= entry.capacity) entry = growPoolEntry(key, entry);
  const index = entry.count;
  entry.count += 1;
  entry.owners.push(ownerId);
  entry.mesh.count = entry.count;
  return { mesh: entry.mesh, index };
}

/**
 * Intenta desviar `part` (una malla ya devuelta por `buildCadAssetArchetype`,
 * ya posicionada en coordenadas LOCALES al activo) hacia el pool compartido.
 * Devuelve `true` si lo consiguió — el llamador NO debe añadir `part` como
 * hijo propio, ya quedó representada por una instancia — o `false` si la
 * parte no encaja en el patrón instanciable (geometría/material fuera de las
 * tres formas soportadas), y el llamador debe tratarla como hasta ahora.
 *
 * `worldTransform` es la transformación absoluta del activo (posición +
 * rotación) — se compone con la matriz local de `part` para hornear, de una
 * vez, la matriz de instancia absoluta que compensa el `matrixWorld` fijo en
 * identidad del `InstancedMesh` (ver `anchorToWorldSpace`).
 *
 * `ownerId` es el id del activo: `releaseAssetInstances(ownerId)` es la única
 * forma de liberar esta instancia después, así que sin un id que la ligue a su
 * activo una actualización o un borrado no tendría qué liberar.
 */
export function poolAssetPart(
  housing: THREE.Object3D,
  ownerId: string,
  archetype: AssetArchetype,
  partIndex: number,
  shape: "rect" | "circle",
  part: THREE.Object3D,
  worldTransform: THREE.Matrix4,
): boolean {
  if (!(part instanceof THREE.Mesh)) return false;
  const material = part.material;
  if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) return false;
  const kind = poolableKind(part.geometry);
  if (!kind) return false;

  const key = [
    archetype,
    partIndex,
    shape,
    kind,
    geometryDimsToken(kind, part.geometry),
    materialToken(material),
  ].join("|");

  part.updateMatrix();
  const instanceMatrix = worldTransform.clone().multiply(part.matrix);

  // Material neutro y compartido; el color real de esta parte viaja por
  // instancia via `instanceColor`, tal como pide el diseño de instancing.
  // Sólo se clona si la clave es nueva — `acquireInstance` no llama a esta
  // fábrica en un acierto de caché.
  const makeSharedMaterial = () => {
    const shared = material.clone();
    shared.color.set(0xffffff);
    return shared;
  };

  const { mesh, index } = acquireInstance(housing, ownerId, key, part.geometry, makeSharedMaterial);
  mesh.setMatrixAt(index, instanceMatrix);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.setColorAt(index, material.color);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return true;
}
