/**
 * Spec de la fachada `CadNativeMassHosts`.
 *
 * No repite la geometría —eso ya lo prueban `wall-solid-host.spec.ts` y
 * `room-solid-host.spec.ts`—: sólo afirma que la fachada de verdad delega en
 * los dos anfitriones (su grupo trae los dos sub-grupos, un `sync` puebla
 * ambos, un `dispose` libera los dos) y que la selección SÍ llega a los
 * muros aunque las masas no la usen.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadWallEntity } from "@/lib/cad/cad-entities-v6";
import { CadNativeMassHosts } from "./native-mass-hosts";

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
): CadWallEntity {
  return {
    id,
    type: "wall",
    start: { x: start[0], y: start[1], z: 0 },
    end: { x: end[0], y: end[1], z: 0 },
    thickness: 250,
    height: 2_400,
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
const shellWalls: CadWallEntity[] = [
  wall("sur", [0, 0], [5_000, 0]),
  wall("este", [5_000, 0], [5_000, 4_000]),
  wall("norte", [5_000, 4_000], [0, 4_000]),
  wall("oeste", [0, 4_000], [0, 0]),
];

{
  const hosts = new CadNativeMassHosts(() => viewport);
  assert.equal(hosts.group.children.length, 2, "un sub-grupo por anfitrión");
  const scene = new THREE.Group();
  scene.add(hosts.group);

  hosts.sync(documentWith(shellWalls), new Set(["sur"]));
  const [wallsGroup, massesGroup] = hosts.group.children;
  assert.equal(
    wallsGroup.children.length,
    4,
    "los cuatro muros llegan al anfitrión de muros",
  );
  assert.equal(
    massesGroup.children.length,
    3,
    "piso, cielorraso y cubierta llegan al de masas",
  );

  // La selección SÍ resuelve hasta el muro (aunque no se pueda ver el color
  // desde aquí sin GPU, el objeto seleccionado existe y no lanza).
  assert.doesNotThrow(() =>
    hosts.sync(documentWith(shellWalls), new Set(["sur", "este"])),
  );

  hosts.dispose();
  assert.equal(
    hosts.group.children.length,
    0,
    "dispose libera los dos anfitriones",
  );
  assert.equal(hosts.group.parent, null);
}

// --- T-10a: VSCURRENT llega a los DOS anfitriones de masa nativa ----------
//
// Antes, `applyVisualStyle` sólo existía en `CadSolidShadeHost` (SOLID3D):
// el estilo visual «confirmaba un cambio que sobre muros, losas y cubiertas
// no ocurre» (auditoría, 00c-CUADRO-DE-MANDO.md). Aquí se afirma la ESCENA
// —conteo de mallas y aristas, y el `data-visual-style` que
// `Cad3DSolidDiagnostics` publica—, no la etiqueta que el comando devuelve.
{
  const hosts = new CadNativeMassHosts(() => viewport);
  hosts.sync(documentWith(shellWalls), new Set());
  assert.equal(hosts.visualStyle, "shaded", "por defecto, el aspecto de siempre: caras, sin aristas");
  const shaded = hosts.getSnapshot();
  assert.ok(shaded.meshCount > 0, "en Sombreado hay mallas de cara");

  const label = hosts.applyVisualStyle("wireframe");
  assert.equal(label, "Alámbrico", "devuelve la ETIQUETA que VSCURRENT anuncia");
  assert.equal(hosts.visualStyle, "wireframe", "y el estado vigente cambió de verdad");

  const wireframe = hosts.getSnapshot();
  assert.equal(
    wireframe.visualStyle,
    "wireframe",
    "getSnapshot().visualStyle es lo que `Cad3DSolidDiagnostics` publica como `data-visual-style`",
  );
  assert.equal(
    wireframe.meshCount,
    shaded.meshCount,
    // Alámbrico no construye `Mesh`, sólo `LineSegments` — pero getSnapshot
    // cuenta las DOS clases, así que el número de PIEZAS visibles no cae a
    // cero: si cayera, un golden creería que el 3D desapareció.
    "el recuento sigue viendo objetos reales: no se confunde «sin caras» con «sin escena»",
  );

  hosts.applyVisualStyle("shaded");
  assert.equal(hosts.visualStyle, "shaded", "y se puede volver atrás");

  hosts.dispose();
}

console.log(
  "native-mass-hosts.spec: la fachada delega sync/dispose en muros y masas por igual, y VSCURRENT llega a los dos",
);
