/**
 * Spec del anfitrión del volumen 3D de muros.
 *
 * Lo que se puede afirmar en Node es la RECONCILIACIÓN, igual que en
 * `solid-shade-host.spec.ts`: un objeto por muro, identidad de referencia
 * evita reconstruir lo que no cambió, y designar/borrar hace lo esperado. La
 * comprobación PROPIA de este anfitrión —la que no tiene `CadSolidShadeHost`,
 * porque un sólido no aloja nada— es que un vano SIN tocar el muro que lo
 * hospeda también dispara la reconstrucción de ESE muro y sólo de ése: el
 * hueco vive en la malla del muro, no en una capa aparte.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import type { CadOpeningEntity } from "@/lib/cad/cad-entities-v7";
import { CadWallSolidHost } from "./wall-solid-host";

const layer = {
  id: "0",
  name: "0",
  color: "#94a3b8",
  visible: true,
  locked: false,
};

function wall(id: string, length: number): CadWallEntity {
  return {
    id,
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: length, y: 0, z: 0 },
    thickness: 200,
    height: 2_400,
    layer: "0",
  };
}

function door(id: string, hostId: string, position: number): CadOpeningEntity {
  return {
    id,
    type: "opening",
    kind: "door",
    hostId,
    position,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
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
const none: ReadonlySet<string> = new Set();

// --- sync reconcilia: crea, conserva por referencia, reconstruye y libera ----
{
  const host = new CadWallSolidHost(() => viewport);
  const m1 = wall("m1", 4_000);
  const m2 = wall("m2", 3_000);
  host.sync(documentWith([m1, m2]), none);
  assert.equal(host.count, 2, "un objeto por muro");
  assert.equal(host.group.children.length, 2);

  const before = [...host.group.children];
  host.sync(documentWith([m1, m2]), none);
  assert.deepEqual(
    [...host.group.children],
    before,
    "sin cambios no se reconstruye nada",
  );

  const m1Mas = wall("m1", 4_500);
  host.sync(documentWith([m1Mas, m2]), none);
  const m2Después = host.group.children.filter((child) =>
    before.includes(child),
  );
  assert.equal(m2Después.length, 1, "m2 intacto conserva su objeto; m1 no");

  host.sync(documentWith([m2]), none);
  assert.equal(host.count, 1, "el muro borrado se libera");

  host.dispose();
  assert.equal(host.count, 0);
  assert.equal(host.group.children.length, 0, "dispose vacía el grupo");
}

// --- un vano nuevo (sin tocar el muro) reconstruye SÓLO su muro anfitrión ----
{
  const host = new CadWallSolidHost(() => viewport);
  const m1 = wall("m1", 4_000);
  const m2 = wall("m2", 3_000);
  host.sync(documentWith([m1, m2]), none);
  const before = [...host.group.children];

  const p1 = door("p1", "m1", 1_500);
  // m1 y m2 son las MISMAS referencias que antes — sólo cambió el conjunto de
  // vanos de m1.
  host.sync(documentWith([m1, m2, p1]), none);
  assert.equal(
    host.count,
    2,
    "sigue habiendo un objeto por muro, no uno por vano",
  );
  const kept = host.group.children.filter((child) => before.includes(child));
  assert.equal(
    kept.length,
    1,
    "m2 (sin vanos nuevos) conserva su objeto; m1 no",
  );

  // Volver a sincronizar con el MISMO vano no reconstruye nada más.
  const afterDoor = [...host.group.children];
  host.sync(documentWith([m1, m2, p1]), none);
  assert.deepEqual(
    [...host.group.children],
    afterDoor,
    "el mismo vano no reconstruye de nuevo",
  );

  // Borrar el vano (sin tocar el muro) también reconstruye sólo m1.
  host.sync(documentWith([m1, m2]), none);
  const keptAfterRemove = host.group.children.filter((child) =>
    afterDoor.includes(child),
  );
  assert.equal(
    keptAfterRemove.length,
    1,
    "borrar el vano reconstruye m1 y respeta m2",
  );
  host.dispose();
}

// --- la designación RECOLOREA sin retesellar; el color cambia de verdad ------
{
  const host = new CadWallSolidHost(() => viewport);
  const m1 = wall("m1", 4_000);
  const m2 = wall("m2", 3_000);
  host.sync(documentWith([m1, m2]), none);
  const before = [...host.group.children];
  const m1Object = before.find((child) => child.userData.nativeEntityId === "m1")!;
  const meshOf = (object: THREE.Object3D) =>
    object.children.find(
      (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
    );
  const colorOf = (object: THREE.Object3D) =>
    (meshOf(object)?.material as THREE.MeshLambertMaterial | undefined)?.color.getHex();
  const genericColor = colorOf(m1Object);

  host.sync(documentWith([m1, m2]), new Set(["m1"]));
  const kept = host.group.children.filter((child) => before.includes(child));
  assert.equal(
    kept.length,
    2,
    "designar NO reconstruye a nadie: ni el designado ni el que no lo es cambian de objeto",
  );
  assert.equal(
    colorOf(m1Object),
    0x22d3ee,
    "el MISMO objeto de m1 recolorea a color de selección",
  );

  host.sync(documentWith([m1, m2]), none);
  assert.equal(
    colorOf(m1Object),
    genericColor,
    "soltar la selección devuelve el color genérico, sin reconstruir tampoco",
  );
  host.dispose();
}

// --- cambiar el MATERIAL tampoco reconstruye: recolorea el mismo objeto -----
{
  const host = new CadWallSolidHost(() => viewport);
  const m1 = wall("m1", 4_000);
  host.sync(documentWith([m1]), none);
  const before = host.group.children[0];
  const meshOf = (object: THREE.Object3D) =>
    object.children.find(
      (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
    );
  const colorOf = (object: THREE.Object3D) =>
    (meshOf(object)?.material as THREE.MeshLambertMaterial | undefined)?.color.getHex();
  const genericColor = colorOf(before);

  // Nueva REFERENCIA de m1 (como haría una edición real), pero con el MISMO
  // eje/grosor/altura y sólo el material distinto.
  const m1WithMaterial: CadWallEntity = { ...m1, material: "brick" };
  host.sync(documentWith([m1WithMaterial]), none);
  assert.equal(
    host.group.children[0],
    before,
    "un material nuevo no reconstruye el objeto: sigue siendo el mismo Mesh",
  );
  assert.notEqual(
    colorOf(before),
    genericColor,
    "…pero el color SÍ cambió: el material se pintó de verdad",
  );
  host.dispose();
}

// --- cambiar la GEOMETRÍA (grosor) sí reconstruye, aunque el material siga --
{
  const host = new CadWallSolidHost(() => viewport);
  const m1 = wall("m1", 4_000);
  host.sync(documentWith([m1]), none);
  const before = host.group.children[0];

  const m1Thicker: CadWallEntity = { ...m1, thickness: 400 };
  host.sync(documentWith([m1Thicker]), none);
  assert.notEqual(
    host.group.children[0],
    before,
    "un grosor nuevo SÍ reconstruye: recolorear no basta para una malla distinta",
  );
  host.dispose();
}

// --- identidad para picking: cada objeto apunta a la entidad canónica -------
{
  const host = new CadWallSolidHost(() => viewport);
  host.sync(documentWith([wall("m1", 4_000)]), none);
  const object = host.group.children[0];
  assert.equal(object?.userData.nativeEntityId, "m1");
  assert.equal(object?.userData.nativeEntityType, "wall");
  host.dispose();
}

// --- invalidIds(): un muro degenerado avisa, no desaparece en silencio -----
{
  const host = new CadWallSolidHost(() => viewport);
  const sound = wall("m1", 4_000);
  const degenerate: CadWallEntity = {
    ...wall("m2", 4_000),
    // Eje de longitud cero: la misma condición fail-closed de
    // wallSolidBodyLocal (ver wall-solid.spec.ts).
    end: { x: 0, y: 0, z: 0 },
  };
  host.sync(documentWith([sound, degenerate]), none);
  assert.deepEqual(
    host.invalidIds(),
    ["m2"],
    "sólo el muro degenerado sale en invalidIds; el sano no",
  );

  // Arreglarlo lo saca de la lista, sin quedar fantasma.
  const fixed: CadWallEntity = { ...degenerate, end: { x: 4_000, y: 0, z: 0 } };
  host.sync(documentWith([sound, fixed]), none);
  assert.deepEqual(
    host.invalidIds(),
    [],
    "arreglar el eje lo saca de invalidIds",
  );
  host.dispose();
}

console.log(
  "wall-solid-host.spec: reconciliación por firma (muro + vanos alojados)",
);
