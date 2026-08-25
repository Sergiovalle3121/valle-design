/**
 * El cuerpo LOCAL de una losa horizontal (`room-solid.ts`), llevado a
 * geometría de escena.
 *
 * Más simple que `wall-solid-three.ts`: una losa no gira nunca —piso,
 * cielorraso y cubierta son horizontales por definición—, así que el marco
 * LOCAL de `architecturalSlabBodyLocal` ya usa X/Y de PLANTA directamente.
 * Llevarlo a escena es la misma permutación de ejes que `solid3d-three.ts`
 * aplica a un `SOLID3D` (que tampoco gira), sin el paso intermedio de
 * `wallAxisFrame` que sí hace falta para un muro.
 */
import * as THREE from "three";
import { tessellateBody } from "../brep";
import type { CadPoint2 } from "./cad-document";
import type { CadThreeViewport } from "./entity-three";
import { architecturalSlabBodyLocal } from "./room-solid";

export type CadArchitecturalMassKind = "floor" | "ceiling" | "roof";

const MASS_COLOR: Record<CadArchitecturalMassKind, number> = {
  floor: 0x9ca3af,
  ceiling: 0xe2e8f0,
  roof: 0x78716c,
};

/**
 * Geometría de escena de la losa entre `z0` y `z1` sobre `ring`, o `null` si
 * la entrada es degenerada — el mismo criterio fail-closed que
 * `architecturalSlabBodyLocal`.
 */
export function buildCadArchitecturalSlabGeometry(
  ring: readonly CadPoint2[],
  z0: number,
  z1: number,
  viewport: CadThreeViewport,
): THREE.BufferGeometry | null {
  const body = architecturalSlabBodyLocal(ring, z0, z1);
  if (!body) return null;
  const mesh = tessellateBody(body);
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  const { scale, width, height } = viewport;
  for (let index = 0; index < count; index += 1) {
    const x = mesh.positions[index * 3];
    const y = mesh.positions[index * 3 + 1];
    const z = mesh.positions[index * 3 + 2];
    positions[index * 3] = (x - width / 2) * scale;
    positions[index * 3 + 1] = z * scale;
    positions[index * 3 + 2] = (y - height / 2) * scale;
    // Misma permutación que las posiciones, sin traslación ni escala: son
    // direcciones, no puntos.
    normals[index * 3] = mesh.normals[index * 3];
    normals[index * 3 + 1] = mesh.normals[index * 3 + 2];
    normals[index * 3 + 2] = mesh.normals[index * 3 + 1];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(Array.from(mesh.indices));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Objeto de escena de la losa. A diferencia de `buildCadWallSolidObject`, NO
 * lleva `userData.nativeEntityId`: piso, cielorraso y cubierta son masas
 * DERIVADAS de todo el grafo de muros, no la proyección de una única entidad
 * del documento — no hay todavía ni edición ni propiedades que aplicarles, y
 * marcarlas como si fueran una entidad nativa seleccionable las expondría a
 * comandos (borrar, mover) que no tienen adónde ir. `userData.architecturalMassKind`
 * las identifica para quien SÍ necesita distinguirlas (el anfitrión, las
 * specs), sin tomar prestado el contrato de las entidades nativas reales.
 */
export function buildCadArchitecturalMassObject(
  kind: CadArchitecturalMassKind,
  ring: readonly CadPoint2[],
  z0: number,
  z1: number,
  viewport: CadThreeViewport,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `cad-architectural-mass:${kind}`;
  group.userData.architecturalMassKind = kind;

  let geometry: THREE.BufferGeometry | null;
  try {
    geometry = buildCadArchitecturalSlabGeometry(ring, z0, z1, viewport);
  } catch {
    geometry = null;
  }
  if (!geometry) {
    // Anillo degenerado o booleana irrecuperable: grupo vacío, no un visor
    // roto — el mismo patrón que `buildCadWallSolidObject`.
    group.userData.invalid = true;
    return group;
  }

  const material = new THREE.MeshLambertMaterial({
    color: MASS_COLOR[kind],
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `cad-architectural-mass-faces:${kind}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

/** Libera geometría y material del objeto de la losa. */
export function disposeCadArchitecturalMassObject(
  object: THREE.Object3D,
): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as
      THREE.Material | THREE.Material[] | undefined;
    const materials = Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    // `.map` no lo pone ningún material de losa hoy (color plano) — mismo
    // hueco cerrado por la misma razón en `wall-solid-three.ts`.
    for (const item of materials) {
      (item as THREE.MeshLambertMaterial).map?.dispose?.();
      item.dispose();
    }
  });
  object.removeFromParent();
}
