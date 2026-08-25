import assert from "node:assert/strict";
import { cadDocumentDxfExportLosses } from "./dxf-cad-document";
import { cadEntityToDxfPrimitive } from "./dxf-entity-primitives";
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

// --- Elevación aplanada ---------------------------------------------------

const elevated: CadEntity = {
  id: "linea-elevada",
  type: "line",
  start: { x: 0, y: 0, z: 250 },
  end: { x: 10, y: 0, z: 250 },
  layer: "0",
} as CadEntity;

const zLosses = cadDocumentDxfExportLosses(documentWith([elevated]));
assert.equal(zLosses.length, 1);
assert.equal(zLosses[0].code, "dxf_export_z_flattened");
assert.equal(zLosses[0].entityId, "linea-elevada");
assert.equal(zLosses[0].severity, "warning");
assert.match(zLosses[0].detail, /250/, "el aviso debe decir QUÉ cota se pierde");

// La elevación también se detecta en los vértices de una polilínea.
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
assert.equal(
  cadDocumentDxfExportLosses(documentWith([elevatedPolyline]))[0]?.code,
  "dxf_export_z_flattened",
  "la elevación de un vértice de polilínea también cuenta",
);

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

const mixed = documentWith([elevated, flat]);

assert.equal(
  cadDocumentDxfExportLosses(mixed).length,
  1,
  "sin filtro se evalúa todo el documento",
);

assert.deepEqual(
  cadDocumentDxfExportLosses(mixed, (entity) => entity.id === "linea-plana"),
  [],
  "si la entidad elevada queda fuera del ámbito exportado, no debe avisarse",
);

assert.equal(
  cadDocumentDxfExportLosses(mixed, (entity) => entity.id === "linea-elevada")
    .length,
  1,
  "si la entidad elevada SÍ se exporta, el aviso debe aparecer",
);

console.log("dxf-export-losses.spec.ts OK");
