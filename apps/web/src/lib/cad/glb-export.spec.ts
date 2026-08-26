/**
 * Round-trip GLB: exportar, VOLVER A LEER y comprobar que el edificio viaja.
 *
 * El criterio COMMERCIAL-RC1 al pie de la letra: un GLB sin la arquitectura
 * debe FALLAR. Aquí se construye la misma escena que el editor (los mismos
 * anfitriones: `CadNativeMassHosts` para muros+losas), se exporta con el
 * mismo `GLTFExporter` de three, se vuelve a parsear con `GLTFLoader` y se
 * afirma sobre lo LEÍDO, no sobre lo exportado:
 *
 *   1. La lista de exportación incluye la arquitectura (la firma del defecto
 *      original: sólo viajaban los grupos del modelo heredado).
 *   2. El GLB releído contiene mallas, con la bounding box del edificio
 *      (± tolerancia) — no una escena vacía ni un nodo fantasma.
 *   3. Los materiales sobreviven (el color declarado del muro llega al GLB).
 *   4. El HUECO existe de verdad en la malla releída: un rayo por el centro
 *      de la puerta no choca ningún triángulo; un rayo por el muro macizo sí.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CadDocument, CadEntity } from "./cad-document";
import { CAD_DOCUMENT_SCHEMA } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";
import type { CadOpeningEntity } from "./cad-entities-v7";
import { CadNativeMassHosts } from "@/components/cad/viewport/native-mass-hosts";
import {
  cadGlbExportIncludesArchitecture,
  collectCadGlbExportObjects,
  hideCadGlbOverlays,
  planCadGlbExport,
  serializeCadGlbBlob,
} from "./glb-export";
import { cadWallMaterialStyle } from "./wall-materials";

// GLTFExporter usa FileReader (API de navegador) para ensamblar el binario;
// Node no lo trae. Polyfill mínimo — readAsArrayBuffer/readAsDataURL sobre
// Blob.arrayBuffer — suficiente para exportar sin texturas.
class NodeFileReader {
  onload: ((event: { target: NodeFileReader }) => void) | null = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  result: ArrayBuffer | string | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}
const globalWithReader = globalThis as { FileReader?: unknown };
if (!globalWithReader.FileReader) globalWithReader.FileReader = NodeFileReader;

const layer = { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false };

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
): CadWallEntity {
  return {
    id,
    type: "wall",
    start: { x: start[0], y: start[1], z: 0 },
    end: { x: end[0], y: end[1], z: 0 },
    thickness: 250,
    height: 2_400,
    layer: "0",
    material: "brick",
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

/** Un grupo heredado CON geometría, para aislar el caso architecture-missing. */
function makeLegacyBox(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ),
  );
  return group;
}

// Vivienda mínima: cuatro muros que cierran 5×4 m y una puerta en el muro sur.
const door: CadOpeningEntity = {
  id: "puerta",
  type: "opening",
  kind: "door",
  hostId: "sur",
  position: 2_500,
  width: 900,
  height: 2_100,
  sill: 0,
  swing: "left",
  hinge: "start",
  layer: "0",
};
const building = documentWith([
  wall("sur", [0, 0], [5_000, 0]),
  wall("este", [5_000, 0], [5_000, 4_000]),
  wall("norte", [5_000, 4_000], [0, 4_000]),
  wall("oeste", [0, 4_000], [0, 0]),
  door,
]);

async function main(): Promise<void> {
const hosts = new CadNativeMassHosts(() => viewport);
hosts.sync(building, new Set());
assert.equal(
  hosts.invalidGeometry().wallIds.length,
  0,
  "los cuatro muros producen volumen válido",
);

// 1 · La lista de exportación incluye la arquitectura; sin ella, lo dice.
const groups = {
  legacy: [new THREE.Group()], // grupo heredado VACÍO, como un plano sin assets
  architecture: [hosts.group],
};
assert.ok(
  cadGlbExportIncludesArchitecture(groups),
  "la colección reconoce la arquitectura materializada",
);
const objects = collectCadGlbExportObjects(groups);
assert.ok(
  objects.includes(hosts.group),
  "el grupo de arquitectura está en la lista final",
);
assert.ok(
  !objects.some((object) => object !== hosts.group),
  "un grupo heredado vacío no viaja como nodo fantasma",
);
assert.equal(
  cadGlbExportIncludesArchitecture({ legacy: [], architecture: [new THREE.Group()] }),
  false,
  "una escena sin geometría de arquitectura se detecta (la firma del defecto)",
);

// 1b · El PLAN del botón — las dos negativas y la afirmativa, sin editor.
const plan = planCadGlbExport(groups, true);
assert.ok(plan.kind === "ready", "documento con arquitectura materializada: listo");
assert.ok(plan.objects.includes(hosts.group), "el plan lleva la arquitectura");
assert.equal(
  planCadGlbExport({ legacy: [new THREE.Group()], architecture: [] }, false).kind,
  "empty",
  "sin nada renderable no hay exportación",
);
assert.equal(
  planCadGlbExport(
    { legacy: [makeLegacyBox()], architecture: [new THREE.Group()] },
    true,
  ).kind,
  "architecture-missing",
  "documento con muros y escena sin arquitectura: se RECHAZA (hard-cap RC1)",
);

// 1c · Los overlays se apagan durante la exportación y se restauran después,
// sin encender lo que ya estaba apagado.
{
  const root = new THREE.Group();
  const label = new THREE.Group();
  label.userData.isLabel = true;
  const alreadyHidden = new THREE.Group();
  alreadyHidden.userData.isLabel = true;
  alreadyHidden.visible = false;
  root.add(label, alreadyHidden);
  const restore = hideCadGlbOverlays(root, (o) => !!o.userData?.isLabel);
  assert.equal(label.visible, false, "el overlay queda oculto para exportar");
  restore();
  assert.equal(label.visible, true, "restaurar vuelve a encender el overlay");
  assert.equal(alreadyHidden.visible, false, "lo ya apagado sigue apagado");
}

// 2 · Export → re-read, por la MISMA función que usa el botón del editor.
const exported: ArrayBuffer = await (
  await serializeCadGlbBlob(objects)
).arrayBuffer();
assert.ok(exported.byteLength > 1_000, "el GLB tiene contenido real");

const reread = await new Promise<THREE.Group>((resolve, reject) => {
  new GLTFLoader().parse(
    exported,
    "",
    (gltf) => resolve(gltf.scene),
    reject,
  );
});

const meshes: THREE.Mesh[] = [];
reread.traverse((child) => {
  if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
});
assert.ok(meshes.length >= 7, `mallas releídas: ${meshes.length} (4 muros + 3 losas)`);

// Bounding box del edificio releído ≈ bounding box de la escena exportada.
const expectedBox = new THREE.Box3();
for (const object of objects) expectedBox.expandByObject(object);
const rereadBox = new THREE.Box3().setFromObject(reread);
for (const axis of ["x", "y", "z"] as const) {
  assert.ok(
    Math.abs(rereadBox.min[axis] - expectedBox.min[axis]) < 1e-3 &&
      Math.abs(rereadBox.max[axis] - expectedBox.max[axis]) < 1e-3,
    `bounding box releída coincide en ${axis}: ` +
      `[${rereadBox.min[axis]}, ${rereadBox.max[axis]}] vs ` +
      `[${expectedBox.min[axis]}, ${expectedBox.max[axis]}]`,
  );
}

// 3 · El material declarado del muro sobrevive el viaje.
const brick = new THREE.Color(cadWallMaterialStyle("brick").color);
const materialColors = meshes
  .map((mesh) => mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial)
  .filter((material) => !!material && "color" in material)
  .map((material) => material.color);
assert.ok(
  materialColors.some(
    (color) =>
      Math.abs(color.r - brick.r) < 0.02 &&
      Math.abs(color.g - brick.g) < 0.02 &&
      Math.abs(color.b - brick.b) < 0.02,
  ),
  "el color del material de muro declarado llega al GLB releído",
);

// 4 · El hueco de la puerta EXISTE en la malla releída: raycast de verdad.
reread.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
const sceneOf = (x: number, y: number, z: number) =>
  new THREE.Vector3(
    (x - viewport.width / 2) * viewport.scale,
    z * viewport.scale,
    (y - viewport.height / 2) * viewport.scale,
  );
const castThrough = (x: number, y: number, z: number) => {
  const target = sceneOf(x, y, z);
  const origin = target.clone().setY(target.y).add(new THREE.Vector3(0, 0, 10));
  raycaster.set(origin, new THREE.Vector3(0, 0, -1));
  raycaster.far = 40;
  return raycaster.intersectObjects(meshes, false).length;
};
// El muro sur corre por y=0 (eje z de escena): un rayo perpendicular por el
// centro de la puerta (x=2500, z=1000) debe pasar limpio; por muro macizo
// (x=700, z=1000) debe chocar.
assert.equal(
  castThrough(2_500, 0, 1_000),
  0,
  "un rayo por el centro de la puerta atraviesa sin tocar pared",
);
assert.ok(
  castThrough(700, 0, 1_000) > 0,
  "un rayo por el muro macizo sí choca con la malla releída",
);

hosts.dispose();
console.log("glb-export.spec: el edificio viaja en el GLB y el hueco es real");
}

void main();
