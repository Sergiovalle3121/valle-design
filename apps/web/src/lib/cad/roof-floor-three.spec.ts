/**
 * Del plano de masa arquitectónica al visor: teselado y mapeo de ejes.
 *
 * Lo que sólo se puede afirmar aquí (frontera kernel/visor, ver la cabecera de
 * `solid3d-view.spec.ts` para la misma razón): que la Z de la losa —piso,
 * cielorraso o techo— llega a la Y de ESCENA, no a la Z, y que un polígono roto
 * no tumba el visor.
 */
import * as THREE from "three";
import { check, checkClose, report } from "../brep/spec-support";
import type { RoofFloorEnvelope, RoofFloorRoom, RoofFloorSlab } from "./roof-floor-generation";
import {
  buildCadRoofObject,
  buildCadRoomMassObject,
  disposeCadArchitecturalMassObject,
} from "./roof-floor-three";

const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };

const square = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

function slab(z: number, thickness: number): RoofFloorSlab {
  return { polygon: square, z, thickness };
}

const room: RoofFloorRoom = {
  id: "room:e,n,s,w",
  wallIds: ["e", "n", "s", "w"],
  polygon: square,
  levelZ: 0,
  height: 2400,
  ceilingZ: 2400,
  floor: slab(-150, 150),
  ceiling: slab(2400, 100),
};

const envelope: RoofFloorEnvelope = {
  wallIds: ["e", "n", "s", "w"],
  polygon: square,
  roofZ: 2400,
  roof: slab(2400, 200),
};

// ---------------------------------------------------------------------------
// 1. La malla del piso llega bajo cota cero, con la Z de dibujo en la Y de escena
// ---------------------------------------------------------------------------
{
  const group = buildCadRoomMassObject(room, viewport);
  check("un objeto para piso y otro para cielorraso", group.children.length === 2);
  check("el grupo declara la habitación", group.userData.roomId === room.id);

  const floorFaces = group.children.find((child) => child.name.startsWith("cad-room-floor"));
  const floorMesh = floorFaces?.children[0] as THREE.Mesh | undefined;
  check("el piso tiene una malla de caras", !!floorMesh);
  const floorBounds = new THREE.Box3().setFromObject(floorMesh!);
  // ANCLA de la permutación de ejes: el grosor de la losa (150) tiene que salir
  // en la Y de escena. Mapeado a Z, este número saldría en el eje equivocado.
  checkClose("el grosor del piso va a la Y de escena", floorBounds.max.y - floorBounds.min.y, 150 * viewport.scale, 1e-6);
  checkClose("el piso cuelga POR DEBAJO de cota cero", floorBounds.max.y, 0, 1e-6);
  checkClose("...hasta -150 en Y de escena", floorBounds.min.y, -150 * viewport.scale, 1e-6);
  checkClose("el ancho de 4000 va a la X de escena", floorBounds.max.x - floorBounds.min.x, 4000 * viewport.scale, 1e-6);
  checkClose("el fondo de 3000 va a la Z de escena", floorBounds.max.z - floorBounds.min.z, 3000 * viewport.scale, 1e-6);

  const ceilingFaces = group.children.find((child) => child.name.startsWith("cad-room-ceiling"));
  const ceilingMesh = ceilingFaces?.children[0] as THREE.Mesh | undefined;
  const ceilingBounds = new THREE.Box3().setFromObject(ceilingMesh!);
  checkClose("la cara de abajo del cielorraso es la altura de muro", ceilingBounds.min.y, 2400 * viewport.scale, 1e-6);
  checkClose("y sube su propio grosor por encima", ceilingBounds.max.y, 2500 * viewport.scale, 1e-6);

  disposeCadArchitecturalMassObject(group);
  check("dispose no lanza y libera el grupo sin dejarlo colgado de nada", group.parent === null);
}

// ---------------------------------------------------------------------------
// 2. El techo se apoya exactamente donde termina el cielorraso
// ---------------------------------------------------------------------------
{
  const group = buildCadRoofObject(envelope, viewport);
  check("el grupo del techo declara sus muros de envolvente", Array.isArray(group.userData.envelopeWallIds));
  const mesh = group.children[0] as THREE.Mesh;
  const bounds = new THREE.Box3().setFromObject(mesh);
  checkClose("el techo arranca en el roofZ de la envolvente", bounds.min.y, 2400 * viewport.scale, 1e-6);
  checkClose("y sube su grosor (200) por encima", bounds.max.y, 2600 * viewport.scale, 1e-6);
  disposeCadArchitecturalMassObject(group);
}

// ---------------------------------------------------------------------------
// 3. Una losa degenerada no tumba el visor
// ---------------------------------------------------------------------------
{
  const broken: RoofFloorRoom = {
    ...room,
    floor: slab(-150, 150),
    ceiling: { polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }], z: 2400, thickness: 100 },
  };
  const group = buildCadRoomMassObject(broken, viewport);
  const ceilingGroup = group.children.find((child) => child.name.startsWith("cad-room-ceiling"))!;
  check("un polígono de dos puntos no lanza: el grupo del cielorraso queda vacío", ceilingGroup.children.length === 0);
  check("y lo declara en userData", ceilingGroup.userData.invalid === true);
  const floorGroup = group.children.find((child) => child.name.startsWith("cad-room-floor"))!;
  check("el piso, que sí es válido, se construye igual", floorGroup.children.length === 1);
  disposeCadArchitecturalMassObject(group);
}

report("roof-floor-three: teselado de losas al visor y permutación de ejes", 14);
