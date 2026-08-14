/**
 * Cabecera común de una entidad R2000 (AC1015) — fases D2/D3.
 *
 * Todas las entidades del cuerpo del dibujo comparten el mismo prólogo antes
 * de sus campos específicos, y los objetos que NO son entidades (las tablas
 * de símbolos de la fase D3) comparten con ellas el arranque de ese prólogo:
 * tipo, tamaño en bits, handle y EED (`readAc1015ObjectPrologue`). Este
 * módulo lo decodifica desde el CUERPO de la envoltura (los `bodyBytes` que
 * la fase D1 devuelve, tipo BS incluido):
 *
 * - tipo BS (se relee aquí: todo lo demás depende de su anchura en bits);
 * - tamaño RL del dato en BITS (R2000+), contado desde el PRIMER bit del dato
 *   — el del tipo — hasta donde arranca el flujo de handles;
 * - handle propio H del objeto;
 * - grupos EED (tamaño BS + handle H de aplicación + esos bytes, hasta un
 *   tamaño cero) — NO se interpretan: se CONTABILIZAN como tramo opaco;
 * - bit de gráfico de previsualización; a 1 le siguen tamaño RL y bytes, que
 *   también se contabilizan opacos;
 * - modo de entidad BB, recuento de reactores BL, bit de sin-vínculos,
 *   color CmC, escala de tipo de línea BD, banderas de tipo de línea BB,
 *   banderas de plotstyle BB, invisibilidad BS y lineweight RC.
 *
 * Lo que esta fase decide NO interpretar (EED, gráfico y el flujo de handles
 * del final: propietario/reactores/xdictionary/capa/ltype) queda ANOTADO como
 * tramo opaco con su posición exacta en bits — jamás se ignora en silencio
 * (AGENTS.md: no rellenar desconocidos con cero ni recuperar en silencio).
 *
 * Reglas del laboratorio: fallo cerrado con offset (truncamiento, tamaños que
 * no caben, banderas fuera de lo definido), presupuesto cobrado a través del
 * cursor acotado y cero dependencias. Hechos de ODA-ODS-DWG-5.4.1-PUBLIC
 * (SOURCE_REGISTER); implementación original; certezas y pendientes de corpus
 * real declarados en DWG0_WORKLOG.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  DwgBitReader,
  type DwgColorReference,
  type DwgHandleReference,
} from "../codecs/bitcodes.js";
import type { DwgPoint3 } from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";

/**
 * Un tramo del cuerpo que esta fase deja sin interpretar, con su posición en
 * BITS desde el inicio del dato. La granularidad es de bit porque el formato
 * no alinea estos tramos a byte; quien los interprete después sabrá dónde
 * empiezan exactamente.
 */
export interface Ac1015OpaqueSpan {
  readonly kind: "extended-data" | "graphic" | "handle-stream";
  readonly startBit: number;
  readonly bitLength: number;
}

/** La cabecera común interpretada de una entidad R2000. */
export interface Ac1015EntityCommon {
  /** Tipo BS con que arranca el dato. */
  readonly type: number;
  /** Tamaño declarado del dato en bits, hasta el arranque de los handles. */
  readonly bitSize: number;
  /** Handle propio del objeto, tal como viaja (código + valor). */
  readonly ownHandle: DwgHandleReference;
  /** Modo de entidad BB (0 = con propietario en el flujo, 1/2 = paper/model). */
  readonly entityMode: number;
  /** Recuento de reactores BL; sus handles viven en el flujo opaco final. */
  readonly reactorCount: number;
  /** Bit R2000 de "sin vínculos" de subentidad. */
  readonly noLinks: boolean;
  /** Color CmC en su forma R2000 (índice BS; 256 = ByLayer). */
  readonly color: DwgColorReference;
  /** Escala de tipo de línea BD. */
  readonly linetypeScale: number;
  /** Banderas BB de tipo de línea (3 = handle en el flujo final). */
  readonly linetypeFlags: number;
  /** Banderas BB de plotstyle (3 = handle en el flujo final). */
  readonly plotstyleFlags: number;
  /** Invisibilidad BS (bit 0 = invisible). */
  readonly invisibility: number;
  /** Lineweight RC crudo; su tabla de valores es de una fase posterior. */
  readonly lineweight: number;
}

/** Resultado del decodificado común: lo interpretado, lo opaco y el lector. */
export interface Ac1015EntityCommonDecode {
  readonly common: Ac1015EntityCommon;
  /** Tramos opacos encontrados DENTRO del común (EED y gráfico). */
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
  /** Lector posicionado en el primer bit de los datos específicos del tipo. */
  readonly reader: DwgBitReader;
  /** Bits totales del cuerpo (relleno del último byte incluido). */
  readonly bodyBitLength: number;
}

/**
 * El prólogo que TODO objeto del cuerpo comparte antes de divergir: tipo BS,
 * tamaño RL en bits, handle propio H y grupos EED contabilizados. Las
 * entidades siguen con gráfico/modo/reactores (esta misma fase); los objetos
 * de tabla siguen directamente con sus reactores (`table-layer.ts`).
 */
export interface Ac1015ObjectPrologue {
  readonly type: number;
  readonly bitSize: number;
  readonly ownHandle: DwgHandleReference;
  /** Mutable a propósito: el llamador sigue anotando tramos sobre la misma lista. */
  readonly opaqueSpans: Ac1015OpaqueSpan[];
  readonly reader: DwgBitReader;
  readonly bodyBitLength: number;
}

/**
 * Decodifica el prólogo común del objeto cuyo cuerpo es `bodyBytes` (los
 * bytes exactos del dato de la envoltura, tipo BS incluido). Los offsets de
 * error son relativos al INICIO del cuerpo; el llamador que tenga el offset
 * del archivo puede trasladarlos.
 */
export function readAc1015ObjectPrologue(
  bodyBytes: Uint8Array,
): Ac1015ObjectPrologue {
  // El cursor acotado inspecciona y copia una vez (rechaza SharedArrayBuffer):
  // a partir de aquí sólo se miran bytes propios.
  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  const bodyBitLength = bodyBytes.length * 8;

  const type = reader.readBS();

  // El tamaño en bits del dato: desde el primer bit del tipo hasta donde
  // empieza el flujo de handles. Un tamaño que no cabe en el cuerpo es un
  // dato mentiroso; un tamaño menor que lo ya leído no puede cerrar nunca.
  const bitSize = reader.readRL();
  if (bitSize > bodyBitLength || bitSize < reader.bitPosition) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      "The declared entity bit size does not fit inside the object body.",
    );
  }

  const ownHandle = reader.readH();

  const opaqueSpans: Ac1015OpaqueSpan[] = [];
  readExtendedData(reader, opaqueSpans);

  return { type, bitSize, ownHandle, opaqueSpans, reader, bodyBitLength };
}

/**
 * Cada handle del flujo final ocupa al menos un byte: un recuento declarado
 * que no cabría ni en el tramo de handles es corrupción, y se rechaza ANTES
 * de que nadie intente recorrerlo o reservar memoria por él.
 */
export function assertHandleCountFits(
  reader: DwgBitReader,
  count: number,
  bitSize: number,
  bodyBitLength: number,
  what: string,
): void {
  if (count * 8 > bodyBitLength - bitSize) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      `The ${what} count cannot fit inside the object handle stream.`,
    );
  }
}

/**
 * Decodifica la cabecera común de la entidad cuyo cuerpo es `bodyBytes`:
 * el prólogo compartido más los campos exclusivos de entidad (gráfico, modo,
 * reactores, color, escala, banderas, invisibilidad y lineweight).
 */
export function readAc1015EntityCommon(
  bodyBytes: Uint8Array,
): Ac1015EntityCommonDecode {
  const { type, bitSize, ownHandle, opaqueSpans, reader, bodyBitLength } =
    readAc1015ObjectPrologue(bodyBytes);

  readGraphic(reader, opaqueSpans);

  const entityMode = reader.readBB();
  if (entityMode === 3) {
    // El formato define los modos 0 (propietario en el flujo), 1 y 2 (paper/
    // model space). 0b11 no está definido: fallo cerrado, no adivinar.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      "An entity mode of 0b11 is not defined by the format.",
    );
  }

  const reactorCount = reader.readBL();
  assertHandleCountFits(reader, reactorCount, bitSize, bodyBitLength, "reactor");

  const noLinks = reader.readB() === 1;
  const color = reader.readCmC();
  const linetypeScale = reader.readBD();
  if (!Number.isFinite(linetypeScale)) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      "A linetype scale must be a finite number.",
    );
  }
  const linetypeFlags = reader.readBB();
  const plotstyleFlags = reader.readBB();
  const invisibility = reader.readBS();
  const lineweight = reader.readRC();

  const common: Ac1015EntityCommon = Object.freeze({
    type,
    bitSize,
    ownHandle,
    entityMode,
    reactorCount,
    noLinks,
    color,
    linetypeScale,
    linetypeFlags,
    plotstyleFlags,
    invisibility,
    lineweight,
  });

  return Object.freeze({
    common,
    opaqueSpans: Object.freeze(opaqueSpans),
    reader,
    bodyBitLength,
  });
}

/**
 * Recorre los grupos EED sin interpretarlos: cada grupo es un tamaño BS
 * distinto de cero, un handle H de aplicación y esos bytes; un tamaño cero
 * cierra la lista. Si hubo al menos un grupo, el tramo completo (terminador
 * incluido) queda contabilizado como opaco con su posición.
 */
function readExtendedData(
  reader: DwgBitReader,
  opaqueSpans: Ac1015OpaqueSpan[],
): void {
  const startBit = reader.bitPosition;
  let sawGroup = false;
  for (;;) {
    const groupLength = reader.readBS();
    if (groupLength === 0) break;
    sawGroup = true;
    // El handle de la aplicación dueña del grupo; no se resuelve aún.
    reader.readH();
    // Los bytes del grupo se recorren (el presupuesto los cobra) pero no se
    // interpretan; un grupo que se sale del cuerpo falla cerrado en readRC.
    for (let index = 0; index < groupLength; index += 1) {
      reader.readRC();
    }
  }
  if (sawGroup) {
    opaqueSpans.push(
      Object.freeze({
        kind: "extended-data" as const,
        startBit,
        bitLength: reader.bitPosition - startBit,
      }),
    );
  }
}

/**
 * El gráfico de previsualización: un bit de presencia y, a 1, un tamaño RL y
 * esos bytes de imagen, que se contabilizan opacos — esta fase no finge
 * decodificar imágenes.
 */
function readGraphic(
  reader: DwgBitReader,
  opaqueSpans: Ac1015OpaqueSpan[],
): void {
  if (reader.readB() === 0) return;
  const startBit = reader.bitPosition;
  const byteCount = reader.readRL();
  if (byteCount * 8 > reader.bitsRemaining) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      "A preview graphic extends outside the object body.",
    );
  }
  for (let index = 0; index < byteCount; index += 1) {
    reader.readRC();
  }
  opaqueSpans.push(
    Object.freeze({
      kind: "graphic" as const,
      startBit,
      bitLength: reader.bitPosition - startBit,
    }),
  );
}

/** El byte (relativo al cuerpo) donde está parado el lector, para errores. */
function byteOf(reader: DwgBitReader): number {
  return Math.floor(reader.bitPosition / 8);
}

/**
 * NaN o ±Infinity no son geometría: un double no finito en un campo decodificado
 * es estructura corrupta (decisión de laboratorio declarada en el worklog), no
 * un valor que propagar al modelo neutral. Compartido por todos los
 * decodificadores de entidad para que no existan copias gemelas del criterio.
 */
export function finiteDecoded(
  reader: DwgBitReader,
  value: number,
  what: string,
): number {
  if (!Number.isFinite(value)) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      byteOf(reader),
      `Reading ${what} produced a non-finite number.`,
    );
  }
  return value;
}

/** Un punto 3D congelado del modelo neutral. */
export function frozenPoint3(x: number, y: number, z: number): DwgPoint3 {
  return Object.freeze({ x, y, z });
}

/** La extrusión BE, validada finita y congelada como punto del modelo. */
export function readFiniteExtrusion(reader: DwgBitReader): DwgPoint3 {
  const { x, y, z } = reader.readBE();
  return frozenPoint3(
    finiteDecoded(reader, x, "an extrusion component"),
    finiteDecoded(reader, y, "an extrusion component"),
    finiteDecoded(reader, z, "an extrusion component"),
  );
}
