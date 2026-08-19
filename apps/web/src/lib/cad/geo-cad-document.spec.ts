/**
 * El predio entra en el dibujo: del shapefile a las entidades canónicas.
 *
 * Esta spec es la que convierte `lib/geo` en una capacidad del producto y no en
 * un lector suelto: recorre el mismo camino que recorre un arquitecto —elige el
 * `.shp`, el `.dbf` y el `.prj`, y aparece el terreno en el plano— pero por el
 * lado de Node, sin navegador.
 *
 * Lo que se fija:
 *
 *   1. Que el polígono llega con sus MEDIDAS: 40 × 25 m en un documento en
 *      milímetros son 40 000 × 25 000 unidades, las mismas que mediría un muro
 *      dibujado a mano. Si esto se equivoca, el predio y el proyecto conviven en
 *      escalas distintas y nadie lo ve hasta acotar.
 *   2. Que el traslado al origen local se DECLARA con sus dos números, y que
 *      con ellos se vuelve al terreno exactamente.
 *   3. Que el vértice repetido con el que el formato cierra un anillo NO llega
 *      al dibujo: la polilínea canónica se cierra con su bandera, y dejar el
 *      vértice metería un tramo de longitud cero.
 *   4. Que la falta del `.prj` es un AVISO explícito y no un silencio.
 *   5. Que el fallo cerrado del lector atraviesa la importación entera en vez
 *      de degradarse a «importado con avisos».
 */
import { strict as assert } from "node:assert";
import { importDocumentBytes, importLimitForFileName, validateImportFile } from "./document-import";
import { CAD_GEO_DEFAULT_LAYER, shapefileToCadEntities } from "./geo-cad-document";
import { buildDbfBytes, buildShapefileBytes } from "../geo/fixtures";
import { geoUnplace, readShapefile } from "../geo";

// Predio de 40 × 25 m con patio de 10 × 5 m, en UTM 14N sobre Guadalajara.
const LOT = [
  { x: 660_000, y: 2_140_000 },
  { x: 660_000, y: 2_140_025 },
  { x: 660_040, y: 2_140_025 },
  { x: 660_040, y: 2_140_000 },
  { x: 660_000, y: 2_140_000 },
];
const COURTYARD = [
  { x: 660_010, y: 2_140_005 },
  { x: 660_020, y: 2_140_005 },
  { x: 660_020, y: 2_140_010 },
  { x: 660_010, y: 2_140_010 },
  { x: 660_010, y: 2_140_005 },
];
const parcel = buildShapefileBytes(5, [{ parts: [0, 5], points: [...LOT, ...COURTYARD] }]);
const PRJ_UTM14 =
  'PROJCS["WGS_1984_UTM_Zone_14N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0]],' +
  'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],' +
  'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-99.0],' +
  'PARAMETER["Scale_Factor",0.9996],UNIT["Meter",1.0]]';

// ---------------------------------------------------------------------------
// La conversión, con sus medidas
// ---------------------------------------------------------------------------

const shapefile = readShapefile({ shp: parcel.shp, shx: parcel.shx, prj: PRJ_UTM14 });
const converted = shapefileToCadEntities(shapefile, { layer: "predio-039.shp", unit: "mm" });

assert.equal(converted.entities.length, 2, "el contorno y el patio son dos polilíneas");
const [outer, hole] = converted.entities;
assert.equal(outer.type, "polyline", "el contorno es una polilínea");
if (outer.type !== "polyline" || hole.type !== "polyline") throw new Error("tipo");

// El vértice repetido del formato NO llega al dibujo: la polilínea se cierra
// con su bandera y un tramo de longitud cero ensuciaría OSNAP y el perímetro.
assert.equal(outer.vertices.length, 4, "cuatro vértices, no cinco");
assert.ok(outer.closed, "y cerrada por bandera");
assert.equal(hole.vertices.length, 4, "el patio, igual");

// Las medidas: 40 m son 40 000 unidades de un documento en milímetros, las
// mismas que mediría un muro de 40 m dibujado a mano en el mismo plano.
const xs = outer.vertices.map((vertex) => vertex.x);
const ys = outer.vertices.map((vertex) => vertex.y);
assert.equal(Math.max(...xs) - Math.min(...xs), 40_000, "el predio mide 40 m de frente");
assert.equal(Math.max(...ys) - Math.min(...ys), 25_000, "y 25 m de fondo");
assert.equal(Math.min(...xs), 0, "y arranca pegado al origen local");

// La vuelta al terreno, con los números que el manifiesto publica.
const back = geoUnplace(outer.vertices[2].x, outer.vertices[2].y, converted.placement);
assert.equal(back.x, 660_040, "el este vuelve exacto");
assert.equal(back.y, 2_140_025, "y el norte también");

assert.equal(outer.layer, "PREDIO-039", "la capa sale del nombre del archivo, saneado");
assert.equal(
  shapefileToCadEntities(shapefile, {}).entities[0].layer,
  CAD_GEO_DEFAULT_LAYER,
  "sin nombre utilizable se cae en la capa por omisión",
);

// ---------------------------------------------------------------------------
// El manifiesto declara TODO lo que se le hizo a la geometría
// ---------------------------------------------------------------------------

const codes = converted.losses.map((entry) => entry.code);
assert.ok(codes.includes("geo_local_origin"), "el traslado se declara");
assert.ok(codes.includes("geo_unit_scale"), "la escala también");
assert.ok(codes.includes("geo_crs_declared"), "y el sistema de referencia");
const origin = converted.losses.find((entry) => entry.code === "geo_local_origin")!;
assert.ok(origin.detail.includes("660000"), "con el número del este, para poder deshacerlo");
assert.ok(origin.detail.includes("2140000"), "y el del norte");
const crs = converted.losses.find((entry) => entry.code === "geo_crs_declared")!;
assert.ok(crs.detail.includes("EPSG:32614"), "el sistema, por su código");
assert.ok(crs.detail.includes("NO se han reproyectado"), "y que nadie reproyectó nada por su cuenta");

// Sin `.prj` la geometría entra igual y la falta es un AVISO, no un silencio:
// un predio sin sistema de referencia no se puede combinar con otro.
const anonymous = shapefileToCadEntities(readShapefile({ shp: parcel.shp }), {});
const missing = anonymous.losses.find((entry) => entry.code === "geo_crs_missing");
assert.ok(missing, "la falta del .prj se declara");
assert.equal(missing?.severity, "warning", "y como aviso, no como nota informativa");
assert.ok(missing!.detail.includes("Pide el .prj"), "diciendo qué hacer");

// ---------------------------------------------------------------------------
// La importación completa, por el mismo camino que el producto
// ---------------------------------------------------------------------------

const dbf = buildDbfBytes(
  [{ name: "CLAVE", type: "C", length: 12 }],
  [["14-039-001"]],
);
const report = importDocumentBytes("predio-039.shp", parcel.shp, {
  shx: parcel.shx,
  dbf,
  prj: PRJ_UTM14,
});
assert.equal(report.format, "shp", "el informe declara el formato leído");
assert.equal(report.importedEntityCount, 2, "dos entidades en el documento resultante");
assert.equal(report.document.meta.unit, "mm", "el documento se crea en milímetros");
assert.equal(report.document.modelSpace.entityIds.length, 2, "las dos, en el espacio modelo");
assert.ok(
  report.document.layers.some((layer) => layer.name === "PREDIO-039"),
  "con su capa creada",
);
assert.ok(
  report.warnings.some((warning) => warning.code === "geo_local_origin"),
  "y el traslado visible en los avisos de la interfaz",
);

assert.equal(validateImportFile("predio.shp", 1_000), undefined, "el .shp es un formato aceptado");
assert.equal(importLimitForFileName("predio.shp"), 8_000_000, "con su propio tope de tamaño");

// ---------------------------------------------------------------------------
// El fallo cerrado del lector atraviesa la importación entera
// ---------------------------------------------------------------------------

const fails = (fn: () => unknown, fragment: string, what: string) => {
  try {
    fn();
  } catch (error) {
    assert.ok(
      String((error as Error).message).includes(fragment),
      `${what}: el mensaje no menciona «${fragment}»: ${(error as Error).message}`,
    );
    return;
  }
  assert.fail(`${what}: no falló, y debía fallar cerrado`);
};

// Un .shp cortado NO se importa a medias. Medio predio parece un predio entero.
fails(
  () => importDocumentBytes("predio.shp", parcel.shp.slice(0, parcel.shp.byteLength - 32)),
  "descarga se cortó",
  "shapefile truncado",
);
// Un .prj en NAD27 tumba la importación entera: sus coordenadas están a
// cientos de metros de donde el dibujo las pondría.
fails(
  () =>
    importDocumentBytes("predio.shp", parcel.shp, {
      prj:
        'PROJCS["NAD_1927_UTM_Zone_14N",GEOGCS["GCS_North_American_1927",' +
        'DATUM["D_North_American_1927",SPHEROID["Clarke_1866",6378206.4,294.9786982]]],' +
        'PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",-99.0]]',
    }),
  "NAD27",
  "shapefile en NAD27",
);
// Un .dbf de otro conjunto: emparejar por posición le pondría a este predio los
// datos de otro dueño, y se vería perfectamente bien.
fails(
  () =>
    importDocumentBytes("predio.shp", parcel.shp, {
      dbf: buildDbfBytes([{ name: "CLAVE", type: "C", length: 12 }], [["a"], ["b"], ["c"]]),
    }),
  "no son del mismo conjunto",
  ".dbf descuadrado",
);

console.log(
  `geo-cad-document: predio de 40 × 25 m importado como ${report.importedEntityCount} polilíneas ` +
    "en milímetros, traslado declarado y reversible, y tres averías que tumban la importación entera",
);
