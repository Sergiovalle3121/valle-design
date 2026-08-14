/**
 * Decodificadores de las entidades geométricas nucleares R2000 — fase D2.
 *
 * La PRIMERA geometría real del laboratorio: LINE, POINT, CIRCLE y ARC. Cada
 * decodificador es una función pura sobre lo que sigue a la cabecera común
 * (`entity-common.ts`) y produce el modelo neutral de `src/model/`; el
 * despachador `decodeAc1015EntityBody` une las piezas: común interpretado,
 * geometría del tipo y tramos opacos contabilizados (EED, gráfico y el flujo
 * de handles del final del objeto).
 *
 * Códigos de TIPO BS de estas entidades (hecho registrado en
 * SOURCE_REGISTER, ODA-ODS-DWG-5.4.1-PUBLIC): 0x11 ARC, 0x12 CIRCLE,
 * 0x13 LINE, 0x1B POINT.
 *
 * Reglas del laboratorio:
 * - **Unsupported no es corrupt**: un tipo BS que esta fase no decodifica
 *   lanza `DWG_VERSION_DECODER_UNSUPPORTED` — el archivo puede ser perfecto;
 *   somos nosotros los que aún no llegamos.
 * - **Fallo cerrado**: datos truncados, doubles no finitos, radios negativos
 *   o un tamaño en bits que no cuadra con lo decodificado → error tipado con
 *   su byte relativo al cuerpo.
 * - **Nada se ignora en silencio**: el flujo de handles del final (desde el
 *   bit que declara `bitSize` hasta el último bit del cuerpo) queda anotado
 *   como tramo opaco con su posición exacta.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import type {
  DwgArcEntity,
  DwgCircleEntity,
  DwgGeometryEntity,
  DwgLineEntity,
  DwgPoint3,
  DwgPointEntity,
} from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  readAc1015EntityCommon,
  type Ac1015EntityCommon,
  type Ac1015OpaqueSpan,
} from "./entity-common.js";

/** Códigos de tipo BS de las entidades nucleares (hechos registrados). */
export const AC1015_TYPE_ARC = 0x11;
export const AC1015_TYPE_CIRCLE = 0x12;
export const AC1015_TYPE_LINE = 0x13;
export const AC1015_TYPE_POINT = 0x1b;

/** Una entidad decodificada por completo: común, geometría y restos opacos. */
export interface Ac1015DecodedEntity {
  readonly common: Ac1015EntityCommon;
  readonly entity: DwgGeometryEntity;
  /** EED y gráfico (si los hubo) más el flujo de handles final. */
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/**
 * Decodifica el cuerpo COMPLETO de una entidad nuclear R2000: cabecera común,
 * datos del tipo y contabilidad de los tramos opacos. `bodyBytes` son los
 * bytes exactos del dato de la envoltura D1 (tipo BS incluido); los offsets
 * de error son relativos a su inicio.
 */
export function decodeAc1015EntityBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedEntity {
  // El tipo se decide ANTES de interpretar nada más: los objetos que no son
  // estas cuatro entidades (diccionarios, tablas, otras entidades) tienen
  // cuerpos cuya disposición esta fase no conoce, y fingir que su prólogo es
  // el común de entidad sería desincronizarse en silencio. El tipo vive en el
  // byte 0 del cuerpo; lo desconocido es capacidad ausente, no corrupción.
  const type = peekEntityType(bodyBytes);
  if (
    type !== AC1015_TYPE_LINE &&
    type !== AC1015_TYPE_POINT &&
    type !== AC1015_TYPE_CIRCLE &&
    type !== AC1015_TYPE_ARC
  ) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This entity type is not decoded by the phase-D2 laboratory.",
    );
  }

  const { common, opaqueSpans, reader, bodyBitLength } =
    readAc1015EntityCommon(bodyBytes);

  const entity = decodeEntitySpecific(common.type, reader);

  // El tamaño en bits declarado debe cuadrar EXACTAMENTE con el final de los
  // datos del tipo: ahí arranca el flujo de handles. Un descuadre en
  // cualquier dirección es una estructura desincronizada y no se "recupera".
  if (reader.bitPosition !== common.bitSize) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The declared bit size does not match the decoded entity data.",
    );
  }

  // El flujo de handles del final (propietario según el modo, reactores,
  // xdictionary, capa, ltype/plotstyle si sus banderas lo piden) más el
  // relleno del último byte: opaco, contabilizado, nunca ignorado en silencio.
  const spans: Ac1015OpaqueSpan[] = [...opaqueSpans];
  const handleStreamBits = bodyBitLength - common.bitSize;
  if (handleStreamBits > 0) {
    spans.push(
      Object.freeze({
        kind: "handle-stream" as const,
        startBit: common.bitSize,
        bitLength: handleStreamBits,
      }),
    );
  }

  return Object.freeze({
    common,
    entity,
    opaqueSpans: Object.freeze(spans),
  });
}

/**
 * Relee el tipo BS inicial del cuerpo sobre un cursor propio, sin mover nada
 * del llamador. Un cuerpo que no alcanza ni para su tipo es corrupción.
 */
function peekEntityType(bodyBytes: Uint8Array): number {
  return new DwgBitReader(new BoundedByteCursor(bodyBytes)).readBS();
}

/** Despacha al decodificador del tipo ya verificado como soportado. */
function decodeEntitySpecific(
  type: number,
  reader: DwgBitReader,
): DwgGeometryEntity {
  switch (type) {
    case AC1015_TYPE_LINE:
      return decodeLine(reader);
    case AC1015_TYPE_POINT:
      return decodePoint(reader);
    case AC1015_TYPE_CIRCLE:
      return decodeCircle(reader);
    case AC1015_TYPE_ARC:
      return decodeArc(reader);
    default:
      // Inalcanzable: el despachador sólo se llama tras el filtro de tipos.
      // Si llega, el error es NUESTRO, no del archivo.
      throwDwgError(
        "DWG_INTERNAL_ERROR",
        "internal",
        0,
        "The entity dispatcher reached an unfiltered type.",
      );
  }
}

/**
 * LINE (R2000+): el formato ahorra bits codificando el punto final como
 * deltas DD contra el inicial, y las Z con un bit que declara si ambas son
 * cero. Después, grosor BT y extrusión BE.
 */
function decodeLine(reader: DwgBitReader): DwgLineEntity {
  const zeroZ = reader.readB() === 1;
  const startX = finite(reader, reader.readRD(), "a line start X");
  const endX = finite(reader, reader.readDD(startX), "a line end X");
  const startY = finite(reader, reader.readRD(), "a line start Y");
  const endY = finite(reader, reader.readDD(startY), "a line end Y");
  let startZ = 0;
  let endZ = 0;
  if (!zeroZ) {
    startZ = finite(reader, reader.readRD(), "a line start Z");
    endZ = finite(reader, reader.readDD(startZ), "a line end Z");
  }
  const thickness = finite(reader, reader.readBT(), "a line thickness");
  const extrusion = readExtrusion(reader);
  return Object.freeze({
    kind: "line" as const,
    start: point3(startX, startY, startZ),
    end: point3(endX, endY, endZ),
    thickness,
    extrusion,
  });
}

/** POINT: posición 3BD, grosor BT, extrusión BE y ángulo BD del eje X. */
function decodePoint(reader: DwgBitReader): DwgPointEntity {
  const position = read3BDPoint(reader, "a point position");
  const thickness = finite(reader, reader.readBT(), "a point thickness");
  const extrusion = readExtrusion(reader);
  const xAxisAngle = finite(reader, reader.readBD(), "a point X-axis angle");
  return Object.freeze({
    kind: "point" as const,
    position,
    thickness,
    extrusion,
    xAxisAngle,
  });
}

/** CIRCLE: centro 3BD, radio BD, grosor BT y extrusión BE. */
function decodeCircle(reader: DwgBitReader): DwgCircleEntity {
  const { center, radius, thickness, extrusion } = decodeCircleFields(reader);
  return Object.freeze({
    kind: "circle" as const,
    center,
    radius,
    thickness,
    extrusion,
  });
}

/** ARC: los campos del círculo más los ángulos BD inicial y final. */
function decodeArc(reader: DwgBitReader): DwgArcEntity {
  const { center, radius, thickness, extrusion } = decodeCircleFields(reader);
  const startAngle = finite(reader, reader.readBD(), "an arc start angle");
  const endAngle = finite(reader, reader.readBD(), "an arc end angle");
  return Object.freeze({
    kind: "arc" as const,
    center,
    radius,
    thickness,
    extrusion,
    startAngle,
    endAngle,
  });
}

/** Campos compartidos por CIRCLE y ARC, en su orden. */
function decodeCircleFields(reader: DwgBitReader): {
  center: DwgPoint3;
  radius: number;
  thickness: number;
  extrusion: DwgPoint3;
} {
  const center = read3BDPoint(reader, "a circle center");
  const radius = finite(reader, reader.readBD(), "a circle radius");
  if (radius < 0) {
    // Un radio negativo no describe ningún círculo: estructura corrupta,
    // no una "convención" que inventar.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "A circle radius cannot be negative.",
    );
  }
  const thickness = finite(reader, reader.readBT(), "a circle thickness");
  const extrusion = readExtrusion(reader);
  return { center, radius, thickness, extrusion };
}

/** Un 3BD validado como punto finito del modelo neutral. */
function read3BDPoint(reader: DwgBitReader, what: string): DwgPoint3 {
  const { x, y, z } = reader.read3BD();
  return point3(
    finite(reader, x, what),
    finite(reader, y, what),
    finite(reader, z, what),
  );
}

/** La extrusión BE, validada finita y congelada como punto del modelo. */
function readExtrusion(reader: DwgBitReader): DwgPoint3 {
  const { x, y, z } = reader.readBE();
  return point3(
    finite(reader, x, "an extrusion component"),
    finite(reader, y, "an extrusion component"),
    finite(reader, z, "an extrusion component"),
  );
}

/**
 * NaN o ±Infinity no son geometría: un double no finito en un campo de
 * coordenadas es estructura corrupta (decisión de laboratorio declarada en el
 * worklog), no un valor que propagar al modelo neutral.
 */
function finite(reader: DwgBitReader, value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      `Reading ${what} produced a non-finite number.`,
    );
  }
  return value;
}

function point3(x: number, y: number, z: number): DwgPoint3 {
  return Object.freeze({ x, y, z });
}
