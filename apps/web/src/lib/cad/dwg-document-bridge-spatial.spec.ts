import { strict as assert } from "node:assert";
import { dwgNeutralDatabaseToCadDocument } from "./dwg-document-bridge";
import type { DwgNeutralDatabase, DwgNeutralGeometry } from "./dwg-neutral-model";

// Casos geométricos sintéticos, definidos sin pasar por el writer DWG.
// La beta 2D no debe convertir silenciosamente una entidad espacial en XY.
const planarLine: DwgNeutralGeometry = {
  kind: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 120, y: 80, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 }, thickness: 0,
};
const planarCircle: DwgNeutralGeometry = {
  kind: "circle", center: { x: 20, y: 20, z: 0 }, radius: 10,
  extrusion: { x: 0, y: 0, z: 1 }, thickness: 0,
};
const record = (entity: DwgNeutralGeometry, handle: number) => ({
  entity, handle, layerHandle: 1, insertedBlockName: undefined,
  attributes: undefined, vertices: undefined,
});
const database = (entities: DwgNeutralGeometry[]): DwgNeutralDatabase => ({
  insunits: 4,
  layers: [{
    handle: 1, name: [48], colorIndex: 7, stateFlags: 1008,
    frozen: false, locked: false, unmeasuredStateBits: 0, linetypeName: "CONTINUOUS",
  }],
  blocks: [], modelSpaceEntities: entities.map((entity, index) => record(entity, index + 16)),
  unsupported: [], diagnostics: [],
});

const planar = dwgNeutralDatabaseToCadDocument(database([planarLine, planarCircle]));
assert.equal(planar.importedEntityCount, 2, "la geometría en XY sigue importándose");
assert.ok(!planar.warnings.some((warning) => warning.code === "dwg_nonplanar_entity_excluded"));

const outsidePlane: DwgNeutralGeometry[] = [
  { ...planarLine, end: { x: 120, y: 80, z: 60 } },
  { ...planarCircle, center: { x: 20, y: 20, z: 50 } },
  { ...planarCircle, extrusion: { x: 0, y: 1, z: 0 } },
  { ...planarCircle, extrusion: { x: 0, y: 0, z: -1 } },
  { ...planarCircle, thickness: 5 },
  {
    kind: "spline", scenario: 1, degree: 2, rational: false, closed: false,
    periodic: false, knotTolerance: 0, controlTolerance: 0,
    knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 60, z: 10 }, { x: 100, y: 0, z: 0 }],
    weights: undefined, fitTolerance: undefined, startTangent: undefined,
    endTangent: undefined, fitPoints: undefined,
  },
];
const spline = outsidePlane[5];
assert.equal(spline.kind, "spline");
if (spline.kind !== "spline") throw new Error("fixture de spline ausente");
const planarSpline = { ...spline, controlPoints: spline.controlPoints!.map((point) => ({ ...point, z: 0 })) };
outsidePlane.push(
  { ...planarSpline, startTangent: { x: 1, y: 0, z: 1 } },
  { ...planarSpline, endTangent: { x: 1, y: 0, z: -1 } },
  { ...planarSpline, scenario: 2, controlPoints: undefined, fitPoints: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 1, z: 0 }] },
);
for (const entity of outsidePlane) {
  const report = dwgNeutralDatabaseToCadDocument(database([planarLine, entity]));
  assert.equal(report.importedEntityCount, 1, `${entity.kind}: conserva la línea plana, sin geometría espacial engañosa`);
  const loss = report.document.lossManifest.find((entry) => entry.code === "dwg_nonplanar_entity_excluded");
  assert.ok(loss, `${entity.kind}: exclusión declarada y persistida`);
  assert.equal(loss.sourceType, entity.kind);
  assert.match(loss.detail, /no se importó.*2D/u);
  assert.ok(report.warnings.some((warning) => warning.code === loss.code));
  assert.throws(
    () => dwgNeutralDatabaseToCadDocument(database([entity])),
    /ninguna de sus entidades produjo algo importable/u,
    "un archivo sin contenido representable no responde éxito vacío",
  );
}

// La misma frontera cubre contenido de bloques: no basta filtrar model space.
const inBlock = database([planarLine]);
const reportWithBlock = dwgNeutralDatabaseToCadDocument({
  ...inBlock,
  blocks: [{
    handle: 100, name: [66], blockBeginHandle: 101, blockEndHandle: 102,
    entities: [record(planarLine, 103), record(outsidePlane[2], 104)],
  }],
});
assert.ok(reportWithBlock.document.lossManifest.some((entry) => entry.code === "dwg_nonplanar_entity_excluded"));

// Estos dos contenedores existen incluso en un DWG vacío real del corpus.
// No son dos símbolos útiles que justifiquen un mensaje de importación exitosa.
const spaceContainers = ["*Model_Space", "*Paper_Space", "*Paper_Space0"].map((name, index) => ({
  handle: 200 + index, name: [...name].map((char) => char.charCodeAt(0)),
  blockBeginHandle: undefined, blockEndHandle: undefined, entities: [],
}));
assert.throws(
  () => dwgNeutralDatabaseToCadDocument({ ...database([]), blocks: spaceContainers }),
  /ninguna de sus entidades produjo algo importable/u,
  "los contenedores de espacios vacíos no convierten un archivo vacío en éxito",
);
const withContainers = dwgNeutralDatabaseToCadDocument({ ...database([planarLine]), blocks: spaceContainers });
assert.equal(withContainers.importedEntityCount, 1);
assert.equal(withContainers.importedBlockCount, 0, "no aparecen símbolos falsos en la biblioteca");

const insert: DwgNeutralGeometry = {
  kind: "insert", position: { x: 10, y: 20, z: 0 }, scale: { x: 1, y: 1, z: 1 },
  rotation: 0, extrusion: { x: 0, y: 0, z: 1 }, attributesFollow: false,
};
const emptyAfterExclusion = {
  handle: 300, name: [65], blockBeginHandle: 301, blockEndHandle: 302,
  entities: [record(outsidePlane[0], 303)],
};
const insertA = { ...record(insert, 304), insertedBlockName: [65] };
assert.throws(
  () => dwgNeutralDatabaseToCadDocument({
    ...database([]), blocks: [emptyAfterExclusion], modelSpaceEntities: [insertA],
  }),
  /ninguna de sus entidades produjo algo importable/u,
  "INSERT a bloque vaciado por exclusión espacial no cuenta como geometría importada",
);
const partialBlock = dwgNeutralDatabaseToCadDocument({
  ...database([planarLine]), blocks: [emptyAfterExclusion],
  modelSpaceEntities: [record(planarLine, 305), insertA],
});
assert.equal(partialBlock.importedEntityCount, 1);
assert.equal(partialBlock.importedBlockCount, 0);
assert.ok(partialBlock.document.lossManifest.some((loss) => loss.code === "dwg_unrenderable_insert_excluded"));

// Una cadena de referencias sin geometría, incluida una circular, no basta.
const blockA = { ...emptyAfterExclusion, entities: [{ ...record(insert, 306), insertedBlockName: [66] }] };
const blockB = { ...emptyAfterExclusion, handle: 310, name: [66], entities: [insertA] };
assert.throws(
  () => dwgNeutralDatabaseToCadDocument({ ...database([]), blocks: [blockA, blockB], modelSpaceEntities: [insertA] }),
  /ninguna de sus entidades produjo algo importable/u,
);
const validNested = dwgNeutralDatabaseToCadDocument({
  ...database([]), blocks: [blockA, { ...blockB, entities: [record(planarLine, 311)] }], modelSpaceEntities: [insertA],
});
assert.equal(validNested.importedEntityCount, 1, "una instancia que alcanza geometría real se conserva");
assert.equal(validNested.importedBlockCount, 2, "la cadena válida de definiciones también se conserva");
console.log("dwg-document-bridge-spatial: XY preservado; geometría espacial excluida con aviso persistente; contenedores internos no cuentan como símbolos importados");
