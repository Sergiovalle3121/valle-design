import assert from "node:assert/strict";
import { cadDocumentDxfExportLosses } from "./dxf-cad-document";
import { cadEntityToDxfPrimitive, cadOpeningToDxfPrimitives } from "./dxf-entity-primitives";
import { wallJoinedFootprint, wallJoins } from "./wall-joins";
import type { CadDocument, CadEntity } from "./cad-document";

/**
 * La exportación DXF es parcial — eso es legítimo y está declarado. Lo que NO
 * es aceptable es que las pérdidas sean SILENCIOSAS: el usuario debe poder
 * saber, antes de confiar en el fichero, qué se va a degradar o descartar.
 *
 * Esta función es ADITIVA: no cambia el contrato de exportación.
 */

function documentWith(entities: CadEntity[]): CadDocument {
  return {
    entities,
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  } as unknown as CadDocument;
}

const flat: CadEntity = {
  id: "linea-plana",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 0, z: 0 },
  layer: "0",
} as CadEntity;

// --- Geometría 2D limpia no genera ruido ----------------------------------

assert.deepEqual(
  cadDocumentDxfExportLosses(documentWith([flat])),
  [],
  "una línea plana exporta sin pérdidas: no debe inventarse un aviso",
);

// --- Elevación: desde la Ola C (2026-09-02) VIAJA, y sólo se declara lo que no cabe ---

// Una LINE elevada escribe su cota en 30/31 (ver z-frontiers.spec.ts): ya no
// es pérdida. Hasta la Ola C este mismo caso exigía el aviso.
const elevated: CadEntity = {
  id: "linea-elevada",
  type: "line",
  start: { x: 0, y: 0, z: 250 },
  end: { x: 10, y: 0, z: 250 },
  layer: "0",
} as CadEntity;
assert.deepEqual(
  cadDocumentDxfExportLosses(documentWith([elevated])),
  [],
  "una línea elevada viaja con su cota: sin aviso",
);

// Una polilínea alabeada pero RECTA sale como polilínea 3D (bit 8): tampoco.
const elevatedPolyline: CadEntity = {
  id: "pl-elevada",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 90 },
  ],
  closed: false,
  layer: "0",
} as CadEntity;
assert.deepEqual(
  cadDocumentDxfExportLosses(documentWith([elevatedPolyline])),
  [],
  "una polilínea 3D recta viaja entera",
);

// Lo que el formato NO tiene es polilínea 3D con arcos: bulge Y cotas
// distintas se aplana a la cota del primer vértice, y eso sí se declara.
const bulgedSpatial: CadEntity = {
  id: "pl-alabeada-con-arco",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0, bulge: 0.5 },
    { x: 10, y: 0, z: 90 },
  ],
  closed: false,
  layer: "0",
} as CadEntity;
const zLosses = cadDocumentDxfExportLosses(documentWith([bulgedSpatial]));
assert.equal(zLosses.length, 1);
assert.equal(zLosses[0].code, "dxf_export_z_flattened");
assert.equal(zLosses[0].entityId, "pl-alabeada-con-arco");
assert.equal(zLosses[0].severity, "warning");
assert.match(zLosses[0].detail, /90/, "el aviso debe decir QUÉ cota se pierde");
assert.match(zLosses[0].detail, /arcos/, "y por qué: el formato no tiene polilínea 3D con arcos");

// --- Spline racional: los pesos no se exportan ----------------------------

const rational: CadEntity = {
  id: "spline-racional",
  type: "spline",
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 5, y: 10, z: 0 },
    { x: 10, y: 0, z: 0 },
  ],
  degree: 2,
  knots: [0, 0, 0, 1, 1, 1],
  weights: [1, 2.5, 1],
  closed: false,
  layer: "0",
} as CadEntity;

const splineLosses = cadDocumentDxfExportLosses(documentWith([rational]));
assert.ok(
  splineLosses.some((loss) => loss.code === "dxf_export_spline_weights_dropped"),
  "una spline racional debe avisar de que pierde los pesos",
);

// Una spline NO racional (todos los pesos a 1) no cambia de forma: sin aviso.
const nonRational = {
  ...rational,
  id: "spline-no-racional",
  weights: [1, 1, 1],
} as CadEntity;
assert.deepEqual(
  cadDocumentDxfExportLosses(documentWith([nonRational])),
  [],
  "pesos unitarios no alteran la curva: no debe avisarse",
);

// --- Entidades que se descartan por completo ------------------------------

const legacyCircle: CadEntity = {
  id: "circulo-legacy",
  type: "circle",
  center: { x: 0, y: 0, z: 0 },
  radius: 5,
  layer: "0",
  legacy: { kind: "station", rotation: 0 },
} as CadEntity;

const dropped = cadDocumentDxfExportLosses(documentWith([legacyCircle]));
assert.equal(dropped.length, 1);
assert.equal(dropped[0].code, "dxf_export_entity_dropped");
assert.equal(
  dropped[0].severity,
  "error",
  "descartar una entidad entera es más grave que degradarla",
);

// --- Los tipos con camino propio NO se reportan como descartados ----------

for (const type of ["hatch", "mtext", "dimension", "mleader", "insert"]) {
  const entity = { id: `e-${type}`, type, layer: "0" } as unknown as CadEntity;
  assert.deepEqual(
    cadDocumentDxfExportLosses(documentWith([entity])),
    [],
    `${type} tiene su propio camino de exportación: no debe marcarse como descartado`,
  );
}

// --- WALL: la geometría viaja, la receta se declara perdida ---------------

const wall: CadEntity = {
  id: "muro-1",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 3000, y: 0, z: 0 },
  thickness: 150,
  height: 2400,
  layer: "0",
} as CadEntity;

const wallLosses = cadDocumentDxfExportLosses(documentWith([wall]));
assert.equal(wallLosses.length, 1, "el muro degrada, no se cae del fichero");
assert.equal(wallLosses[0].code, "dxf_export_wall_parametric_degraded");
assert.equal(wallLosses[0].severity, "warning", "la geometría viaja: es degradación, no descarte");
assert.match(wallLosses[0].detail, /150/, "el aviso nombra el grosor que deja de ser editable");
assert.match(wallLosses[0].detail, /2400/, "y la altura que no viaja");
assert.doesNotMatch(
  wallLosses[0].detail,
  /material/,
  "sin material declarado, el aviso no inventa una pérdida que no hubo",
);

// Con material declarado, el mismo aviso nombra TAMBIÉN esa pérdida: el DXF
// plano no tiene dónde guardar un acabado que no es ni color ni capa.
const wallWithMaterial: CadEntity = { ...wall, id: "muro-2", material: "brick" } as CadEntity;
const wallWithMaterialLosses = cadDocumentDxfExportLosses(documentWith([wallWithMaterial]));
assert.equal(wallWithMaterialLosses.length, 1);
assert.equal(wallWithMaterialLosses[0].code, "dxf_export_wall_parametric_degraded");
assert.match(
  wallWithMaterialLosses[0].detail,
  /material "brick"/,
  "con material declarado, el mismo aviso YA existente nombra también esa pérdida",
);

// Y su primitiva ES el contorno que el usuario ve: polilínea cerrada de 4 puntos.
const wallPrimitive = cadEntityToDxfPrimitive(wall);
assert.ok(wallPrimitive && wallPrimitive.kind === "polyline");
assert.equal(wallPrimitive.closed, true);
assert.equal(wallPrimitive.points.length, 4);

// Un muro DEGENERADO no produce contorno: se cae del fichero y lo dice a
// gritos, no entre degradaciones.
const brokenWall = { ...wall, id: "muro-roto", thickness: 0 } as CadEntity;
const brokenLosses = cadDocumentDxfExportLosses(documentWith([brokenWall]));
assert.equal(brokenLosses.length, 1);
assert.equal(brokenLosses[0].code, "dxf_export_entity_dropped");
assert.equal(brokenLosses[0].severity, "error");

// --- El informe respeta el MISMO filtro que la exportación ----------------
//
// Si divergieran, se avisaría de pérdidas en entidades que no viajan al
// fichero, y ese ruido erosiona la confianza en el aviso.

// La entidad con pérdida es la polilínea alabeada con arco: la LINE elevada
// ya viaja entera (Ola C) y no cuenta.
const mixed = documentWith([bulgedSpatial, elevated, flat]);

assert.equal(
  cadDocumentDxfExportLosses(mixed).length,
  1,
  "sin filtro se evalúa todo el documento",
);

assert.deepEqual(
  cadDocumentDxfExportLosses(mixed, (entity) => entity.id === "linea-plana"),
  [],
  "si la entidad con pérdida queda fuera del ámbito exportado, no debe avisarse",
);

assert.equal(
  cadDocumentDxfExportLosses(mixed, (entity) => entity.id === "pl-alabeada-con-arco")
    .length,
  1,
  "si la entidad con pérdida SÍ se exporta, el aviso debe aparecer",
);

// --- T-34: la esquina exportada es la del INGLETE, no la aislada ----------

const cornerA: CadEntity = {
  id: "muro-esquina-a",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 1000, y: 0, z: 0 },
  thickness: 250,
  height: 2400,
  layer: "0",
} as CadEntity;
const cornerB: CadEntity = {
  id: "muro-esquina-b",
  type: "wall",
  start: { x: 1000, y: 0, z: 0 },
  end: { x: 1000, y: 1000, z: 0 },
  thickness: 250,
  height: 2400,
  layer: "0",
} as CadEntity;
const cornerDocument = documentWith([cornerA, cornerB]);

const isolatedFootprint = cadEntityToDxfPrimitive(cornerA)!;
const joinedFootprint = cadEntityToDxfPrimitive(cornerA, cornerDocument)!;
assert.notDeepEqual(
  joinedFootprint.points,
  isolatedFootprint.points,
  "T-34: con un vecino en la esquina, el contorno exportado NO puede ser el aislado",
);
// Y coincide EXACTAMENTE con lo que ve el usuario en pantalla: el mismo
// cálculo que usa `opening-entity-adapter.ts` para las jambas de un hueco.
const wallCornerA = cornerA as Extract<CadEntity, { type: "wall" }>;
const wallCornerB = cornerB as Extract<CadEntity, { type: "wall" }>;
const expectedCorner = wallJoinedFootprint(wallCornerA, wallJoins(wallCornerA, [wallCornerB]));
assert.deepEqual(joinedFootprint.points, expectedCorner, "el contorno exportado ES el inglete real");

// --- T-34: OPENING deja de salir sin puertas ni ventanas ------------------

const openingHostWall: CadEntity = {
  id: "muro-con-hueco",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 3000, y: 0, z: 0 },
  thickness: 200,
  height: 2400,
  layer: "0",
} as CadEntity;
const door: CadEntity = {
  id: "puerta-1",
  type: "opening",
  kind: "door",
  hostId: "muro-con-hueco",
  position: 1500,
  width: 900,
  height: 2100,
  sill: 0,
  swing: "left",
  hinge: "start",
  layer: "0",
} as CadEntity;

const openingLosses = cadDocumentDxfExportLosses(documentWith([openingHostWall, door]));
assert.deepEqual(
  openingLosses.filter((loss) => loss.entityId === "puerta-1"),
  [],
  "una puerta con anfitrión válido y sin bloque propio exporta sin pérdidas",
);

const doorPrimitives = cadOpeningToDxfPrimitives(
  door as Extract<CadEntity, { type: "opening" }>,
  documentWith([openingHostWall, door]),
);
assert.ok(doorPrimitives.length >= 3, "T-34: la puerta produce jambas + hoja + arco, no cero trazos");
assert.ok(
  doorPrimitives.every((primitive) => primitive.kind === "polyline" && primitive.layer === "0"),
  "todas las primitivas viajan en la capa del hueco",
);

// Con bloque propio: las jambas siguen viajando, pero se declara que el
// símbolo sale de fábrica en vez del bloque del estudio.
const doorWithBlock = { ...door, id: "puerta-2", symbolBlock: "PUERTA-DESPACHO" } as CadEntity;
const blockLosses = cadDocumentDxfExportLosses(
  documentWith([openingHostWall, doorWithBlock]),
).filter((loss) => loss.entityId === "puerta-2");
assert.equal(blockLosses.length, 1);
assert.equal(blockLosses[0].code, "dxf_export_opening_symbol_block_degraded");
assert.match(blockLosses[0].detail, /PUERTA-DESPACHO/);

// Sin anfitrión (hostId roto): cero primitivas, declarado como pérdida de
// geometría — nunca un marcador inventado en el origen.
const orphanDoor = { ...door, id: "puerta-huerfana", hostId: "no-existe" } as CadEntity;
const orphanPrimitives = cadOpeningToDxfPrimitives(
  orphanDoor as Extract<CadEntity, { type: "opening" }>,
  documentWith([openingHostWall, orphanDoor]),
);
assert.deepEqual(orphanPrimitives, []);
const orphanLosses = cadDocumentDxfExportLosses(
  documentWith([openingHostWall, orphanDoor]),
).filter((loss) => loss.entityId === "puerta-huerfana");
assert.equal(orphanLosses.length, 1);
assert.equal(orphanLosses[0].code, "dxf_export_entity_dropped");
assert.equal(orphanLosses[0].severity, "error");

console.log("dxf-export-losses.spec.ts OK");
