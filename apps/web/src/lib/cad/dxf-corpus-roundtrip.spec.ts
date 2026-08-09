import assert from "node:assert/strict";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";
import {
  cadDocumentDxfExportLosses,
  cadDocumentNativeDxfPrimitives,
  cadDxfPrimitivesToCanonicalEntities,
} from "./dxf-cad-document";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";

/**
 * Corpus de round-trip DXF sobre un documento con VARIOS tipos a la vez.
 *
 * Las pruebas existentes recorrían un tipo cada una. Lo que no cubría ninguna
 * es el documento completo: que al exportar e importar sobrevivan los CONTEOS,
 * los TIPOS, las CAPAS, el cierre, el número de vértices, las coordenadas
 * dentro de tolerancia, los bulges y el ORDEN — y que lo que no sobrevive esté
 * declarado en el manifiesto de pérdidas en vez de desaparecer en silencio.
 *
 * Todos los fixtures se generan aquí: no se incorpora ningún fichero externo.
 */

const TOLERANCE = 1e-6;

type Polyline = Extract<CadEntity, { type: "polyline" }>;

const entities: CadEntity[] = [
  {
    id: "e1-line",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4_000, y: 0, z: 0 },
    layer: "MUROS",
  },
  {
    id: "e2-open",
    type: "polyline",
    vertices: [
      { x: 0, y: 1_000, z: 0 },
      { x: 2_000, y: 1_000, z: 0 },
      { x: 2_000, y: 2_500, z: 0 },
    ],
    closed: false,
    layer: "MUROS",
  },
  {
    id: "e3-closed",
    type: "polyline",
    vertices: [
      { x: 3_000, y: 1_000, z: 0 },
      { x: 5_000, y: 1_000, z: 0 },
      { x: 5_000, y: 3_000, z: 0 },
      { x: 3_000, y: 3_000, z: 0 },
    ],
    closed: true,
    layer: "ZONAS",
  },
  {
    id: "e4-bulge",
    type: "polyline",
    // Arco intermedio y arco de CIERRE: el segundo es el que el vértice
    // duplicado tapaba.
    vertices: [
      { x: 6_000, y: 1_000, z: 0, bulge: 0.75 },
      { x: 8_000, y: 1_000, z: 0 },
      { x: 8_000, y: 2_000, z: 0, bulge: -0.4 },
    ],
    closed: true,
    layer: "ZONAS",
  },
  {
    id: "e5-arc",
    type: "arc",
    center: { x: 1_000, y: 5_000, z: 0 },
    radius: 400,
    startAngle: 30,
    endAngle: 160,
    layer: "DETALLE",
  },
  {
    id: "e6-circle",
    type: "circle",
    center: { x: 3_000, y: 5_000, z: 0 },
    radius: 250,
    layer: "DETALLE",
  },
  {
    id: "e7-ellipse",
    type: "ellipse",
    center: { x: 5_000, y: 5_000, z: 0 },
    majorAxis: { x: 600, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
    layer: "DETALLE",
  },
  {
    id: "e8-elevated",
    type: "line",
    // Degradación DECLARADA: este exportador escribe primitivas 2D.
    start: { x: 0, y: 7_000, z: 320 },
    end: { x: 2_000, y: 7_000, z: 320 },
    layer: "MUROS",
  },
] as CadEntity[];

const document: CadDocument = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [
    { id: "MUROS", name: "MUROS", color: "#ffffff", visible: true, locked: false },
    { id: "ZONAS", name: "ZONAS", color: "#f97316", visible: true, locked: false },
    { id: "DETALLE", name: "DETALLE", color: "#22d3ee", visible: true, locked: false },
  ],
  entities,
  history: [],
  modelSpace: { entityIds: entities.map((entity) => entity.id) },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
} as unknown as CadDocument);

/* ── Ida y vuelta completa ──────────────────────────────────────────────── */

const primitives = cadDocumentNativeDxfPrimitives(document);
assert.equal(
  primitives.length,
  entities.length,
  "cada entidad soportada produce una primitiva",
);

const dxf = exportCadDxf({ primitives }, { units: "mm" }).content;
const reimported = importDxfPrimitives(dxf);
const recovered = cadDxfPrimitivesToCanonicalEntities(reimported.primitives, {
  idPrefix: "rt",
});

/* ── Conteos y tipos ────────────────────────────────────────────────────── */

const countByType = (list: CadEntity[]) =>
  list.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.type] = (acc[entity.type] ?? 0) + 1;
    return acc;
  }, {});

const before = countByType(entities);
const after = countByType(recovered);
assert.equal(
  recovered.length,
  entities.length,
  "ninguna entidad se pierde ni se duplica en el viaje",
);
assert.equal(after.line, before.line, "las líneas vuelven todas");
assert.equal(after.polyline, before.polyline, "las polilíneas vuelven todas");
assert.equal(after.arc, before.arc, "los arcos vuelven todos");
assert.equal(after.circle, before.circle, "los círculos vuelven todos");
assert.equal(after.ellipse, before.ellipse, "las elipses vuelven todas");

/* ── El ORDEN se conserva ───────────────────────────────────────────────── */

assert.deepEqual(
  recovered.map((entity) => entity.type),
  entities.map((entity) => entity.type),
  "el orden de las entidades sobrevive al round-trip",
);

/* ── Capas ──────────────────────────────────────────────────────────────── */

assert.deepEqual(
  recovered.map((entity) => entity.layer),
  entities.map((entity) => entity.layer),
  "cada entidad vuelve a su capa",
);

/* ── Cierre, vértices y coordenadas ─────────────────────────────────────── */

const polylinesBefore = entities.filter(
  (entity): entity is Polyline => entity.type === "polyline",
);
const polylinesAfter = recovered.filter(
  (entity): entity is Polyline => entity.type === "polyline",
);
assert.equal(polylinesAfter.length, polylinesBefore.length);

polylinesBefore.forEach((source, index) => {
  const result = polylinesAfter[index];
  assert.equal(
    result.closed,
    source.closed,
    `${source.id}: el cierre se conserva exactamente`,
  );
  assert.equal(
    result.vertices.length,
    source.vertices.length,
    `${source.id}: sin vértices de más ni de menos`,
  );
  source.vertices.forEach((vertex, position) => {
    const recoveredVertex = result.vertices[position];
    assert.ok(
      Math.abs(recoveredVertex.x - vertex.x) <= TOLERANCE &&
        Math.abs(recoveredVertex.y - vertex.y) <= TOLERANCE,
      `${source.id}: vértice ${position} dentro de tolerancia`,
    );
    assert.equal(
      recoveredVertex.bulge ?? 0,
      vertex.bulge ?? 0,
      `${source.id}: el bulge del vértice ${position} sobrevive`,
    );
  });
});

/* ── Geometría curva dentro de tolerancia ───────────────────────────────── */

{
  const circle = recovered.find((entity) => entity.type === "circle");
  assert.ok(circle && circle.type === "circle");
  if (!circle || circle.type !== "circle") throw new Error("unreachable");
  assert.ok(Math.abs(circle.radius - 250) <= 1e-4, "el radio vuelve exacto");
  assert.ok(
    Math.abs(circle.center.x - 3_000) <= 1e-4 &&
      Math.abs(circle.center.y - 5_000) <= 1e-4,
    "el centro vuelve exacto",
  );

  const arc = recovered.find((entity) => entity.type === "arc");
  assert.ok(arc && arc.type === "arc");
  if (!arc || arc.type !== "arc") throw new Error("unreachable");
  assert.ok(Math.abs(arc.radius - 400) <= 1e-4);
  assert.ok(Math.abs(arc.startAngle - 30) <= 1e-4, "el ángulo inicial vuelve");
  assert.ok(Math.abs(arc.endAngle - 160) <= 1e-4, "el ángulo final vuelve");
}

/* ── Las pérdidas están DECLARADAS, no ocultas ──────────────────────────── */

{
  const losses = cadDocumentDxfExportLosses(document);
  const elevated = losses.filter(
    (loss) => loss.code === "dxf_export_z_flattened",
  );
  assert.equal(
    elevated.length,
    1,
    "la única entidad elevada aparece en el manifiesto",
  );
  assert.equal(elevated[0].entityId, "e8-elevated", "y se identifica por id");
  assert.equal(elevated[0].severity, "warning");

  // Lo aplanado es EXACTAMENTE lo que el manifiesto anunció: la geometría XY
  // vuelve intacta y sólo se pierde la cota.
  const flattened = recovered.find(
    (entity) =>
      entity.type === "line" &&
      Math.abs(entity.start.y - 7_000) <= TOLERANCE,
  );
  assert.ok(flattened && flattened.type === "line");
  if (!flattened || flattened.type !== "line") throw new Error("unreachable");
  assert.equal(flattened.start.z, 0, "la cota se aplanó, como se avisó");
  assert.ok(Math.abs(flattened.start.x - 0) <= TOLERANCE);
  assert.ok(Math.abs(flattened.end.x - 2_000) <= TOLERANCE);

  // Y no se inventa ninguna otra pérdida sobre lo que sí viaja bien.
  assert.equal(
    losses.filter((loss) => loss.severity === "error").length,
    0,
    "ninguna entidad de este corpus se cae del fichero",
  );
}

/* ── El importador reporta lo que NO entiende ───────────────────────────── */

for (const type of ["3DFACE"]) {
  // Entidades deliberadamente fuera del subconjunto implementado.
  const hostile = [
    "0", "SECTION", "2", "ENTITIES",
    "0", type, "8", "MUROS", "10", "0", "20", "0", "30", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  const parsed = importDxfPrimitives(hostile);
  assert.equal(
    parsed.primitives.length,
    0,
    `${type}: no se inventa geometría a partir de lo que no se entiende`,
  );
  assert.ok(
    parsed.warnings.some((warning) => warning.code === "unsupported_entity"),
    `${type}: la entidad no soportada se declara como advertencia`,
  );
}

// POINT dejó de estar en esa lista: el esquema 4 lo importa como entidad de
// pleno derecho. Se fija aquí para que la cobertura quede a la vista y para que
// nadie devuelva este tipo al saco de "no soportado".
{
  const withPoint = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "POINT", "8", "MUROS", "10", "150", "20", "250", "30", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  const parsed = importDxfPrimitives(withPoint);
  assert.equal(parsed.primitives.length, 1, "POINT es una entidad de primera clase");
  assert.equal(parsed.primitives[0].kind, "point");
  assert.deepEqual(parsed.primitives[0].points[0], { x: 150, y: 250 });
  assert.equal(
    parsed.warnings.filter((warning) => warning.code === "unsupported_entity").length,
    0,
    "y por tanto ya no genera advertencia de tipo no soportado",
  );
}

// Un SOLID sin sus cuatro esquinas no define superficie: se descarta en vez de
// inventar un triángulo degenerado.
{
  const partial = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "SOLID", "8", "MUROS", "10", "0", "20", "0", "30", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  assert.equal(
    importDxfPrimitives(partial).primitives.length,
    0,
    "SOLID incompleto: no se inventa geometría",
  );
}

// LÍMITE CONOCIDO, fijado aquí para que no se confunda con cobertura: el aviso
// lo emite el mapeador, así que sólo aparece para tipos que el tokenizador
// subyacente (`dxf-parser`) sí construye. Un 3DSOLID o un LEADER se descartan
// ANTES de llegar al mapeador y no producen advertencia: el importador no
// inventa geometría, pero tampoco declara esa omisión. Cerrar ese hueco exige
// inspeccionar el texto crudo y queda fuera de este alcance.
{
  const dropped = ["0", "SECTION", "2", "ENTITIES", "0", "3DSOLID", "8", "M", "0", "ENDSEC", "0", "EOF"].join("\n");
  const parsed = importDxfPrimitives(dropped);
  assert.equal(parsed.primitives.length, 0, "sigue sin inventarse geometría");
  assert.equal(
    parsed.warnings.length,
    0,
    "hueco declarado: el tokenizador lo descarta antes del mapeador",
  );
}

console.log("dxf-corpus-roundtrip.spec.ts OK");
