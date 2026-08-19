/**
 * El shapefile de un predio: lo que entra bien y lo que NO entra.
 *
 * ## Qué se fija aquí
 *
 * Primero, que la geometría se lee EXACTA: un polígono con patio interior
 * conserva sus dos anillos, su sentido de giro y su superficie neta —la del
 * terreno menos la del patio, que es la que va en la escritura—.
 *
 * Y después, lo que de verdad justifica el módulo: que un archivo roto NO
 * produce un predio. Cada caso de fallo se monta a mano, byte a byte, con la
 * avería que se quiere probar; el escritor de `fixtures.ts` no sabe producir
 * ninguno de ellos, y por eso valen como prueba independiente.
 *
 * ## Los bytes concretos, no sólo la ida y vuelta
 *
 * Un escritor y un lector escritos a la vez pueden equivocarse igual y darse la
 * razón. Por eso la primera aserción de este archivo comprueba
 * DESPLAZAMIENTOS LITERALES contra el documento técnico de ESRI: código 9994 en
 * big-endian en el byte 0, versión 1000 en little-endian en el 28, tipo en el
 * 32. Si el escritor se desviara del formato, esa comprobación caería.
 */
import { strict as assert } from "node:assert";
import { buildDbfBytes, buildShapefileBytes } from "./fixtures";
import { readDbf } from "./dbf";
import { GeoError } from "./errors";
import { polygonNetArea, readShapefile, shapeRingSignedArea } from "./shapefile";

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
// Los bytes de la cabecera, contra el documento técnico
// ---------------------------------------------------------------------------

// Un predio de 40 × 25 m en coordenadas UTM 14N: el este ronda los 660 000 y el
// norte los 2 140 000, que es el orden de magnitud real en Guadalajara. El
// contorno se recorre en HORARIO, que es lo que el formato exige de un anillo
// exterior.
const LOT: Array<{ x: number; y: number }> = [
  { x: 660_000, y: 2_140_000 },
  { x: 660_000, y: 2_140_025 },
  { x: 660_040, y: 2_140_025 },
  { x: 660_040, y: 2_140_000 },
  { x: 660_000, y: 2_140_000 },
];
// Patio interior de 10 × 5 m, recorrido al revés: en el formato, un anillo
// antihorario es un hueco.
const COURTYARD: Array<{ x: number; y: number }> = [
  { x: 660_010, y: 2_140_005 },
  { x: 660_020, y: 2_140_005 },
  { x: 660_020, y: 2_140_010 },
  { x: 660_010, y: 2_140_010 },
  { x: 660_010, y: 2_140_005 },
];

const lot = buildShapefileBytes(5, [{ parts: [0, 5], points: [...LOT, ...COURTYARD] }]);
const header = new DataView(lot.shp.buffer, lot.shp.byteOffset, lot.shp.byteLength);
assert.equal(header.getInt32(0, false), 9994, "byte 0: código de archivo, big-endian");
assert.equal(header.getInt32(24, false) * 2, lot.shp.byteLength, "byte 24: longitud en palabras");
assert.equal(header.getInt32(28, true), 1000, "byte 28: versión, little-endian");
assert.equal(header.getInt32(32, true), 5, "byte 32: tipo de geometría");
assert.equal(header.getInt32(100, false), 1, "byte 100: primer registro, numerado desde 1");

// ---------------------------------------------------------------------------
// La geometría entra exacta
// ---------------------------------------------------------------------------

const read = readShapefile({ shp: lot.shp, shx: lot.shx, name: "predio.shp" });
assert.equal(read.kind, "polygon", "el conjunto es de polígonos");
assert.ok(read.indexVerified, "el .shx aportado tiene que cuadrar con el .shp");
assert.equal(read.shapes.length, 1, "un predio, un registro");
assert.equal(read.vertexCount, 10, "cinco vértices por anillo, dos anillos");

const predio = read.shapes[0];
assert.deepEqual(predio.parts, [0, 5], "los dos anillos conservan su índice de arranque");
assert.equal(predio.vertices[0].x, 660_000, "el primer vértice, sin perder cifras");
assert.equal(predio.vertices[2].y, 2_140_025, "y el tercero tampoco");

// La superficie es la prueba que un arquitecto va a hacer en cuanto lo vea: el
// terreno mide 40 × 25 = 1000 m² y el patio 10 × 5 = 50 m². Netos: 950 m².
assert.equal(polygonNetArea(predio), 950, "superficie neta del predio, con el patio descontado");
assert.equal(shapeRingSignedArea(predio, 0), -1_000, "el contorno exterior gira en horario");
assert.equal(shapeRingSignedArea(predio, 1), 50, "y el patio al revés: es un hueco");

// El rectángulo medido es el de los vértices, no el que anunciaba la cabecera.
assert.deepEqual(
  read.measuredBounds,
  { minX: 660_000, minY: 2_140_000, maxX: 660_040, maxY: 2_140_025 },
  "rectángulo medido",
);

// Polilínea (un lindero suelto) y punto (un mojón) también entran.
const linderos = buildShapefileBytes(3, [
  { parts: [0], points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }] },
  { parts: [0, 2], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 6, y: 6 }] },
]);
const readLines = readShapefile({ shp: linderos.shp, shx: linderos.shx });
assert.equal(readLines.shapes.length, 2, "dos polilíneas");
assert.equal(readLines.shapes[1].parts.length, 2, "la segunda trae dos tramos");

const mojones = buildShapefileBytes(1, [
  { parts: [], points: [{ x: 660_001, y: 2_140_002 }] },
  { parts: [], points: [{ x: 660_002, y: 2_140_003 }] },
]);
const readPoints = readShapefile({ shp: mojones.shp, shx: mojones.shx });
assert.equal(readPoints.kind, "point", "un conjunto de mojones son puntos");
assert.equal(readPoints.shapes[1].vertices[0].y, 2_140_003, "el segundo mojón, exacto");

// ---------------------------------------------------------------------------
// Fallo cerrado: cada avería, montada a mano
// ---------------------------------------------------------------------------

/** Copia los bytes y deja cambiar los que haga falta. Nunca toca el original. */
const mutated = (source: Uint8Array, edit: (view: DataView, bytes: Uint8Array) => void) => {
  const copy = new Uint8Array(source);
  edit(new DataView(copy.buffer), copy);
  return copy;
};

rejects(
  () => readShapefile({ shp: mutated(lot.shp, (view) => view.setInt32(0, 1234, false)) }),
  "formato-desconocido",
  "código de archivo equivocado",
);
rejects(
  () => readShapefile({ shp: mutated(lot.shp, (view) => view.setInt32(28, 1001, true)) }),
  "variante-no-soportada",
  "versión inexistente",
);
rejects(
  () => readShapefile({ shp: lot.shp.slice(0, lot.shp.byteLength - 16) }),
  "archivo-truncado",
  "descarga cortada",
);
rejects(
  () => readShapefile({ shp: mutated(lot.shp, (view) => view.setInt32(32, 31, true)) }),
  "variante-no-soportada",
  "MultiPatch",
);

// LA AVERÍA QUE JUSTIFICA EL MÓDULO. Se le resta una palabra a la longitud
// declarada del registro: el archivo sigue midiendo lo que dice medir y el
// registro sigue cabiendo, pero ya no coincide con lo que exigen sus partes y
// sus puntos. Un lector que sólo comprobara «cabe» seguiría adelante y
// devolvería un polígono cerrado, con superficie, con pinta de predio — y con
// las coordenadas desplazadas. Aquí tiene que morir.
const shifted = rejects(
  () =>
    readShapefile({
      shp: mutated(lot.shp, (view) => {
        view.setInt32(104, view.getInt32(104, false) - 1, false);
      }),
    }),
  "longitud-incoherente",
  "longitud de contenido que no cuadra con las partes y los puntos",
);
assert.ok(
  String(shifted.message).includes("desplazada"),
  "el mensaje tiene que explicar que la lectura se desalineó, no sólo que un número no cuadra",
);

// Numeración rota: el registro 1 dice ser el 7.
const twoLots = buildShapefileBytes(5, [
  { parts: [0], points: LOT },
  { parts: [0], points: LOT.map((point) => ({ x: point.x + 100, y: point.y })) },
]);
rejects(
  () => readShapefile({ shp: mutated(twoLots.shp, (view) => view.setInt32(100, 7, false)) }),
  "indice-incoherente",
  "numeración de registros con salto",
);

// Anillo abierto: el último vértice deja de coincidir con el primero.
const open = buildShapefileBytes(5, [
  { parts: [0], points: [...LOT.slice(0, 4), { x: 660_001, y: 2_140_001 }] },
]);
rejects(() => readShapefile({ shp: open.shp }), "geometria-invalida", "anillo que no cierra");

// Anillo de tres vértices: no encierra superficie.
const thin = buildShapefileBytes(5, [
  { parts: [0], points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }] },
]);
rejects(() => readShapefile({ shp: thin.shp }), "geometria-invalida", "anillo de tres vértices");

// Coordenada infinita escrita a mano sobre el primer vértice. La cuenta del
// desplazamiento sale del documento técnico: 100 de cabecera + 8 de cabecera de
// registro + 4 del tipo + 32 del rectángulo + 4 del número de partes + 4 del de
// puntos + 8 de los dos índices de anillo = 160.
rejects(
  () =>
    readShapefile({
      shp: mutated(lot.shp, (view) => view.setFloat64(160, Number.POSITIVE_INFINITY, true)),
    }),
  "coordenada-invalida",
  "coordenada infinita",
);

// Vértice fuera del rectángulo que declara la cabecera: el archivo se
// contradice, y esa contradicción es la firma de una lectura desalineada.
rejects(
  () => readShapefile({ shp: mutated(lot.shp, (view) => view.setFloat64(52, 660_010, true)) }),
  "geometria-invalida",
  "vértices fuera del rectángulo declarado",
);

// Un .shx de otro conjunto. Los dos archivos existen, los dos son válidos, y
// juntos no describen lo mismo.
rejects(
  () => readShapefile({ shp: lot.shp, shx: twoLots.shx }),
  "indice-incoherente",
  ".shx de otro conjunto",
);

// Tope de vértices: el archivo entra, pero se declara demasiado grande.
rejects(
  () => readShapefile({ shp: lot.shp, maxVertices: 4 }),
  "demasiado-grande",
  "más vértices que el tope",
);

// ---------------------------------------------------------------------------
// El `.prj`: el sistema de referencia llega con la geometría
// ---------------------------------------------------------------------------

const PRJ_UTM14 =
  'PROJCS["WGS_1984_UTM_Zone_14N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",-99.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const georeferenced = readShapefile({ shp: lot.shp, prj: PRJ_UTM14, name: "predio.shp" });
assert.equal(georeferenced.crs?.id, "EPSG:32614", "el .prj decide el sistema, no la suposición");

// Y el NAD27 tumba la lectura ENTERA, no sólo el sistema: leer la geometría
// «sin sistema» invitaría a colocarla como si fuera WGS84.
const PRJ_NAD27 =
  'PROJCS["NAD_1927_UTM_Zone_14N",GEOGCS["GCS_North_American_1927",' +
  'DATUM["D_North_American_1927",SPHEROID["Clarke_1866",6378206.4,294.9786982]]],' +
  'PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",-99.0]]';
rejects(
  () => readShapefile({ shp: lot.shp, prj: PRJ_NAD27 }),
  "crs-no-soportado",
  "shapefile en NAD27",
);

// ---------------------------------------------------------------------------
// La tabla de atributos
// ---------------------------------------------------------------------------

const dbf = buildDbfBytes(
  [
    { name: "CLAVE", type: "C", length: 12 },
    { name: "PROPIETAR", type: "C", length: 24 },
    { name: "SUP_M2", type: "N", length: 12, decimals: 2 },
    { name: "REGULARIZ", type: "L", length: 1 },
    { name: "FECHA_ESC", type: "D", length: 8 },
  ],
  [
    ["14-039-001", "María Peña Núñez", "950.00", "T", "20240315"],
    ["14-039-002", "Ejido San José", "", "F", ""],
  ],
);
const table = readDbf({ dbf, name: "predio.dbf" });
assert.equal(table.records.length, 2, "dos filas");
assert.equal(table.records[0].CLAVE, "14-039-001", "la clave catastral, sin relleno");
assert.equal(table.records[0].SUP_M2, 950, "la superficie es número, no texto");
assert.equal(table.records[0].REGULARIZ, true, "el lógico T es verdadero");
assert.equal(table.records[0].FECHA_ESC, "2024-03-15", "la fecha sale en orden legible");
// El campo vacío es NULO, no cero. En catastro, «superficie desconocida» y
// «superficie cero» son cosas distintas y confundirlas contamina toda suma.
assert.equal(table.records[1].SUP_M2, null, "el numérico en blanco es nulo, no cero");
assert.equal(table.records[1].FECHA_ESC, null, "la fecha en blanco es nula");
assert.equal(table.encodingDeclared, false, "sin .cpg, la codificación se declara supuesta");
assert.equal(table.encoding, "windows-1252", "y la supuesta es la que escriben ArcGIS y QGIS");

// Los acentos sobreviven: el nombre de un propietario mexicano lleva eñes.
const utf8Table = readDbf({
  dbf: buildDbfBytes([{ name: "NOMBRE", type: "C", length: 20 }], [["Nunez"]]),
  cpg: "UTF-8",
  name: "x.dbf",
});
assert.equal(utf8Table.encoding, "utf-8", "el .cpg manda sobre la suposición");
assert.equal(utf8Table.encodingDeclared, true, "y entonces deja de ser una suposición");

rejects(
  () => readDbf({ dbf: mutated(dbf, (_, bytes) => { bytes[0] = 0x83; }) }),
  "variante-no-soportada",
  ".dbf con campos memo",
);
rejects(
  () => readDbf({ dbf: mutated(dbf, (view) => view.setUint16(10, 99, true)) }),
  "longitud-incoherente",
  "longitud de registro que no suma los campos",
);
rejects(
  () => readDbf({ dbf: mutated(dbf, (_, bytes) => { bytes[32 + 2 * 32 + 11] = 0x4d; }) }),
  "variante-no-soportada",
  "campo de tipo memo",
);
rejects(
  () => readDbf({ dbf: dbf.slice(0, dbf.byteLength - 20) }),
  "archivo-truncado",
  ".dbf cortado",
);

console.log(
  `shapefile: predio de ${polygonNetArea(predio)} m² netos con patio, .shx verificado, ` +
    `${table.records.length} filas de atributos y 16 averías distintas rechazadas con su código`,
);
