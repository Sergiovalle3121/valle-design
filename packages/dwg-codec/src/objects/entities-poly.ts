/**
 * Decodificador de LWPOLYLINE R2000 — fase D3.
 *
 * La polilínea ligera es la primera entidad del laboratorio con CARDINALIDAD
 * variable: una bandera BS declara qué campos opcionales viajan, un BL cuenta
 * los vértices y el primero llega como 2RD mientras cada siguiente viaja como
 * 2DD contra el anterior — el formato comprime la cadena de vértices delta a
 * delta. Vive en este hermano de `entities-core.ts` para que ninguno de los
 * dos se acerque al presupuesto de 800 líneas; el despachador de tipos sigue
 * siendo único (`decodeAc1015EntityBody`).
 *
 * Bandera BS de presencia (hecho registrado en SOURCE_REGISTER,
 * ODA-ODS-DWG-5.4.1-PUBLIC): 1 extrusión BE, 2 grosor BD, 4 ancho constante
 * BD, 8 elevación BD, 16 recuento de bulges BL, 32 recuento de anchos BL,
 * 512 polilínea cerrada. Los opcionales presentes se leen en el orden ancho
 * constante → elevación → grosor → extrusión.
 *
 * Reglas del laboratorio:
 * - **Unsupported no es corrupt**: un bit de bandera que esta fase no modela
 *   (p. ej. la generación de tipo de línea o los ids de vértice R2010+)
 *   cambiaría la disposición de lo que sigue; fingir que no está sería
 *   desincronizarse en silencio, así que se declara capacidad ausente.
 * - **Fallo cerrado**: recuentos que no caben en los bits del cuerpo,
 *   recuentos de bulges/anchos que no cuadran con los vértices, anchos
 *   negativos o doubles no finitos → error tipado con su byte.
 * - **Presupuesto antes de reservar**: el recuento de vértices se comprueba
 *   contra los bits restantes ANTES de reservar ningún array.
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type {
  DwgLwPolylineEntity,
  DwgPoint2,
  DwgPoint3,
  DwgVertexWidths,
} from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import { finiteDecoded, readFiniteExtrusion } from "./entity-common.js";

/** Código de tipo BS de LWPOLYLINE (hecho registrado). */
export const AC1015_TYPE_LWPOLYLINE = 0x4d;

/** Bits de la bandera BS que esta fase modela (hecho registrado). */
const FLAG_EXTRUSION = 0x1;
const FLAG_THICKNESS = 0x2;
const FLAG_CONSTANT_WIDTH = 0x4;
const FLAG_ELEVATION = 0x8;
const FLAG_BULGE_COUNT = 0x10;
const FLAG_WIDTH_COUNT = 0x20;
const FLAG_CLOSED = 0x200;

const KNOWN_FLAGS =
  FLAG_EXTRUSION |
  FLAG_THICKNESS |
  FLAG_CONSTANT_WIDTH |
  FLAG_ELEVATION |
  FLAG_BULGE_COUNT |
  FLAG_WIDTH_COUNT |
  FLAG_CLOSED;

/** Bits mínimos de un vértice delta: dos banderas DD con ambos por defecto. */
const MIN_BITS_PER_DELTA_VERTEX = 4;
/** Bits exactos del primer vértice: dos RD completos. */
const BITS_FIRST_VERTEX = 128;

/**
 * Decodifica los datos específicos de una LWPOLYLINE a partir del lector que
 * `readAc1015EntityCommon` deja posicionado tras la cabecera común. El
 * despachador comprueba después que el tamaño en bits declarado cuadra
 * EXACTAMENTE, así que aquí sólo hay que leer en el orden del formato y
 * fallar cerrado ante lo imposible.
 */
export function decodeLwPolyline(reader: DwgBitReader): DwgLwPolylineEntity {
  const flags = reader.readBS();
  if ((flags & ~KNOWN_FLAGS) !== 0) {
    // Un bit no modelado declara campos cuya disposición esta fase no
    // conoce: seguir leyendo sería interpretar bits desplazados. El archivo
    // puede ser perfecto — capacidad ausente, no corrupción.
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      byteOf(reader),
      "This LWPOLYLINE flag bit is not decoded by the phase-D3 laboratory.",
    );
  }

  const constantWidth =
    (flags & FLAG_CONSTANT_WIDTH) !== 0
      ? nonNegative(
          reader,
          finiteDecoded(reader, reader.readBD(), "a polyline constant width"),
          "constant width",
        )
      : undefined;
  const elevation =
    (flags & FLAG_ELEVATION) !== 0
      ? finiteDecoded(reader, reader.readBD(), "a polyline elevation")
      : undefined;
  const thickness =
    (flags & FLAG_THICKNESS) !== 0
      ? finiteDecoded(reader, reader.readBD(), "a polyline thickness")
      : undefined;
  const extrusion: DwgPoint3 | undefined =
    (flags & FLAG_EXTRUSION) !== 0 ? readFiniteExtrusion(reader) : undefined;

  const vertexCount = reader.readBL();
  if (vertexCount < 1) {
    // Cero vértices no describen ninguna polilínea.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      "A polyline needs at least one vertex.",
    );
  }
  // Presupuesto ANTES de reservar: aun con todos los atajos DD, los vértices
  // declarados necesitan estos bits como mínimo. Un recuento que ni así cabe
  // es un dato mentiroso y no merece ni un array.
  const minimumVertexBits =
    BITS_FIRST_VERTEX + (vertexCount - 1) * MIN_BITS_PER_DELTA_VERTEX;
  if (minimumVertexBits > reader.bitsRemaining) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      "The declared vertex count cannot fit inside the object body.",
    );
  }

  let bulgeCount = 0;
  if ((flags & FLAG_BULGE_COUNT) !== 0) {
    bulgeCount = reader.readBL();
    if (bulgeCount !== vertexCount) {
      // El modelo neutral alinea un bulge por vértice; un recuento distinto
      // no tiene interpretación conocida (decisión de laboratorio declarada).
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        byteOf(reader),
        "The bulge count does not match the polyline vertex count.",
      );
    }
  }
  let widthCount = 0;
  if ((flags & FLAG_WIDTH_COUNT) !== 0) {
    widthCount = reader.readBL();
    if (widthCount !== vertexCount) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        byteOf(reader),
        "The width count does not match the polyline vertex count.",
      );
    }
  }

  // La cadena de vértices: el primero completo, los demás delta a delta
  // contra el anterior (cada componente DD usa el componente previo como
  // valor por defecto).
  const vertices = new Array<DwgPoint2>(vertexCount);
  let previousX = finiteDecoded(reader, reader.readRD(), "a vertex X");
  let previousY = finiteDecoded(reader, reader.readRD(), "a vertex Y");
  vertices[0] = Object.freeze({ x: previousX, y: previousY });
  for (let index = 1; index < vertexCount; index += 1) {
    previousX = finiteDecoded(reader, reader.readDD(previousX), "a vertex X");
    previousY = finiteDecoded(reader, reader.readDD(previousY), "a vertex Y");
    vertices[index] = Object.freeze({ x: previousX, y: previousY });
  }

  let bulges: readonly number[] | undefined;
  if (bulgeCount > 0) {
    const values = new Array<number>(bulgeCount);
    for (let index = 0; index < bulgeCount; index += 1) {
      // El bulge puede ser negativo (arco horario): sólo se exige finito.
      values[index] = finiteDecoded(reader, reader.readBD(), "a vertex bulge");
    }
    bulges = Object.freeze(values);
  }

  let widths: readonly DwgVertexWidths[] | undefined;
  if (widthCount > 0) {
    const values = new Array<DwgVertexWidths>(widthCount);
    for (let index = 0; index < widthCount; index += 1) {
      const start = nonNegative(
        reader,
        finiteDecoded(reader, reader.readBD(), "a vertex start width"),
        "start width",
      );
      const end = nonNegative(
        reader,
        finiteDecoded(reader, reader.readBD(), "a vertex end width"),
        "end width",
      );
      values[index] = Object.freeze({ start, end });
    }
    widths = Object.freeze(values);
  }

  return Object.freeze({
    kind: "lwpolyline" as const,
    closed: (flags & FLAG_CLOSED) !== 0,
    vertices: Object.freeze(vertices),
    bulges,
    widths,
    constantWidth,
    elevation,
    thickness,
    extrusion,
  });
}

/**
 * Un ancho negativo no describe ningún trazo: estructura corrupta (decisión
 * de laboratorio declarada en el worklog), igual que el radio negativo de D2.
 */
function nonNegative(
  reader: DwgBitReader,
  value: number,
  what: string,
): number {
  if (value < 0) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      `A polyline ${what} cannot be negative.`,
    );
  }
  return value;
}

/** El byte (relativo al cuerpo) donde está parado el lector, para errores. */
function byteOf(reader: DwgBitReader): number {
  return Math.floor(reader.bitPosition / 8);
}
