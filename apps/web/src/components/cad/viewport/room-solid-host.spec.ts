/**
 * Spec del anfitrión del volumen 3D de piso, cielorraso y cubierta.
 *
 * A diferencia de `CadWallSolidHost`, aquí no hay "un objeto por entidad": las
 * tres losas dependen del grafo de TODOS los muros a la vez
 * (`detectCadRooms(walls).exteriorRing`), así que lo que se afirma es que se
 * reconstruyen las TRES juntas cuando cualquier muro cambia — nunca una a
 * medias — y ninguna cuando no cambió nada; y que si la planta deja de
 * cerrar, no queda ninguna losa flotando de un estado anterior.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import {
  CadArchitecturalMassHost,
  CAD_CEILING_SLAB_THICKNESS,
  CAD_FLOOR_SLAB_THICKNESS,
  CAD_ROOF_SLAB_THICKNESS,
} from "./room-solid-host";

const layer = {
  id: "0",
  name: "0",
  color: "#94a3b8",
  visible: true,
  locked: false,
};

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  height = 2_400,
): CadWallEntity {
  return {
    id,
    type: "wall",
    start: { x: start[0], y: start[1], z: 0 },
    end: { x: end[0], y: end[1], z: 0 },
    thickness: 250,
    height,
    layer: "0",
  };
}

function documentWith(entities: readonly CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [layer],
    entities: [...entities],
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

const viewport = { scale: 0.01, width: 10_000, height: 10_000 };
const shell = (height = 2_400): CadWallEntity[] => [
  wall("sur", [0, 0], [5_000, 0], height),
  wall("este", [5_000, 0], [5_000, 4_000], height),
  wall("norte", [5_000, 4_000], [0, 4_000], height),
  wall("oeste", [0, 4_000], [0, 0], height),
];

// --- sync reconcilia: planta cerrada → tres losas; sin cambios, nada nuevo --
{
  const host = new CadArchitecturalMassHost(() => viewport);
  const walls = shell();
  host.sync(documentWith(walls));
  assert.equal(host.count, 3, "piso, cielorraso y cubierta: tres objetos");
  assert.equal(host.group.children.length, 3);
  const kinds = host.group.children
    .map((child) => child.userData.architecturalMassKind as string)
    .sort();
  assert.deepEqual(kinds, ["ceiling", "floor", "roof"]);

  const before = [...host.group.children];
  // MISMAS referencias de muro: el grafo no pudo haber cambiado.
  host.sync(documentWith(walls));
  assert.deepEqual(
    [...host.group.children],
    before,
    "sin cambios no se reconstruye nada",
  );

  // Un muro con referencia NUEVA (aunque el resto siga igual) reconstruye
  // las TRES losas, no sólo una: las tres comparten el mismo anillo exterior.
  const wallsMutated = [
    { ...walls[0], thickness: 300 },
    walls[1],
    walls[2],
    walls[3],
  ];
  host.sync(documentWith(wallsMutated));
  const survived = host.group.children.filter((child) =>
    before.includes(child),
  );
  assert.equal(
    survived.length,
    0,
    "un solo muro mutado reconstruye las tres, ninguna sobrevive",
  );
  assert.equal(
    host.count,
    3,
    "y siguen siendo tres: piso, cielorraso y cubierta",
  );

  // La planta deja de cerrar (falta un muro): ninguna losa queda a medias.
  host.sync(documentWith(wallsMutated.slice(0, 3)));
  assert.equal(
    host.count,
    0,
    "una planta que no cierra no deja ninguna losa flotando",
  );
  assert.equal(host.group.children.length, 0);

  host.sync(documentWith(walls));
  assert.equal(host.count, 3, "vuelve a cerrar, vuelven las tres");
  host.dispose();
  assert.equal(host.count, 0);
  assert.equal(host.group.children.length, 0, "dispose vacía el grupo");
}

// --- las tres losas se apoyan donde toca, en escena --------------------------
{
  const host = new CadArchitecturalMassHost(() => viewport);
  const height = 2_400;
  host.sync(documentWith(shell(height)));
  const byKind = new Map(
    host.group.children.map((child) => [
      child.userData.architecturalMassKind as string,
      child,
    ]),
  );
  const near = (actual: number, expected: number, what: string) =>
    assert.ok(
      Math.abs(actual - expected) < 1e-6,
      `${what}: ${actual}, se esperaba ${expected}`,
    );

  const floorBox = new THREE.Box3().setFromObject(byKind.get("floor")!);
  near(floorBox.max.y, 0, "el piso remata en el nivel 0 del dibujo");
  near(
    floorBox.min.y,
    -CAD_FLOOR_SLAB_THICKNESS * viewport.scale,
    "y baja su grosor completo",
  );

  const ceilingBox = new THREE.Box3().setFromObject(byKind.get("ceiling")!);
  near(
    ceilingBox.min.y,
    height * viewport.scale,
    "el cielorraso se apoya en la altura de muro",
  );
  near(
    ceilingBox.max.y,
    (height + CAD_CEILING_SLAB_THICKNESS) * viewport.scale,
    "y sube su propio grosor",
  );

  const roofBox = new THREE.Box3().setFromObject(byKind.get("roof")!);
  near(
    roofBox.min.y,
    (height + CAD_CEILING_SLAB_THICKNESS) * viewport.scale,
    "la cubierta se apoya sobre el cielorraso, no sobre el muro directamente",
  );
  near(
    roofBox.max.y,
    (height + CAD_CEILING_SLAB_THICKNESS + CAD_ROOF_SLAB_THICKNESS) *
      viewport.scale,
    "y sube su propio grosor",
  );
  host.dispose();
}

// --- ninguna de las tres es una entidad seleccionable -----------------------
{
  const host = new CadArchitecturalMassHost(() => viewport);
  host.sync(documentWith(shell()));
  for (const child of host.group.children)
    assert.equal(
      child.userData.nativeEntityId,
      undefined,
      "piso/cielorraso/cubierta no llevan nativeEntityId: no hay entidad de documento que editar",
    );
  host.dispose();
}

// --- invalidKinds(): expone lo que buildCadArchitecturalMassObject marcó ----
// Provocar un `null` REAL de `architecturalSlabBodyLocal` a través de
// `sync()` no es realista: `detectCadRooms` ya descarta cualquier anillo
// degenerado antes de exponerlo como `exteriorRing`, y los rangos de Z de
// piso/cielorraso/cubierta son constantes de módulo siempre positivas — el
// único camino real a `userData.invalid` es una excepción del kernel ante un
// anillo patológico, que `room-solid-three.spec.ts` ya cubre directamente
// sobre `buildCadArchitecturalMassObject`. Lo que hace falta probar AQUÍ es
// la lectura: que `invalidKinds()` reporta fielmente lo que cada objeto
// lleve en `userData`, sin llevar cuenta aparte. Como `sync()` añade cada
// objeto a la vez a `group.children` (público) y a la lista privada que
// `invalidKinds()` recorre, marcar la malla ya construida a través de
// `group.children` simula justo lo que una construcción fallida habría
// dejado, sin tocar estado privado.
{
  const host = new CadArchitecturalMassHost(() => viewport);
  const walls = shell();
  host.sync(documentWith(walls));
  assert.deepEqual(
    host.invalidKinds(),
    [],
    "un contorno rectangular corriente produce tres losas válidas",
  );

  const roof = host.group.children.find(
    (child) => child.userData.architecturalMassKind === "roof",
  )!;
  roof.userData.invalid = true;
  assert.deepEqual(
    host.invalidKinds(),
    ["roof"],
    "invalidKinds() lee la marca de cada objeto: sólo la cubierta sale",
  );

  // Los MISMOS muros no reconstruyen nada (misma referencia) — la marca
  // sintética sigue en pie, tal como quedaría una masa realmente inválida
  // hasta que algo en la planta cambie de verdad.
  host.sync(documentWith(walls));
  assert.deepEqual(
    host.invalidKinds(),
    ["roof"],
    "sin cambios en los muros, la masa inválida no se limpia sola",
  );

  // Cualquier cambio real reconstruye las tres desde cero, con el contorno
  // real (válido): la marca sintética desaparece.
  const wallsMutated = [
    { ...walls[0], thickness: 300 },
    walls[1],
    walls[2],
    walls[3],
  ];
  host.sync(documentWith(wallsMutated));
  assert.deepEqual(
    host.invalidKinds(),
    [],
    "una reconstrucción real repone las tres masas, todas válidas otra vez",
  );
  host.dispose();
}

console.log(
  "room-solid-host.spec: piso, cielorraso y cubierta se reconcilian juntos por el grafo de muros",
);
