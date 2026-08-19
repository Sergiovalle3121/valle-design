/**
 * Lector de shapefile (.shp) — el formato en el que llega un predio.
 *
 * ## Por qué éste y no otro
 *
 * Un arquitecto mexicano recibe el levantamiento de su terreno del topógrafo, y
 * lo que le llega es un shapefile: el polígono del predio, los linderos, a veces
 * las manzanas del entorno. Es también lo que publican el catastro municipal y
 * el INEGI. De los tres formatos de la fila —malla LAS, ráster GeoTIFF, vector
 * SHP— éste es el que aparece en el correo de un despacho de verdad.
 *
 * ## Lo que se lee y lo que NO
 *
 * SE LEE: el archivo principal `.shp` completo —punto, polilínea, polígono y
 * multipunto, con sus variantes Z y M—, el índice `.shx` cuando se aporta (como
 * comprobación redundante, no como fuente) y la tabla de atributos `.dbf`.
 *
 * NO SE LEE: MultiPatch (tipo 31), que es geometría 3D de fachadas y no aparece
 * en catastro. Se rechaza por su nombre en vez de leerse a medias.
 *
 * ## Fallo cerrado, y por qué aquí más que en ningún sitio
 *
 * Un DXF mal leído se ve: falta un muro, sobra un texto. Un shapefile mal leído
 * NO se ve. Sale un polígono cerrado, con superficie, con rumbos, con pinta de
 * predio — sólo que no es el predio. Si esa lámina se protocoliza, el error se
 * descubre cuando el vecino levanta su barda.
 *
 * Por eso este lector no perdona nada:
 *
 *   · El código de archivo tiene que ser 9994 y la versión 1000.
 *   · La longitud declarada en la cabecera tiene que coincidir EXACTAMENTE con
 *     los bytes que hay. Ni de más (basura al final) ni de menos (descarga
 *     cortada).
 *   · Los números de registro tienen que ir 1, 2, 3… sin saltos.
 *   · La longitud de contenido de cada registro tiene que coincidir EXACTAMENTE
 *     con la que exigen sus partes y sus puntos. Ésta es la comprobación que
 *     caza un desplazamiento de un solo byte, que es la avería que produce
 *     coordenadas plausibles y falsas.
 *   · Todo punto tiene que caer dentro del rectángulo declarado en la cabecera.
 *   · Los anillos de un polígono tienen que estar cerrados y tener cuatro
 *     vértices como mínimo.
 *
 * Cualquiera de esas condiciones que falle aborta la lectura ENTERA. No se
 * devuelve «lo que sí se entendió»: lo que sí se entendió de un archivo roto es
 * precisamente la trampa.
 *
 * Fuente del formato: ESRI, «ESRI Shapefile Technical Description», documento
 * técnico J-7855, julio de 1998. Todos los desplazamientos y tipos de este
 * archivo salen de ahí.
 */
import type { GeoCrs } from "./crs";
import { parseGeoCrsWkt } from "./crs";
import { GeoError, geoAssert } from "./errors";

/** Código mágico del archivo principal, big-endian en el byte 0. */
const SHP_FILE_CODE = 9994;
/** Única versión que el formato ha tenido nunca. */
const SHP_VERSION = 1000;
/** Cabecera del `.shp` y del `.shx`: 100 bytes fijos. */
const SHP_HEADER_BYTES = 100;
/** Valor por debajo del cual una medida M significa «sin dato». Sección 2. */
const SHP_NO_DATA_THRESHOLD = -1e38;

/** Tipos de geometría del formato. El número es el del documento técnico. */
export const SHP_SHAPE_TYPES = {
  null: 0,
  point: 1,
  polyline: 3,
  polygon: 5,
  multipoint: 8,
  pointZ: 11,
  polylineZ: 13,
  polygonZ: 15,
  multipointZ: 18,
  pointM: 21,
  polylineM: 23,
  polygonM: 25,
  multipointM: 28,
  multipatch: 31,
} as const;

export type GeoShapeKind = "null" | "point" | "polyline" | "polygon" | "multipoint";

export interface GeoBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Un vértice tal cual venía en el archivo, en el sistema del archivo. */
export interface GeoVertex {
  x: number;
  y: number;
  /** Cota, sólo en las variantes Z. */
  z?: number;
  /** Medida (distancia acumulada, tiempo…), sólo si el archivo la trae. */
  m?: number;
}

/**
 * Una geometría del archivo.
 *
 * `parts` son los índices donde arranca cada anillo o cada tramo dentro de
 * `vertices`. Se conserva la estructura del formato en vez de aplanarla: un
 * predio con patio interior es UN polígono con DOS anillos, y aplanarlo
 * convertiría el hueco en superficie construida.
 */
export interface GeoShape {
  /** Número de registro del archivo, 1-basado. Es la clave con el `.dbf`. */
  recordNumber: number;
  kind: GeoShapeKind;
  vertices: GeoVertex[];
  /** Vacío para punto y multipunto; con un índice por anillo o tramo si no. */
  parts: number[];
}

export interface GeoShapefile {
  /** Tipo declarado en la cabecera. Todos los registros lo comparten. */
  shapeType: number;
  kind: GeoShapeKind;
  /** Rectángulo declarado en la cabecera del archivo. */
  declaredBounds: GeoBoundingBox;
  /** Rectángulo REAL de los vértices leídos. Puede ser menor que el declarado. */
  measuredBounds: GeoBoundingBox;
  shapes: GeoShape[];
  vertexCount: number;
  /** Sistema de referencia leído del `.prj`, si se aportó. */
  crs?: GeoCrs;
  /** `true` si se aportó `.shx` y todos sus desplazamientos cuadraron. */
  indexVerified: boolean;
}

export interface GeoShapefileInput {
  /** Bytes del `.shp`. Obligatorio. */
  shp: ArrayBuffer | Uint8Array;
  /** Bytes del `.shx`. Opcional; si viene, se usa para comprobar, no para leer. */
  shx?: ArrayBuffer | Uint8Array;
  /** Texto del `.prj`. Opcional; si viene, decide el sistema de referencia. */
  prj?: string;
  /** Nombre del archivo, sólo para que los mensajes de error digan cuál era. */
  name?: string;
  /**
   * Tope de vértices. Un `.shp` de catastro municipal puede traer millones y
   * reventar la pestaña; el tope convierte eso en un error con nombre.
   */
  maxVertices?: number;
}

/** Un millón de vértices es un municipio entero. Más que eso es otro problema. */
export const GEO_SHAPEFILE_MAX_VERTICES = 1_000_000;

const KIND_BY_TYPE: Readonly<Record<number, GeoShapeKind>> = {
  0: "null",
  1: "point",
  3: "polyline",
  5: "polygon",
  8: "multipoint",
  11: "point",
  13: "polyline",
  15: "polygon",
  18: "multipoint",
  21: "point",
  23: "polyline",
  25: "polygon",
  28: "multipoint",
};

/** ¿La variante trae arreglo de cotas Z? Tipos 11, 13, 15, 18. */
const hasZ = (type: number) => type >= 11 && type <= 18;
/** ¿La variante trae arreglo de medidas M? Las Z lo traen opcional; las M, obligatorio. */
const hasM = (type: number) => (type >= 11 && type <= 18) || (type >= 21 && type <= 28);

function toView(bytes: ArrayBuffer | Uint8Array): DataView {
  return bytes instanceof Uint8Array
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new DataView(bytes);
}

/**
 * Lee un shapefile completo.
 *
 * Devuelve la geometría EN EL SISTEMA DEL ARCHIVO. La reproyección es un paso
 * aparte y deliberadamente explícito: mezclar leer y reproyectar hace imposible
 * distinguir un error de lectura de uno de reproyección, y son averías con
 * arreglos distintos.
 */
export function readShapefile(input: GeoShapefileInput): GeoShapefile {
  const source = input.name ?? "(sin nombre)";
  const maxVertices = input.maxVertices ?? GEO_SHAPEFILE_MAX_VERTICES;
  const view = toView(input.shp);

  geoAssert(
    view.byteLength >= SHP_HEADER_BYTES,
    "archivo-truncado",
    `El archivo tiene ${view.byteLength} bytes y la cabecera de un shapefile ocupa ${SHP_HEADER_BYTES}.`,
    { source, detail: { bytes: view.byteLength } },
  );

  const fileCode = view.getInt32(0, false);
  geoAssert(
    fileCode === SHP_FILE_CODE,
    "formato-desconocido",
    `El archivo no es un .shp: su código es ${fileCode} y debería ser ${SHP_FILE_CODE}. ` +
      "Si lo abriste desde un .zip, comprueba que extrajiste el .shp y no el .dbf o el .shx.",
    { source, detail: { fileCode } },
  );
  const version = view.getInt32(28, true);
  geoAssert(
    version === SHP_VERSION,
    "variante-no-soportada",
    `Versión de shapefile ${version}; la única que existe es la ${SHP_VERSION}.`,
    { source, detail: { version } },
  );

  // La longitud va en PALABRAS de 16 bits, cabecera incluida. Que cuadre al byte
  // es lo que distingue una descarga completa de una cortada, y una descarga
  // cortada de un shapefile es un predio al que le faltan vértices.
  const declaredBytes = view.getInt32(24, false) * 2;
  geoAssert(
    declaredBytes === view.byteLength,
    declaredBytes > view.byteLength ? "archivo-truncado" : "longitud-incoherente",
    declaredBytes > view.byteLength
      ? `El archivo declara ${declaredBytes} bytes y sólo hay ${view.byteLength}: la descarga se ` +
        "cortó. Vuelve a pedir el archivo; leer lo que llegó daría un predio incompleto con " +
        "aspecto de completo."
      : `El archivo declara ${declaredBytes} bytes y hay ${view.byteLength}: sobran datos al final.`,
    { source, detail: { declaredBytes, actualBytes: view.byteLength } },
  );

  const shapeType = view.getInt32(32, true);
  geoAssert(
    shapeType !== SHP_SHAPE_TYPES.multipatch,
    "variante-no-soportada",
    "El archivo es de tipo MultiPatch (31): geometría de superficies 3D. Este producto lee " +
      "puntos, polilíneas, polígonos y multipuntos, que es lo que trae un levantamiento de predio.",
    { source, detail: { shapeType } },
  );
  const kind = KIND_BY_TYPE[shapeType];
  geoAssert(
    kind !== undefined,
    "variante-no-soportada",
    `Tipo de geometría ${shapeType} desconocido para este lector.`,
    { source, detail: { shapeType } },
  );

  const declaredBounds: GeoBoundingBox = {
    minX: view.getFloat64(36, true),
    minY: view.getFloat64(44, true),
    maxX: view.getFloat64(52, true),
    maxY: view.getFloat64(60, true),
  };
  assertFiniteBounds(declaredBounds, source);

  const crs = input.prj !== undefined ? parseGeoCrsWkt(input.prj) : undefined;

  const shapes: GeoShape[] = [];
  const offsets: number[] = [];
  const measured: GeoBoundingBox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  let vertexCount = 0;
  let offset = SHP_HEADER_BYTES;
  let expectedRecord = 1;

  while (offset < view.byteLength) {
    geoAssert(
      offset + 8 <= view.byteLength,
      "archivo-truncado",
      `La cabecera del registro ${expectedRecord} se sale del archivo (byte ${offset}).`,
      { source, detail: { offset, record: expectedRecord } },
    );
    const recordNumber = view.getInt32(offset, false);
    geoAssert(
      recordNumber === expectedRecord,
      "indice-incoherente",
      `Se esperaba el registro ${expectedRecord} y el archivo dice ${recordNumber} (byte ${offset}). ` +
        "La numeración de un shapefile es correlativa desde 1; un salto significa que la lectura " +
        "se ha desalineado y que todo lo que venga después sería inventado.",
      { source, detail: { offset, expected: expectedRecord, found: recordNumber } },
    );
    const contentBytes = view.getInt32(offset + 4, false) * 2;
    geoAssert(
      contentBytes >= 4 && offset + 8 + contentBytes <= view.byteLength,
      contentBytes >= 4 ? "archivo-truncado" : "longitud-incoherente",
      `El registro ${recordNumber} declara ${contentBytes} bytes de contenido y no caben en el archivo.`,
      { source, detail: { record: recordNumber, contentBytes, offset } },
    );

    offsets.push(offset);
    const shape = readRecord(view, offset + 8, contentBytes, shapeType, recordNumber, source);
    for (const vertex of shape.vertices) {
      if (vertex.x < measured.minX) measured.minX = vertex.x;
      if (vertex.y < measured.minY) measured.minY = vertex.y;
      if (vertex.x > measured.maxX) measured.maxX = vertex.x;
      if (vertex.y > measured.maxY) measured.maxY = vertex.y;
    }
    vertexCount += shape.vertices.length;
    geoAssert(
      vertexCount <= maxVertices,
      "demasiado-grande",
      `El archivo pasa de ${maxVertices} vértices. Recórtalo en el programa de origen: cargarlo ` +
        "entero dejaría el navegador sin memoria a mitad de la lectura.",
      { source, detail: { vertexCount, maxVertices } },
    );
    shapes.push(shape);

    offset += 8 + contentBytes;
    expectedRecord += 1;
  }

  geoAssert(
    shapes.length > 0,
    "geometria-invalida",
    "El shapefile no contiene ni un registro. Un archivo vacío que se importa «con éxito» es peor " +
      "que un error: parece que el predio entró y no entró nada.",
    { source },
  );

  // Todo vértice tiene que caber en el rectángulo que anuncia la cabecera. Un
  // punto fuera significa que se está leyendo en el sitio equivocado — y es la
  // comprobación que sobrevive a un archivo cuyo rectángulo quedó holgado.
  if (Number.isFinite(measured.minX)) {
    const slack = boundsSlack(declaredBounds);
    geoAssert(
      measured.minX >= declaredBounds.minX - slack &&
        measured.minY >= declaredBounds.minY - slack &&
        measured.maxX <= declaredBounds.maxX + slack &&
        measured.maxY <= declaredBounds.maxY + slack,
      "geometria-invalida",
      "Hay vértices fuera del rectángulo que declara la cabecera. El archivo se contradice a sí " +
        "mismo y la geometría no se puede dar por buena.",
      {
        source,
        detail: {
          declarado: `${declaredBounds.minX},${declaredBounds.minY} → ${declaredBounds.maxX},${declaredBounds.maxY}`,
          medido: `${measured.minX},${measured.minY} → ${measured.maxX},${measured.maxY}`,
        },
      },
    );
  }

  const indexVerified = input.shx !== undefined ? verifyIndex(input.shx, offsets, source) : false;

  return {
    shapeType,
    kind,
    declaredBounds,
    measuredBounds: Number.isFinite(measured.minX) ? measured : { ...declaredBounds },
    shapes,
    vertexCount,
    ...(crs ? { crs } : {}),
    indexVerified,
  };
}

/**
 * Lee UN registro y comprueba que su longitud declarada es exactamente la que
 * exige su contenido.
 *
 * Esa igualdad es la guardia más importante del archivo. Un lector que sólo
 * comprueba «cabe» avanza feliz sobre un fichero desplazado un byte y devuelve
 * coordenadas que son basura interpretada como dobles: números grandes,
 * finitos, con pinta de UTM. La igualdad exacta lo corta en el primer registro.
 */
function readRecord(
  view: DataView,
  start: number,
  contentBytes: number,
  fileShapeType: number,
  recordNumber: number,
  source: string,
): GeoShape {
  const type = view.getInt32(start, true);
  if (type === SHP_SHAPE_TYPES.null) {
    geoAssert(
      contentBytes === 4,
      "longitud-incoherente",
      `El registro nulo ${recordNumber} declara ${contentBytes} bytes y un nulo ocupa 4.`,
      { source, detail: { record: recordNumber, contentBytes } },
    );
    return { recordNumber, kind: "null", vertices: [], parts: [] };
  }
  geoAssert(
    type === fileShapeType,
    "indice-incoherente",
    `El registro ${recordNumber} es de tipo ${type} y el archivo declara ${fileShapeType}. Un ` +
      "shapefile no puede mezclar geometrías.",
    { source, detail: { record: recordNumber, type, fileShapeType } },
  );

  const kind = KIND_BY_TYPE[type];
  return kind === "point"
    ? readPoint(view, start, contentBytes, type, recordNumber, source)
    : readCollection(view, start, contentBytes, type, kind, recordNumber, source);
}

function readPoint(
  view: DataView,
  start: number,
  contentBytes: number,
  type: number,
  recordNumber: number,
  source: string,
): GeoShape {
  // 4 (tipo) + 16 (x, y) + 8 si Z + 8 si M. En el punto Z la M es obligatoria
  // según el documento técnico, así que sólo hay dos tamaños legales por tipo.
  const expected = 4 + 16 + (hasZ(type) ? 8 : 0) + (hasM(type) ? 8 : 0);
  geoAssert(
    contentBytes === expected,
    "longitud-incoherente",
    `El punto ${recordNumber} declara ${contentBytes} bytes y su tipo exige ${expected}.`,
    { source, detail: { record: recordNumber, contentBytes, expected } },
  );
  const vertex: GeoVertex = {
    x: coordinate(view, start + 4, recordNumber, source),
    y: coordinate(view, start + 12, recordNumber, source),
  };
  if (hasZ(type)) vertex.z = coordinate(view, start + 20, recordNumber, source);
  if (hasM(type)) {
    const m = view.getFloat64(start + 20 + (hasZ(type) ? 8 : 0), true);
    if (m > SHP_NO_DATA_THRESHOLD) vertex.m = m;
  }
  return { recordNumber, kind: "point", vertices: [vertex], parts: [] };
}

function readCollection(
  view: DataView,
  start: number,
  contentBytes: number,
  type: number,
  kind: GeoShapeKind,
  recordNumber: number,
  source: string,
): GeoShape {
  const multipoint = kind === "multipoint";
  // Disposición del documento técnico: tipo, rectángulo, [nº de partes],
  // nº de puntos, [partes], puntos, [rango Z + cotas], [rango M + medidas].
  let cursor = start + 4 + 32;
  let partCount = 0;
  if (!multipoint) {
    partCount = view.getInt32(cursor, true);
    cursor += 4;
  }
  const pointCount = view.getInt32(cursor, true);
  cursor += 4;

  geoAssert(
    pointCount > 0 && pointCount <= 10_000_000 && (multipoint || partCount > 0),
    "geometria-invalida",
    `El registro ${recordNumber} declara ${partCount} parte(s) y ${pointCount} punto(s).`,
    { source, detail: { record: recordNumber, partCount, pointCount } },
  );
  geoAssert(
    multipoint || partCount <= pointCount,
    "geometria-invalida",
    `El registro ${recordNumber} declara más partes (${partCount}) que puntos (${pointCount}).`,
    { source, detail: { record: recordNumber, partCount, pointCount } },
  );

  const zBytes = hasZ(type) ? 16 + 8 * pointCount : 0;
  const mBytes = 16 + 8 * pointCount;
  const base = 4 + 32 + (multipoint ? 0 : 4) + 4 + 4 * partCount + 16 * pointCount;
  // La M es opcional incluso donde el tipo la contempla: hay productores que la
  // omiten. Se admiten los dos tamaños y NADA más — cualquier otro número
  // significa que las cuentas del archivo no cierran.
  const legalSizes = hasM(type) ? [base + zBytes, base + zBytes + mBytes] : [base + zBytes];
  geoAssert(
    legalSizes.includes(contentBytes),
    "longitud-incoherente",
    `El registro ${recordNumber} declara ${contentBytes} bytes y sus ${partCount} parte(s) con ` +
      `${pointCount} punto(s) exigen ${legalSizes.join(" o ")}. Cuando estas cuentas no cuadran, ` +
      "la lectura está desplazada y las coordenadas siguientes serían inventadas.",
    { source, detail: { record: recordNumber, contentBytes, expected: legalSizes.join("|") } },
  );

  const parts: number[] = [];
  if (!multipoint) {
    for (let index = 0; index < partCount; index += 1) {
      const value = view.getInt32(cursor + 4 * index, true);
      geoAssert(
        value >= 0 && value < pointCount && (index === 0 ? value === 0 : value > parts[index - 1]),
        "indice-incoherente",
        `Los índices de parte del registro ${recordNumber} no son crecientes desde 0.`,
        { source, detail: { record: recordNumber, part: index, value } },
      );
      parts.push(value);
    }
    cursor += 4 * partCount;
  }

  const vertices: GeoVertex[] = new Array(pointCount);
  for (let index = 0; index < pointCount; index += 1)
    vertices[index] = {
      x: coordinate(view, cursor + 16 * index, recordNumber, source),
      y: coordinate(view, cursor + 16 * index + 8, recordNumber, source),
    };
  cursor += 16 * pointCount;

  if (hasZ(type)) {
    cursor += 16; // rango Z: se ignora, las cotas mandan
    for (let index = 0; index < pointCount; index += 1)
      vertices[index].z = coordinate(view, cursor + 8 * index, recordNumber, source);
    cursor += 8 * pointCount;
  }
  if (hasM(type) && contentBytes === base + zBytes + mBytes) {
    cursor += 16; // rango M
    for (let index = 0; index < pointCount; index += 1) {
      const m = view.getFloat64(cursor + 8 * index, true);
      if (m > SHP_NO_DATA_THRESHOLD) vertices[index].m = m;
    }
  }

  if (kind === "polygon") assertClosedRings(vertices, parts, recordNumber, source);
  if (kind === "polyline") assertUsableParts(vertices, parts, recordNumber, source, 2);

  return { recordNumber, kind, vertices, parts };
}

/**
 * Un anillo abierto no es un polígono: es una polilínea con aspiraciones.
 *
 * El documento técnico exige que el primer vértice y el último coincidan. Si no
 * coinciden, calcular la superficie del predio devolvería un número —siempre
 * devuelve un número—, y ese número estaría mal.
 */
function assertClosedRings(
  vertices: readonly GeoVertex[],
  parts: readonly number[],
  recordNumber: number,
  source: string,
): void {
  assertUsableParts(vertices, parts, recordNumber, source, 4);
  for (let index = 0; index < parts.length; index += 1) {
    const from = parts[index];
    const to = index + 1 < parts.length ? parts[index + 1] : vertices.length;
    const first = vertices[from];
    const last = vertices[to - 1];
    geoAssert(
      first.x === last.x && first.y === last.y,
      "geometria-invalida",
      `El anillo ${index + 1} del polígono ${recordNumber} no cierra: empieza en ` +
        `(${first.x}, ${first.y}) y acaba en (${last.x}, ${last.y}).`,
      { source, detail: { record: recordNumber, ring: index + 1 } },
    );
  }
}

function assertUsableParts(
  vertices: readonly GeoVertex[],
  parts: readonly number[],
  recordNumber: number,
  source: string,
  minimum: number,
): void {
  for (let index = 0; index < parts.length; index += 1) {
    const from = parts[index];
    const to = index + 1 < parts.length ? parts[index + 1] : vertices.length;
    geoAssert(
      to - from >= minimum,
      "geometria-invalida",
      `La parte ${index + 1} del registro ${recordNumber} tiene ${to - from} vértice(s) y necesita ` +
        `al menos ${minimum}.`,
      { source, detail: { record: recordNumber, part: index + 1, vertices: to - from } },
    );
  }
}

function coordinate(view: DataView, offset: number, recordNumber: number, source: string): number {
  const value = view.getFloat64(offset, true);
  geoAssert(
    Number.isFinite(value) && Math.abs(value) < 1e15,
    "coordenada-invalida",
    `El registro ${recordNumber} trae la coordenada ${value} en el byte ${offset}. No es un número ` +
      "utilizable: casi siempre es señal de que la lectura se desplazó.",
    { source, detail: { record: recordNumber, offset, value: String(value) } },
  );
  return value;
}

function assertFiniteBounds(bounds: GeoBoundingBox, source: string): void {
  geoAssert(
    Number.isFinite(bounds.minX) &&
      Number.isFinite(bounds.minY) &&
      Number.isFinite(bounds.maxX) &&
      Number.isFinite(bounds.maxY) &&
      bounds.minX <= bounds.maxX &&
      bounds.minY <= bounds.maxY,
    "geometria-invalida",
    "El rectángulo de la cabecera no es un rectángulo válido.",
    { source },
  );
}

/** Holgura para comparar contra el rectángulo declarado: relativa, nunca absoluta. */
function boundsSlack(bounds: GeoBoundingBox): number {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  return span * 1e-9;
}

/**
 * Comprueba el `.shx` contra los desplazamientos que ya se leyeron.
 *
 * El índice NO se usa para leer: leer por el índice y leer en secuencia darían
 * el mismo resultado en un archivo sano y resultados DISTINTOS en uno roto, y
 * entonces el archivo roto tendría dos lecturas plausibles. Se lee en secuencia
 * y el índice sirve de segunda opinión.
 */
function verifyIndex(
  shx: ArrayBuffer | Uint8Array,
  offsets: readonly number[],
  source: string,
): boolean {
  const view = toView(shx);
  geoAssert(
    view.byteLength === SHP_HEADER_BYTES + 8 * offsets.length,
    "indice-incoherente",
    `El .shx mide ${view.byteLength} bytes y para ${offsets.length} registro(s) debería medir ` +
      `${SHP_HEADER_BYTES + 8 * offsets.length}.`,
    { source, detail: { bytes: view.byteLength, records: offsets.length } },
  );
  geoAssert(
    view.getInt32(0, false) === SHP_FILE_CODE,
    "formato-desconocido",
    "El archivo aportado como .shx no lo es.",
    { source },
  );
  for (let index = 0; index < offsets.length; index += 1) {
    const indexed = view.getInt32(SHP_HEADER_BYTES + 8 * index, false) * 2;
    geoAssert(
      indexed === offsets[index],
      "indice-incoherente",
      `El .shx sitúa el registro ${index + 1} en el byte ${indexed} y en el .shp está en el ` +
        `${offsets[index]}. Los dos archivos no son del mismo conjunto.`,
      { source, detail: { record: index + 1, shx: indexed, shp: offsets[index] } },
    );
  }
  return true;
}

/**
 * Superficie con signo de un anillo, en unidades del sistema al cuadrado.
 *
 * Se expone porque es la pregunta que hace un arquitecto en cuanto ve el predio
 * en pantalla —«¿cuántos metros son?»— y porque el SIGNO importa: en el formato,
 * un anillo en sentido horario es contorno exterior y uno antihorario es hueco.
 * Devolver el valor absoluto sumaría el patio a la superficie del terreno.
 */
export function shapeRingSignedArea(shape: GeoShape, ringIndex: number): number {
  geoAssert(
    ringIndex >= 0 && ringIndex < Math.max(1, shape.parts.length),
    "indice-incoherente",
    `El registro ${shape.recordNumber} no tiene un anillo ${ringIndex}.`,
    { detail: { record: shape.recordNumber, ringIndex } },
  );
  const from = shape.parts[ringIndex] ?? 0;
  const to = ringIndex + 1 < shape.parts.length ? shape.parts[ringIndex + 1] : shape.vertices.length;
  let total = 0;
  for (let index = from; index < to - 1; index += 1) {
    const a = shape.vertices[index];
    const b = shape.vertices[index + 1];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/**
 * Superficie neta de un polígono: exteriores menos huecos.
 *
 * Sale de sumar las superficies con signo de todos sus anillos, que es
 * exactamente la convención del formato. Un predio con patio da la superficie
 * del terreno sin el patio, que es la que va en la escritura.
 */
export function polygonNetArea(shape: GeoShape): number {
  geoAssert(
    shape.kind === "polygon",
    "geometria-invalida",
    `El registro ${shape.recordNumber} no es un polígono.`,
    { detail: { record: shape.recordNumber, kind: shape.kind } },
  );
  const rings = Math.max(1, shape.parts.length);
  let total = 0;
  for (let index = 0; index < rings; index += 1) total += shapeRingSignedArea(shape, index);
  // El formato usa horario positivo y la fórmula de la lazada da lo contrario:
  // se invierte el signo para que un contorno exterior salga positivo.
  return -total;
}

export { GeoError };
