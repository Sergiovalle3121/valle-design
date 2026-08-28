/**
 * EL CODIFICADOR DE CÓDIGOS QR — el ensamblado de la matriz.
 *
 * Las tablas y la aritmética del estándar viven en `qr-tables.ts` y se
 * reexportan desde aquí, para que este módulo siga siendo la única puerta:
 * quien pinta un QR importa `encodeQr` y nada más.
 *
 * Lo que SÍ está aquí es todo lo que sólo se puede comprobar dibujando: los
 * patrones de función, el recorrido en zigzag de los módulos de datos, las
 * ocho máscaras con su penalización, y el ensamblado final con entrelazado de
 * bloques.
 *
 * ── LO QUE HACE FALTA SABER PARA TOCARLO ────────────────────────────────────
 * Un codificador de QR falla de una forma especialmente cruel: produce una
 * matriz de aspecto impecable que ningún teléfono lee. No hay excepción, no hay
 * salida corrupta, no hay nada que mirar. Por eso `qr-encode.spec.ts` y
 * `qr-roundtrip.spec.ts` no comprueban que devuelva algo: contrastan cada pieza
 * contra algo que NO es este codificador —una aritmética independiente, un
 * lector escrito aparte, y los vectores publicados del estándar—. Si cambias
 * algo aquí, esas suites son el único aviso que vas a tener.
 */
import {
  alignmentPatternPositions,
  assertVersionInRange,
  MODE_BYTE,
  PAD_BYTES,
  reedSolomonGenerator,
  reedSolomonRemainder,
  blockLayout,
  byteCapacity,
  characterCountBits,
  formatInfoBits,
  QR_MAX_VERSION,
  QR_MIN_VERSION,
  versionInfoBits,
  versionSize,
  type QrEncodeOptions,
  type QrMatrix,
} from "./qr-tables";

export * from "./qr-tables";

// ───────────────────────────────────────────────────────────────────────────
// Trazado de la matriz
// ───────────────────────────────────────────────────────────────────────────

interface Canvas {
  size: number;
  modules: boolean[][];
  /** Módulos de función: ni se enmascaran ni admiten datos. */
  isFunction: boolean[][];
}

function createGrid(size: number): boolean[][] {
  return Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
}

function setFunctionModule(
  canvas: Canvas,
  row: number,
  col: number,
  dark: boolean,
): void {
  canvas.modules[row][col] = dark;
  canvas.isFunction[row][col] = true;
}

/**
 * Localizador 7x7 con su separador. Se dibuja por distancia de Chebyshev al
 * centro: 0 y 1 son el núcleo oscuro, 2 el anillo claro, 3 el marco oscuro y 4
 * el separador claro. Escribirlo así —y no como una matriz literal— evita
 * tener que recortar a mano el separador en las tres esquinas, donde se sale
 * de la matriz por dos lados distintos según la esquina.
 */
function drawFinderPattern(
  canvas: Canvas,
  centerRow: number,
  centerCol: number,
): void {
  for (let dr = -4; dr <= 4; dr += 1) {
    for (let dc = -4; dc <= 4; dc += 1) {
      const row = centerRow + dr;
      const col = centerCol + dc;
      if (row < 0 || row >= canvas.size || col < 0 || col >= canvas.size)
        continue;
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      setFunctionModule(canvas, row, col, distance !== 2 && distance !== 4);
    }
  }
}

/** Alineación 5x5: núcleo oscuro, anillo claro (distancia 1), marco oscuro. */
function drawAlignmentPattern(
  canvas: Canvas,
  centerRow: number,
  centerCol: number,
): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      setFunctionModule(canvas, centerRow + dr, centerCol + dc, distance !== 1);
    }
  }
}

/** Coordenadas de los 15 módulos de formato, en orden de bit 0 a bit 14. */
function formatModulePositions(
  size: number,
): ReadonlyArray<readonly [row: number, col: number]> {
  const first: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i += 1) first.push([i, 8]);
  first.push([7, 8], [8, 8], [8, 7]);
  for (let i = 9; i < 15; i += 1) first.push([8, 14 - i]);
  const second: Array<[number, number]> = [];
  for (let i = 0; i < 8; i += 1) second.push([8, size - 1 - i]);
  for (let i = 8; i < 15; i += 1) second.push([size - 15 + i, 8]);
  return [...first, ...second];
}

function drawFormatInfo(
  modules: boolean[][],
  size: number,
  maskId: number,
): void {
  const bits = formatInfoBits(maskId);
  const positions = formatModulePositions(size);
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    modules[positions[i][0]][positions[i][1]] = dark;
    modules[positions[i + 15][0]][positions[i + 15][1]] = dark;
  }
}

function drawFunctionPatterns(canvas: Canvas, version: number): void {
  const { size } = canvas;

  // Temporización primero: los localizadores la pisan donde se solapan, y así
  // no hay que calcular los tramos "libres" de las filas 6 y columnas 6.
  for (let i = 0; i < size; i += 1) {
    setFunctionModule(canvas, 6, i, i % 2 === 0);
    setFunctionModule(canvas, i, 6, i % 2 === 0);
  }

  drawFinderPattern(canvas, 3, 3);
  drawFinderPattern(canvas, 3, size - 4);
  drawFinderPattern(canvas, size - 4, 3);

  const positions = alignmentPatternPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      // Las tres esquinas ya están ocupadas por los localizadores.
      const overlapsFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0);
      if (overlapsFinder) continue;
      drawAlignmentPattern(canvas, positions[i], positions[j]);
    }
  }

  // Módulo oscuro: siempre oscuro, siempre aquí. Es la referencia que fija la
  // orientación del segundo bloque de formato.
  setFunctionModule(canvas, size - 8, 8, true);

  // Se RESERVAN los módulos de formato (valor definitivo al elegir máscara).
  for (const [row, col] of formatModulePositions(size)) {
    canvas.isFunction[row][col] = true;
  }

  if (version >= 7) {
    const bits = versionInfoBits(version);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) === 1;
      const far = size - 11 + (i % 3);
      const near = Math.floor(i / 3);
      setFunctionModule(canvas, near, far, dark); // bloque superior derecho
      setFunctionModule(canvas, far, near, dark); // bloque inferior izquierdo
    }
  }
}

export interface QrModulePosition {
  row: number;
  col: number;
}

/**
 * Recorrido en zigzag de los módulos de datos, en el orden EXACTO en que se
 * escriben los bits: pares de columnas de derecha a izquierda, alternando
 * sentido ascendente y descendente, saltando la columna 6 (temporización
 * vertical) para que el zigzag no se descoloque media columna.
 *
 * Se expone porque el orden de recorrido es una convención externa: una ida y
 * vuelta contra el decodificador no lo verificaría (un orden equivocado pero
 * consistente entre los dos daría el mismo texto), así que las pruebas lo
 * contrastan contra las coordenadas publicadas del primer codeword.
 */
export function dataModulePath(version: number): QrModulePosition[] {
  assertVersionInRange(version);
  const canvas = createCanvas(version);
  return traverse(canvas);
}

function traverse(canvas: Canvas): QrModulePosition[] {
  const { size, isFunction } = canvas;
  const path: QrModulePosition[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (!isFunction[row][col]) path.push({ row, col });
      }
    }
  }
  return path;
}

function createCanvas(version: number): Canvas {
  const size = versionSize(version);
  const canvas: Canvas = {
    size,
    modules: createGrid(size),
    isFunction: createGrid(size),
  };
  drawFunctionPatterns(canvas, version);
  return canvas;
}

// ───────────────────────────────────────────────────────────────────────────
// Máscaras y penalización
// ───────────────────────────────────────────────────────────────────────────

/** Las ocho máscaras del estándar. `true` = ese módulo se invierte. */
export function maskBit(maskId: number, row: number, col: number): boolean {
  switch (maskId) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      throw new Error(`Máscara ${maskId} fuera del rango 0-7.`);
  }
}

/** Pesos de las cuatro reglas de penalización, tal y como los fija el estándar. */
export const PENALTY_N1 = 3;
export const PENALTY_N2 = 3;
export const PENALTY_N3 = 40;
export const PENALTY_N4 = 10;

/** Las dos ventanas de 11 módulos que imitan la proporción 1:1:3:1:1 más 4 claros. */
const FINDER_LIKE_PATTERNS: ReadonlyArray<readonly boolean[]> = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/**
 * Penalización total de una matriz ya enmascarada. MENOS ES MEJOR.
 *
 * POR QUÉ IMPORTA, Y NO ES COSMÉTICA. El lector no ve bits: ve una imagen que
 * binariza y de la que deduce la retícula. Una máscara mal elegida deja
 * regiones grandes de un solo color —donde el umbral local se vuelve inestable
 * con sombras o reflejos— y, peor, deja secuencias 1:1:3:1:1 en medio de los
 * datos, que es EXACTAMENTE el patrón con el que el lector busca los
 * localizadores: un falso localizador desplaza la retícula entera y el código
 * no se lee, aunque cada bit esté bien puesto. Por eso se puntúan las ocho.
 *
 * Las cuatro reglas: N1 tramos largos del mismo color, N2 cuadros 2x2 de un
 * color, N3 el patrón que imita un localizador, N4 el desequilibrio global
 * claro/oscuro.
 */
export function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;

  // ── N1: tramos de 5 o más módulos iguales, en filas y en columnas ────────
  const scoreRun = (length: number): number =>
    length >= 5 ? PENALTY_N1 + (length - 5) : 0;
  for (let i = 0; i < size; i += 1) {
    let rowColor = modules[i][0];
    let rowRun = 1;
    let colColor = modules[0][i];
    let colRun = 1;
    for (let j = 1; j < size; j += 1) {
      if (modules[i][j] === rowColor) {
        rowRun += 1;
      } else {
        score += scoreRun(rowRun);
        rowColor = modules[i][j];
        rowRun = 1;
      }
      if (modules[j][i] === colColor) {
        colRun += 1;
      } else {
        score += scoreRun(colRun);
        colColor = modules[j][i];
        colRun = 1;
      }
    }
    score += scoreRun(rowRun) + scoreRun(colRun);
  }

  // ── N2: bloques de 2x2 del mismo color ───────────────────────────────────
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const color = modules[row][col];
      if (
        modules[row][col + 1] === color &&
        modules[row + 1][col] === color &&
        modules[row + 1][col + 1] === color
      ) {
        score += PENALTY_N2;
      }
    }
  }

  // ── N3: ventanas de 11 módulos que imitan un localizador ─────────────────
  for (let i = 0; i < size; i += 1) {
    for (let start = 0; start + 11 <= size; start += 1) {
      for (const pattern of FINDER_LIKE_PATTERNS) {
        let inRow = true;
        let inColumn = true;
        for (let k = 0; k < 11; k += 1) {
          if (modules[i][start + k] !== pattern[k]) inRow = false;
          if (modules[start + k][i] !== pattern[k]) inColumn = false;
          if (!inRow && !inColumn) break;
        }
        if (inRow) score += PENALTY_N3;
        if (inColumn) score += PENALTY_N3;
      }
    }
  }

  // ── N4: desviación de la proporción de módulos oscuros respecto al 50% ───
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) if (modules[row][col]) dark += 1;
  }
  const total = size * size;
  // |porcentaje - 50| / 5, en aritmética entera para no arrastrar decimales.
  const deviation = Math.floor(Math.abs(dark * 20 - total * 10) / total);
  score += deviation * PENALTY_N4;

  return score;
}

// ───────────────────────────────────────────────────────────────────────────
// Codificación
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cadena de bits del segmento: modo + cuenta + bytes, con terminador, relleno
 * hasta byte completo y bytes de relleno alternados hasta llenar la capacidad.
 */
function buildDataCodewords(data: Uint8Array, version: number): number[] {
  const layout = blockLayout(version);
  const capacityBits = layout.totalDataCodewords * 8;
  const bits: boolean[] = [];
  const appendBits = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1)
      bits.push(((value >>> i) & 1) === 1);
  };

  appendBits(MODE_BYTE, 4);
  appendBits(data.length, characterCountBits(version));
  for (const byte of data) appendBits(byte, 8);

  // Terminador: hasta cuatro ceros, o menos si ya no cabe. El `min` es defensa,
  // no un caso vivo: en modo byte la cabecera son 4 + 8 o 4 + 16 bits, así que
  // el flujo siempre acaba en 4 (mod 8) y la capacidad es múltiplo de 8 — nunca
  // quedan menos de cuatro bits libres. Se deja porque quien lea esto no tiene
  // por qué rehacer esa cuenta para convencerse.
  appendBits(0, Math.min(4, capacityBits - bits.length));
  // Y hasta completar el byte en curso.
  appendBits(0, (8 - (bits.length % 8)) % 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    codewords.push(byte);
  }
  for (let i = 0; codewords.length < layout.totalDataCodewords; i += 1) {
    codewords.push(PAD_BYTES[i % 2]);
  }
  return codewords;
}

/**
 * Reparte los datos en bloques, calcula el ECC de cada uno y los ENTRELAZA.
 *
 * El entrelazado no es un capricho: reparte cada bloque por toda la matriz, de
 * modo que una mancha o un doblez concentrados dañen unos pocos codewords de
 * cada bloque en vez de destruir un bloque entero. Reed-Solomon corrige hasta
 * t errores POR BLOQUE; sin entrelazar, un borrón local supera ese límite en un
 * bloque mientras los otros salen intactos.
 */
function buildInterleavedCodewords(
  dataCodewords: readonly number[],
  version: number,
): number[] {
  const layout = blockLayout(version);
  const generator = reedSolomonGenerator(layout.ecPerBlock);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (let b = 0; b < layout.blocks; b += 1) {
    const length =
      b < layout.shortBlocks ? layout.shortDataLength : layout.longDataLength;
    const block = dataCodewords.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomonRemainder(block, generator));
  }

  const result: number[] = [];
  for (let i = 0; i < layout.longDataLength; i += 1) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < layout.ecPerBlock; i += 1) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

function placeCodewords(canvas: Canvas, codewords: readonly number[]): void {
  const path = traverse(canvas);
  const totalBits = codewords.length * 8;
  for (let i = 0; i < path.length; i += 1) {
    // Los módulos que sobran del recorrido son los bits de resto: quedan claros.
    if (i >= totalBits) break;
    const bit = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
    canvas.modules[path[i].row][path[i].col] = bit === 1;
  }
}

function chooseVersion(byteLength: number, minVersion: number): number {
  for (let version = minVersion; version <= QR_MAX_VERSION; version += 1) {
    if (byteLength <= byteCapacity(version)) return version;
  }
  throw new Error(
    `El texto no cabe en un código QR de nivel M: ocupa ${byteLength} bytes en UTF-8 y la versión ` +
      `${QR_MAX_VERSION} admite como máximo ${byteCapacity(QR_MAX_VERSION)}. Acorta el contenido ` +
      `o pásalo por un enlace corto.`,
  );
}

interface PreparedCode {
  version: number;
  canvas: Canvas;
}

function prepare(text: string, options?: QrEncodeOptions): PreparedCode {
  const minVersion = options?.minVersion ?? QR_MIN_VERSION;
  assertVersionInRange(minVersion);
  const data = new TextEncoder().encode(text);
  const version = chooseVersion(data.length, minVersion);
  const canvas = createCanvas(version);
  placeCodewords(
    canvas,
    buildInterleavedCodewords(buildDataCodewords(data, version), version),
  );
  return { version, canvas };
}

function renderWithMask(canvas: Canvas, maskId: number): boolean[][] {
  const modules = canvas.modules.map((row) => row.slice());
  drawFormatInfo(modules, canvas.size, maskId);
  for (let row = 0; row < canvas.size; row += 1) {
    for (let col = 0; col < canvas.size; col += 1) {
      // Los módulos de función NO se enmascaran: el lector los necesita
      // intactos para encontrar la retícula antes de saber qué máscara hay.
      if (canvas.isFunction[row][col]) continue;
      if (maskBit(maskId, row, col)) modules[row][col] = !modules[row][col];
    }
  }
  return modules;
}

/**
 * Penalización de cada una de las ocho máscaras para este contenido, en orden
 * de máscara 0 a 7. Se expone para que las pruebas puedan comprobar que
 * `encodeQr` elige de verdad el mínimo, sin tener que reimplementar la
 * selección.
 */
export function maskPenalties(
  text: string,
  options?: QrEncodeOptions,
): number[] {
  const { canvas } = prepare(text, options);
  const penalties: number[] = [];
  for (let maskId = 0; maskId < 8; maskId += 1) {
    penalties.push(penaltyScore(renderWithMask(canvas, maskId)));
  }
  return penalties;
}

/**
 * La misma matriz que `encodeQr`, pero con la máscara IMPUESTA en vez de
 * elegida por penalización.
 *
 * No lo use el producto: existe para que las pruebas puedan recorrer las ocho
 * máscaras de punta a punta. La selección por penalización mínima elige casi
 * siempre las mismas tres o cuatro —la 7 no sale ni en trescientos textos—, así
 * que sin esta puerta habría máscaras que ninguna prueba llegaría a escribir ni
 * a leer nunca, y un error en una de ellas esperaría a salir en producción el
 * día que un secreto cualquiera la hiciera ganar.
 */
export function encodeQrWithMask(
  text: string,
  maskId: number,
  options?: QrEncodeOptions,
): QrMatrix {
  if (!Number.isInteger(maskId) || maskId < 0 || maskId > 7) {
    throw new Error(`Máscara ${maskId} fuera del rango 0-7.`);
  }
  const { version, canvas } = prepare(text, options);
  return {
    size: canvas.size,
    modules: renderWithMask(canvas, maskId),
    version,
  };
}

/**
 * Codifica `text` en una matriz de módulos. Determinista: la misma entrada
 * produce siempre la misma matriz, porque la máscara se elige por penalización
 * mínima y los empates se resuelven por el índice más bajo.
 */
export function encodeQr(text: string, options?: QrEncodeOptions): QrMatrix {
  const { version, canvas } = prepare(text, options);
  let best: boolean[][] | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let maskId = 0; maskId < 8; maskId += 1) {
    const candidate = renderWithMask(canvas, maskId);
    const penalty = penaltyScore(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = candidate;
    }
  }
  if (best === null)
    throw new Error(
      "No se pudo evaluar ninguna máscara; esto no debería ocurrir.",
    );
  return { size: canvas.size, modules: best, version };
}
