/**
 * GeoJSON leído a la forma del shapefile (Ola G, 2026-09-02).
 *
 *   - Las cuatro geometrías que un dibujo recibe entran con sus partes: un
 *     polígono con patio son DOS anillos (`parts` [0, 5]) en un rasgo, como
 *     en el shapefile; un MultiPolygon, tantos anillos como traiga.
 *   - Un rasgo sin geometría entra NULO con su fila, para que la fila 3 siga
 *     siendo de la geometría 3.
 *   - Las propiedades hacen la tabla: la unión de claves, el tipo por el
 *     valor, lo anidado como su JSON.
 *   - Lo que no es GeoJSON se rechaza con su código: no JSON, sin "type",
 *     GeometryCollection, geometría desconocida, coordenada que no es número.
 *   - `readGeoDataset` lo reconoce por sus BYTES y lo entrega como shapefile
 *     en WGS 84 con su tabla.
 */
import { strict as assert } from "node:assert";
import { GeoError } from "./errors";
import { looksLikeGeoJson, readGeoJson } from "./geojson";
import { detectGeoFormat, readGeoDataset } from "./index";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const rejects = (fn: () => unknown, code: string, what: string) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GeoError, `${what}: el error no es un GeoError sino ${error}`);
    assert.equal((error as GeoError).code, code, `${what}: código inesperado (${(error as GeoError).message})`);
    checks += 1;
    return;
  }
  assert.fail(`${what}: no falló, y debía fallar cerrado`);
};

/* ── La forma ───────────────────────────────────────────────────────────── */
const collection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-103.35, 20.6714, 1540] }, properties: { CLAVE: "P-1", ALTURA: 1540 } },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-103.35, 20.67], [-103.35, 20.68], [-103.34, 20.68], [-103.34, 20.67], [-103.35, 20.67]], [[-103.348, 20.672], [-103.342, 20.672], [-103.342, 20.678], [-103.348, 20.678], [-103.348, 20.672]]] },
      properties: { CLAVE: "L-7", USO: "Habitacional", SUPERFICIE: 1234.5, ACTIVO: true, EXTRA: { nivel: 2 } },
    },
    { type: "Feature", geometry: null, properties: { CLAVE: "sin-geometría" } },
    { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[[[0, 0], [0, 1], [1, 1], [0, 0]]], [[[2, 2], [2, 3], [3, 3], [2, 2]]]] }, properties: null },
    { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: {} },
  ],
};
{
  const read = readGeoJson(JSON.stringify(collection), "predio.geojson");
  const { shapefile, attributes } = read;
  eq(shapefile.crs?.id, "EPSG:4326", "un GeoJSON está SIEMPRE en WGS 84 (RFC 7946)");
  eq(shapefile.shapes.length, 5, "cinco rasgos, cinco geometrías (la nula incluida)");
  eq(shapefile.kind, "point", "el tipo del conjunto es el del primer rasgo dibujable");
  eq(shapefile.shapes[0].vertices[0], { x: -103.35, y: 20.6714, z: 1540 }, "el punto conserva su cota");
  eq(shapefile.shapes[1].parts, [0, 5], "el polígono con patio: dos anillos en un rasgo");
  eq(shapefile.shapes[1].vertices.length, 10, "con sus diez vértices (cierre repetido incluido, como el shapefile)");
  eq(shapefile.shapes[2].kind, "null", "el rasgo sin geometría entra nulo…");
  eq(read.skipped, ["Rasgo 3: sin geometría."], "…y se dice cuál");
  eq(shapefile.shapes[3].parts, [0, 4], "el MultiPolygon: un anillo por polígono");
  eq(shapefile.vertexCount, 1 + 10 + 8 + 2, "los vértices contados");
  ok(shapefile.measuredBounds.minX === -103.35 && shapefile.measuredBounds.maxX === 3, "el envolvente medido sobre todos los rasgos");
  eq(attributes.records.length, 5, "una fila por rasgo, la nula incluida");
  eq(attributes.records[1], { CLAVE: "L-7", USO: "Habitacional", SUPERFICIE: 1234.5, ACTIVO: true, EXTRA: '{"nivel":2}' }, "la fila plana: lo anidado como su JSON");
  eq(attributes.records[3], {}, "properties null es una fila vacía");
  eq(attributes.fields.map((field) => `${field.name}:${field.type}`), ["CLAVE:C", "ALTURA:N", "USO:C", "SUPERFICIE:F", "ACTIVO:L", "EXTRA:C"], "los campos: unión de claves, tipo por el valor");
  ok(attributes.encodingDeclared && attributes.encoding === "utf-8", "UTF-8 declarado por la especificación");
}
{
  const single = readGeoJson(JSON.stringify({ type: "Feature", geometry: { type: "MultiPoint", coordinates: [[1, 2], [3, 4]] }, properties: { n: 1 } }));
  eq(single.shapefile.kind, "multipoint", "un Feature suelto");
  eq(single.shapefile.shapes[0].vertices.length, 2, "con sus dos puntos");
  const bare = readGeoJson(JSON.stringify({ type: "MultiLineString", coordinates: [[[0, 0], [1, 0]], [[0, 1], [1, 1]]] }));
  eq(bare.shapefile.shapes[0].parts, [0, 2], "una geometría suelta es un rasgo sin propiedades, con sus tramos");
  eq(bare.attributes.fields, [], "y sin campos");
}

/* ── Los rechazos ───────────────────────────────────────────────────────── */
rejects(() => readGeoJson("no es json", "x"), "variante-no-soportada", "texto que no es JSON");
rejects(() => readGeoJson("[1,2,3]", "x"), "variante-no-soportada", "JSON sin \"type\"");
rejects(() => readGeoJson('{"type":"FeatureCollection"}', "x"), "variante-no-soportada", "FeatureCollection sin features");
rejects(() => readGeoJson('{"type":"Topology"}', "x"), "variante-no-soportada", "un tipo que no es GeoJSON");
rejects(() => readGeoJson(JSON.stringify({ type: "GeometryCollection", geometries: [] }), "x"), "variante-no-soportada", "GeometryCollection");
rejects(() => readGeoJson(JSON.stringify({ type: "Feature", geometry: { type: "Hexagon", coordinates: [] } }), "x"), "variante-no-soportada", "geometría desconocida");
rejects(() => readGeoJson(JSON.stringify({ type: "Point", coordinates: ["a", 1] }), "x"), "coordenada-invalida", "coordenada que no es número");
rejects(() => readGeoJson(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: null }] }), "x"), "geometria-invalida", "ningún rasgo dibujable");

/* ── El reconocimiento ──────────────────────────────────────────────────── */
ok(looksLikeGeoJson('  {"type": "FeatureCollection", "features": []}'), "parece GeoJSON con espacio delante");
ok(!looksLikeGeoJson('{"kind":"valle-geo-bundle","files":[]}'), "un sobre de archivos no parece GeoJSON");
ok(!looksLikeGeoJson("0\nSECTION"), "un DXF no parece GeoJSON");
{
  const bytes = new TextEncoder().encode(JSON.stringify(collection));
  eq(detectGeoFormat(bytes), "geojson", "los bytes se reconocen como GeoJSON");
  const dataset = readGeoDataset({ bytes, name: "predio.geojson" });
  ok(dataset.kind === "shapefile" && dataset.shapefile.crs?.id === "EPSG:4326" && dataset.attributes?.records.length === 5, "readGeoDataset lo entrega como shapefile en WGS 84 con su tabla");
  rejects(() => readGeoDataset({ bytes: new Uint8Array([0x7b, 0x22, 0x74, 0x79, 0x70, 0x65, 0x22, 0x3a, 0xff, 0xfe]), name: "roto.geojson" }), "variante-no-soportada", "bytes que no son UTF-8 ni ningún formato");
}

console.log(`geojson: ${checks} comprobaciones · FeatureCollection de 5 rasgos (punto con cota, polígono con patio, nulo, MultiPolygon, línea) a la forma del shapefile en WGS 84; 8 rechazos con código`);
