/**
 * De la losa PURA (polígono + Z + grosor) al objeto del visor 3D.
 *
 * Mismo reparto de trabajo que `solid3d-three.ts`: `lib/brep/` sabe extruir y
 * teselar, `roof-floor-generation.ts` calcula QUÉ extruir, y este módulo es el
 * adaptador entre las dos cosas y el mapeo de escena del editor (ver la
 * cabecera de `solid3d-three.ts` para la fórmula completa — se reutiliza tal
 * cual, porque una losa tiene Z real igual que un sólido).
 *
 * La extrusión NO se escribe a mano: `extrudeProfile` + `tessellateBody` ya
 * hacen exactamente esto —perfil 2D antihorario, un cuerpo B-rep cerrado, una
 * malla— para el propio SOLID3D del documento. Una losa es un caso particular
 * (un prisma recto, sin desmoldeo) y no un algoritmo nuevo.
 */
import * as THREE from "three";
import {
  V3_X,
  V3_Z,
  extrudeProfile,
  makeFrame,
  tessellateBody,
  vec3,
  type BrepBody,
} from "../brep";
import type {
  RoofFloorEnvelope,
  RoofFloorRoom,
  RoofFloorSlab,
} from "./roof-floor-generation";
import type { CadThreeViewport } from "./entity-three";

const FLOOR_COLOR = 0xa39b8c;
const CEILING_COLOR = 0xe8e3d8;
const ROOF_COLOR = 0x8a5a3c;

function slabBody(slab: RoofFloorSlab): BrepBody {
  return extrudeProfile({
    profile: { outer: slab.polygon.map((point) => ({ x: point.x, y: point.y })) },
    height: slab.thickness,
    frame: makeFrame(vec3(0, 0, slab.z), V3_Z, V3_X),
  });
}

/**
 * Geometría de la losa en coordenadas de ESCENA.
 *
 * La permutación de ejes (x, ARRIBA=z, y) es la MISMA que `buildCadSolidGeometry`:
 * la Z del dibujo es la altura real, no una elevación fija de entidad plana.
 */
function buildSlabGeometry(slab: RoofFloorSlab, viewport: CadThreeViewport): THREE.BufferGeometry {
  const mesh = tessellateBody(slabBody(slab));
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
    normals[index * 3] = mesh.normals[index * 3];
    normals[index * 3 + 1] = mesh.normals[index * 3 + 2];
    normals[index * 3 + 2] = mesh.normals[index * 3 + 1];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildSlabObject(slab: RoofFloorSlab, viewport: CadThreeViewport, color: number, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  let geometry: THREE.BufferGeometry;
  try {
    geometry = buildSlabGeometry(slab, viewport);
  } catch {
    // Un polígono degenerado (loop autointersecante que se coló, grosor
    // negativo) no tumba el visor: deja el grupo vacío, igual que el sólido.
    group.userData.invalid = true;
    return group;
  }
  const material = new THREE.MeshLambertMaterial({ color, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${name}:faces`;
  group.add(mesh);
  return group;
}

/** Piso + cielorraso de una habitación, como UN grupo reconciliable por `room.id`. */
export function buildCadRoomMassObject(room: RoofFloorRoom, viewport: CadThreeViewport): THREE.Group {
  const group = new THREE.Group();
  group.name = `cad-room-mass:${room.id}`;
  group.userData.roomId = room.id;
  group.add(buildSlabObject(room.floor, viewport, FLOOR_COLOR, `cad-room-floor:${room.id}`));
  group.add(buildSlabObject(room.ceiling, viewport, CEILING_COLOR, `cad-room-ceiling:${room.id}`));
  return group;
}

/** Losa de techo sobre la envolvente exterior. Plana en esta primera versión. */
export function buildCadRoofObject(envelope: RoofFloorEnvelope, viewport: CadThreeViewport): THREE.Group {
  const group = buildSlabObject(envelope.roof, viewport, ROOF_COLOR, "cad-roof");
  group.userData.envelopeWallIds = envelope.wallIds;
  return group;
}

/** Libera geometrías y materiales de un grupo de piso/cielorraso/techo. */
export function disposeCadArchitecturalMassObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
  object.removeFromParent();
}
