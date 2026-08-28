/**
 * CODIFICADOR DE CÓDIGOS QR — entrega la MATRIZ de módulos, sin dependencias.
 *
 * QUÉ PROBLEMA RESUELVE. El alta de segundo factor (MFA/TOTP) enseña un
 * `otpauth://` en la página de cuenta, y ese URI lleva DENTRO el secreto
 * compartido. Eso descarta las dos salidas fáciles: un generador remoto (los
 * `api.…/qr?data=` de turno) entrega el secreto a un tercero en el query
 * string, y una dependencia de npm añade superficie de suministro permanente
 * a cambio de aritmética congelada desde 2006. Queda escribirla.
 *
 * QUÉ ENTREGA Y QUÉ NO. Sólo la matriz booleana; pintarla —SVG, canvas,
 * tabla— es de la capa de presentación, y traerlo aquí ataría el codificador
 * a React. Tampoco incluye la «zona tranquila»: son 4 módulos de margen que
 * el que pinta añade como padding, y devolverlos como filas falsas obligaría
 * a todo consumidor a recortarlas.
 *
 * ALCANCE DELIBERADO. Modo BYTE (UTF-8), nivel M, versiones 1 a 40. Los modos
 * numérico y alfanumérico comprimirían más, pero cada modo es otra tabla de
 * capacidades y otro camino de pruebas, y ninguno sirve para un URI con
 * minúsculas y signos. Nivel M (~15% de recuperación) es el de los
 * autenticadores: L se degrada mal impreso y Q/H agrandan la matriz sin que
 * nadie lo necesite en pantalla.
 */

/** Matriz cuadrada de módulos. `true` es módulo oscuro. */
export interface QrMatrix {
  size: number;
  modules: readonly (readonly boolean[])[];
  version: number;
}

export interface QrEncodeOptions {
  /** Fuerza un tamaño mínimo. Útil para que una matriz no «baile» de tamaño. */
  minVersion?: number;
}

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 40;

/** Indicador de modo BYTE (4 bits) según ISO/IEC 18004 tabla 2. */
const MODE_BYTE = 0b0100;

/** Los dos bits de nivel de corrección para M. L=01, M=00, Q=11, H=10. */
const EC_LEVEL_M_BITS = 0b00;

/** Bytes de relleno alternados que exige el estándar tras el terminador. */
const PAD_BYTES = [0xec, 0x11] as const;

// ───────────────────────────────────────────────────────────────────────────
// Aritmética en GF(256)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Polinomio primitivo x^8 + x^4 + x^3 + x^2 + 1. No es una preferencia: es el
 * que fija el estándar, y con otro los codewords de corrección saldrían
 * distintos y ningún lector podría leerlos.
 */
const GF_PRIMITIVE = 0x11d;

/**
 * Tablas de antilogaritmo y logaritmo en base α = 2. Multiplicar es sumar
 * exponentes, y por eso `GF_EXP` se duplica hasta 512: así la suma de dos
 * logaritmos (máximo 254 + 254) se indexa sin un módulo por operación.
 */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= GF_PRIMITIVE;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}

/** Producto en GF(256). El cero no tiene logaritmo, de ahí el caso aparte. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * Polinomio generador mónico de grado `degree`, coeficientes de mayor a menor
 * grado: g(x) = (x - α^0)(x - α^1)…(x - α^(degree-1)).
 *
 * OJO CON LA CONVENCIÓN. QR arranca las raíces en α^0, no en α^1 como la
 * literatura genérica de Reed-Solomon (fcr = 1). Quien compruebe síndromes
 * contra α^1..α^2t sobre un bloque de QR obtendrá valores NO nulos aunque el
 * ECC esté perfecto; hay que evaluar en α^0..α^(2t-1).
 */
export function reedSolomonGenerator(degree: number): number[] {
  if (degree < 1) throw new Error(`Grado ${degree} inválido para el polinomio generador.`);
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    const root = GF_EXP[i % 255];
    const next = new Array<number>(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMul(generator[j], root);
    }
    generator = next;
  }
  return generator;
}

/**
 * Resto de dividir el mensaje (multiplicado por x^ecLen) entre el generador:
 * los codewords de corrección. División sintética con acarreo XOR; se procesa
 * un byte por vuelta para no materializar el dividendo completo.
 */
function reedSolomonRemainder(data: readonly number[], generator: readonly number[]): number[] {
  const ecLength = generator.length - 1;
  const result = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < ecLength; i += 1) result[i] ^= gfMul(generator[i + 1], factor);
  }
  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// Geometría y capacidades por versión
// ───────────────────────────────────────────────────────────────────────────

/** Lado de la matriz. La relación 4·versión+17 es la definición de versión. */
export function versionSize(version: number): number {
  return version * 4 + 17;
}

/**
 * Módulos disponibles para datos + corrección, ya descontados los patrones de
 * función. Se CALCULA en vez de tabularse porque la tabla son 40 números que
 * nadie puede revisar de un vistazo, mientras que la fórmula se deriva de la
 * geometría: área total, menos los tres localizadores con separador, menos
 * las líneas de temporización, menos los alineamientos (que se solapan con la
 * temporización de forma regular), menos la información de versión.
 */
function rawDataModules(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;
    modules -= (25 * alignmentCount - 10) * alignmentCount - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}

/** Codewords totales (datos + corrección) que caben en la versión. */
export function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

/**
 * Bits sobrantes al final del recorrido: la matriz no siempre es múltiplo de
 * 8 módulos de datos. Se dejan claros y el lector los ignora.
 */
export function remainderBits(version: number): number {
  return rawDataModules(version) - totalCodewords(version) * 8;
}

/**
 * Codewords de corrección por bloque y número de bloques, nivel M.
 *
 * POR QUÉ SÓLO DOS NÚMEROS POR VERSIÓN. Las tablas publicadas traen cinco
 * columnas (EC por bloque, y bloques y datos de los grupos 1 y 2). Las tres
 * últimas son DERIVABLES: los datos totales son `total - bloques × EC`, y el
 * estándar los reparte en bloques que difieren como mucho en un codeword.
 * Copiar 200 números a mano es una fuente de erratas silenciosas; copiar 80 y
 * derivar el resto convierte media tabla en una invariante comprobable, y las
 * pruebas la comprueban contra las cinco columnas publicadas.
 *
 * Dos listas paralelas indexadas por `versión - 1`, y no pares, porque
 * cuarenta parejas ocupan cuarenta renglones y dejan de leerse como tabla.
 */
const EC_CODEWORDS_PER_BLOCK_M: readonly number[] = [
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const EC_BLOCKS_M: readonly number[] = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26,
  28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

export interface QrBlockLayout {
  ecPerBlock: number;
  blocks: number;
  /** Bloques «cortos»; los demás llevan un codeword de datos más. */
  shortBlocks: number;
  shortDataLength: number;
  longDataLength: number;
  totalDataCodewords: number;
  totalCodewords: number;
}

export function blockLayout(version: number): QrBlockLayout {
  assertVersionInRange(version);
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK_M[version - 1];
  const blocks = EC_BLOCKS_M[version - 1];
  const total = totalCodewords(version);
  const totalDataCodewords = total - ecPerBlock * blocks;
  const shortDataLength = Math.floor(totalDataCodewords / blocks);
  const longBlocks = totalDataCodewords % blocks;
  return {
    ecPerBlock,
    blocks,
    shortBlocks: blocks - longBlocks,
    shortDataLength,
    longDataLength: shortDataLength + 1,
    totalDataCodewords,
    totalCodewords: total,
  };
}

/**
 * Bits del indicador de cuenta de caracteres en modo byte: 8 hasta la versión
 * 9 y 16 a partir de la 10. El salto importa porque cambia la capacidad justo
 * en la frontera y una versión elegida con el ancho equivocado desborda.
 */
export function characterCountBits(version: number): number {
  return version < 10 ? 8 : 16;
}

/** Bytes UTF-8 que caben en la versión, nivel M, modo byte. */
export function byteCapacity(version: number): number {
  const layout = blockLayout(version);
  const usableBits = layout.totalDataCodewords * 8 - 4 - characterCountBits(version);
  return Math.floor(usableBits / 8);
}

/**
 * Centros de los patrones de alineación. El primero siempre en 6 y el último
 * en `size-7`; los intermedios se reparten con paso PAR (los centros han de
 * caer en coordenada par para no romper la temporización). La versión 32 es la
 * excepción documentada del estándar: el reparto uniforme daría 28 y la tabla
 * publicada dice 26.
 */
export function alignmentPatternPositions(version: number): number[] {
  assertVersionInRange(version);
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = version * 4 + 10; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

function assertVersionInRange(version: number): void {
  if (!Number.isInteger(version) || version < QR_MIN_VERSION || version > QR_MAX_VERSION) {
    throw new Error(
      `Versión de QR inválida: ${version}. Sólo existen las versiones ${QR_MIN_VERSION} a ${QR_MAX_VERSION}.`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Información de formato y de versión (códigos BCH)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 15 bits de información de formato: 2 de nivel de corrección + 3 de máscara,
 * protegidos con BCH(15,5) —generador 0x537— y enmascarados con 0x5412.
 *
 * POR QUÉ LA MÁSCARA 0x5412. Sin ella, el formato (M, máscara 0) sería quince
 * ceros: una región uniforme pegada al localizador, justo lo que confunde a un
 * lector. La XOR garantiza que ninguna combinación de las 32 posibles salga
 * toda clara ni toda oscura.
 */
export function formatInfoBits(maskId: number): number {
  if (!Number.isInteger(maskId) || maskId < 0 || maskId > 7) {
    throw new Error(`Máscara ${maskId} fuera del rango 0-7.`);
  }
  const data = (EC_LEVEL_M_BITS << 3) | maskId;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

/**
 * 18 bits de información de versión (sólo versión >= 7): 6 de versión con
 * BCH(18,6), generador 0x1F25. Aquí NO hay máscara final: el estándar no la
 * define porque estos bloques quedan lejos de los localizadores.
 */
export function versionInfoBits(version: number): number {
  assertVersionInRange(version);
  if (version < 7) {
    throw new Error(
      `La versión ${version} no lleva información de versión; sólo la 7 en adelante.`,
    );
  }
  let remainder = version;
  for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

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
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function setFunctionModule(canvas: Canvas, row: number, col: number, dark: boolean): void {
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
function drawFinderPattern(canvas: Canvas, centerRow: number, centerCol: number): void {
  for (let dr = -4; dr <= 4; dr += 1) {
    for (let dc = -4; dc <= 4; dc += 1) {
      const row = centerRow + dr;
      const col = centerCol + dc;
      if (row < 0 || row >= canvas.size || col < 0 || col >= canvas.size) continue;
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      setFunctionModule(canvas, row, col, distance !== 2 && distance !== 4);
    }
  }
}

/** Alineación 5x5: núcleo oscuro, anillo claro (distancia 1), marco oscuro. */
function drawAlignmentPattern(canvas: Canvas, centerRow: number, centerCol: number): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      setFunctionModule(canvas, centerRow + dr, centerCol + dc, distance !== 1);
    }
  }
}

/** Coordenadas de los 15 módulos de formato, en orden de bit 0 a bit 14. */
function formatModulePositions(size: number): ReadonlyArray<readonly [row: number, col: number]> {
  const first: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i += 1) first.push([i, 8]);
  first.push([7, 8], [8, 8], [8, 7]);
  for (let i = 9; i < 15; i += 1) first.push([8, 14 - i]);
  const second: Array<[number, number]> = [];
  for (let i = 0; i < 8; i += 1) second.push([8, size - 1 - i]);
  for (let i = 8; i < 15; i += 1) second.push([size - 15 + i, 8]);
  return [...first, ...second];
}

function drawFormatInfo(modules: boolean[][], size: number, maskId: number): void {
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
        (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
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
  const scoreRun = (length: number): number => (length >= 5 ? PENALTY_N1 + (length - 5) : 0);
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
    for (let i = length - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) === 1);
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
function buildInterleavedCodewords(dataCodewords: readonly number[], version: number): number[] {
  const layout = blockLayout(version);
  const generator = reedSolomonGenerator(layout.ecPerBlock);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (let b = 0; b < layout.blocks; b += 1) {
    const length = b < layout.shortBlocks ? layout.shortDataLength : layout.longDataLength;
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
  placeCodewords(canvas, buildInterleavedCodewords(buildDataCodewords(data, version), version));
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
export function maskPenalties(text: string, options?: QrEncodeOptions): number[] {
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
    throw new Error("No se pudo evaluar ninguna máscara; esto no debería ocurrir.");
  return { size: canvas.size, modules: best, version };
}
