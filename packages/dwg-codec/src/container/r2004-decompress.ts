/**
 * Descompresión LZ77 de la familia R2004 (AC1018/AC1024/AC1027/AC1032).
 *
 * El flujo comprimido abre con una TIRADA LITERAL y sigue con tokens de copia
 * {longitud, offset hacia atrás, literales inmediatos}; la longitud puede
 * superar al offset (copia solapada, el rasgo clásico de LZ77). Tabla de
 * opcodes de ODA-ODS-DWG-5.4.1-PUBLIC §4.7 (SOURCE_REGISTER), verificada
 * contra los mapas y páginas reales de los 32 DWG de la familia:
 *
 * - Longitud literal: 0x01–0x0F → valor+3; byte con nibble alto ≠ 0 → tirada
 *   de 0 literales y ese byte es el siguiente opcode; 0x00 → forma larga
 *   (total arranca en 0x0F, cada 0x00 suma 0xFF, el byte final suma su valor,
 *   y al total se le suman 3).
 * - Copias 0x40–0xFF: longitud `(opcode>>4)−1`, un byte más de offset
 *   (`(byte<<2)|((opcode&0x0C)>>2)`), literales `opcode&3`.
 * - Copias 0x21–0x3F: longitud `opcode−0x1E`; 0x20: longitud extendida
 *   (valor largo + 0x21); 0x12–0x1F: longitud `(opcode&0x0F)+2` y 0x10:
 *   longitud extendida (valor largo + 9), ambos con offset desplazado 0x3FFF.
 *   Todas llevan un offset de dos bytes `(b0>>2)|(b1<<6)` cuyos 2 bits bajos
 *   son los literales inmediatos; si valen 0 se lee una longitud literal.
 * - 0x11 termina el flujo.
 *
 * MEDICIONES first-party que fijan lo que la tabla dejaba ambiguo (los 6
 * mapas de sistema y las 41 páginas de datos comprimidas del corpus
 * descomprimen EXACTOS con estas dos reglas y se desalinean sin ellas):
 *
 * - El offset almacenado es `real − 1` en TODAS las formas: se suma 1 (además
 *   del 0x3FFF de la familia 0x10–0x1F).
 * - El campo "tamaño comprimido" de las cabeceras de página cuenta DOS bytes
 *   tras el 0x11 final (el offset del terminador, observado 0x0000): este
 *   decompresor los consume y exige que el flujo termine exactamente ahí.
 *
 * Reglas del laboratorio: el tamaño declarado se valida contra el presupuesto
 * ANTES de reservar; cada iteración consume entrada, así que no existe bucle
 * sin tope; producir más o menos que lo declarado, un offset que se sale, un
 * opcode imposible o un flujo sin terminador → error tipado con el offset
 * RELATIVO al buffer comprimido (el llamador lo traslada al archivo).
 */
import { assertNonNegativeSafeInteger } from "../binary/checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";
import type { DwgLimits } from "../api/limits.js";

/** Bytes que el terminador 0x11 arrastra tras de sí (medición de corpus). */
export const R2004_TERMINATOR_TRAILER_LENGTH = 2;

/**
 * Descomprime un flujo R2004 completo a EXACTAMENTE `declaredSize` bytes.
 *
 * `declaredSize` es el tamaño descomprimido que declaró la cabecera de página
 * dueña del flujo; `compressed` debe ser exactamente el flujo declarado
 * (terminador y sus dos bytes incluidos). Cualquier desacuerdo es corrupción.
 */
export function decompressR2004(
  compressed: Uint8Array,
  declaredSize: number,
  limits: DwgLimits,
): Uint8Array {
  if (!(compressed instanceof Uint8Array)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "R2004 decompression requires a byte array input.",
    );
  }
  assertNonNegativeSafeInteger(declaredSize);
  if (declaredSize > limits.maxExpandedBytes) {
    // El tope se cobra ANTES de reservar un solo byte de salida.
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The declared decompressed size exceeds the expansion budget.",
    );
  }

  const out = new Uint8Array(declaredSize);
  const state = { input: compressed, position: 0, output: out, produced: 0 };

  copyLiterals(state, readLiteralLength(state));
  for (;;) {
    const opcodeOffset = state.position;
    const opcode = readByte(state);
    if (opcode < 0x10) {
      // Una tirada literal "desnuda" en posición de opcode no existe en el
      // formato: las tiradas viajan al inicio o tras una copia.
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        opcodeOffset,
        "A literal-length byte appeared where a copy opcode belongs.",
      );
    }
    if (opcode === 0x11) {
      finishStream(state);
      return out;
    }

    let length;
    let offset;
    let literalCount;
    if (opcode >= 0x40) {
      length = ((opcode & 0xf0) >> 4) - 1;
      const opcode2 = readByte(state);
      offset = ((opcode2 << 2) | ((opcode & 0x0c) >> 2)) + 1;
      literalCount = opcode & 0x03;
    } else {
      if (opcode === 0x10) length = readLongValue(state) + 9;
      else if (opcode === 0x20) length = readLongValue(state) + 0x21;
      else if (opcode >= 0x21) length = opcode - 0x1e;
      else length = (opcode & 0x0f) + 2;
      const first = readByte(state);
      const second = readByte(state);
      offset = ((first >> 2) | (second << 6)) + 1;
      if (opcode < 0x20) offset += 0x3fff;
      literalCount = first & 0x03;
    }

    if (offset > state.produced) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        opcodeOffset,
        "A copy offset reaches behind the start of the decompressed data.",
      );
    }
    if (state.produced + length > declaredSize) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        opcodeOffset,
        "A copy run overflows the declared decompressed size.",
      );
    }
    for (let index = 0; index < length; index += 1) {
      out[state.produced] = out[state.produced - offset]!;
      state.produced += 1;
    }

    if (literalCount === 0) literalCount = readLiteralLength(state);
    copyLiterals(state, literalCount);
  }
}

interface DecompressState {
  readonly input: Uint8Array;
  position: number;
  readonly output: Uint8Array;
  produced: number;
}

function readByte(state: DecompressState): number {
  if (state.position >= state.input.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      state.position,
      "The compressed stream ended without its terminator.",
    );
  }
  const byte = state.input[state.position]!;
  state.position += 1;
  return byte;
}

/**
 * Longitud de una tirada literal. Un byte con el nibble alto encendido no se
 * consume: es el siguiente opcode y la tirada vale 0.
 */
function readLiteralLength(state: DecompressState): number {
  const first = readByte(state);
  if ((first & 0xf0) !== 0) {
    state.position -= 1;
    return 0;
  }
  if (first !== 0) return first + 3;
  let total = 0x0f;
  let next = readByte(state);
  while (next === 0) {
    total += 0xff;
    next = readByte(state);
  }
  return total + next + 3;
}

/** Valor largo de las longitudes extendidas (0x10 y 0x20). */
function readLongValue(state: DecompressState): number {
  let total = 0;
  let next = readByte(state);
  while (next === 0) {
    total += 0xff;
    next = readByte(state);
  }
  return total + next;
}

function copyLiterals(state: DecompressState, count: number): void {
  for (let index = 0; index < count; index += 1) {
    if (state.produced >= state.output.length) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        state.position,
        "A literal run overflows the declared decompressed size.",
      );
    }
    state.output[state.produced] = readByte(state);
    state.produced += 1;
  }
}

/**
 * Cierra el flujo tras el 0x11: consume los dos bytes del terminador y exige
 * que entrada y salida cuadren EXACTAMENTE con lo declarado. Un flujo que
 * produce de menos, o al que le sobran bytes, es un contenedor mentiroso.
 */
function finishStream(state: DecompressState): void {
  if (state.input.length - state.position < R2004_TERMINATOR_TRAILER_LENGTH) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      state.position,
      "The stream terminator is missing its two trailing bytes.",
    );
  }
  state.position += R2004_TERMINATOR_TRAILER_LENGTH;
  if (state.position !== state.input.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      state.position,
      "Trailing bytes after the stream terminator are not accepted.",
    );
  }
  if (state.produced !== state.output.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      state.position,
      "The stream produced less data than its declared decompressed size.",
    );
  }
}
