import { strict as assert } from "node:assert";
import DxfParser from "dxf-parser";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { importDxfPrimitives } from "../dxf-import";
import { cadDxfPrimitivesToCanonicalEntities } from "../dxf-cad-document";
import { cadDocumentDxfExportLosses } from "../dxf-export-loss-manifest";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";

/**
 * 1.5 — LA COTA CRUZA TODAS LAS FRONTERAS DEL DXF (Ola C, 2026-09-02).
 *
 * ─── Por qué existe esta suite ─────────────────────────────────────────────
 *
 * Medido antes de la ola: `pushPoint` escribía `30 = "0"` fijo, la LINE
 * escribía `31 = "0"`, `pt()` tiraba la z que `dxf-parser` sí leía y
 * `point3()` ponía `z: 0` al entrar al documento. Cuatro fronteras, cuatro
 * puntos donde la cota moría en silencio: un pilar de tres metros salía del
 * fichero como una LINE de longitud CERO, y el comando LINE —declarado
 * `spatial`— guardaba en el documento una cota que ningún DXF conservaba.
 *
 * Esta suite deja UNA prueba de ida y vuelta en cada frontera con el mismo
 * número, **3000** (un pilar de tres metros en milímetros): grande, entero y
 * distinto de cualquier coordenada del plano, para que una cota que se
 * confunda con x o y se note.
 *
 * ─── Oráculos ──────────────────────────────────────────────────────────────
 *
 *  1. `dxf-parser`, lector de TERCEROS: no conoce las convenciones del
 *     producto. Si él lee la z, la leerá cualquiera.
 *  2. Aritmética en papel: la longitud del pilar es 3000 por Pitágoras con
 *     dos catetos nulos; un SCU reflejado (extrusión (0,0,−1)) tiene el eje
 *     X del OCS en (−1,0,0) por el algoritmo del eje arbitrario de DXF, así
 *     que (100, 50) del OCS es (−100, 50) del mundo, y un arco de 0° a 90°
 *     en ese plano va de 90° a 180° en el mundo.
 *
 * Fronteras cubiertas, una por bloque:
 *
 *   1. LINE: 30/31 de ida y vuelta, y la longitud del pilar
 *   2. CIRCLE y ARC: la z del centro (planta elevada)
 *   3. POLYLINE elevada: cabecera 30 + VERTEX, con su bulge
 *   4. POLYLINE 3D: bit 8 del 70 y VERTEX 70 = 32, sin bulge
 *   5. ELLIPSE y SPLINE: centro y puntos de control WCS
 *   6. Proyección con escala: la z se escala con el plano
 *   7. SCU reflejado al importar: vuelve al mundo sin aviso
 *   8. Lo que NO cabe se declara: arcos con cotas distintas, plano inclinado
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/** EL número de esta suite. */
const Z = 3000;

function document(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "ESTRUCTURA", name: "ESTRUCTURA", color: "#000000", visible: true, locked: false },
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities,
    history: [{ version: 1, label: "z-frontiers" }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

// Las entidades del lector de terceros no tienen tipo publicado: se leen tal cual.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
/** Lee con la biblioteca de TERCEROS: es el oráculo, no el producto. */
function readIndependently(dxf: string): Raw[] {
  const parsed = new DxfParser().parseSync(dxf) as { entities?: Raw[] } | null;
  assert.ok(parsed, "el lector independiente devolvió un documento");
  return parsed!.entities ?? [];
}

/** Exporta, lee con el oráculo y reimporta con el producto. */
function roundTrip(entities: CadEntity[]) {
  const dxf = exportCadDocumentDxf(document(entities)).content;
  const imported = importDxfPrimitives(dxf);
  const native = cadDxfPrimitivesToCanonicalEntities(imported.primitives);
  return { dxf, foreign: readIndependently(dxf), imported, native };
}

/* ── 1. LINE: el pilar ────────────────────────────────────────────────────── */
{
  const pilar = {
    id: "pilar",
    type: "line",
    layer: "ESTRUCTURA",
    start: { x: 100, y: 50, z: 0 },
    end: { x: 100, y: 50, z: Z },
  } as CadEntity;
  const { dxf, foreign, imported, native } = roundTrip([pilar]);
  ok(/\n31\n3000\n/.test(dxf), "el extremo del pilar escribe su cota en el código 31");
  const line = foreign.find((entity) => entity.type === "LINE")!;
  ok(near(line.vertices[1].z, Z), `el lector independiente lee z = ${Z} en el segundo vértice`);
  ok(near(line.vertices[0].z ?? 0, 0), "y z = 0 en el primero");
  ok(imported.primitives[0]?.points[1]?.z === Z, "la primitiva reimportada conserva la cota");
  const back = native[0];
  ok(back?.type === "line", "vuelve como LINE");
  if (back?.type === "line") {
    ok(near(back.end.z, Z), "la entidad canónica tiene la cota del extremo");
    const length = Math.hypot(back.end.x - back.start.x, back.end.y - back.start.y, back.end.z - back.start.z);
    ok(near(length, Z), `el pilar mide ${Z} (antes de la ola: 0)`);
  }
  ok(
    !imported.warnings.some((warning) => warning.code === "flattened_to_ground"),
    "y no hay aviso de aplanado: la cota viajó",
  );
}

/* ── 2. CIRCLE y ARC en planta elevada ────────────────────────────────────── */
{
  const circle = { id: "c", type: "circle", layer: "0", center: { x: 400, y: 300, z: Z }, radius: 250 } as CadEntity;
  const arc = {
    id: "a",
    type: "arc",
    layer: "0",
    center: { x: 900, y: 300, z: Z },
    radius: 250,
    startAngle: 37.5,
    endAngle: 120,
  } as CadEntity;
  const { foreign, native } = roundTrip([circle, arc]);
  ok(near(foreign.find((entity) => entity.type === "CIRCLE")!.center.z, Z), "CIRCLE: el oráculo lee la z del centro");
  const rawArc = foreign.find((entity) => entity.type === "ARC")!;
  ok(near(rawArc.center.z, Z), "ARC: el oráculo lee la z del centro");
  const backCircle = native.find((entity) => entity.type === "circle");
  const backArc = native.find((entity) => entity.type === "arc");
  ok(backCircle?.type === "circle" && near(backCircle.center.z, Z), "CIRCLE: la cota vuelve al documento");
  ok(backArc?.type === "arc" && near(backArc.center.z, Z), "ARC: la cota vuelve al documento");
  ok(backArc?.type === "arc" && near(backArc.startAngle, 37.5) && near(backArc.endAngle, 120), "ARC: los ángulos no se tocan");
}

/* ── 3. POLYLINE elevada (RECTANG con Elevación), con bulge ───────────────── */
{
  const elevated = {
    id: "pl",
    type: "polyline",
    layer: "0",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: Z, bulge: 0.25 },
      { x: 1000, y: 0, z: Z },
      { x: 1000, y: 600, z: Z },
      { x: 0, y: 600, z: Z },
    ],
  } as CadEntity;
  const { dxf, foreign, native } = roundTrip([elevated]);
  ok(/\n0\nPOLYLINE\n[\s\S]*?\n30\n3000\n70\n1\n/.test(dxf), "la cabecera lleva la elevación en 30 y, justo detrás, 70 = 1 (cerrada, 2D)");
  const raw = foreign.find((entity) => entity.type === "POLYLINE")!;
  ok(raw.is3dPolyline === false, "el oráculo la ve como polilínea 2D");
  ok(raw.vertices.every((vertex: Raw) => near(vertex.z, Z)), "y cada VERTEX lleva la elevación");
  ok(near(raw.vertices[0].bulge, 0.25), "el bulge sobrevive en una polilínea elevada");
  const back = native[0];
  ok(back?.type === "polyline" && back.closed === true, "vuelve cerrada");
  if (back?.type === "polyline") {
    ok(back.vertices.every((vertex) => near(vertex.z, Z)), "con la cota en cada vértice");
    ok(near(back.vertices[0].bulge ?? 0, 0.25), "y el arco intacto");
  }
}

/* ── 4. POLYLINE 3D: cotas distintas, sin bulge ───────────────────────────── */
{
  const spatial = {
    id: "3d",
    type: "polyline",
    layer: "0",
    closed: false,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1000, y: 0, z: 1500 },
      { x: 1000, y: 1000, z: Z },
    ],
  } as CadEntity;
  const { dxf, foreign, native } = roundTrip([spatial]);
  ok(/\n70\n8\n/.test(dxf), "70 lleva el bit 8: polilínea 3D");
  ok((dxf.match(/\n70\n32\n/g) ?? []).length === 3, "cada VERTEX lleva 70 = 32");
  const raw = foreign.find((entity) => entity.type === "POLYLINE")!;
  ok(raw.is3dPolyline === true, "el oráculo la reconoce como polilínea 3D");
  ok(near(raw.vertices[1].z, 1500) && near(raw.vertices[2].z, Z), "y lee la cota de cada vértice");
  const back = native[0];
  ok(back?.type === "polyline" && back.closed === false, "vuelve abierta");
  if (back?.type === "polyline")
    ok(
      near(back.vertices[0].z, 0) && near(back.vertices[1].z, 1500) && near(back.vertices[2].z, Z),
      "con las tres cotas distintas",
    );
}

/* ── 5. ELLIPSE y SPLINE ──────────────────────────────────────────────────── */
{
  const ellipse = {
    id: "e",
    type: "ellipse",
    layer: "0",
    center: { x: 500, y: 500, z: Z },
    majorAxis: { x: 300, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
  } as CadEntity;
  const spline = {
    id: "s",
    type: "spline",
    layer: "0",
    degree: 2,
    controlPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 500, y: 800, z: Z },
      { x: 1000, y: 0, z: 0 },
    ],
    knots: [0, 0, 0, 1, 1, 1],
  } as CadEntity;
  const { foreign, native } = roundTrip([ellipse, spline]);
  ok(near(foreign.find((entity) => entity.type === "ELLIPSE")!.center.z, Z), "ELLIPSE: el oráculo lee la z del centro");
  ok(near(foreign.find((entity) => entity.type === "SPLINE")!.controlPoints[1].z, Z), "SPLINE: el oráculo lee la z del control");
  const backEllipse = native.find((entity) => entity.type === "ellipse");
  const backSpline = native.find((entity) => entity.type === "spline");
  ok(backEllipse?.type === "ellipse" && near(backEllipse.center.z, Z), "ELLIPSE: la cota vuelve");
  ok(backSpline?.type === "spline" && near(backSpline.controlPoints[1].z, Z), "SPLINE: la cota vuelve");
}

/* ── 6. Proyección con escala: la z se escala con el plano ────────────────── */
{
  const imported = importDxfPrimitives(exportCadDocumentDxf(document([
    { id: "pilar", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: Z } } as CadEntity,
  ])).content);
  // Un fichero en milímetros abierto en un editor en metros: 0.001 en el plano
  // y, por tanto, 0.001 en la cota. Escalar el plano y dejar la z en
  // milímetros habría dado un pilar mil veces más alto que ancho el dibujo.
  const metres = cadDxfPrimitivesToCanonicalEntities(imported.primitives, {
    projection: { point: (point) => ({ x: point.x * 0.001, y: point.y * 0.001 }) },
  });
  ok(metres[0]?.type === "line" && near(metres[0].end.z, 3), "3000 mm son 3 m también en z");
}

/* ── 7. SCU reflejado al importar ─────────────────────────────────────────── */
{
  const reflected = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "CIRCLE", "8", "MUROS", "10", "100", "20", "50", "30", "0", "40", "25", "210", "0", "220", "0", "230", "-1",
    "0", "ARC", "8", "MUROS", "10", "100", "20", "50", "30", "0", "40", "25", "50", "0", "51", "90", "210", "0", "220", "0", "230", "-1",
    "0", "LWPOLYLINE", "8", "CUBIERTA", "90", "2", "70", "0", "38", "3000", "10", "0", "20", "0", "10", "1000", "20", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  const imported = importDxfPrimitives(reflected);
  ok(
    !imported.warnings.some((warning) => warning.code === "flattened_to_ground"),
    "ni el reflejo ni la elevación del 38 son ya pérdidas declaradas",
  );
  const native = cadDxfPrimitivesToCanonicalEntities(imported.primitives);
  const circle = native.find((entity) => entity.type === "circle");
  ok(circle?.type === "circle" && near(circle.center.x, -100) && near(circle.center.y, 50), "CIRCLE reflejado: (100, 50) del OCS es (−100, 50) del mundo");
  const arc = native.find((entity) => entity.type === "arc");
  ok(arc?.type === "arc" && near(arc.startAngle, 90) && near(arc.endAngle, 180), "ARC reflejado: 0°→90° pasa a 90°→180°");
  const polyline = native.find((entity) => entity.type === "polyline");
  ok(polyline?.type === "polyline" && polyline.vertices.every((vertex) => near(vertex.z, Z)), "LWPOLYLINE con 38: la elevación va a cada vértice");
}

/* ── 8. Lo que NO cabe se declara ─────────────────────────────────────────── */
{
  const withArc = {
    id: "alabeada",
    type: "polyline",
    layer: "0",
    closed: false,
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 0.5 },
      { x: 1000, y: 0, z: Z },
    ],
  } as CadEntity;
  const losses = cadDocumentDxfExportLosses(document([withArc]));
  ok(losses.some((loss) => loss.code === "dxf_export_z_flattened"), "arcos con cotas distintas: pérdida declarada al exportar");
  const { foreign } = roundTrip([withArc]);
  const raw = foreign.find((entity) => entity.type === "POLYLINE")!;
  ok(raw.is3dPolyline === false && near(raw.vertices[0].bulge, 0.5), "y el fichero conserva el arco a la cota del primer vértice");
  ok(
    cadDocumentDxfExportLosses(document([
      { id: "p", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: Z } } as CadEntity,
    ])).length === 0,
    "una LINE con cota ya no figura en el manifiesto de pérdidas",
  );
  const tilted = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "CIRCLE", "8", "MUROS", "10", "100", "20", "50", "30", "0", "40", "25", "210", "1", "220", "0", "230", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  ok(
    importDxfPrimitives(tilted).warnings.some((warning) => warning.code === "flattened_to_ground"),
    "un plano INCLINADO (normal (1,0,0)) sigue declarándose: es «todavía no», no silencio",
  );
}

console.log(`cad verification z-frontiers: ${checks} comprobaciones sobre la cota`);
