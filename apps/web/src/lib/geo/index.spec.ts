/**
 * La puerta de entrada: reconocer el archivo por sus BYTES y colocarlo.
 *
 * Dos cosas se fijan aquí y las dos son de producto, no de formato:
 *
 *   1. QUÉ ES el archivo se decide mirando sus bytes, nunca su nombre. Un `.laz`
 *      renombrado a `.las` es lo que hace un usuario cuando un programa se
 *      queja, y creerle al nombre convertiría eso en una lectura silenciosamente
 *      equivocada. Un GeoTIFF —que no se lee— se reconoce igual, para poder
 *      decir «esto es una ortofoto y todavía no la leemos» en vez de «archivo
 *      corrupto».
 *   2. Que el traslado al origen local es REVERSIBLE AL BIT. Es lo que hace
 *      defendible mover un predio de la coordenada 2 140 000 al entorno del
 *      cero: si la vuelta perdiera cifras, el traslado sería una pérdida de
 *      georreferencia disfrazada de comodidad.
 */
import { strict as assert } from "node:assert";
import {
  detectGeoFormat,
  geoDatasetBounds,
  geoPlace,
  geoPlacementFor,
  geoUnplace,
  readGeoDataset,
} from "./index";
import { GeoError } from "./errors";
import { buildDbfBytes, buildLasBytes, buildShapefileBytes } from "./fixtures";

const rejects = (fn: () => unknown, code: string, what: string) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GeoError, `${what}: el error no es un GeoError sino ${error}`);
    assert.equal((error as GeoError).code, code, `${what}: código inesperado`);
    return error as GeoError;
  }
  assert.fail(`${what}: no falló, y debía fallar cerrado`);
};

// ---------------------------------------------------------------------------
// Reconocer por los bytes
// ---------------------------------------------------------------------------

const LOT = [
  { x: 660_000, y: 2_140_000 },
  { x: 660_000, y: 2_140_025 },
  { x: 660_040, y: 2_140_025 },
  { x: 660_040, y: 2_140_000 },
  { x: 660_000, y: 2_140_000 },
];
const parcel = buildShapefileBytes(5, [{ parts: [0], points: LOT }]);
const dbf = buildDbfBytes([{ name: "CLAVE", type: "C", length: 10 }], [["14-039-001"]]);
const cloud = buildLasBytes({ count: 1_000, epsg: 32_614 });

assert.equal(detectGeoFormat(parcel.shp), "shapefile", "el .shp por su código mágico");
assert.equal(detectGeoFormat(parcel.shx), "shapefile-index", "el .shx se distingue del .shp");
assert.equal(detectGeoFormat(dbf), "dbase", "el .dbf por su byte de versión y su fecha");
assert.equal(detectGeoFormat(cloud), "las", "el .las por su firma LASF");
assert.equal(
  detectGeoFormat(buildLasBytes({ count: 10, pretendCompressed: true })),
  "laz",
  "el .laz por el bit alto del formato, aunque se llame .las",
);

// TIFF little-endian y big-endian: un GeoTIFF es un TIFF con etiquetas extra.
const tiffLittle = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0]);
const tiffBig = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 0]);
assert.equal(detectGeoFormat(tiffLittle), "geotiff", "TIFF little-endian");
assert.equal(detectGeoFormat(tiffBig), "geotiff", "TIFF big-endian");
assert.equal(detectGeoFormat(new Uint8Array(16)), "desconocido", "ceros no son nada");

// ---------------------------------------------------------------------------
// Lo que no se lee se dice por su nombre, no como «archivo corrupto»
// ---------------------------------------------------------------------------

const tiffError = rejects(
  () => readGeoDataset({ bytes: tiffLittle, name: "ortofoto.tif" }),
  "variante-no-soportada",
  "GeoTIFF",
);
assert.ok(tiffError.message.includes("ráster"), "el mensaje nombra lo que es: ráster");
assert.ok(
  tiffError.message.includes("No es que el archivo esté mal"),
  "y descarta explícitamente que el archivo esté roto, que es la lectura por defecto del usuario",
);

const shxError = rejects(
  () => readGeoDataset({ bytes: parcel.shx, name: "predio.shx" }),
  "variante-no-soportada",
  "abrir el .shx en vez del .shp",
);
assert.ok(shxError.message.includes(".shp"), "y dice cuál abrir");

rejects(
  () => readGeoDataset({ bytes: dbf, name: "predio.dbf" }),
  "variante-no-soportada",
  "abrir el .dbf en vez del .shp",
);
rejects(
  () => readGeoDataset({ bytes: new Uint8Array(64), name: "cualquiera.bin" }),
  "variante-no-soportada",
  "archivo que no es nada",
);

// ---------------------------------------------------------------------------
// La lectura completa del conjunto
// ---------------------------------------------------------------------------

const PRJ_UTM14 =
  'PROJCS["WGS_1984_UTM_Zone_14N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0]],' +
  'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],' +
  'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-99.0],' +
  'PARAMETER["Scale_Factor",0.9996],UNIT["Meter",1.0]]';

const dataset = readGeoDataset({
  bytes: parcel.shp,
  shx: parcel.shx,
  dbf,
  prj: PRJ_UTM14,
  name: "predio.shp",
});
assert.equal(dataset.kind, "shapefile", "un shapefile es un shapefile");
if (dataset.kind !== "shapefile") throw new Error("tipo");
assert.equal(dataset.shapefile.crs?.id, "EPSG:32614", "con su sistema de referencia");
assert.equal(dataset.attributes?.records[0].CLAVE, "14-039-001", "y con sus atributos");

// El desajuste entre geometría y atributos aborta: emparejarlos de todas formas
// le pondría a cada predio los datos de otro, y eso se ve perfectamente bien.
rejects(
  () =>
    readGeoDataset({
      bytes: parcel.shp,
      dbf: buildDbfBytes(
        [{ name: "CLAVE", type: "C", length: 10 }],
        [["14-039-001"], ["14-039-002"]],
      ),
    }),
  "indice-incoherente",
  ".dbf con más filas que geometrías",
);

const lasDataset = readGeoDataset({ bytes: cloud, name: "levantamiento.las" });
assert.equal(lasDataset.kind, "point-cloud", "un LAS es una nube");
if (lasDataset.kind !== "point-cloud") throw new Error("tipo");
assert.equal(lasDataset.cloud.x.length, 1_000, "con sus mil puntos");

// ---------------------------------------------------------------------------
// La colocación: reversible al bit
// ---------------------------------------------------------------------------

const bounds = geoDatasetBounds(dataset);
const placement = geoPlacementFor(bounds, { unit: "m" });
assert.equal(placement.originX, 660_000, "el origen se redondea al kilómetro hacia abajo");
assert.equal(placement.originY, 2_140_000, "también en el norte");
assert.equal(placement.unitScale, 1, "un documento en metros no reescala nada");

// El predio queda pegado al origen del dibujo, que es lo que se buscaba: a
// 2 140 000 unidades del cero, un `float` de 32 bits tiene 20 cm de paso.
const placed = LOT.map((point) => geoPlace(point.x, point.y, placement));
assert.deepEqual(placed[0], { x: 0, y: 0 }, "el primer vértice cae en el origen");
assert.deepEqual(placed[2], { x: 40, y: 25 }, "y el predio conserva sus 40 × 25 m");
assert.ok(
  placed.every((point) => Math.abs(point.x) < 1_000 && Math.abs(point.y) < 1_000),
  "todo el predio cabe dentro del kilómetro alrededor del origen",
);

// LA PROPIEDAD QUE HACE DEFENDIBLE EL TRASLADO. La vuelta al mundo real tiene
// que ser exacta al bit, no aproximada: el traslado es una resta de números
// redondos y la escala una potencia de diez, y ninguna de las dos pierde cifras.
for (const unit of ["m", "cm", "mm"] as const) {
  const p = geoPlacementFor(bounds, { unit });
  for (const point of LOT) {
    const back = geoUnplace(geoPlace(point.x, point.y, p).x, geoPlace(point.x, point.y, p).y, p);
    assert.equal(back.x, point.x, `vuelta exacta del este en ${unit}`);
    assert.equal(back.y, point.y, `vuelta exacta del norte en ${unit}`);
  }
}

// En milímetros el predio mide 40 000 unidades: es la escala del resto del
// producto, y un predio importado tiene que medir lo mismo que un muro dibujado.
const millimetres = geoPlacementFor(bounds, { unit: "mm" });
assert.deepEqual(
  geoPlace(660_040, 2_140_025, millimetres),
  { x: 40_000, y: 25_000 },
  "40 m son 40 000 mm de dibujo",
);

// Dos archivos vecinos comparten origen: el redondeo al kilómetro es lo que
// impide que el segundo levantamiento entre descolocado respecto del primero.
const neighbour = geoPlacementFor(
  { minX: 660_300, minY: 2_140_800, maxX: 660_900, maxY: 2_140_950 },
  { unit: "m" },
);
assert.equal(neighbour.originX, placement.originX, "mismo origen para el predio de al lado");
assert.equal(neighbour.originY, placement.originY, "también en el norte");

console.log(
  "geo/index: seis formatos reconocidos por sus bytes (GeoTIFF y LAZ nombrados para rechazarlos), " +
    "conjunto shapefile+dbf+prj leído entero y traslado al origen local reversible al bit",
);
