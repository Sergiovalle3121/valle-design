/**
 * MAPIMPORT: el conjunto GIS dentro del plano, con las cuatro situaciones
 * decididas y dichas (Ola G, 2026-09-02).
 *
 *   A. Dibujo georreferenciado en 14N + shapefile 14N con .prj y .dbf: el
 *      predio cae en su sitio (E 660 010 → x = 10 000 mm) con su clave
 *      catastral en metadatos. Un GeoJSON en WGS 84 se REPROYECTA al sistema
 *      del dibujo: el punto cuya lat/lon es la del marcador cae en (0, 0) a
 *      menos de 1 mm.
 *   B. Dibujo georreferenciado + shapefile sin .prj: se rechaza diciéndolo.
 *   C. Dibujo sin georreferencia + GeoJSON: se proyecta a la zona 13N de su
 *      centro, se coloca al kilómetro redondo y el dibujo QUEDA
 *      georreferenciado con el marcador en (0, 0).
 *   D. Ni uno ni otro: al origen local, con el aviso de siempre.
 *
 * El sobre de archivos va y vuelve por base64 al byte; el comando pide los
 * archivos por `geo-file`, enseña el plan y sólo escribe al confirmar.
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { buildDbfBytes, buildShapefileBytes } from "../../../geo/fixtures";
import { geoUtmCrs } from "../../../geo/crs";
import { cadGeoreferenceMarker } from "../../georeference";
import { decodeCadGeoBundle, encodeCadGeoBundle, cadGeoBundleName, isCadGeoBundle } from "../../geo-import-bundle";
import { planCadGeoImport } from "../../geo-import-plan";
import { shapefileToCadEntities } from "../../geo-cad-document";
import { readGeoDataset } from "../../../geo";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/* ── Los nombres ────────────────────────────────────────────────────────── */
{
  const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
  eq(resolveCadCommandAlias("importargis", known), "MAPIMPORT", "IMPORTARGIS → MAPIMPORT");
}

/* ── Los archivos de prueba ─────────────────────────────────────────────── */
const PRJ_UTM14_WGS84 =
  'PROJCS["WGS_1984_UTM_Zone_14N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",-99.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
// Un predio de 40 × 30 m en 14N, anillo horario como manda ESRI.
const predio = buildShapefileBytes(5, [
  { parts: [0], points: [{ x: 660_010, y: 2_140_010 }, { x: 660_010, y: 2_140_040 }, { x: 660_050, y: 2_140_040 }, { x: 660_050, y: 2_140_010 }, { x: 660_010, y: 2_140_010 }] },
]);
const tabla = buildDbfBytes(
  [{ name: "CLAVE", type: "C", length: 12 }, { name: "USO", type: "C", length: 10 }],
  [["14-039-001", "HABITACION"]],
);
const encoder = new TextEncoder();
const files = [
  { name: "Predio.shp", bytes: predio.shp },
  { name: "Predio.shx", bytes: predio.shx },
  { name: "Predio.dbf", bytes: tabla },
  { name: "Predio.prj", bytes: encoder.encode(PRJ_UTM14_WGS84) },
  { name: "Predio.cpg", bytes: encoder.encode("UTF-8") },
];

/* ── El sobre ───────────────────────────────────────────────────────────── */
const bundle = encodeCadGeoBundle(files);
{
  ok(isCadGeoBundle(bundle), "el sobre se reconoce por su marca");
  const opened = decodeCadGeoBundle(bundle)!;
  eq(opened.map((file) => file.name), files.map((file) => file.name), "los cinco nombres");
  ok(opened.every((file, index) => Buffer.compare(Buffer.from(file.bytes), Buffer.from(files[index].bytes)) === 0), "los bytes vuelven al byte");
  eq(decodeCadGeoBundle('{"type":"FeatureCollection"}'), null, "un GeoJSON no es un sobre");
  assert.throws(() => decodeCadGeoBundle('{"kind":"valle-geo-bundle","files":[{"name":1}]}'), /malformado/, "un sobre roto lanza");
  checks += 1;
  eq(cadGeoBundleName(files), "Predio.shp (+4 archivo(s))", "el nombre del sobre: el principal y cuántos van con él");
  eq(cadGeoBundleName([{ name: "x.geojson", bytes: new Uint8Array() }]), "x.geojson", "un GeoJSON solo");
}

/* ── El contexto ────────────────────────────────────────────────────────── */
const marker14 = cadGeoreferenceMarker("geo-marker", { x: 0, y: 0 }, geoUtmCrs(14), 660_000, 2_140_000) as CadEntity;
const baseLayer: CadLayerDef = { id: "0", name: "0", color: "#ffffff", visible: true, locked: false };
function makeContext(entities: CadEntity[] = [], layers: CadLayerDef[] = [baseLayer], unit = "mm"): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "0",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `m${++ids}`,
    layers: () => layers,
    blocks: () => [],
    document: () => ({ meta: { version: 1, schema: 9, unit }, entities, layers, blocks: [], styles: { text: {}, dimension: {}, table: {}, plot: {} }, externalReferences: [], modelSpace: { entityIds: entities.map((entity) => entity.id) }, unsupportedEntities: [], lossManifest: [] }) as never,
  };
}
const planWith = (context: CadCommandContext, list = files) => planCadGeoImport({ files: list, unit: context.unit, newEntityId: context.newEntityId, document: context.document?.() });

/* ── A. Dibujo georreferenciado, shapefile con .prj ─────────────────────── */
{
  const plan = planWith(makeContext([marker14], [baseLayer, { id: "GEO", name: "GEO", color: "#22c55e", visible: true, locked: false }]));
  assert.ok(plan.ok, `debía planificar: ${plan.ok ? "" : plan.reason}`);
  eq(plan.georeference, "kept", "se usa la georreferencia del dibujo");
  eq(plan.layer, "PREDIO", "la capa por el nombre del archivo, en mayúsculas");
  eq(plan.commands.map((command) => command.type), ["layer", "insert"], "la capa nueva y la polilínea; sin marcador, que ya hay");
  const polyline = plan.commands[1].type === "insert" ? plan.commands[1].entity : null;
  assert.ok(polyline && polyline.type === "polyline");
  eq(polyline.closed, true, "cerrada");
  eq(polyline.vertices, [{ x: 10_000, y: 10_000, z: 0 }, { x: 10_000, y: 40_000, z: 0 }, { x: 50_000, y: 40_000, z: 0 }, { x: 50_000, y: 10_000, z: 0 }], "E 660 010 N 2 140 010 es (10 000, 10 000) mm: cae en su sitio, sin el cierre repetido");
  eq(polyline.context?.metadata, { CLAVE: "14-039-001", USO: "HABITACION" }, "la fila del .dbf en metadatos");
  eq(plan.lines[0], "«Predio.shp»: 1 entidad(es) → capa PREDIO", "el plan a la vista");
  ok(plan.lines.some((line) => line.includes("2 atributo(s) por entidad en metadatos: CLAVE, USO")), "dice los atributos");
  eq(plan.notice, "MAPIMPORT: 1 entidad(es) de «Predio.shp» en la capa PREDIO (EPSG:32614); colocadas con la georreferencia del dibujo.", "el aviso");
  ok(!plan.losses.some((loss) => loss.severity !== "info"), `sin avisos: .prj, .shx, .dbf y .cpg presentes (${plan.losses.filter((loss) => loss.severity !== "info").map((loss) => loss.code).join(", ")})`);

  // El GeoJSON en grados cae en el mismo sitio: la lat/lon del marcador es (0, 0).
  const geojson = encoder.encode(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-97.4767578161503, 19.347653408755342] }, properties: { NOMBRE: "mojonera" } }] }));
  const reprojected = planWith(makeContext([marker14]), [{ name: "mojonera.geojson", bytes: geojson }]);
  assert.ok(reprojected.ok, `debía planificar: ${reprojected.ok ? "" : reprojected.reason}`);
  const inserted = reprojected.commands.find((command) => command.type === "insert");
  assert.ok(inserted && inserted.type === "insert" && inserted.entity.type === "point");
  ok(near(inserted.entity.position.x, 0, 1) && near(inserted.entity.position.y, 0, 1), `la mojonera cae en (0, 0) a menos de 1 mm: (${inserted.entity.position.x}, ${inserted.entity.position.y})`);
  ok(reprojected.losses.some((loss) => loss.code === "geo_reprojected"), "y la reproyección queda declarada");
  ok(reprojected.notice.includes("reproyectadas desde WGS 84 geográfico (EPSG:4326)"), `el aviso dice de dónde: ${reprojected.notice}`);
}

/* ── B. Dibujo georreferenciado, shapefile sin .prj ─────────────────────── */
{
  const plan = planWith(makeContext([marker14]), files.filter((file) => !file.name.endsWith(".prj")));
  ok(!plan.ok && plan.reason.includes("no trae .prj: no se sabe en qué sistema está, y colocarlo sería adivinar"), `se rechaza diciéndolo: ${plan.ok ? "" : plan.reason}`);
}

/* ── C. Dibujo sin georreferencia, GeoJSON de Guadalajara ───────────────── */
{
  const geojson = encoder.encode(JSON.stringify({ type: "Feature", geometry: { type: "Point", coordinates: [-103.35, 20.6714] }, properties: { NOMBRE: "catedral" } }));
  const plan = planWith(makeContext(), [{ name: "catedral.geojson", bytes: geojson }]);
  assert.ok(plan.ok, `debía planificar: ${plan.ok ? "" : plan.reason}`);
  eq(plan.georeference, "created", "el dibujo queda georreferenciado");
  eq(plan.crs?.id, "EPSG:32613", "en la zona 13N, la de su centro");
  eq(plan.commands.map((command) => command.type), ["layer", "insert", "layer", "insert"], "capa CATEDRAL, el punto, capa GEO y el marcador");
  const point = plan.commands[1].type === "insert" ? plan.commands[1].entity : null;
  assert.ok(point && point.type === "point");
  ok(near(point.position.x, 873_004.27, 1) && near(point.position.y, 655_064.0, 1), `E 671 873,00 N 2 286 655,06 menos el kilómetro redondo, en mm: (${point.position.x}, ${point.position.y})`);
  const marker = plan.commands[3].type === "insert" ? plan.commands[3].entity : null;
  assert.ok(marker && marker.type === "point");
  eq(marker.context?.metadata, { geo: "marker", crs: "EPSG:32613", east: 671_000, north: 2_286_000 }, "el marcador en (0, 0) dice el origen local");
  eq(marker.position, { x: 0, y: 0, z: 0 }, "en (0, 0)");
  ok(plan.notice.endsWith("el dibujo queda georreferenciado en WGS 84 / UTM zona 13N con el marcador en la capa GEO."), plan.notice);
}

/* ── D. Sin georreferencia ni .prj ──────────────────────────────────────── */
{
  const plan = planWith(makeContext(), files.filter((file) => !file.name.endsWith(".prj")));
  assert.ok(plan.ok, `debía planificar: ${plan.ok ? "" : plan.reason}`);
  eq(plan.georeference, "none", "sin sistema, sin marcador");
  ok(plan.losses.some((loss) => loss.code === "geo_crs_missing"), "con el aviso de que falta el .prj");
  ok(plan.lines.some((line) => line.startsWith("  · aviso: El conjunto llegó sin archivo .prj")), "y el aviso a la vista antes de confirmar");
  ok(plan.notice.endsWith("sin .prj, al origen local y sin georreferencia."), plan.notice);
  const empty = planWith(makeContext(), [{ name: "nota.txt", bytes: encoder.encode("hola") }]);
  ok(!empty.ok && empty.reason.includes("no hay ningún .shp ni .geojson"), "sin archivo principal, se dice");
}

/* ── La tabla que no cuadra ─────────────────────────────────────────────── */
{
  const dataset = readGeoDataset({ bytes: predio.shp, name: "Predio.shp" });
  assert.ok(dataset.kind === "shapefile");
  const twoRows = buildDbfBytes([{ name: "CLAVE", type: "C", length: 4 }], [["A"], ["B"]]);
  const converted = shapefileToCadEntities(dataset.shapefile, {
    attributes: { fields: [{ name: "CLAVE", type: "C", length: 4, decimals: 0 }], records: [{ CLAVE: "A" }, { CLAVE: "B" }], declaredRecordCount: 2, deletedCount: 0, encoding: "utf-8", encodingDeclared: true },
    attributesAsMetadata: true,
  });
  ok(twoRows.byteLength > 0 && converted.entities[0].context === undefined, "dos filas para una geometría: nadie hereda los atributos de otro");
  ok(converted.losses.some((loss) => loss.code === "geo_attributes_unaligned"), "y se declara");
}

/* ── El comando ─────────────────────────────────────────────────────────── */
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const enter: CadCommandInput = { kind: "enter" };
function drive(inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("MAPIMPORT")!;
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts };
}
{
  const asked = drive([keyword("Archivo")]);
  ok(asked.prompts[0].startsWith("Elige los archivos del conjunto"), asked.prompts[0]);
  ok(asked.result?.kind === "ui" && asked.result.request.target === "geo-file", "Archivo pide los archivos por el canal de interfaz geo-file");

  const context = makeContext([marker14]);
  const confirmed = drive([text(bundle), enter], context);
  ok(confirmed.prompts[1].startsWith("«Predio.shp»: 1 entidad(es) → capa PREDIO") && confirmed.prompts[1].endsWith("¿Importar?"), `el plan a la vista antes de escribir: ${confirmed.prompts[1]}`);
  assert.ok(confirmed.result?.kind === "document", `Intro confirma: ${confirmed.result?.kind}`);
  eq(confirmed.result.label, "MAPIMPORT (1 entidades)", "la etiqueta de deshacer");
  eq(confirmed.result.commands.length, 2, "las mismas dos órdenes del plan");
  ok(confirmed.result.notice?.startsWith("MAPIMPORT: 1 entidad(es) de «Predio.shp»") === true, "con su aviso");

  const declined = drive([text(bundle), keyword("No")], context);
  ok(declined.result?.kind === "message" && declined.result.text === "MAPIMPORT cancelado. El dibujo no ha cambiado.", "No cancela sin tocar el dibujo");
  const pasted = drive([text('{"type":"Feature","geometry":{"type":"Point","coordinates":[-103.35,20.6714]},"properties":{}}')]);
  ok(pasted.prompts[1].includes("→ capa PEGADO"), `un GeoJSON pegado se planifica igual: ${pasted.prompts[1]}`);
  const garbage = drive([text("0\nSECTION")]);
  ok(garbage.result?.kind === "message" && garbage.result.text.includes("lo pegado no es un GeoJSON"), "lo que no es GeoJSON ni sobre se dice");
  const broken = drive([text(encodeCadGeoBundle([{ name: "roto.shp", bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) }]))]);
  ok(broken.result?.kind === "message" && broken.result.text.startsWith("MAPIMPORT: "), `un archivo roto termina en mensaje, no en excepción: ${broken.result?.kind === "message" ? broken.result.text : ""}`);
}

console.log(`map-import: ${checks} comprobaciones · A: predio 14N en su sitio (E 660 010 → 10 000 mm) con CLAVE en metadatos y GeoJSON reproyectado a < 1 mm; B: sin .prj rechazado; C: Guadalajara → 13N con marcador; D: origen local con aviso`);
