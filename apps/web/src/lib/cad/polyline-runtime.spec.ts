import assert from "node:assert/strict";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import type { CadEntity } from "./cad-document";

type Polyline = Extract<CadEntity, { type: "polyline" }>;

function polyline(partial: Partial<Polyline> = {}): Polyline {
  return {
    id: "pl-1",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 50, z: 0 },
    ],
    closed: false,
    layer: "0",
    ...partial,
  } as Polyline;
}

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperaba ${expected}, recibí ${actual}`,
  );

// --- POLYLINE es una entidad nativa de primera clase -----------------------

assert.equal(
  CAD_ENTITY_REGISTRY.supports(polyline()),
  true,
  "POLYLINE debe ser nativa: si no, persiste en el documento pero el editor no la ve",
);

const adapter = CAD_ENTITY_REGISTRY.adapter(polyline());
assert.equal(adapter.type, "polyline");

// --- Render ---------------------------------------------------------------

const openPaths = adapter.renderer.paths(polyline());
assert.equal(openPaths.length, 1);
assert.equal(openPaths[0].closed, false);
assert.equal(openPaths[0].points.length, 3, "sin bulge no se teselan arcos");

const closedPaths = adapter.renderer.paths(polyline({ closed: true }));
assert.equal(closedPaths[0].closed, true);

assert.deepEqual(
  adapter.renderer.paths(polyline({ vertices: [] })),
  [],
  "una polilínea vacía no produce paths",
);

// --- Bulge: convención DXF (bulge = tan(θ/4), positivo = antihorario) ------

// Semicírculo: de (0,0) a (100,0) con bulge 1 => θ = π, radio 50.
const semicircle = polyline({
  vertices: [
    { x: 0, y: 0, z: 0, bulge: 1 },
    { x: 100, y: 0, z: 0 },
  ],
});
const semicircleBounds = adapter.bounds.bounds(semicircle);
near(semicircleBounds.minX, 0, 1e-6);
near(semicircleBounds.maxX, 100, 1e-6);
// Bulge positivo = antihorario: para una cuerda hacia +x el arco cae por debajo.
near(semicircleBounds.minY, -50, 1e-6);
near(semicircleBounds.maxY, 0, 1e-6);

// Bulge negativo refleja el arco al otro lado de la cuerda.
const mirrored = polyline({
  vertices: [
    { x: 0, y: 0, z: 0, bulge: -1 },
    { x: 100, y: 0, z: 0 },
  ],
});
const mirroredBounds = adapter.bounds.bounds(mirrored);
near(mirroredBounds.minY, 0, 1e-6);
near(mirroredBounds.maxY, 50, 1e-6);

// El arco teselado empieza y termina EXACTAMENTE en sus vértices.
const arcPoints = adapter.renderer.paths(semicircle, 64)[0].points;
near(arcPoints[0].x, 0);
near(arcPoints[0].y, 0);
near(arcPoints[arcPoints.length - 1].x, 100);
near(arcPoints[arcPoints.length - 1].y, 0);
assert.ok(arcPoints.length > 8, "un semicírculo debe teselarse, no ser una cuerda");
// Todo punto teselado está sobre el círculo de centro (50,0) y radio 50.
for (const point of arcPoints) {
  near(Math.hypot(point.x - 50, point.y - 0), 50, 1e-6);
}

// Bounds EXACTOS: los vértices por sí solos no bastan cuando hay bulge.
assert.ok(
  semicircleBounds.minY < -49.99,
  "los bounds deben incluir el punto extremo del arco, no sólo los vértices",
);

// --- Hit testing ----------------------------------------------------------

assert.equal(
  adapter.hitTester.hitTest(polyline(), { x: 50, y: 0 }, 1),
  true,
  "un punto sobre el primer segmento debe impactar",
);
assert.equal(
  adapter.hitTester.hitTest(polyline(), { x: 50, y: 40 }, 1),
  false,
  "un punto lejos de la polilínea no debe impactar",
);
assert.equal(
  adapter.hitTester.hitTest(semicircle, { x: 50, y: -50 }, 1),
  true,
  "el punto extremo del arco pertenece a la polilínea",
);

assert.equal(
  adapter.hitTester.intersectsWindow(
    polyline(),
    { minX: -10, minY: -10, maxX: 200, maxY: 200 },
    false,
  ),
  true,
  "ventana que contiene la polilínea",
);
assert.equal(
  adapter.hitTester.intersectsWindow(
    polyline(),
    { minX: -10, minY: -10, maxX: 50, maxY: 50 },
    false,
  ),
  false,
  "una ventana parcial NO contiene la polilínea",
);
assert.equal(
  adapter.hitTester.intersectsWindow(
    polyline(),
    { minX: -10, minY: -10, maxX: 50, maxY: 50 },
    true,
  ),
  true,
  "en modo crossing la ventana parcial sí la cruza",
);

// --- Grips por vértice ----------------------------------------------------

const grips = adapter.grips.grips(polyline());
assert.equal(grips.length, 3, "un grip por vértice");
assert.deepEqual(grips[1].point, { x: 100, y: 0 });

const moved = adapter.grips.moveGrip(polyline(), "vertex:1", { x: 120, y: 30 });
assert.deepEqual(
  moved.vertices.map((vertex) => [vertex.x, vertex.y]),
  [
    [0, 0],
    [120, 30],
    [100, 50],
  ],
);
assert.equal(
  adapter.grips.moveGrip(polyline(), "vertex:99", { x: 1, y: 1 }).vertices.length,
  3,
  "un grip inexistente no debe corromper la entidad",
);

// Mover un grip preserva el bulge de ese vértice.
const movedArc = adapter.grips.moveGrip(semicircle, "vertex:0", { x: 10, y: 10 });
assert.equal(movedArc.vertices[0].bulge, 1);

// --- Snaps ----------------------------------------------------------------

const snaps = adapter.snaps.snaps(polyline());
assert.ok(
  snaps.some((snap) => snap.kind === "endpoint" && snap.point.x === 100 && snap.point.y === 0),
  "endpoint por vértice",
);
assert.ok(
  snaps.some((snap) => snap.point.x === 50 && snap.point.y === 0),
  "punto medio de un segmento recto",
);

const arcSnaps = adapter.snaps.snaps(semicircle);
const center = arcSnaps.find((snap) => snap.kind === "center");
assert.ok(center, "un segmento con bulge expone el centro del arco");
near(center.point.x, 50);
near(center.point.y, 0);

// --- Propiedades ----------------------------------------------------------

const properties = adapter.properties.read(polyline({ closed: true }));
assert.equal(properties.vertexCount, 3);
assert.equal(properties.segmentCount, 3, "cerrada => 3 segmentos");
assert.equal(properties.arcSegments, 0);
assert.equal(properties.closed, true);

assert.equal(adapter.properties.read(semicircle).arcSegments, 1);
assert.equal(adapter.properties.read(polyline()).segmentCount, 2, "abierta => 2 segmentos");

const reopened = adapter.properties.write(polyline({ closed: true }), {
  closed: false,
  layer: "MUROS",
});
assert.equal(reopened.closed, false);
assert.equal(reopened.layer, "MUROS");

// --- Transformaciones -----------------------------------------------------

const translated = adapter.commands.transform(polyline(), {
  translation: { x: 10, y: 20 },
});
assert.deepEqual(
  translated.vertices.map((vertex) => [vertex.x, vertex.y]),
  [
    [10, 20],
    [110, 20],
    [110, 70],
  ],
);

// El bulge sobrevive a rotación y escala uniforme (es tan(θ/4): θ no cambia).
const rotated = adapter.commands.transform(semicircle, { rotationDeg: 90 });
assert.equal(rotated.vertices[0].bulge, 1);
const scaled = adapter.commands.transform(semicircle, { scale: 2 });
assert.equal(scaled.vertices[0].bulge, 1);
near(scaled.vertices[1].x, 200);
// Escalar x2 duplica el radio del arco.
const scaledBounds = adapter.bounds.bounds(scaled);
near(scaledBounds.minY, -100, 1e-6);

console.log("polyline-runtime.spec.ts OK");
