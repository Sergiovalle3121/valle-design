/**
 * GEOGRAPHICLOCATION y la georreferencia como marcador (Ola G, 2026-09-02).
 *
 *   - Un punto del dibujo + su Este/Norte UTM 14N producen UN lote: la capa
 *     GEO, el marcador POINT con la receta en metadatos. Nada más cambia.
 *   - `Geográfica`: latitud y longitud de Guadalajara se guardan como el
 *     este/norte de la zona 13N (E 671 873,00 N 2 286 655,06, contra la spec
 *     de crs.ts), porque un grado no es una unidad de dibujo.
 *   - Volver a georreferenciar borra el marcador anterior; `Informe` lee sin
 *     escribir; la zona 17 se rechaza con su motivo; el datum ITRF92 cambia
 *     el identificador.
 *   - ID, en un dibujo georreferenciado, añade el este/norte y la latitud y
 *     longitud del punto (1 000 mm al este y al norte del marcador son 1 m).
 *   - La lectura es tolerante con lo que no es marcador: un POINT sin
 *     metadatos o con un sistema desconocido no georreferencia nada.
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { resolveCadCommandAlias } from "../alias-table";
import { cadFormatLatLon, cadGeoreferenceGeographic, cadGeoreferenceMarker, cadGeoreferenceOf, cadGeoreferencePlacement, cadGeoreferenceWorld } from "../../georeference";
import { geoUtmCrs } from "../../../geo/crs";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

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
  for (const alias of ["GEO", "geolocation", "MAPCSASSIGN", "georreferenciar"]) eq(resolveCadCommandAlias(alias, known), "GEOGRAPHICLOCATION", `${alias} → GEOGRAPHICLOCATION`);
}

/* ── El contexto ────────────────────────────────────────────────────────── */
function makeContext(entities: CadEntity[] = [], layers: CadLayerDef[] = [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }], unit = "mm"): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "0",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `g${++ids}`,
    layers: () => layers,
    blocks: () => [],
    document: () => ({ meta: { version: 1, schema: 9, unit }, entities, layers, blocks: [], styles: { text: {}, dimension: {}, table: {}, plot: {} }, externalReferences: [], modelSpace: { entityIds: entities.map((entity) => entity.id) }, unsupportedEntities: [], lossManifest: [] }) as never,
  };
}
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

function drive(name: string, inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name)!;
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    prompts.push(step.prompt.message);
  }
  return { step, result: step.result, prompts };
}
function messageOf(driven: ReturnType<typeof drive>): string {
  assert.ok(driven.result?.kind === "message", `debía terminar con mensaje, dio ${driven.result?.kind}`);
  checks += 1;
  return driven.result!.kind === "message" ? driven.result!.text : "";
}

/* ── UTM 14N tecleado ───────────────────────────────────────────────────── */
const marker: CadEntity[] = [];
{
  const driven = drive("GEOGRAPHICLOCATION", [point(0, 0), distance(660_000), distance(2_140_000)]);
  ok(driven.prompts[0].startsWith("WGS84 / UTM zona 14N. Precise el punto del dibujo"), `el prompt dice la receta por omisión: ${driven.prompts[0]}`);
  eq(driven.prompts[1], "Precise el Este UTM de ese punto en metros", "tras el punto, el este");
  eq(driven.prompts[2], "Precise el Norte UTM en metros", "luego el norte");
  const result = driven.result;
  assert.ok(result && result.kind === "document", `debía escribir, dio ${result?.kind}`);
  eq(result.label, "GEOGRAPHICLOCATION", "la etiqueta de deshacer");
  eq(result.commands.length, 2, "dos órdenes: la capa y el marcador");
  eq(result.commands[0], { type: "layer", op: "upsert", layer: { id: "GEO", name: "GEO", color: "#22c55e", visible: true, locked: false } }, "la capa GEO porque no existía");
  const inserted = result.commands[1];
  assert.ok(inserted.type === "insert" && inserted.entity.type === "point");
  eq(inserted.entity.layer, "GEO", "el marcador en GEO");
  eq(inserted.entity.context?.metadata, { geo: "marker", crs: "EPSG:32614", east: 660_000, north: 2_140_000 }, "la receta en metadatos, que el formato ya tiene");
  eq(result.notice, "GEOGRAPHICLOCATION: el punto (0, 0) es E 660000.00 N 2140000.00 en WGS 84 / UTM zona 14N (EPSG:32614); 19.3477° N, 97.4768° O. El marcador está en la capa GEO.", "la orden dice el sistema y la latitud y longitud");
  marker.push(inserted.entity as CadEntity);
}

/* ── La lectura y las cuentas ───────────────────────────────────────────── */
{
  const georeference = cadGeoreferenceOf({ entities: marker, meta: { unit: "mm" } })!;
  ok(georeference !== null && georeference.crs.id === "EPSG:32614" && georeference.markerId === "g1", "el marcador se lee");
  eq(cadGeoreferencePlacement(georeference, "mm"), { originX: 660_000, originY: 2_140_000, unitScale: 1000, unit: "mm" }, "la colocación: origen en el este/norte del marcador, 1 000 mm por metro");
  eq(cadGeoreferenceWorld(georeference, { x: 1000, y: 1000 }, "mm"), { x: 660_001, y: 2_140_001 }, "1 000 mm al este y al norte son 1 m");
  const geographic = cadGeoreferenceGeographic(georeference, { x: 1000, y: 1000 }, "mm");
  ok(near(geographic.latitudeDeg, 19.347662363, 1e-8) && near(geographic.longitudeDeg, -97.476748215, 1e-8), `la latitud y longitud por crs.ts: ${geographic.latitudeDeg}, ${geographic.longitudeDeg}`);
  eq(cadFormatLatLon(19.3476624, -97.4767482), "19.3477° N, 97.4767° O", "el formato de plano");
  eq(cadFormatLatLon(-33.45, 151.2), "33.4500° S, 151.2000° E", "hemisferio sur y este");
  eq(cadGeoreferencePlacement(georeference, "m").unitScale, 1, "en metros, 1 unidad por metro");
  const bogus: CadEntity[] = [
    { id: "p1", type: "point", position: { x: 0, y: 0, z: 0 }, layer: "0" },
    { id: "p2", type: "point", position: { x: 0, y: 0, z: 0 }, layer: "GEO", context: { metadata: { geo: "marker", crs: "EPSG:99999", east: 1, north: 2 } } },
    { id: "p3", type: "point", position: { x: 0, y: 0, z: 0 }, layer: "GEO", context: { metadata: { geo: "marker", crs: "EPSG:32614", east: "1", north: 2 } } },
  ];
  eq(cadGeoreferenceOf({ entities: bogus }), null, "un POINT sin receta, con sistema desconocido o con el este en texto no georreferencia nada");
  eq(cadGeoreferenceOf({ entities: [...bogus, cadGeoreferenceMarker("m", { x: 5, y: 6 }, geoUtmCrs(12), 400_000, 3_000_000) ] })?.anchor, { x: 5, y: 6 }, "el primer marcador válido manda");
}

/* ── ID en un dibujo georreferenciado ───────────────────────────────────── */
{
  const driven = drive("ID", [point(1000, 1000)], makeContext(marker));
  const result = driven.result;
  assert.ok(result && result.kind === "variables", `ID informa por variables, dio ${result?.kind}`);
  ok((result.text ?? "").includes("E 660,001.00 N 2,140,001.00 · 19.3477° N, 97.4767° O (WGS 84 / UTM zona 14N, EPSG:32614)"), `ID dice el este/norte y la latitud y longitud: ${result.text}`);
  const plain = drive("ID", [point(1000, 1000)], makeContext([]));
  ok(plain.result?.kind === "variables" && !(plain.result.text ?? "").includes("EPSG"), "sin marcador, ID no inventa coordenadas del mundo");
}

/* ── Volver a georreferenciar, Informe, Geográfica, Zona, Datum ─────────── */
{
  const again = drive("GEOGRAPHICLOCATION", [point(500, 500), distance(660_010), distance(2_140_010)], makeContext(marker, [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }, { id: "GEO", name: "GEO", color: "#22c55e", visible: true, locked: false }]));
  assert.ok(again.result?.kind === "document");
  eq(again.result.commands.map((command) => command.type), ["delete", "insert"], "con GEO ya en el dibujo: fuera el marcador viejo, dentro el nuevo, sin tocar la capa");
  ok(again.result.commands[0].type === "delete" && again.result.commands[0].entityId === "g1", "el que se borra es el marcador anterior");

  const report = messageOf(drive("GEOGRAPHICLOCATION", [keyword("Informe")], makeContext(marker)));
  ok(report.startsWith("El dibujo está georreferenciado: el punto (0, 0) es E 660,000.00 N 2,140,000.00"), `Informe lee sin escribir: ${report}`);
  ok(messageOf(drive("GEOGRAPHICLOCATION", [enter])).startsWith("El dibujo no está georreferenciado"), "Intro sin punto en un dibujo sin marcador lo dice");

  const geographic = drive("GEOGRAPHICLOCATION", [keyword("Geográfica"), point(0, 0), distance(20.6714), distance(-103.35)]);
  ok(geographic.prompts[1].startsWith("WGS 84 geográfico (latitud y longitud). Precise el punto"), `Geográfica cambia la receta: ${geographic.prompts[1]}`);
  eq(geographic.prompts[2], "Precise la latitud de ese punto en grados (negativa al sur)", "pide la latitud");
  assert.ok(geographic.result?.kind === "document");
  const geoMarker = geographic.result.commands[1];
  assert.ok(geoMarker.type === "insert");
  const metadata = geoMarker.entity.context?.metadata ?? {};
  eq(metadata.crs, "EPSG:32613", "Guadalajara cae en la zona 13N, que es la que se guarda");
  ok(near(Number(metadata.east), 671_873.0043, 1e-3) && near(Number(metadata.north), 2_286_655.064, 1e-3), `el este/norte de crs.spec.ts: ${metadata.east}, ${metadata.north}`);
  ok(messageOf(drive("GEOGRAPHICLOCATION", [keyword("Geográfica"), point(0, 0), distance(95), distance(0)])).includes("la latitud va de −90 a 90"), "una latitud imposible se rechaza");

  const zone = drive("GEOGRAPHICLOCATION", [keyword("Zona"), distance(17)]);
  ok(messageOf(zone).includes("la zona 17 no es de las verificadas (11, 12, 13, 14, 15, 16)"), "la zona 17 se rechaza con su motivo");
  const zone12 = drive("GEOGRAPHICLOCATION", [keyword("Zona"), distance(12), keyword("Datum"), keyword("ITRF92"), point(0, 0), distance(400_000), distance(3_000_000)]);
  eq(zone12.prompts[1], "Precise la zona UTM (11 a 16)", "Zona pregunta el número");
  ok(zone12.prompts[3].startsWith("Indique el datum"), "Datum pregunta el marco");
  ok(zone12.prompts[4].startsWith("ITRF92 / UTM zona 12N."), `la receta refleja zona y datum: ${zone12.prompts[4]}`);
  assert.ok(zone12.result?.kind === "document" && zone12.result.commands[1].type === "insert");
  eq(zone12.result.commands[1].entity.context?.metadata?.crs, "ITRF92/UTM12N", "el identificador lleva el marco cuando no es WGS84");
  ok(messageOf(drive("GEOGRAPHICLOCATION", [point(0, 0), enter])) === "GEOGRAPHICLOCATION necesita la coordenada del punto.", "sin coordenada, se dice");
}

console.log(`geo-location: ${checks} comprobaciones · marcador POINT en GEO con {geo, crs, east, north}; (0,0) = E 660000 N 2140000 → 19.3477° N, 97.4768° O; Guadalajara por Geográfica → EPSG:32613 E 671873.00; ID con este/norte y lat/lon`);
