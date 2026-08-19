/**
 * Lectura de archivos geoespaciales en el runtime del producto.
 *
 * ## Qué se lee DE VERDAD, hoy
 *
 * · **Shapefile (`.shp` + `.shx` + `.dbf` + `.prj`)** — completo. Es el formato
 *   en el que llega un predio: el polígono del terreno, los linderos, la
 *   manzana. Lo entrega el topógrafo, lo publican el catastro y el INEGI.
 * · **LAS sin comprimir, 1.0 a 1.4** — completo, formatos de registro 0, 1, 2,
 *   3, 6, 7 y 8. Es el levantamiento con láser.
 *
 * ## Qué NO se lee, dicho aquí y no escondido
 *
 * · **LAZ** (LAS comprimido). Se DETECTA y se rechaza por su nombre. El códec
 *   LASzip es un descompresor aritmético completo y no está implementado.
 * · **GeoTIFF**. La ortofoto de fondo. Se DETECTA —un TIFF se reconoce por sus
 *   dos primeros bytes— y se rechaza diciendo qué es, para que nadie confunda
 *   «no lo soportamos» con «tu archivo está roto».
 * · Cualquier otra cosa del mundo GIS: GeoPackage, GML, KML, GeoJSON.
 *
 * Dos formatos leídos bien es lo que hay. No se anuncia GIS completo.
 *
 * ## Cero dependencias de terceros, y por qué no es una virtud presumida
 *
 * Es una restricción de licencia. Las bibliotecas buenas de este terreno —GDAL,
 * PROJ, laszip— son GPL o LGPL, y una dependencia copyleft en el árbol de
 * runtime cambia las obligaciones de distribución del producto entero. El gate
 * `check:licenses` lo bloquearía, y con razón. Lo que se necesitaba de ellas
 * —leer dos formatos y reproyectar seis zonas UTM— cabe en este subárbol y se
 * puede verificar; lo que no cabía se declara no soportado.
 *
 * ## El problema de las coordenadas grandes, que es el que rompe el CAD
 *
 * Un predio en Guadalajara está en el este 670 000 y el norte 2 285 000. Meter
 * esos números tal cual en un dibujo pone la geometría a 2 285 kilómetros del
 * origen, y a esa distancia un `float` de 32 bits —que es lo que llega a la
 * tarjeta gráfica— tiene un paso de unos 20 centímetros: los vértices del
 * lindero empiezan a saltar en pantalla y las cotas bailan. AutoCAD Map resuelve
 * esto igual que se resuelve aquí: se traslada el conjunto a un ORIGEN LOCAL y
 * se declara cuál fue el traslado, para que la vuelta al mundo real sea exacta.
 */
import { GeoError, geoAssert, isGeoError, type GeoErrorCode } from "./errors";
import {
  readLas,
  readLasHeader,
  type GeoLasHeader,
  type GeoLasInput,
  type GeoPointCloud,
} from "./las";
import {
  readShapefile,
  type GeoBoundingBox,
  type GeoShape,
  type GeoShapefile,
  type GeoShapefileInput,
} from "./shapefile";
import { readDbf, type GeoDbfTable } from "./dbf";

export * from "./errors";
export * from "./crs";
export * from "./crs-prj";
export * from "./shapefile";
export * from "./dbf";
export * from "./las";

// ---------------------------------------------------------------------------
// Reconocer el archivo por sus bytes, no por su nombre
// ---------------------------------------------------------------------------

/**
 * Lo que un archivo resulta ser cuando se le miran los bytes.
 *
 * La extensión no decide: un `.laz` renombrado a `.las` es lo que un usuario
 * hace cuando un programa se queja, y confiar en el nombre convertiría eso en
 * una lectura silenciosamente equivocada.
 */
export type GeoFormat =
  | "shapefile"
  | "shapefile-index"
  | "dbase"
  | "las"
  | "laz"
  | "geotiff"
  | "desconocido";

/** Formatos que este producto lee de verdad. Los demás se nombran y se rechazan. */
export const GEO_READABLE_FORMATS: readonly GeoFormat[] = ["shapefile", "las"];

export function detectGeoFormat(bytes: ArrayBuffer | Uint8Array): GeoFormat {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength < 8) return "desconocido";
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Shapefile y su índice comparten el código mágico 9994; los distingue el
  // tipo de archivo, que no está en la cabecera — pero sí la longitud: el .shx
  // mide exactamente 100 + 8·registros y su longitud declarada lo confirma.
  if (view.getInt32(0, false) === 9994 && view.getInt32(28, true) === 1000)
    return (view.getInt32(24, false) * 2 - 100) % 8 === 0 &&
      view.getInt32(24, false) * 2 === data.byteLength &&
      isShapeIndexShaped(view, data.byteLength)
      ? "shapefile-index"
      : "shapefile";

  if (String.fromCharCode(data[0], data[1], data[2], data[3]) === "LASF")
    // El bit alto del formato de registro es la firma de LASzip. Es lo único
    // que separa un .las de un .laz cuando el nombre miente.
    return data.byteLength > 104 && (data[104] & 0x80) !== 0 ? "laz" : "las";

  // TIFF: «II» little-endian o «MM» big-endian seguidos del 42 mágico. Un
  // GeoTIFF es un TIFF con etiquetas extra, así que a este nivel es un TIFF.
  const littleEndianTiff = data[0] === 0x49 && data[1] === 0x49;
  const bigEndianTiff = data[0] === 0x4d && data[1] === 0x4d;
  if (littleEndianTiff || bigEndianTiff) {
    const magic = view.getUint16(2, littleEndianTiff);
    if (magic === 42 || magic === 43) return "geotiff";
  }

  // dBASE: el primer byte es la versión y los tres siguientes una fecha
  // plausible. Es una firma débil, y por eso va la última.
  if ((data[0] === 0x03 || data[0] === 0x30) && data[2] >= 1 && data[2] <= 12 && data[3] >= 1 && data[3] <= 31)
    return "dbase";

  return "desconocido";
}

/** Un `.shx` sólo tiene pares (desplazamiento, longitud) crecientes desde el 50. */
function isShapeIndexShaped(view: DataView, byteLength: number): boolean {
  if (byteLength < 108) return false;
  return view.getInt32(100, false) === 50;
}

// ---------------------------------------------------------------------------
// La lectura, con el rechazo dicho por su nombre
// ---------------------------------------------------------------------------

export type GeoDataset =
  | { kind: "shapefile"; shapefile: GeoShapefile; attributes?: GeoDbfTable }
  | { kind: "point-cloud"; cloud: GeoPointCloud };

export interface GeoDatasetInput {
  /** Bytes del archivo principal. */
  bytes: ArrayBuffer | Uint8Array;
  name?: string;
  /** Acompañantes del shapefile. Todos opcionales. */
  shx?: ArrayBuffer | Uint8Array;
  dbf?: ArrayBuffer | Uint8Array;
  prj?: string;
  cpg?: string;
  maxVertices?: number;
  maxPoints?: number;
  withIntensity?: boolean;
}

/**
 * Lee lo que sea que traiga el usuario, o dice exactamente qué es y por qué no.
 *
 * Es el ÚNICO punto de entrada que debería usar el producto. Los lectores
 * concretos se exportan para las pruebas y para quien ya sepa lo que tiene,
 * pero el camino normal pasa por aquí porque aquí es donde el archivo se
 * reconoce por sus bytes en vez de por su nombre.
 */
export function readGeoDataset(input: GeoDatasetInput): GeoDataset {
  const source = input.name ?? "(sin nombre)";
  const format = detectGeoFormat(input.bytes);

  if (format === "shapefile") {
    const shapefile = readShapefile({
      shp: input.bytes,
      ...(input.shx ? { shx: input.shx } : {}),
      ...(input.prj !== undefined ? { prj: input.prj } : {}),
      ...(input.maxVertices !== undefined ? { maxVertices: input.maxVertices } : {}),
      name: source,
    });
    if (!input.dbf) return { kind: "shapefile", shapefile };
    const attributes = readDbf({
      dbf: input.dbf,
      ...(input.cpg !== undefined ? { cpg: input.cpg } : {}),
      name: source,
    });
    // La unión entre geometría y atributos es POSICIONAL: no hay clave que
    // comprobar. Lo único que se puede exigir es que haya tantas filas como
    // registros — si no, cada predio llevaría el nombre de otro dueño, y eso
    // se vería perfectamente bien en pantalla.
    geoAssert(
      attributes.records.length + attributes.deletedCount === shapefile.shapes.length,
      "indice-incoherente",
      `El .shp trae ${shapefile.shapes.length} geometría(s) y el .dbf ${attributes.declaredRecordCount} ` +
        "fila(s). Los dos archivos no son del mismo conjunto, y emparejarlos de todas formas le " +
        "pondría a cada predio los datos de otro.",
      {
        source,
        detail: { shapes: shapefile.shapes.length, rows: attributes.declaredRecordCount },
      },
    );
    return { kind: "shapefile", shapefile, attributes };
  }

  if (format === "las")
    return {
      kind: "point-cloud",
      cloud: readLas({
        las: input.bytes,
        name: source,
        ...(input.maxPoints !== undefined ? { maxPoints: input.maxPoints } : {}),
        ...(input.withIntensity !== undefined ? { withIntensity: input.withIntensity } : {}),
      }),
    };

  throw new GeoError("variante-no-soportada", unsupportedMessage(format), {
    source,
    detail: { format },
  });
}

function unsupportedMessage(format: GeoFormat): string {
  if (format === "laz")
    return (
      "El archivo es un LAZ: un LAS comprimido con LASzip. Este producto lee LAS sin comprimir; " +
      "conviértelo con las2las o exporta el levantamiento en .las."
    );
  if (format === "geotiff")
    return (
      "El archivo es un TIFF (probablemente un GeoTIFF de ortofoto). Este producto todavía no lee " +
      "ráster georreferenciado: hoy lee shapefile y LAS. No es que el archivo esté mal."
    );
  if (format === "shapefile-index")
    return (
      "Ése es el índice .shx, no el archivo principal. Abre el .shp que lleva el mismo nombre; el " +
      ".shx se aporta aparte y sirve para comprobar."
    );
  if (format === "dbase")
    return (
      "Ésa es la tabla de atributos .dbf, no la geometría. Abre el .shp que lleva el mismo nombre y " +
      "adjunta el .dbf: los datos entrarán con los polígonos."
    );
  return (
    "El archivo no es ninguno de los formatos que este producto lee: shapefile (.shp) y LAS sin " +
    "comprimir (.las)."
  );
}

// ---------------------------------------------------------------------------
// Colocación: del mundo real al dibujo
// ---------------------------------------------------------------------------

/** Unidades de dibujo que el documento canónico admite. */
export type GeoDocumentUnit = "mm" | "cm" | "m";

/** Cuántas unidades de dibujo mide un metro del terreno. */
const UNITS_PER_METRE: Readonly<Record<GeoDocumentUnit, number>> = { mm: 1000, cm: 100, m: 1 };

export interface GeoPlacement {
  /** Origen local restado a cada coordenada, en las unidades del ARCHIVO. */
  originX: number;
  originY: number;
  /** Multiplicador de archivo a dibujo. */
  unitScale: number;
  unit: GeoDocumentUnit;
}

/**
 * Redondeo del origen local: un kilómetro.
 *
 * Un número redondo es un número que un topógrafo puede volver a teclear sin
 * copiar y pegar, y que se representa exacto en coma flotante. Redondear al
 * kilómetro deja el dibujo dentro de un cuadrado de un kilómetro alrededor del
 * origen, que es donde el `float` de la tarjeta gráfica tiene submilímetro de
 * paso.
 */
export const GEO_LOCAL_ORIGIN_STEP_M = 1_000;

/**
 * Calcula el traslado que hay que aplicar a un conjunto para que quepa cerca
 * del origen del dibujo.
 *
 * El origen se redondea HACIA ABAJO al kilómetro, nunca al centro del predio:
 * un origen que depende del contenido cambiaría al añadir un segundo archivo y
 * los dos conjuntos quedarían descolocados entre sí. Con el redondeo, dos
 * archivos vecinos comparten origen casi siempre, y cuando no, la diferencia es
 * un número redondo de kilómetros que se ve a simple vista.
 */
export function geoPlacementFor(
  bounds: GeoBoundingBox,
  options: { unit?: GeoDocumentUnit; sourceUnit?: "m" } = {},
): GeoPlacement {
  geoAssert(
    Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY),
    "geometria-invalida",
    "No se puede colocar un conjunto sin rectángulo envolvente.",
    {},
  );
  const unit = options.unit ?? "m";
  const step = GEO_LOCAL_ORIGIN_STEP_M;
  return {
    originX: Math.floor(bounds.minX / step) * step,
    originY: Math.floor(bounds.minY / step) * step,
    unitScale: UNITS_PER_METRE[unit],
    unit,
  };
}

/** Aplica la colocación a una coordenada. Inversa exacta de `geoUnplace`. */
export function geoPlace(x: number, y: number, placement: GeoPlacement): { x: number; y: number } {
  return {
    x: (x - placement.originX) * placement.unitScale,
    y: (y - placement.originY) * placement.unitScale,
  };
}

/**
 * Vuelve del dibujo al mundo. Es la operación que hace defendible el traslado.
 *
 * Sin ella, mover el predio al origen sería perder la georreferencia; con ella,
 * cualquier punto del dibujo se puede devolver a coordenadas UTM exactas —el
 * traslado es una resta de números redondos y la escala una potencia de diez, y
 * ninguna de las dos pierde una cifra.
 */
export function geoUnplace(x: number, y: number, placement: GeoPlacement): { x: number; y: number } {
  return {
    x: x / placement.unitScale + placement.originX,
    y: y / placement.unitScale + placement.originY,
  };
}

/** Rectángulo envolvente de un conjunto, sea del tipo que sea. */
export function geoDatasetBounds(dataset: GeoDataset): GeoBoundingBox {
  if (dataset.kind === "shapefile") return dataset.shapefile.measuredBounds;
  const { measuredBounds } = dataset.cloud;
  return {
    minX: measuredBounds.minX,
    minY: measuredBounds.minY,
    maxX: measuredBounds.maxX,
    maxY: measuredBounds.maxY,
  };
}

export type { GeoBoundingBox, GeoShape, GeoShapefile, GeoShapefileInput };
export type { GeoDbfTable, GeoLasHeader, GeoLasInput, GeoPointCloud, GeoErrorCode };
export { readShapefile, readDbf, readLas, readLasHeader, isGeoError, GeoError };
