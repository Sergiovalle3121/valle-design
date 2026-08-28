/**
 * LAS TABLAS Y LA ARITMÉTICA DEL ESTÁNDAR QR.
 *
 * Todo lo que en un código QR está FIJADO por el estándar y no depende de qué
 * se codifique: el campo GF(256) y su generador de Reed-Solomon, el tamaño y la
 * capacidad de cada versión, el reparto en bloques del nivel de corrección M,
 * los centros de los patrones de alineación, y las cadenas BCH de información
 * de formato y de versión.
 *
 * ── POR QUÉ ESTÁ SEPARADO DEL CODIFICADOR ───────────────────────────────────
 * Por tamaño —`qr-encode.ts` pasó de 800 líneas y el gate del monolito pide
 * dividir, no presupuestar— y porque el corte cae en una costura real: aquí
 * está lo que se puede contrastar contra un número PUBLICADO, y en
 * `qr-encode.ts` lo que sólo se puede comprobar dibujando una matriz. Las dos
 * suites de prueba se partieron por la misma línea.
 *
 * `qr-encode.ts` reexporta todo esto, así que quien ya importaba de allí sigue
 * funcionando; `qr-decode.ts` importa de aquí las tablas declarativas que
 * necesita para no reimplementarlas (y que las pruebas fijan contra el
 * estándar, precisamente porque compartirlas sería circular de otro modo).
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
export const MODE_BYTE = 0b0100;

/** Los dos bits de nivel de corrección para M. L=01, M=00, Q=11, H=10. */
const EC_LEVEL_M_BITS = 0b00;

/** Bytes de relleno alternados que exige el estándar tras el terminador. */
export const PAD_BYTES = [0xec, 0x11] as const;

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
  if (degree < 1)
    throw new Error(`Grado ${degree} inválido para el polinomio generador.`);
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
export function reedSolomonRemainder(
  data: readonly number[],
  generator: readonly number[],
): number[] {
  const ecLength = generator.length - 1;
  const result = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < ecLength; i += 1)
      result[i] ^= gfMul(generator[i + 1], factor);
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
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28,
];
const EC_BLOCKS_M: readonly number[] = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18,
  20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
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
  const usableBits =
    layout.totalDataCodewords * 8 - 4 - characterCountBits(version);
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
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = version * 4 + 10; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

export function assertVersionInRange(version: number): void {
  if (
    !Number.isInteger(version) ||
    version < QR_MIN_VERSION ||
    version > QR_MAX_VERSION
  ) {
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
  for (let i = 0; i < 10; i += 1)
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
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
  for (let i = 0; i < 12; i += 1)
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}
