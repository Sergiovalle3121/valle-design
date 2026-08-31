/**
 * Puente entre `THREE.BufferGeometry` (lo que devuelven los cuatro lectores de
 * three) y `RawMeshComponent` (lo que entiende este subsistema). Un sólo sitio
 * para la aritmética de índices, para no repetirla cuatro veces con matices
 * distintos.
 */
import * as THREE from "three";
import type { RawMeshComponent } from "./mesh-import-types";

/**
 * Vuelca una geometría a espacio de mundo con `worldMatrix` YA aplicada — el
 * caso `undefined`/identidad es el de OBJ y STL, que no traen jerarquía de
 * escena; glTF y COLLADA sí, y ahí importa: un componente hijo de un nodo con
 * transformación (posición, rotación, escala del `<node>` o del nodo glTF) que
 * se leyera en coordenadas LOCALES saldría en el sitio equivocado del modelo.
 */
export function bufferGeometryToComponent(
  geometry: THREE.BufferGeometry,
  name: string | undefined,
  worldMatrix?: THREE.Matrix4,
): RawMeshComponent | null {
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return null;
  const matrix = worldMatrix ?? new THREE.Matrix4();
  const points: { x: number; y: number; z: number }[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i).applyMatrix4(matrix);
    points.push({ x: v.x, y: v.y, z: v.z });
  }
  const faces: number[][] = [];
  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
    }
  } else {
    for (let i = 0; i + 2 < position.count; i += 3) {
      faces.push([i, i + 1, i + 2]);
    }
  }
  if (faces.length === 0) return null;
  return { name, points, faces };
}

/**
 * Recorre un `Object3D` y devuelve un componente por cada `Mesh` con geometría
 * de triángulos.
 *
 * Comprueba `isMesh`/`isBufferGeometry` — las banderas booleanas que three pone
 * en cada instancia — en vez de `instanceof THREE.Mesh`/`instanceof
 * THREE.BufferGeometry`. No es una preferencia de estilo: cada lector importa
 * su cargador de three con un `import()` dinámico propio, y bajo Node/`tsx`
 * eso puede resolver un ejemplar de la librería distinto al que importa este
 * archivo (dos módulos, dos clases `BufferGeometry`), con lo que `instanceof`
 * da `false` para una geometría perfectamente válida. Las banderas son datos
 * de instancia, no identidad de clase, y sobreviven a esa duplicación — que en
 * el bundle único del navegador nunca ocurre, pero mejor no depender de que no
 * ocurra.
 */
export function collectMeshComponents(root: THREE.Object3D): RawMeshComponent[] {
  root.updateMatrixWorld(true);
  const components: RawMeshComponent[] = [];
  root.traverse((child) => {
    const mesh = child as unknown as { isMesh?: boolean; name: string; geometry?: { isBufferGeometry?: boolean }; matrixWorld: THREE.Matrix4 };
    if (!mesh.isMesh || !mesh.geometry?.isBufferGeometry) return;
    const component = bufferGeometryToComponent(mesh.geometry as THREE.BufferGeometry, mesh.name || undefined, mesh.matrixWorld);
    if (component) components.push(component);
  });
  return components;
}
