/**
 * Escritores de archivos geoespaciales — existen para poder MEDIR sobre bytes.
 *
 * ## Por qué el producto lleva un escritor que el producto no usa
 *
 * Porque las specs y el banco de pruebas a escala de nube de puntos tienen que
 * trabajar sobre el MISMO archivo. La primera versión de esto tenía un
 * generador en la spec y otro en el probe, y era una trampa esperando: bastaba
 * con que uno de los dos escribiera la longitud de registro de otra manera para
 * que la spec certificara un formato y el banco midiera otro, y nadie se
 * enterara. Un solo escritor hace imposible esa divergencia.
 *
 * ## Por qué esto no valida el lector por sí solo
 *
 * Un escritor y un lector escritos por la misma persona pueden estar
 * equivocados de la misma manera y darse la razón. Por eso las specs NO se
 * conforman con la ida y vuelta: comprueban además bytes concretos en
 * desplazamientos concretos —los que fija el documento del formato— y leen
 * archivos deliberadamente rotos que este escritor NO sabe producir, montados a
 * mano byte a byte en la propia spec.
 *
 * Fuentes de formato: ESRI «Shapefile Technical Description» (J-7855, 1998) y
 * ASPRS «LAS Specification» 1.2 / 1.4-R15.
 */

// ---------------------------------------------------------------------------
// Shapefile
// ---------------------------------------------------------------------------

export interface FixtureShapeRecord {
  /** Índices de arranque de cada parte. Vacío en punto y multipunto. */
  parts: number[];
  points: Array<{ x: number; y: number }>;
}

/**
 * Escribe un `.shp` y su `.shx` a juego.
 *
 * Los dos salen de la misma pasada porque el índice no es más que la lista de
 * desplazamientos que el archivo principal fue ocupando: calcularlo aparte
 * volvería a abrir la puerta a que discrepen.
 */
export function buildShapefileBytes(
  shapeType: number,
  records: readonly FixtureShapeRecord[],
): { shp: Uint8Array; shx: Uint8Array } {
  const isPoint = shapeType === 1;
  const isMultipoint = shapeType === 8;

  const bodies = records.map((record) => {
    if (isPoint) {
      const body = new DataView(new ArrayBuffer(20));
      body.setInt32(0, shapeType, true);
      body.setFloat64(4, record.points[0].x, true);
      body.setFloat64(12, record.points[0].y, true);
      return new Uint8Array(body.buffer);
    }
    const partCount = isMultipoint ? 0 : record.parts.length;
    const pointCount = record.points.length;
    const bytes = 4 + 32 + (isMultipoint ? 0 : 4) + 4 + 4 * partCount + 16 * pointCount;
    const body = new DataView(new ArrayBuffer(bytes));
    body.setInt32(0, shapeType, true);
    const xs = record.points.map((point) => point.x);
    const ys = record.points.map((point) => point.y);
    body.setFloat64(4, Math.min(...xs), true);
    body.setFloat64(12, Math.min(...ys), true);
    body.setFloat64(20, Math.max(...xs), true);
    body.setFloat64(28, Math.max(...ys), true);
    let at = 36;
    if (!isMultipoint) {
      body.setInt32(at, partCount, true);
      at += 4;
    }
    body.setInt32(at, pointCount, true);
    at += 4;
    if (!isMultipoint) {
      for (const part of record.parts) {
        body.setInt32(at, part, true);
        at += 4;
      }
    }
    for (const point of record.points) {
      body.setFloat64(at, point.x, true);
      body.setFloat64(at + 8, point.y, true);
      at += 16;
    }
    return new Uint8Array(body.buffer);
  });

  const total = 100 + bodies.reduce((sum, body) => sum + 8 + body.byteLength, 0);
  const shp = new Uint8Array(total);
  const shpView = new DataView(shp.buffer);
  const shx = new Uint8Array(100 + 8 * bodies.length);
  const shxView = new DataView(shx.buffer);

  const allX = records.flatMap((record) => record.points.map((point) => point.x));
  const allY = records.flatMap((record) => record.points.map((point) => point.y));
  for (const [view, byteLength] of [
    [shpView, total],
    [shxView, shx.byteLength],
  ] as const) {
    view.setInt32(0, 9994, false);
    view.setInt32(24, byteLength / 2, false);
    view.setInt32(28, 1000, true);
    view.setInt32(32, shapeType, true);
    view.setFloat64(36, Math.min(...allX), true);
    view.setFloat64(44, Math.min(...allY), true);
    view.setFloat64(52, Math.max(...allX), true);
    view.setFloat64(60, Math.max(...allY), true);
  }

  let offset = 100;
  bodies.forEach((body, index) => {
    shpView.setInt32(offset, index + 1, false);
    shpView.setInt32(offset + 4, body.byteLength / 2, false);
    shp.set(body, offset + 8);
    shxView.setInt32(100 + 8 * index, offset / 2, false);
    shxView.setInt32(100 + 8 * index + 4, body.byteLength / 2, false);
    offset += 8 + body.byteLength;
  });

  return { shp, shx };
}

// ---------------------------------------------------------------------------
// dBASE
// ---------------------------------------------------------------------------

export interface FixtureDbfField {
  name: string;
  type: "C" | "N" | "F" | "L" | "D";
  length: number;
  decimals?: number;
}

/** Escribe un `.dbf` de dBASE III+ sin campos memo, que es lo del shapefile. */
export function buildDbfBytes(
  fields: readonly FixtureDbfField[],
  rows: ReadonlyArray<readonly string[]>,
): Uint8Array {
  const headerBytes = 32 + 32 * fields.length + 1;
  const recordBytes = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const bytes = new Uint8Array(headerBytes + rows.length * recordBytes + 1);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x03;
  bytes[1] = 26; // 2026
  bytes[2] = 8;
  bytes[3] = 18;
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerBytes, true);
  view.setUint16(10, recordBytes, true);

  fields.forEach((field, index) => {
    const at = 32 + index * 32;
    for (let letter = 0; letter < Math.min(field.name.length, 10); letter += 1)
      bytes[at + letter] = field.name.charCodeAt(letter);
    bytes[at + 11] = field.type.charCodeAt(0);
    bytes[at + 16] = field.length;
    bytes[at + 17] = field.decimals ?? 0;
  });
  bytes[headerBytes - 1] = 0x0d;

  rows.forEach((row, rowIndex) => {
    let at = headerBytes + rowIndex * recordBytes;
    bytes[at] = 0x20;
    at += 1;
    fields.forEach((field, index) => {
      const raw = row[index] ?? "";
      // Los números van alineados a la derecha y el texto a la izquierda: es la
      // convención del formato y el lector la deshace con un `trim`.
      const padded =
        field.type === "N" || field.type === "F"
          ? raw.padStart(field.length, " ")
          : raw.padEnd(field.length, " ");
      for (let letter = 0; letter < field.length; letter += 1)
        bytes[at + letter] = padded.charCodeAt(letter) & 0xff;
      at += field.length;
    });
  });
  bytes[bytes.byteLength - 1] = 0x1a;
  return bytes;
}

// ---------------------------------------------------------------------------
// LAS
// ---------------------------------------------------------------------------

export interface FixtureLasOptions {
  /** Número de puntos. El generador los coloca; no hay que darlos uno a uno. */
  count: number;
  /** 0, 1, 2, 3, 6, 7 u 8. */
  pointFormat?: number;
  /** Versión menor: 2 (cabecera de 227 bytes) o 4 (de 375). */
  versionMinor?: 2 | 4;
  /** Origen del cuadrado que ocupa la nube, en metros. */
  originX?: number;
  originY?: number;
  /** Lado del cuadrado, en metros. */
  spanM?: number;
  /** Rango de cotas, en metros. */
  minZ?: number;
  maxZ?: number;
  /** Código EPSG a declarar en las claves GeoTIFF. Omitido = sin sistema. */
  epsg?: number;
  /** Marca el flujo como comprimido para probar el rechazo del LAZ. */
  pretendCompressed?: boolean;
  /** Semilla del generador. Misma semilla, mismos bytes. */
  seed?: number;
}

const LAS_POINT_BYTES: Readonly<Record<number, number>> = {
  0: 20, 1: 28, 2: 26, 3: 34, 6: 30, 7: 36, 8: 38,
};

/**
 * Escribe un LAS completo con sus puntos.
 *
 * La nube se genera con un generador congruencial propio en vez de con
 * `Math.random`: el banco de pruebas tiene que poder repetir EXACTAMENTE la
 * misma nube en tres procesos distintos, y un archivo distinto en cada corrida
 * convertiría la mediana de tres en la mediana de tres cosas diferentes.
 */
export function buildLasBytes(options: FixtureLasOptions): Uint8Array {
  const {
    count,
    pointFormat = 1,
    versionMinor = 2,
    originX = 660_000,
    originY = 2_140_000,
    spanM = 1_000,
    minZ = 1_500,
    maxZ = 1_560,
    epsg,
    pretendCompressed = false,
    seed = 1,
  } = options;

  const headerBytes = versionMinor >= 4 ? 375 : 227;
  const pointBytes = LAS_POINT_BYTES[pointFormat];
  if (!pointBytes) throw new Error(`Formato de punto ${pointFormat} no soportado por el escritor.`);

  // Registro de claves GeoTIFF: cabecera de 4 enteros de 16 bits y una entrada
  // de otros 4 por clave. Aquí sólo se declara la 3072, el sistema proyectado.
  const geoKeyPayload = epsg === undefined ? 0 : 8 + 8;
  const vlrBytes = epsg === undefined ? 0 : 54 + geoKeyPayload;
  const dataOffset = headerBytes + vlrBytes;

  const bytes = new Uint8Array(dataOffset + count * pointBytes);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x4c; // L
  bytes[1] = 0x41; // A
  bytes[2] = 0x53; // S
  bytes[3] = 0x46; // F
  bytes[24] = 1;
  bytes[25] = versionMinor;
  writeAscii(bytes, 26, "valle-design fixture", 32);
  writeAscii(bytes, 58, "valle-design fixtures.ts", 32);
  view.setUint16(94, headerBytes, true);
  view.setUint32(96, dataOffset, true);
  view.setUint32(100, epsg === undefined ? 0 : 1, true);
  bytes[104] = pointFormat | (pretendCompressed ? 0x80 : 0);
  view.setUint16(105, pointBytes, true);
  view.setUint32(107, versionMinor >= 4 ? 0 : count, true);
  if (versionMinor >= 4) view.setBigUint64(247, BigInt(count), true);

  // Escala de un milímetro: es lo que declara cualquier levantamiento serio y
  // hace que la coordenada entera quepa holgada en 32 bits.
  const scale = 0.001;
  view.setFloat64(131, scale, true);
  view.setFloat64(139, scale, true);
  view.setFloat64(147, scale, true);
  view.setFloat64(155, originX, true);
  view.setFloat64(163, originY, true);
  view.setFloat64(171, 0, true);

  if (epsg !== undefined) {
    const at = headerBytes;
    writeAscii(bytes, at + 2, "LASF_Projection", 16);
    view.setUint16(at + 18, 34_735, true);
    view.setUint16(at + 20, geoKeyPayload, true);
    const keys = at + 54;
    view.setUint16(keys, 1, true); // versión del directorio
    view.setUint16(keys + 2, 1, true);
    view.setUint16(keys + 4, 0, true);
    view.setUint16(keys + 6, 1, true); // una sola clave
    view.setUint16(keys + 8, 3072, true); // ProjectedCSTypeGeoKey
    view.setUint16(keys + 10, 0, true); // el valor va en la propia entrada
    view.setUint16(keys + 12, 1, true);
    view.setUint16(keys + 14, epsg, true);
  }

  let state = seed >>> 0;
  const next = () => {
    // Congruencial lineal de Numerical Recipes: barato, repetible y suficiente
    // para repartir puntos por un cuadrado.
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };

  let minXi = Number.POSITIVE_INFINITY, minYi = Number.POSITIVE_INFINITY, minZi = Number.POSITIVE_INFINITY;
  let maxXi = Number.NEGATIVE_INFINITY, maxYi = Number.NEGATIVE_INFINITY, maxZi = Number.NEGATIVE_INFINITY;
  const classificationAt = pointFormat >= 6 ? 16 : 15;

  for (let index = 0; index < count; index += 1) {
    const at = dataOffset + index * pointBytes;
    const rawX = Math.round((next() * spanM) / scale);
    const rawY = Math.round((next() * spanM) / scale);
    const rawZ = Math.round((minZ + next() * (maxZ - minZ)) / scale);
    view.setInt32(at, rawX, true);
    view.setInt32(at + 4, rawY, true);
    view.setInt32(at + 8, rawZ, true);
    view.setUint16(at + 12, (index * 37) % 65_536, true);
    // Clases de un levantamiento: suelo, vegetación baja, edificio.
    bytes[at + classificationAt] = [2, 3, 6][index % 3];
    minXi = Math.min(minXi, rawX); maxXi = Math.max(maxXi, rawX);
    minYi = Math.min(minYi, rawY); maxYi = Math.max(maxYi, rawY);
    minZi = Math.min(minZi, rawZ); maxZi = Math.max(maxZi, rawZ);
  }

  // El volumen se escribe DESPUÉS de generar los puntos y a partir de ellos: un
  // volumen supuesto sería un volumen que el lector podría contradecir.
  const empty = count === 0;
  view.setFloat64(179, empty ? originX : maxXi * scale + originX, true);
  view.setFloat64(187, empty ? originX : minXi * scale + originX, true);
  view.setFloat64(195, empty ? originY : maxYi * scale + originY, true);
  view.setFloat64(203, empty ? originY : minYi * scale + originY, true);
  view.setFloat64(211, empty ? 0 : maxZi * scale, true);
  view.setFloat64(219, empty ? 0 : minZi * scale, true);

  return bytes;
}

function writeAscii(bytes: Uint8Array, at: number, text: string, length: number): void {
  for (let index = 0; index < Math.min(text.length, length); index += 1)
    bytes[at + index] = text.charCodeAt(index) & 0x7f;
}
