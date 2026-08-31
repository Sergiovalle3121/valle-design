/**
 * Lector LAS — el levantamiento con láser, punto a punto.
 *
 * ## Qué se lee de verdad
 *
 * LAS sin comprimir, versiones 1.0 a 1.4, formatos de registro 0, 1, 2, 3, 6, 7
 * y 8. Eso cubre lo que sale de un escáner terrestre y de un vuelo LiDAR
 * normal: coordenadas, clasificación, intensidad, tiempo GPS y color.
 *
 * ## Qué NO se lee, dicho aquí y no en la letra pequeña
 *
 * · **LAZ no se lee.** Un `.laz` es un `.las` comprimido con el códec LASzip, y
 *   ese códec es un descompresor aritmético completo, no un `inflate`. No está
 *   implementado. Se DETECTA —el bit alto del formato de registro y el registro
 *   de longitud variable de LASzip lo delatan— y se rechaza diciendo qué es y
 *   qué hacer. Un `.laz` renombrado a `.las` también cae aquí.
 * · **Los formatos con forma de onda (4, 5, 9 y 10) no se leen.** Traen la señal
 *   completa del retorno del láser, que este producto no usa para nada.
 * · **GeoTIFF no se lee.** La ortofoto de fondo sigue pendiente; no se anuncia.
 *
 * ## El punto se devuelve en arreglos, no en objetos
 *
 * Una nube de diez millones de puntos son diez millones de objetos `{x, y, z}`
 * si se lee de la forma cómoda, y eso es más de un gigabyte de recolección de
 * basura antes de dibujar nada. Aquí las coordenadas salen en `Float64Array`
 * paralelos: la memoria es plana, predecible y del tamaño que se puede calcular
 * de antemano. El índice espacial de `point-index.ts` consume exactamente esa
 * forma, sin copiar.
 *
 * ## Fallo cerrado
 *
 * La cuenta que cierra el archivo es `desplazamiento + puntos × longitud =
 * tamaño`. Si no cuadra, la lectura aborta: leer «los puntos que caben» de un
 * archivo cortado produce una nube que parece completa y que le falta la mitad
 * del terreno. Además, todo punto tiene que caer dentro del volumen que declara
 * la propia cabecera; un punto fuera significa que se está leyendo con la
 * longitud de registro equivocada, y entonces las coordenadas son basura con
 * aspecto de coordenadas.
 *
 * Fuente del formato: ASPRS, «LAS Specification», versiones 1.2 (2008) y 1.4-R15
 * (2019): bloque de cabecera pública, registros de longitud variable y formatos
 * de registro de punto.
 */
import type { GeoCrs } from "./crs";
import { resolveGeoCrs } from "./crs";
import { parseGeoCrsWkt } from "./crs-prj";
import { GeoError, geoAssert, isGeoError } from "./errors";
import { formatRegionNumber } from "../cad/region";

/** Firma del formato en los cuatro primeros bytes. */
const LAS_SIGNATURE = "LASF";
/** Tamaño del bloque de cabecera pública por versión menor. */
const LAS_HEADER_BYTES: Readonly<Record<number, number>> = { 0: 227, 1: 227, 2: 227, 3: 235, 4: 375 };
/** Cabecera de un registro de longitud variable. */
const LAS_VLR_HEADER_BYTES = 54;
/** Bit que marca el flujo de puntos como comprimido con LASzip. */
const LAS_COMPRESSION_BIT = 0x80;

/**
 * Longitud mínima de cada formato de registro de punto.
 *
 * Es MÍNIMA y no exacta a propósito: la especificación permite «bytes extra» al
 * final de cada punto, y un archivo real de un escáner los trae. Lo que no se
 * permite es que la longitud sea MENOR, porque entonces los campos se solapan.
 */
const LAS_POINT_BYTES: Readonly<Record<number, number>> = {
  0: 20, 1: 28, 2: 26, 3: 34, 4: 57, 5: 63, 6: 30, 7: 36, 8: 38, 9: 59, 10: 67,
};
/** Formatos con forma de onda: se reconocen para rechazarlos con su nombre. */
const LAS_WAVEFORM_FORMATS = new Set([4, 5, 9, 10]);
/** Formatos que este lector sabe recorrer. */
const LAS_SUPPORTED_FORMATS = new Set([0, 1, 2, 3, 6, 7, 8]);

export interface GeoLasHeader {
  versionMajor: number;
  versionMinor: number;
  pointFormat: number;
  pointRecordBytes: number;
  pointCount: number;
  scale: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  systemIdentifier: string;
  generatingSoftware: string;
}

export interface GeoPointCloud {
  header: GeoLasHeader;
  /** Coordenadas ya escaladas y desplazadas, en las unidades del archivo. */
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  /** Clasificación ASPRS: 2 es suelo, 5 vegetación alta, 6 edificio. */
  classification: Uint8Array;
  /** Sólo si se pidió; si no, `undefined` para no pagar 2 bytes por punto. */
  intensity?: Uint16Array;
  /** Volumen REAL de los puntos leídos, que puede ser menor que el declarado. */
  measuredBounds: {
    minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number;
  };
  /** Sistema de referencia, si el archivo lo declaró y este producto lo soporta. */
  crs?: GeoCrs;
  /** Por dónde se supo el sistema de referencia. */
  crsSource: "wkt" | "geokey" | "ninguno";
  /**
   * Por qué NO se pudo usar el sistema que el archivo declara.
   *
   * Se guarda en vez de lanzarse: las coordenadas del archivo siguen siendo las
   * del archivo y leerlas no miente. Lo que miente es asumir un sistema, y eso
   * es justo lo que no se hace — quien quiera georreferenciar tendrá que pasar
   * por aquí y encontrarse este texto.
   */
  crsRejection?: string;
}

export interface GeoLasInput {
  las: ArrayBuffer | Uint8Array;
  name?: string;
  /** Lee también la intensidad. Cuesta 2 bytes por punto. */
  withIntensity?: boolean;
  /** Tope de puntos. Por encima se aborta en vez de agotar la memoria. */
  maxPoints?: number;
}

/**
 * Tope por omisión.
 *
 * Veinte millones de puntos son unos 480 MB sólo en las tres coordenadas. Es
 * más de lo que aguanta una pestaña con el editor abierto, así que el tope
 * existe para que el fallo sea un mensaje y no una pestaña que se cierra sola.
 */
export const GEO_LAS_MAX_POINTS = 20_000_000;

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/**
 * Lee sólo la cabecera. Barato y suficiente para decidir si el archivo cabe.
 *
 * Se expone porque la pregunta «¿cuántos puntos trae y dónde está?» se hace
 * ANTES de reservar medio gigabyte, y responderla no debería costar medio
 * gigabyte.
 */
export function readLasHeader(input: GeoLasInput): GeoLasHeader {
  const source = input.name ?? "(sin nombre)";
  const bytes = toBytes(input.las);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  geoAssert(
    bytes.byteLength >= 227,
    "archivo-truncado",
    `El archivo tiene ${bytes.byteLength} bytes y la cabecera LAS más corta ocupa 227.`,
    { source, detail: { bytes: bytes.byteLength } },
  );
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  geoAssert(
    signature === LAS_SIGNATURE,
    "formato-desconocido",
    `El archivo no empieza por «${LAS_SIGNATURE}»: no es un LAS.`,
    { source, detail: { signature } },
  );

  const versionMajor = bytes[24];
  const versionMinor = bytes[25];
  geoAssert(
    versionMajor === 1 && LAS_HEADER_BYTES[versionMinor] !== undefined,
    "variante-no-soportada",
    `LAS ${versionMajor}.${versionMinor}: este producto lee de la 1.0 a la 1.4.`,
    { source, detail: { versionMajor, versionMinor } },
  );

  const headerBytes = view.getUint16(94, true);
  geoAssert(
    headerBytes >= LAS_HEADER_BYTES[versionMinor] && headerBytes <= bytes.byteLength,
    "longitud-incoherente",
    `La cabecera declara ${headerBytes} bytes y una LAS ${versionMajor}.${versionMinor} necesita ` +
      `al menos ${LAS_HEADER_BYTES[versionMinor]}.`,
    { source, detail: { headerBytes, versionMinor } },
  );

  const rawFormat = bytes[104];
  // El bit alto encendido es la firma de LASzip. Es lo que distingue un .laz de
  // un .las aunque alguien le haya cambiado la extensión.
  geoAssert(
    (rawFormat & LAS_COMPRESSION_BIT) === 0,
    "variante-no-soportada",
    "El archivo está comprimido con LASzip (es un .laz, aunque se llame .las). Este producto lee " +
      "LAS sin comprimir; descomprímelo con las2las o exporta el levantamiento en .las.",
    { source, detail: { rawFormat } },
  );
  const pointFormat = rawFormat & 0x3f;
  geoAssert(
    !LAS_WAVEFORM_FORMATS.has(pointFormat),
    "variante-no-soportada",
    `El formato de registro ${pointFormat} lleva la forma de onda completa del retorno del láser. ` +
      "Este producto lee los formatos 0, 1, 2, 3, 6, 7 y 8, que son los que traen la nube.",
    { source, detail: { pointFormat } },
  );
  geoAssert(
    LAS_SUPPORTED_FORMATS.has(pointFormat),
    "variante-no-soportada",
    `Formato de registro de punto ${pointFormat} desconocido.`,
    { source, detail: { pointFormat } },
  );

  const pointRecordBytes = view.getUint16(105, true);
  geoAssert(
    pointRecordBytes >= LAS_POINT_BYTES[pointFormat],
    "longitud-incoherente",
    `Cada punto declara ${pointRecordBytes} bytes y el formato ${pointFormat} necesita al menos ` +
      `${LAS_POINT_BYTES[pointFormat]}.`,
    { source, detail: { pointRecordBytes, pointFormat } },
  );

  const legacyCount = view.getUint32(107, true);
  // En LAS 1.4 el conteo de verdad es de 64 bits; el de 32 se queda a cero
  // cuando la nube pasa de 4 294 967 295 puntos o cuando el formato es ≥ 6.
  const modernCount = versionMinor >= 4 && headerBytes >= 375 ? Number(view.getBigUint64(247, true)) : 0;
  const pointCount = modernCount > 0 ? modernCount : legacyCount;

  const scale = {
    x: view.getFloat64(131, true),
    y: view.getFloat64(139, true),
    z: view.getFloat64(147, true),
  };
  geoAssert(
    [scale.x, scale.y, scale.z].every((value) => Number.isFinite(value) && value > 0),
    "longitud-incoherente",
    `Los factores de escala del archivo son (${scale.x}, ${scale.y}, ${scale.z}) y tienen que ser ` +
      "positivos y finitos: son el multiplicador de cada coordenada entera.",
    { source, detail: { scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z } },
  );

  const offset = {
    x: view.getFloat64(155, true),
    y: view.getFloat64(163, true),
    z: view.getFloat64(171, true),
  };
  const bounds = {
    maxX: view.getFloat64(179, true),
    minX: view.getFloat64(187, true),
    maxY: view.getFloat64(195, true),
    minY: view.getFloat64(203, true),
    maxZ: view.getFloat64(211, true),
    minZ: view.getFloat64(219, true),
  };
  geoAssert(
    Object.values(bounds).every(Number.isFinite) &&
      Object.values(offset).every(Number.isFinite) &&
      bounds.minX <= bounds.maxX &&
      bounds.minY <= bounds.maxY &&
      bounds.minZ <= bounds.maxZ,
    "geometria-invalida",
    "El volumen declarado en la cabecera no es un volumen válido.",
    { source },
  );

  const ascii = new TextDecoder("ascii");
  const clean = (from: number, length: number) =>
    ascii.decode(bytes.subarray(from, from + length)).replace(/\0.*$/, "").trim();

  return {
    versionMajor,
    versionMinor,
    pointFormat,
    pointRecordBytes,
    pointCount,
    scale,
    offset,
    bounds,
    systemIdentifier: clean(26, 32),
    generatingSoftware: clean(58, 32),
  };
}

/**
 * Lee la nube entera.
 *
 * El bucle de puntos es el único sitio de este subárbol escrito pensando en la
 * velocidad y no en la claridad: se resuelven fuera todos los desplazamientos y
 * dentro sólo quedan tres lecturas enteras y tres multiplicaciones. A diez
 * millones de puntos, cualquier objeto intermedio se nota.
 */
export function readLas(input: GeoLasInput): GeoPointCloud {
  const source = input.name ?? "(sin nombre)";
  const bytes = toBytes(input.las);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = readLasHeader(input);
  const maxPoints = input.maxPoints ?? GEO_LAS_MAX_POINTS;

  geoAssert(
    header.pointCount <= maxPoints,
    "demasiado-grande",
    `La nube trae ${formatRegionNumber(header.pointCount)} puntos y el tope es ` +
      `${formatRegionNumber(maxPoints)}. Recórtala o submuéstreala en el programa de origen.`,
    { source, detail: { pointCount: header.pointCount, maxPoints } },
  );

  const dataOffset = view.getUint32(96, true);
  const needed = dataOffset + header.pointCount * header.pointRecordBytes;
  geoAssert(
    dataOffset >= view.getUint16(94, true) && needed <= bytes.byteLength,
    needed > bytes.byteLength ? "archivo-truncado" : "longitud-incoherente",
    needed > bytes.byteLength
      ? `El archivo declara ${header.pointCount} puntos de ${header.pointRecordBytes} bytes desde ` +
        `el ${dataOffset}: hacen falta ${needed} bytes y hay ${bytes.byteLength}. La descarga se ` +
        "cortó, y leer los puntos que llegaron daría un levantamiento al que le falta terreno sin " +
        "que nada lo indique."
      : `El desplazamiento a los datos (${dataOffset}) cae dentro de la propia cabecera.`,
    { source, detail: { dataOffset, needed, bytes: bytes.byteLength } },
  );

  const count = header.pointCount;
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const z = new Float64Array(count);
  const classification = new Uint8Array(count);
  const intensity = input.withIntensity ? new Uint16Array(count) : undefined;

  // La clasificación cambió de sitio en el formato 6: antes iba en el byte 15 y
  // compartía el byte con banderas; desde el 6 tiene byte propio, el 16.
  const classificationAt = header.pointFormat >= 6 ? 16 : 15;
  const { scale, offset } = header;
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < count; index += 1) {
    const at = dataOffset + index * header.pointRecordBytes;
    const px = view.getInt32(at, true) * scale.x + offset.x;
    const py = view.getInt32(at + 4, true) * scale.y + offset.y;
    const pz = view.getInt32(at + 8, true) * scale.z + offset.z;
    x[index] = px;
    y[index] = py;
    z[index] = pz;
    // La clasificación del formato 0 comparte byte con los bits de sintético,
    // punto clave y retirado. Los cinco bits bajos son la clase.
    classification[index] = header.pointFormat >= 6 ? bytes[at + classificationAt] : bytes[at + classificationAt] & 0x1f;
    if (intensity) intensity[index] = view.getUint16(at + 12, true);
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }

  if (count > 0) {
    // Un punto fuera del volumen declarado significa, casi siempre, que se está
    // recorriendo con la longitud de registro equivocada: los enteros que se
    // leen son trozos de dos puntos distintos y salen coordenadas creíbles.
    const slackX = Math.max(scale.x, (header.bounds.maxX - header.bounds.minX) * 1e-9);
    const slackY = Math.max(scale.y, (header.bounds.maxY - header.bounds.minY) * 1e-9);
    const slackZ = Math.max(scale.z, (header.bounds.maxZ - header.bounds.minZ) * 1e-9);
    geoAssert(
      minX >= header.bounds.minX - slackX && maxX <= header.bounds.maxX + slackX &&
        minY >= header.bounds.minY - slackY && maxY <= header.bounds.maxY + slackY &&
        minZ >= header.bounds.minZ - slackZ && maxZ <= header.bounds.maxZ + slackZ,
      "geometria-invalida",
      "Hay puntos fuera del volumen que declara la cabecera. El archivo se contradice a sí mismo " +
        "y la nube no se puede dar por buena.",
      {
        source,
        detail: {
          declarado: `${header.bounds.minX},${header.bounds.minY},${header.bounds.minZ} → ${header.bounds.maxX},${header.bounds.maxY},${header.bounds.maxZ}`,
          medido: `${minX},${minY},${minZ} → ${maxX},${maxY},${maxZ}`,
        },
      },
    );
  }

  const declared = readCrsFromVlrs(bytes, view, header, dataOffset, source);

  return {
    header,
    x,
    y,
    z,
    classification,
    ...(intensity ? { intensity } : {}),
    measuredBounds: count > 0
      ? { minX, minY, minZ, maxX, maxY, maxZ }
      : { ...header.bounds },
    ...(declared.crs ? { crs: declared.crs } : {}),
    crsSource: declared.crsSource,
    ...(declared.rejection ? { crsRejection: declared.rejection } : {}),
  };
}

/**
 * Busca el sistema de referencia en los registros de longitud variable.
 *
 * Hay dos maneras y las dos conviven: el WKT de la OGC (identificador 2112,
 * obligatorio desde LAS 1.4 con formatos ≥ 6) y las claves GeoTIFF heredadas
 * (34735), donde la clave 3072 lleva el código EPSG del sistema proyectado y la
 * 2048 el del geográfico. Se prueban en ese orden porque el WKT es explícito y
 * la clave es un número que hay que ir a buscar a una tabla.
 *
 * Si el archivo declara un sistema que este producto no soporta —NAD83, por
 * ejemplo— NO se lanza: se anota el motivo. Las coordenadas del archivo siguen
 * siendo las del archivo, y leerlas no miente. Mentir sería suponer WGS84.
 */
function readCrsFromVlrs(
  bytes: Uint8Array,
  view: DataView,
  header: GeoLasHeader,
  dataOffset: number,
  source: string,
): { crs?: GeoCrs; crsSource: "wkt" | "geokey" | "ninguno"; rejection?: string } {
  const headerBytes = view.getUint16(94, true);
  const vlrCount = view.getUint32(100, true);
  const ascii = new TextDecoder("ascii");

  let geoKeyAt: { at: number; length: number } | undefined;
  let wkt: string | undefined;
  let cursor = headerBytes;

  for (let index = 0; index < vlrCount; index += 1) {
    if (cursor + LAS_VLR_HEADER_BYTES > dataOffset) break;
    const userId = ascii.decode(bytes.subarray(cursor + 2, cursor + 18)).replace(/\0.*$/, "");
    const recordId = view.getUint16(cursor + 18, true);
    const payload = view.getUint16(cursor + 20, true);
    const at = cursor + LAS_VLR_HEADER_BYTES;
    geoAssert(
      at + payload <= bytes.byteLength,
      "longitud-incoherente",
      `El registro de longitud variable ${index + 1} declara ${payload} bytes que no caben.`,
      { source, detail: { vlr: index + 1, payload } },
    );
    // LASzip deja su propio registro. Si aparece, el flujo de puntos está
    // comprimido aunque el bit del formato viniera limpio.
    geoAssert(
      !/laszip/i.test(userId),
      "variante-no-soportada",
      "El archivo lleva el registro de LASzip: sus puntos están comprimidos y este producto lee " +
        "LAS sin comprimir.",
      { source, detail: { userId } },
    );
    if (userId === "LASF_Projection" && recordId === 2112 && wkt === undefined)
      wkt = ascii.decode(bytes.subarray(at, at + payload)).replace(/\0.*$/, "");
    if (userId === "LASF_Projection" && recordId === 34735 && geoKeyAt === undefined)
      geoKeyAt = { at, length: payload };
    cursor = at + payload;
  }

  if (wkt !== undefined && wkt.trim().length > 0) {
    try {
      return { crs: parseGeoCrsWkt(wkt), crsSource: "wkt" };
    } catch (error) {
      return {
        crsSource: "ninguno",
        rejection: isGeoError(error) ? error.message : String(error),
      };
    }
  }

  if (geoKeyAt) {
    const code = readProjectedEpsgKey(view, geoKeyAt.at, geoKeyAt.length);
    if (code !== undefined) {
      try {
        return { crs: resolveGeoCrs(`EPSG:${code}`), crsSource: "geokey" };
      } catch (error) {
        return {
          crsSource: "ninguno",
          rejection: isGeoError(error) ? error.message : String(error),
        };
      }
    }
  }

  void header;
  return { crsSource: "ninguno" };
}

/**
 * Saca el código EPSG del directorio de claves GeoTIFF.
 *
 * El directorio es una cabecera de cuatro enteros de 16 bits seguida de una
 * entrada de cuatro por clave. Sólo interesan la 3072 (sistema proyectado) y la
 * 2048 (geográfico), y sólo cuando el valor está en la propia entrada —que es
 * como se guarda un código EPSG—. Las claves que apuntan a los otros dos
 * registros llevan textos y dobles que aquí no hacen falta.
 */
function readProjectedEpsgKey(view: DataView, at: number, length: number): number | undefined {
  if (length < 8) return undefined;
  const keyCount = view.getUint16(at + 6, true);
  let geographic: number | undefined;
  for (let index = 0; index < keyCount; index += 1) {
    const entry = at + 8 + index * 8;
    if (entry + 8 > at + length) break;
    const keyId = view.getUint16(entry, true);
    const tagLocation = view.getUint16(entry + 2, true);
    const value = view.getUint16(entry + 6, true);
    if (tagLocation !== 0) continue;
    if (keyId === 3072 && value !== 0 && value !== 32_767) return value;
    if (keyId === 2048 && value !== 0 && value !== 32_767) geographic = value;
  }
  return geographic;
}

export { GeoError };
