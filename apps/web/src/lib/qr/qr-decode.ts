/**
 * DECODIFICADOR MÍNIMO DE CÓDIGOS QR — ORÁCULO DE PRUEBA, NO API DE PRODUCTO.
 *
 * ESTE MÓDULO NO ES UNA CAPACIDAD DEL PRODUCTO. Existe por una sola razón:
 * dar a `qr.spec.ts` una forma INDEPENDIENTE de comprobar lo que produce
 * `qr-encode.ts`. Nada de la aplicación lo importa ni debe importarlo; no lee
 * imágenes, no localiza la retícula en una foto, no corrige errores y no
 * valida checksums de datos. Recibe una matriz ya perfecta y la lee.
 *
 * POR QUÉ HACÍA FALTA ESCRIBIRLO. La regla del repositorio es que una
 * capacidad no cuenta por existir, sólo si su comportamiento está probado
 * contra un oráculo independiente. Para un codificador de QR ese oráculo, o es
 * una dependencia de npm —que es justo lo que el codificador existe para
 * evitar— o son vectores publicados —que cubren la aritmética pero no el
 * ensamblado— o es un lector. Un lector escrito aparte cierra el hueco: si el
 * entrelazado, el zigzag, la máscara o los bits de formato están mal, el texto
 * no vuelve.
 *
 * LA FRONTERA QUE HACE QUE LA PRUEBA PRUEBE ALGO. Este archivo NO comparte
 * lógica con el codificador. Reimplementa, escritos de cero y con otra forma:
 * el mapa de módulos de función (por rectángulos, no por distancia al centro),
 * la lectura y corrección BCH del formato (probando las 32 palabras válidas,
 * no calculando una), el desenmascarado, el recorrido en zigzag (por paridad
 * del par de columnas, no por bits de la coordenada), el desentrelazado y el
 * troceado de bits. De `qr-encode.ts` sólo importa DATOS declarativos —el
 * tamaño por versión, la tabla de bloques del nivel M y los centros de los
 * patrones de alineación—, porque duplicar tablas a mano no añade
 * independencia: añade una segunda errata posible. Esas tablas se verifican
 * aparte, contra los valores publicados del estándar, en `qr.spec.ts`.
 *
 * Si algún día alguien mueve lógica de cálculo a un módulo común e importa
 * desde aquí, las pruebas seguirán en verde y dejarán de significar nada.
 */
import {
  alignmentPatternPositions,
  blockLayout,
  characterCountBits,
  QR_MAX_VERSION,
  QR_MIN_VERSION,
  versionSize,
  type QrMatrix,
} from "./qr-encode";

/** Generador BCH(15,5) del bloque de formato y su máscara, del estándar. */
const FORMAT_BCH_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;

export interface QrDecodedBlock {
  data: readonly number[];
  ec: readonly number[];
}

export interface QrRawRead {
  version: number;
  maskId: number;
  /** Dos bits de nivel de corrección leídos del formato (M = 0b00). */
  ecLevelBits: number;
  /** Codewords tal y como salen del recorrido, aún entrelazados. */
  interleaved: readonly number[];
  /** Bloques ya desentrelazados, cada uno con sus datos y su ECC. */
  blocks: readonly QrDecodedBlock[];
  /** Datos de todos los bloques concatenados en orden. */
  dataCodewords: readonly number[];
}

// ───────────────────────────────────────────────────────────────────────────
// Mapa de módulos de función, construido por rectángulos
// ───────────────────────────────────────────────────────────────────────────

/**
 * `true` en cada módulo que NO lleva datos: localizadores con separador,
 * temporización, alineación, información de formato y de versión, y el módulo
 * oscuro. Se describe por regiones porque así se lee como el dibujo del
 * estándar y no como el algoritmo del codificador.
 */
export function functionModuleMap(version: number): boolean[][] {
  if (
    !Number.isInteger(version) ||
    version < QR_MIN_VERSION ||
    version > QR_MAX_VERSION
  ) {
    throw new Error(`Versión de QR inválida: ${version}.`);
  }
  const size = versionSize(version);
  const map = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const fill = (
    fromRow: number,
    toRow: number,
    fromCol: number,
    toCol: number,
  ): void => {
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let col = fromCol; col <= toCol; col += 1) map[row][col] = true;
    }
  };

  // Los tres localizadores, cada uno con su separador: cuadros de 8x8 pegados
  // a la esquina (7 del localizador más 1 de separador por los lados internos).
  fill(0, 7, 0, 7);
  fill(0, 7, size - 8, size - 1);
  fill(size - 8, size - 1, 0, 7);

  // Temporización: la fila 6 y la columna 6 completas.
  fill(6, 6, 0, size - 1);
  fill(0, size - 1, 6, 6);

  // Formato: fila 8 y columna 8, a ambos lados, más el módulo oscuro.
  fill(8, 8, 0, 8);
  fill(0, 8, 8, 8);
  fill(8, 8, size - 8, size - 1);
  fill(size - 8, size - 1, 8, 8);

  // Alineación: 5x5 centrados, salvo los tres que caerían sobre localizadores.
  const positions = alignmentPatternPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      )
        continue;
      fill(
        positions[i] - 2,
        positions[i] + 2,
        positions[j] - 2,
        positions[j] + 2,
      );
    }
  }

  // Información de versión: dos bloques de 6x3 junto a los localizadores
  // superior derecho e inferior izquierdo.
  if (version >= 7) {
    fill(0, 5, size - 11, size - 9);
    fill(size - 11, size - 9, 0, 5);
  }

  return map;
}

// ───────────────────────────────────────────────────────────────────────────
// Información de formato
// ───────────────────────────────────────────────────────────────────────────

/** Palabra BCH(15,5) de un dato de 5 bits, por división larga explícita. */
function encodeFormatWord(data: number): number {
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((remainder >>> bit) & 1)
      remainder ^= FORMAT_BCH_GENERATOR << (bit - 10);
  }
  return (((data << 10) | remainder) ^ FORMAT_MASK) & 0x7fff;
}

function hammingDistance(a: number, b: number): number {
  let diff = a ^ b;
  let count = 0;
  while (diff !== 0) {
    count += diff & 1;
    diff >>>= 1;
  }
  return count;
}

/**
 * Recupera nivel de corrección y máscara de los 15 bits leídos. En vez de
 * invertir el BCH, genera las 32 palabras válidas y se queda con la más
 * cercana: el código BCH(15,5) tiene distancia mínima 7, así que hasta 3 bits
 * erróneos se resuelven sin ambigüedad.
 */
function decodeFormatWord(word: number): {
  ecLevelBits: number;
  maskId: number;
} {
  let bestData = -1;
  let bestDistance = 16;
  for (let data = 0; data < 32; data += 1) {
    const distance = hammingDistance(word, encodeFormatWord(data));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestData = data;
    }
  }
  if (bestDistance > 3) {
    throw new Error(
      `La información de formato no se corresponde con ninguna válida (distancia ${bestDistance}).`,
    );
  }
  return { ecLevelBits: (bestData >>> 3) & 0b11, maskId: bestData & 0b111 };
}

/** Coordenadas de las dos copias del formato, bit 0 primero. */
function formatCopies(size: number): {
  first: ReadonlyArray<readonly [number, number]>;
  second: ReadonlyArray<readonly [number, number]>;
} {
  const first: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i += 1) first.push([i, 8]);
  first.push([7, 8], [8, 8], [8, 7]);
  for (let i = 9; i < 15; i += 1) first.push([8, 14 - i]);

  const second: Array<[number, number]> = [];
  for (let i = 0; i < 8; i += 1) second.push([8, size - 1 - i]);
  for (let i = 8; i < 15; i += 1) second.push([size - 15 + i, 8]);

  return { first, second };
}

function readWord(
  modules: readonly (readonly boolean[])[],
  positions: ReadonlyArray<readonly [number, number]>,
): number {
  let word = 0;
  for (let i = 0; i < positions.length; i += 1) {
    if (modules[positions[i][0]][positions[i][1]]) word |= 1 << i;
  }
  return word;
}

// ───────────────────────────────────────────────────────────────────────────
// Desenmascarado y recorrido
// ───────────────────────────────────────────────────────────────────────────

/** Las ocho máscaras, en la forma en que las enuncia el estándar. */
function isMasked(maskId: number, row: number, col: number): boolean {
  if (maskId === 0) return (row + col) % 2 === 0;
  if (maskId === 1) return row % 2 === 0;
  if (maskId === 2) return col % 3 === 0;
  if (maskId === 3) return (row + col) % 3 === 0;
  if (maskId === 4)
    return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
  if (maskId === 5) return ((row * col) % 2) + ((row * col) % 3) === 0;
  if (maskId === 6) return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
  if (maskId === 7) return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  throw new Error(`Máscara ${maskId} fuera del rango 0-7.`);
}

/**
 * Orden de lectura de los módulos de datos. Los pares de columnas se recorren
 * de derecha a izquierda; el sentido lo da la PARIDAD del par (el primero va
 * hacia arriba) y la columna 6 se salta entera porque es temporización.
 */
function readingOrder(
  size: number,
  functionMap: readonly (readonly boolean[])[],
): number[][] {
  const rightColumns: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    rightColumns.push(right);
  }

  const order: number[][] = [];
  for (let pair = 0; pair < rightColumns.length; pair += 1) {
    const right = rightColumns[pair];
    const upward = pair % 2 === 0;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (!functionMap[row][col]) order.push([row, col]);
      }
    }
  }
  return order;
}

// ───────────────────────────────────────────────────────────────────────────
// Lectura completa
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lee la matriz hasta los codewords, sin interpretar el segmento. Devuelve
 * también los bloques desentrelazados para que las pruebas puedan comprobar
 * los síndromes de Reed-Solomon bloque a bloque.
 */
export function readQrRaw(matrix: QrMatrix): QrRawRead {
  const { modules, size } = matrix;
  if (size !== modules.length) {
    throw new Error(
      `La matriz dice medir ${size} y tiene ${modules.length} filas.`,
    );
  }
  if ((size - 17) % 4 !== 0) {
    throw new Error(
      `Un lado de ${size} módulos no corresponde a ninguna versión (4·v+17).`,
    );
  }
  const version = (size - 17) / 4;
  if (version < QR_MIN_VERSION || version > QR_MAX_VERSION) {
    throw new Error(`Versión ${version} fuera del rango soportado.`);
  }

  const copies = formatCopies(size);
  const format = decodeFormatWord(readWord(modules, copies.first));
  const secondFormat = decodeFormatWord(readWord(modules, copies.second));
  if (
    format.maskId !== secondFormat.maskId ||
    format.ecLevelBits !== secondFormat.ecLevelBits
  ) {
    throw new Error(
      "Las dos copias de la información de formato no coinciden.",
    );
  }

  const functionMap = functionModuleMap(version);
  const order = readingOrder(size, functionMap);

  const bits: number[] = [];
  for (const [row, col] of order) {
    const dark = modules[row][col];
    bits.push((isMasked(format.maskId, row, col) ? !dark : dark) ? 1 : 0);
  }

  // Los bits que sobran del último byte son de resto: se descartan.
  const interleaved: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    interleaved.push(byte);
  }

  const layout = blockLayout(version);
  if (interleaved.length !== layout.totalCodewords) {
    throw new Error(
      `El recorrido dio ${interleaved.length} codewords y la versión ${version} tiene ${layout.totalCodewords}.`,
    );
  }

  // Desentrelazado: los datos van por «columnas» de bloque, y los bloques
  // cortos simplemente no aportan nada en la última columna.
  const blockDataLengths: number[] = [];
  for (let b = 0; b < layout.blocks; b += 1) {
    blockDataLengths.push(
      b < layout.shortBlocks ? layout.shortDataLength : layout.longDataLength,
    );
  }
  const data: number[][] = blockDataLengths.map(() => []);
  let cursor = 0;
  for (let i = 0; i < layout.longDataLength; i += 1) {
    for (let b = 0; b < layout.blocks; b += 1) {
      if (i < blockDataLengths[b]) {
        data[b].push(interleaved[cursor]);
        cursor += 1;
      }
    }
  }
  const ec: number[][] = blockDataLengths.map(() => []);
  for (let i = 0; i < layout.ecPerBlock; i += 1) {
    for (let b = 0; b < layout.blocks; b += 1) {
      ec[b].push(interleaved[cursor]);
      cursor += 1;
    }
  }

  const dataCodewords: number[] = [];
  for (const block of data) dataCodewords.push(...block);

  return {
    version,
    maskId: format.maskId,
    ecLevelBits: format.ecLevelBits,
    interleaved,
    blocks: data.map((block, index) => ({ data: block, ec: ec[index] })),
    dataCodewords,
  };
}

/**
 * Texto que contiene la matriz. Sólo entiende un segmento en modo BYTE, que es
 * lo único que produce `encodeQr`; cualquier otro modo es, para este oráculo,
 * un fallo del codificador y por eso lanza en vez de devolver algo aproximado.
 */
export function decodeQrText(matrix: QrMatrix): string {
  const raw = readQrRaw(matrix);
  const bits: number[] = [];
  for (const codeword of raw.dataCodewords) {
    for (let i = 7; i >= 0; i -= 1) bits.push((codeword >>> i) & 1);
  }
  let cursor = 0;
  const take = (length: number): number => {
    if (cursor + length > bits.length) {
      throw new Error("El segmento se acaba antes de tiempo: faltan bits.");
    }
    let value = 0;
    for (let i = 0; i < length; i += 1) {
      value = (value << 1) | bits[cursor];
      cursor += 1;
    }
    return value;
  };

  const mode = take(4);
  if (mode !== 0b0100) {
    throw new Error(
      `Modo ${mode.toString(2)} inesperado: este oráculo sólo lee modo BYTE (0100).`,
    );
  }
  const length = take(characterCountBits(raw.version));
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = take(8);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
