/**
 * Perfil 3D heredado PROPUESTO (`AC1015_3D_WIREFRAME_V1`, ADR-0009 §9):
 * 3DFACE, POLYLINE 3D, POLYLINE MESH, POLYLINE PFACE.
 *
 * El laboratorio ya decodifica estos cuatro tipos con fidelidad exacta
 * (`CAPABILITIES.md`, corte 2026-08-21) pero hasta este cambio nunca cruzaban
 * `toBetaProfileDatabase`: caían al mismo diagnóstico "fuera de perfil" que
 * cualquier tipo sin representación en `AC1015_MODELSPACE_2D_V3`. Este spec
 * prueba la mitad PURA del adaptador —igual que la sección 2 de
 * `dwg-native-reader.spec.ts` prueba ELLIPSE/SPLINE/MTEXT/DIMENSION/HATCH,
 * que el writer del laboratorio tampoco sabe fabricar como bytes reales
 * todavía (sólo siete clases, ADR-0009 §8.1)— con bases hechas a mano.
 *
 * NO hay bytes DWG reales en este spec por la misma razón: `writeDwg` no
 * emite 3DFACE/POLYLINE 3D/malla/polyface. La evidencia contra archivos DWG
 * reales queda pendiente de la admisión del PR de la ola 3 del corpus
 * hermano (fixtures 26–30), que exige el conversor de la máquina del
 * titular y su firma de revisor — no maquillado aquí.
 */
import { strict as assert } from "node:assert";
import type { DwgDatabaseEntityRecord, DwgGeometryEntity } from "@valle-design/dwg-codec";
import { toBetaProfileDatabase } from "./dwg-native-reader";

type EntityOfKind<K extends DwgGeometryEntity["kind"]> = Extract<DwgGeometryEntity, { kind: K }>;

const mkRecord = (
  handle: number,
  entity: DwgGeometryEntity,
  vertices?: DwgDatabaseEntityRecord[],
): DwgDatabaseEntityRecord => ({
  handle,
  entity,
  layerHandle: undefined,
  insertedBlockName: undefined,
  attributes: undefined,
  vertices,
  sequenceEndHandle: undefined,
});

// ─── Los cuatro tipos, con Z REAL en cada punto (la trampa que un lector
//     descuidado aplana) ───────────────────────────────────────────────────

const FACE3D: EntityOfKind<"face3d"> = {
  kind: "face3d",
  corners: [
    { x: 0, y: 0, z: 0 },
    { x: 40, y: 0, z: 0 },
    { x: 40, y: 25, z: 18 },
    { x: 0, y: 25, z: 18 },
  ],
  invisibilityFlags: 5,
};

const POLYLINE_3D: EntityOfKind<"polyline3d"> = {
  kind: "polyline3d",
  splineFlags: 0,
  closedFlags: 1, // bit 0 = cerrada
};
const POLYLINE_3D_VERTICES: DwgDatabaseEntityRecord[] = [
  mkRecord(0x61, { kind: "vertex3d", flags: 32, position: { x: 0, y: 0, z: 0 } }),
  mkRecord(0x62, { kind: "vertex3d", flags: 32, position: { x: 10, y: 0, z: 3 } }),
  mkRecord(0x63, { kind: "vertex3d", flags: 32, position: { x: 10, y: 10, z: 6 } }),
];

const POLYMESH: EntityOfKind<"polymesh"> = {
  kind: "polymesh",
  flags: 16 | 1 | 32, // malla | closedM | closedN
  curveType: 0,
  mVertexCount: 2,
  nVertexCount: 2,
  mDensity: 0,
  nDensity: 0,
};
const POLYMESH_VERTICES: DwgDatabaseEntityRecord[] = [
  mkRecord(0x71, { kind: "vertexMesh", flags: 64, position: { x: 0, y: 0, z: 0 } }),
  mkRecord(0x72, { kind: "vertexMesh", flags: 64, position: { x: 0, y: 8, z: 1 } }),
  mkRecord(0x73, { kind: "vertexMesh", flags: 64, position: { x: 8, y: 0, z: 2 } }),
  mkRecord(0x74, { kind: "vertexMesh", flags: 64, position: { x: 8, y: 8, z: 3 } }),
];

const POLYFACE_MESH: EntityOfKind<"polyfaceMesh"> = {
  kind: "polyfaceMesh",
  vertexCount: 4,
  faceCount: 1,
};
const POLYFACE_MESH_VERTICES: DwgDatabaseEntityRecord[] = [
  mkRecord(0x81, { kind: "vertexPface", flags: 192, position: { x: 0, y: 0, z: 0 } }),
  mkRecord(0x82, { kind: "vertexPface", flags: 192, position: { x: 40, y: 0, z: 0 } }),
  mkRecord(0x83, { kind: "vertexPface", flags: 192, position: { x: 40, y: 25, z: 0 } }),
  mkRecord(0x84, { kind: "vertexPface", flags: 192, position: { x: 0, y: 25, z: 0 } }),
  // Índice negativo: arista invisible (fixture 28 del corpus hermano, ola 3).
  mkRecord(0x85, { kind: "pfaceFace", index1: 1, index2: 2, index3: 3, index4: -4 }),
];

const raw = {
  layers: [],
  blocks: [],
  insunits: 4,
  modelSpaceEntities: [
    mkRecord(0x50, FACE3D),
    mkRecord(0x60, POLYLINE_3D, POLYLINE_3D_VERTICES),
    mkRecord(0x70, POLYMESH, POLYMESH_VERTICES),
    mkRecord(0x80, POLYFACE_MESH, POLYFACE_MESH_VERTICES),
  ],
  unsupported: [],
  diagnostics: [],
};

// ─── 1. Por defecto, EXACTAMENTE el comportamiento de siempre: fuera de
//        perfil, nunca "no decodificado" ───────────────────────────────────

const sinPerfil3d = toBetaProfileDatabase(raw);
assert.equal(
  sinPerfil3d.modelSpaceEntities.length,
  0,
  "sin allow3dWireframe, los cuatro tipos siguen fuera del perfil V3, como antes de este cambio",
);
const excluidosPorDefecto = sinPerfil3d.diagnostics.filter(
  (d) => d.code === "dwg_beta_profile_entity_excluded",
);
assert.equal(excluidosPorDefecto.length, 4, "los cuatro se declaran fuera de perfil, no se callan");
assert.equal(
  sinPerfil3d.unsupported.length,
  0,
  "fuera de perfil no es 'no decodificado': el laboratorio SÍ los lee (CAPABILITIES.md)",
);

// ─── 2. Con `allow3dWireframe: true`, los cuatro entran con su Z real y sus
//        vértices atados ───────────────────────────────────────────────────

const conPerfil3d = toBetaProfileDatabase(raw, { allow3dWireframe: true });
assert.deepEqual(
  conPerfil3d.modelSpaceEntities.map((r) => r.entity.kind).sort(),
  ["face3d", "polyfaceMesh", "polyline3d", "polymesh"],
  "los cuatro tipos del perfil 3D heredado entran cuando se autoriza explícitamente",
);
assert.equal(
  conPerfil3d.diagnostics.filter((d) => d.code === "dwg_beta_profile_entity_excluded").length,
  0,
  "ninguno de los cuatro se declara fuera de perfil cuando SÍ está autorizado",
);

const face3d = conPerfil3d.modelSpaceEntities.find((r) => r.entity.kind === "face3d")!;
assert.ok(face3d.entity.kind === "face3d");
assert.deepEqual(
  face3d.entity.corners.map((c) => c.z),
  [0, 0, 18, 18],
  "3DFACE conserva la Z real de cada esquina, sin aplanar a 0",
);

const polyline3d = conPerfil3d.modelSpaceEntities.find((r) => r.entity.kind === "polyline3d")!;
assert.equal(polyline3d.vertices?.length, 3, "POLYLINE 3D trae sus tres VERTEX atados");
assert.deepEqual(
  polyline3d.vertices!.map((v) => (v.entity.kind === "vertex3d" ? v.entity.position.z : null)),
  [0, 3, 6],
  "cada VERTEX 3D conserva su propia Z, distinta de la de sus vecinos",
);

const polymesh = conPerfil3d.modelSpaceEntities.find((r) => r.entity.kind === "polymesh")!;
assert.equal(polymesh.vertices?.length, 4, "POLYLINE MESH trae sus 2×2 VERTEX de malla atados");

const polyfaceMesh = conPerfil3d.modelSpaceEntities.find((r) => r.entity.kind === "polyfaceMesh")!;
const pfaceChildren = polyfaceMesh.vertices ?? [];
assert.equal(
  pfaceChildren.filter((v) => v.entity.kind === "vertexPface").length,
  4,
  "POLYLINE PFACE trae sus 4 VERTEX de posición",
);
const faceRecord = pfaceChildren.find((v) => v.entity.kind === "pfaceFace");
assert.ok(faceRecord && faceRecord.entity.kind === "pfaceFace");
assert.equal(
  faceRecord.entity.index4,
  -4,
  "el índice negativo (arista invisible) viaja crudo, sin reinterpretar ni corromper el signo",
);

// ─── 3. Los doce tipos de V3 siguen intactos con la nueva opción encendida:
//        los dos perfiles son conjuntos DISJUNTOS ─────────────────────────

const LINE: EntityOfKind<"line"> = {
  kind: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 0, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const mixta = toBetaProfileDatabase(
  {
    ...raw,
    modelSpaceEntities: [...raw.modelSpaceEntities, mkRecord(0x90, LINE)],
  },
  { allow3dWireframe: true },
);
assert.equal(
  mixta.modelSpaceEntities.length,
  5,
  "un archivo con LINE (V3) y los cuatro tipos 3D (perfil propuesto) entrega los cinco a la vez",
);
assert.ok(
  mixta.modelSpaceEntities.some((r) => r.entity.kind === "line"),
  "V3 no se apaga por autorizar el perfil 3D: los dos perfiles conviven",
);

console.log(
  "dwg-native-reader (perfil 3D heredado §9): por defecto sigue fuera de perfil (0 filtraciones), " +
    "con allow3dWireframe los cuatro tipos entran con Z real y vértices atados, V3 no se ve afectado.",
);
