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
  resolveDwgHandleReference,
  type DwgColorReference,
  type DwgHandleReference,
  type DwgResolvedHandle,
} from "../codecs/bitcodes.js";
import type {
  DwgPoint2,
  DwgPoint3,
  DwgTextFields,
} from "../model/entity-geometry.js";
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
 * La CABEZA interpretada del flujo de handles de una entidad R2000 (fase D4).
 * Los tramos siguen CONTABILIZADOS como opacos — esto añade interpretación,
 * no la sustituye. Hecho registrado (SOURCE_REGISTER): el flujo arranca con
 * el propietario cuando el modo es 0, siguen los reactores declarados, el
 * xdictionary y la capa, y cierran tipo de línea y plotstyle cuando sus
 * banderas valen 3.
 *
 * Intake 2026-08-20 (`VALLE-CORPUS-AC1015-INTAKE-DAE5E77`, hecho 4): cuando
 * el bit de sin-vínculos del común vale 0, entre el xdictionary y la capa
 * viajan DOS handles más — los punteros a la entidad ANTERIOR y SIGUIENTE de
 * la lista enlazada del dibujo (observado bit a bit en los únicos dos
 * objetos del corpus con el bit a 0: el primero y el último del model
 * space). Se consumen y se exponen resueltos; el orden de la base sigue
 * siendo el del mapa (decisión de laboratorio declarada).
 */
export interface Ac1015EntityHandleHead {
  /** Propietario resuelto; `undefined` cuando el modo no lo lleva (1/2). */
  readonly owner: DwgResolvedHandle | undefined;
  readonly xdictionary: DwgResolvedHandle;
  /** Puntero a la entidad anterior; sólo cuando sin-vínculos vale 0. */
  readonly previousEntity: DwgResolvedHandle | undefined;
  /** Puntero a la entidad siguiente; sólo cuando sin-vínculos vale 0. */
  readonly nextEntity: DwgResolvedHandle | undefined;
  readonly layer: DwgResolvedHandle;
  /** Sólo cuando las banderas de linetype valen 3. */
  readonly linetype: DwgResolvedHandle | undefined;
  /** Sólo cuando las banderas de plotstyle valen 3. */
  readonly plotstyle: DwgResolvedHandle | undefined;
}

/**
 * Interpreta la cabeza del flujo de handles con el lector YA posicionado en
 * el bit que declaró `bitSize` (el llamador debe haber exigido antes el
 * encaje exacto). Cada referencia se resuelve contra el handle propio del
 * objeto — las relativas del formato son relativas a él. Un flujo que no
 * alcanza para sus handles obligatorios es corrupción, no un hueco que
 * rellenar: fallo cerrado con su byte.
 */
export function readAc1015EntityHandleHead(
  reader: DwgBitReader,
  common: Ac1015EntityCommon,
): Ac1015EntityHandleHead {
  const base = common.ownHandle.value;
  const owner =
    common.entityMode === 0
      ? resolveDwgHandleReference(reader.readH(), base)
      : undefined;
  // Los handles de reactores se recorren (el presupuesto los cobra) pero no
  // se modelan aún: siguen dentro del tramo opaco contabilizado y su recuento
  // ya viaja interpretado en el común.
  for (let index = 0; index < common.reactorCount; index += 1) {
    reader.readH();
  }
  const xdictionary = resolveDwgHandleReference(reader.readH(), base);
  // Hecho 4 del intake: el bit de sin-vínculos a 0 significa que aquí viajan
  // los punteros a la entidad anterior y siguiente de la lista enlazada,
  // ANTES de la capa. No leerlos desalineaba capa y referencias del tipo.
  const previousEntity =
    common.noLinks ? undefined : resolveDwgHandleReference(reader.readH(), base);
  const nextEntity =
    common.noLinks ? undefined : resolveDwgHandleReference(reader.readH(), base);
  const layer = resolveDwgHandleReference(reader.readH(), base);
  const linetype =
    common.linetypeFlags === 3
      ? resolveDwgHandleReference(reader.readH(), base)
      : undefined;
  const plotstyle =
    common.plotstyleFlags === 3
      ? resolveDwgHandleReference(reader.readH(), base)
      : undefined;
  return Object.freeze({
    owner,
    xdictionary,
    previousEntity,
    nextEntity,
    layer,
    linetype,
    plotstyle,
  });
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

/**
 * Los campos compartidos por TEXT y por ATTRIB/ATTDEF (hecho registrado: los
 * atributos abren con la MISMA disposición de TEXT antes de sus campos
 * propios). Vive en este módulo HOJA para que `entities-core.ts` y
 * `entities-annotation.ts` lo compartan sin ciclo de importación — cero
 * criterios gemelos. Un RC de banderas abre el dato y cada bit a 1 declara
 * un campo AUSENTE; ausente se modela `undefined`.
 */
export function decodeTextFields(reader: DwgBitReader): DwgTextFields {
  const dataFlags = reader.readRC();

  const elevation =
    (dataFlags & 0x01) === 0
      ? finiteDecoded(reader, reader.readRD(), "a text elevation")
      : undefined;

  const insertionX = finiteDecoded(reader, reader.readRD(), "a text insertion X");
  const insertionY = finiteDecoded(reader, reader.readRD(), "a text insertion Y");
  const insertion = frozenTextPoint2(insertionX, insertionY);

  let alignment: DwgPoint2 | undefined;
  if ((dataFlags & 0x02) === 0) {
    const alignmentX = finiteDecoded(
      reader,
      reader.readDD(insertionX),
      "a text alignment X",
    );
    const alignmentY = finiteDecoded(
      reader,
      reader.readDD(insertionY),
      "a text alignment Y",
    );
    alignment = frozenTextPoint2(alignmentX, alignmentY);
  }

  const extrusion = readFiniteExtrusion(reader);
  const thickness = finiteDecoded(reader, reader.readBT(), "a text thickness");

  const obliqueAngle =
    (dataFlags & 0x04) === 0
      ? finiteDecoded(reader, reader.readRD(), "a text oblique angle")
      : undefined;
  const rotation =
    (dataFlags & 0x08) === 0
      ? finiteDecoded(reader, reader.readRD(), "a text rotation")
      : undefined;

  const height = finiteDecoded(reader, reader.readRD(), "a text height");
  if (height < 0) {
    // Una altura negativa no describe ningún texto: estructura corrupta
    // (decisión de laboratorio declarada), no una convención que inventar.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "A text height cannot be negative.",
    );
  }

  const widthFactor =
    (dataFlags & 0x10) === 0
      ? finiteDecoded(reader, reader.readRD(), "a text width factor")
      : undefined;

  // La cadena llega como bytes congelados: mismos bytes, mismo modelo.
  const text = reader.readTV();
  const valueBytes = new Array<number>(text.bytes.length);
  for (let index = 0; index < text.bytes.length; index += 1) {
    valueBytes[index] = text.bytes[index]!;
  }

  const generation = (dataFlags & 0x20) === 0 ? reader.readBS() : undefined;
  const horizontalAlignment =
    (dataFlags & 0x40) === 0 ? reader.readBS() : undefined;
  const verticalAlignment =
    (dataFlags & 0x80) === 0 ? reader.readBS() : undefined;

  return {
    insertion,
    elevation,
    alignment,
    thickness,
    extrusion,
    obliqueAngle,
    rotation,
    height,
    widthFactor,
    valueBytes: Object.freeze(valueBytes),
    generation,
    horizontalAlignment,
    verticalAlignment,
  };
}

function frozenTextPoint2(x: number, y: number): DwgPoint2 {
  return Object.freeze({ x, y });
}
