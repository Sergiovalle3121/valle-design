/**
 * ADAPTADOR de cuerpos de objeto R2004 (AC1018) → forma R2000 equivalente.
 *
 * La medición byte a byte de los 8 AC1018 reales del corpus (commit a60ebe2)
 * demostró que la codificación de objetos AC1018 es la R2000 con CUATRO
 * deltas exactos, todos verificables por el aterrizaje exacto del tamaño en
 * bits declarado:
 *
 * 1. **Bit de xdictionary ausente (ODS §20.1/§20.4.1, R2004+)**: tras el
 *    recuento de reactores viaja UN bit; a 1, el flujo de handles NO lleva el
 *    handle de xdictionary. En los objetos que no son entidades el bit es un
 *    campo EXTRA (se retira y el tamaño en bits baja en 1); en las ENTIDADES
 *    ocupa la posición del bit R2000 de "sin vínculos" — los punteros a
 *    entidad anterior/siguiente no existen en R2004+ — así que se FUERZA a 1
 *    (la forma R2000 sin vínculos) sin mover el dato.
 * 2. **Xdictionary nulo**: cuando el bit vale 1 se INSERTA un handle nulo
 *    (código 3, contador 0) donde la forma R2000 espera el xdictionary —
 *    equivalencia semántica exacta, no un dato inventado.
 * 3. **Colores CmC 2004 (hecho registrado)**: BS de índice + BL de color +
 *    RC de banderas. El BL medido lleva el método en el byte alto (0xC0 =
 *    ByLayer/256, 0xC1 = ByBlock/0, 0xC3 = índice ACI). Se COLAPSA cada CmC
 *    al BS R2000 con el índice proyectado; métodos RGB o nombres de color
 *    son capacidad ausente tipada, jamás un color inventado. Afecta a LAYER,
 *    DIMSTYLE (dimclrd/e/t) y MLINESTYLE (relleno y segmentos).
 * 4. **BLOCK_HEADER (ODS §20.4.52, R2004+)**: un BL de "objetos poseídos"
 *    entre el bit de cargado y el punto base; se retira (el flujo de handles
 *    del registro es opaco para el decodificador R2000, así que sus handles
 *    extra no estorban).
 *
 * El adaptador REESCRIBE bits, no semántica: cada transformación queda
 * validada aguas abajo por el decodificador R2000 real, que exige el
 * aterrizaje exacto del flujo de handles. Implementación original desde
 * hechos registrados y mediciones first-party (ADR-0007).
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import {
  readAc1015ObjectPrologue,
} from "../objects/entity-common.js";
import { AC1015_TYPE_BLOCK_HEADER } from "../objects/table-block.js";
import { projectR2004ColorIndex } from "../objects/color-2004.js";
import { AC1015_TYPE_LAYER } from "../objects/table-layer.js";
import {
  AC1015_DIMSTYLE_FIELD_LAYOUT,
  AC1015_TYPE_DIMSTYLE,
  readAc1015FieldLayout,
} from "../objects/tables-symbol.js";
import { AC1015_TYPE_MLINESTYLE } from "../objects/objects-dictionary.js";
import { throwDwgError } from "../security/parse-error.js";

/** Byte del handle NULO (código 3, contador 0) que se inserta como xdictionary. */
const NULL_HANDLE_BYTE = 0x30;

/** Una edición de bits: reemplaza el rango [start, end) por `bits`. */
interface BitEdit {
  readonly start: number;
  readonly end: number;
  readonly bits: readonly number[];
}

/**
 * Normaliza un cuerpo de objeto AC1018 a su forma R2000 equivalente. El
 * cuerpo es el dato exacto de la envoltura (tipo BS incluido); `isEntity`
 * decide qué prólogo se recorre (el censo lo aporta el llamador desde el
 * despacho compartido y el mapa de clases). Los offsets de error son
 * relativos al cuerpo.
 */
export function normalizeR2004ObjectBody(
  bodyBytes: Uint8Array,
  isEntity: boolean,
): Uint8Array {
  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  const type = reader.readBS();
  const afterType = reader.bitPosition;
  const bitSize = reader.readRL();
  reader.readH();
  skipExtendedData(reader);
  let entityMode = 0;
  if (isEntity) {
    if (reader.readB() === 1) {
      const graphicBytes = reader.readRL();
      for (let index = 0; index < graphicBytes; index += 1) reader.readRC();
    }
    entityMode = reader.readBB();
  }
  const reactorCount = reader.readBL();
  const flagPosition = reader.bitPosition;
  const xdicMissing = reader.readB();

  // El punto de inserción del xdictionary nulo: tras el propietario (siempre
  // presente en objetos; en entidades sólo con modo 0) y los reactores. El
  // caminante arranca en el tamaño declarado, donde empieza el flujo.
  const handleWalker = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  while (handleWalker.bitPosition < bitSize) handleWalker.readB();
  if (!isEntity || entityMode === 0) {
    handleWalker.readH();
  }
  for (let index = 0; index < reactorCount; index += 1) handleWalker.readH();
  const insertAt = handleWalker.bitPosition;

  const edits: BitEdit[] = [];
  if (isEntity) {
    // El bit pasa a ser el "sin vínculos" R2000, siempre 1 (sin punteros).
    edits.push({ start: flagPosition, end: flagPosition + 1, bits: [1] });
  } else {
    // El bit se RETIRA y el tamaño en bits declarado baja en 1.
    edits.push({
      start: afterType,
      end: afterType + 32,
      bits: rlBits(bitSize - 1),
    });
    edits.push({ start: flagPosition, end: flagPosition + 1, bits: [] });
  }
  if (xdicMissing === 1) {
    edits.push({ start: insertAt, end: insertAt, bits: byteBits(NULL_HANDLE_BYTE) });
  }
  const normalized = spliceBits(bodyBytes, edits);
  return collapseR2004Colors(normalized, type);
}

/**
 * Colapsa los CmC 2004 (y el BL de objetos poseídos del BLOCK_HEADER) de los
 * cuatro tipos afectados, sobre el cuerpo YA normalizado a prólogo R2000.
 * Los demás tipos vuelven tal cual: el corpus demostró que no llevan CmC.
 */
function collapseR2004Colors(body: Uint8Array, type: number): Uint8Array {
  if (
    type !== AC1015_TYPE_LAYER &&
    type !== AC1015_TYPE_BLOCK_HEADER &&
    type !== AC1015_TYPE_DIMSTYLE &&
    type !== AC1015_TYPE_MLINESTYLE
  ) {
    return body;
  }

  const typeWidthReader = new DwgBitReader(new BoundedByteCursor(body));
  typeWidthReader.readBS();
  const afterType = typeWidthReader.bitPosition;

  const prologue = readAc1015ObjectPrologue(body);
  const reader = prologue.reader;
  reader.readBL(); // recuento de reactores
  const edits: BitEdit[] = [];
  let delta = 0;
  const collapse = (): void => {
    const range = readCmc2004Range(reader);
    const bits = bsRawShortBits(range.index);
    edits.push({ start: range.start, end: range.end, bits });
    delta += bits.length - (range.end - range.start);
  };

  if (type === AC1015_TYPE_LAYER) {
    reader.readTV();
    reader.readB();
    reader.readBS();
    reader.readB();
    reader.readBS();
    collapse();
  } else if (type === AC1015_TYPE_BLOCK_HEADER) {
    reader.readTV();
    reader.readB();
    reader.readBS();
    reader.readB();
    for (let index = 0; index < 5; index += 1) reader.readB();
    const start = reader.bitPosition;
    reader.readBL(); // R2004+: recuento de objetos poseídos
    edits.push({ start, end: reader.bitPosition, bits: [] });
    delta -= reader.bitPosition - start;
  } else if (type === AC1015_TYPE_DIMSTYLE) {
    reader.readTV();
    reader.readB();
    reader.readBS();
    reader.readB();
    const colorIndex = AC1015_DIMSTYLE_FIELD_LAYOUT.findIndex(
      ([name]) => name === "dimclrd",
    );
    readAc1015FieldLayout(
      reader,
      AC1015_DIMSTYLE_FIELD_LAYOUT.slice(0, colorIndex),
      {},
      "an R2004 DIMSTYLE",
    );
    collapse();
    collapse();
    collapse();
  } else {
    reader.readTV();
    reader.readTV();
    reader.readBS();
    collapse();
    reader.readBD();
    reader.readBD();
    const segmentCount = reader.readRC();
    for (let index = 0; index < segmentCount; index += 1) {
      reader.readBD();
      collapse();
      reader.readBS();
    }
  }

  edits.push({
    start: afterType,
    end: afterType + 32,
    bits: rlBits(prologue.bitSize + delta),
  });
  return spliceBits(body, edits);
}

/**
 * Rango exacto de un CmC 2004 más su índice ACI proyectado (fallo cerrado).
 * La proyección vive en `objects/color-2004.ts` porque el lector de capas de
 * R2010+ necesita EL MISMO criterio: dos copias es donde se colaría una
 * divergencia silenciosa entre caminos de versión.
 */
function readCmc2004Range(
  reader: DwgBitReader,
): { start: number; end: number; index: number } {
  const start = reader.bitPosition;
  reader.readBS();
  const rawColor = reader.readBL() >>> 0;
  const colorByte = reader.readRC();
  const end = reader.bitPosition;
  const index = projectR2004ColorIndex(rawColor, colorByte, Math.floor(start / 8));
  return { start, end, index };
}

/** Recorre los grupos EED sin interpretarlos (mismo criterio que el común). */
function skipExtendedData(reader: DwgBitReader): void {
  for (;;) {
    const groupLength = reader.readBS();
    if (groupLength === 0) return;
    reader.readH();
    for (let index = 0; index < groupLength; index += 1) reader.readRC();
  }
}

/** Bit `index` (MSB primero dentro de cada byte) del cuerpo. */
function bitAt(bytes: Uint8Array, index: number): number {
  return (bytes[index >> 3]! >> (7 - (index & 7))) & 1;
}

/** Los 8 bits de un byte, MSB primero — el orden del flujo de bits DWG. */
function byteBits(value: number): number[] {
  const bits = new Array<number>(8);
  for (let index = 0; index < 8; index += 1) {
    bits[index] = (value >> (7 - index)) & 1;
  }
  return bits;
}

/** Los 32 bits de un RL: cuatro bytes little-endian, cada uno MSB primero. */
function rlBits(value: number): number[] {
  return [
    ...byteBits(value & 0xff),
    ...byteBits((value >>> 8) & 0xff),
    ...byteBits((value >>> 16) & 0xff),
    ...byteBits((value >>> 24) & 0xff),
  ];
}

/** Un BS en su forma larga "00" + short little-endian: 18 bits inequívocos. */
function bsRawShortBits(value: number): number[] {
  return [
    0,
    0,
    ...byteBits(value & 0xff),
    ...byteBits((value >>> 8) & 0xff),
  ];
}

/**
 * Aplica ediciones de bits NO solapadas sobre el cuerpo y reempaqueta a
 * bytes, rellenando el último byte con ceros. Las ediciones llegan del
 * recorrido en orden de lectura; se ordenan y verifican por si acaso — un
 * solape sería un error del ADAPTADOR, no del archivo, y debe sonar como tal.
 */
function spliceBits(
  bytes: Uint8Array,
  edits: readonly BitEdit[],
): Uint8Array {
  const totalBits = bytes.length * 8;
  const sorted = [...edits].sort((left, right) => left.start - right.start);
  const output: number[] = [];
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor || edit.end > totalBits || edit.end < edit.start) {
      throwDwgError(
        "DWG_INTERNAL_ERROR",
        "internal",
        0,
        "The R2004 body adapter produced overlapping bit edits.",
      );
    }
    for (let index = cursor; index < edit.start; index += 1) {
      output.push(bitAt(bytes, index));
    }
    output.push(...edit.bits);
    cursor = edit.end;
  }
  for (let index = cursor; index < totalBits; index += 1) {
    output.push(bitAt(bytes, index));
  }
  const result = new Uint8Array(Math.ceil(output.length / 8));
  for (let index = 0; index < output.length; index += 1) {
    result[index >> 3] =
      result[index >> 3]! | (output[index]! << (7 - (index & 7)));
  }
  return result;
}
