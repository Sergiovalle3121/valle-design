import { strict as assert } from "node:assert";
import {
  alignmentPatternPositions,
  blockLayout,
  byteCapacity,
  characterCountBits,
  dataModulePath,
  encodeQr,
  encodeQrWithMask,
  formatInfoBits,
  gfMul,
  maskBit,
  maskPenalties,
  penaltyScore,
  QR_MAX_VERSION,
  reedSolomonGenerator,
  remainderBits,
  totalCodewords,
  versionInfoBits,
  versionSize,
  type QrMatrix,
} from "./qr-encode";
import { decodeQrText, functionModuleMap, readQrRaw } from "./qr-decode";

/**
 * PRUEBAS DEL CODIFICADOR DE QR.
 *
 * Un codificador de QR falla de una forma especialmente cruel: produce una
 * matriz de aspecto impecable que ningún teléfono lee. No hay excepción, no hay
 * salida corrupta, no hay nada que mirar. Por eso aquí no se afirma «devuelve
 * algo»: cada pieza se contrasta contra algo que NO es este codificador.
 *
 * Los cuatro oráculos, y qué cubre cada uno:
 *
 *   1. `qr-decode.ts`, un lector escrito aparte que no comparte lógica con el
 *      codificador. Cubre el ensamblado: máscara, formato, zigzag, entrelazado
 *      y troceado de bits. Lo que NO puede cubrir queda anotado abajo.
 *   2. Aritmética independiente sobre GF(256), escrita EN ESTE ARCHIVO con otro
 *      algoritmo (multiplicación por desplazamiento y reducción, en vez de las
 *      tablas de logaritmos del codificador). Cubre Reed-Solomon de verdad: si
 *      todos los síndromes de un bloque son cero, el ECC es correcto, y eso no
 *      depende de cómo se calculó.
 *   3. Vectores publicados del estándar ISO/IEC 18004: polinomio generador,
 *      información de formato, información de versión, centros de alineación y
 *      capacidades. Cubre las constantes y las tablas.
 *   4. Geometría derivada a mano. Cubre penalización y estructura.
 *
 * LÍMITE DECLARADO, para que nadie lo dé por cubierto: una ida y vuelta no
 * puede validar una CONVENCIÓN compartida. Si el codificador y el lector
 * recorrieran los módulos en el mismo orden equivocado, el texto volvería
 * igualmente y el código sería ilegible para un lector real. Por eso el orden
 * de recorrido y las máscaras se contrastan además contra su enunciado
 * publicado (coordenadas del primer codeword, forma visible de cada máscara), y
 * no sólo contra la ida y vuelta.
 */

let comprobaciones = 0;

function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  comprobaciones += 1;
}

function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  comprobaciones += 1;
}

function lanza(fn: () => unknown, pattern: RegExp, message: string): void {
  assert.throws(fn, pattern, message);
  comprobaciones += 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 2 — GF(256) reimplementado con otro algoritmo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Producto en GF(256) por el método del campesino ruso: desplazar y reducir
 * con 0x11D en cuanto se desborda el octavo bit. Deliberadamente NO usa tablas
 * de logaritmos, que es como lo hace el codificador: si ambos compartieran
 * algoritmo, comprobar uno con el otro no diría nada.
 */
function gfMulLibre(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) result ^= x;
    y >>= 1;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  return result;
}

/** α^exponent con α = 2, por multiplicación repetida. */
function alfa(exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i += 1) result = gfMulLibre(result, 2);
  return result;
}

/** Evalúa un polinomio de coeficientes de mayor a menor grado, por Horner. */
function evalPoly(coefficients: readonly number[], x: number): number {
  let value = 0;
  for (const coefficient of coefficients) value = gfMulLibre(value, x) ^ coefficient;
  return value;
}

// ── El campo es el que dice el estándar ─────────────────────────────────────
// α^7 · α = α^8 = x^8, que módulo x^8+x^4+x^3+x^2+1 vale x^4+x^3+x^2+1 = 0x1D.
eq(gfMulLibre(0x80, 2), 0x1d, "la reducción por 0x11D define el campo");
eq(gfMul(0x80, 2), 0x1d, "el codificador reduce con el mismo polinomio primitivo");

// Los dos productos coinciden en las 65 536 parejas. Si el codificador tuviera
// mal una tabla, no habría dónde esconderse.
let discrepancias = 0;
for (let a = 0; a < 256; a += 1) {
  for (let b = 0; b < 256; b += 1) if (gfMul(a, b) !== gfMulLibre(a, b)) discrepancias += 1;
}
eq(discrepancias, 0, "gfMul del codificador difiere del producto independiente");

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 3 — Vectores publicados: polinomios generadores
// ═══════════════════════════════════════════════════════════════════════════

// Publicado en ISO/IEC 18004 anexo A (y reproducido en toda la literatura):
// el generador de grado 10, el que usa la versión 1 nivel M.
eq(
  reedSolomonGenerator(10),
  [1, 216, 194, 159, 111, 199, 94, 95, 113, 157, 193],
  "generador de grado 10 distinto del publicado",
);

// Grados 1 y 2, derivables a mano: (x+α^0) = x+1 y (x+1)(x+α) = x²+3x+2,
// porque α^0+α^1 = 1 xor 2 = 3 y α^0·α^1 = 2.
eq(reedSolomonGenerator(1), [1, 1], "generador de grado 1");
eq(reedSolomonGenerator(2), [1, 3, 2], "generador de grado 2");

/**
 * LA PROPIEDAD QUE DEFINE AL GENERADOR, comprobada con la aritmética libre:
 * g(x) = (x-α^0)…(x-α^(d-1)) tiene por raíces exactamente α^0..α^(d-1). Se
 * verifica para TODOS los grados que la tabla del nivel M llega a usar, no sólo
 * para el que trae vector publicado.
 */
const gradosUsados = new Set<number>();
for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
  gradosUsados.add(blockLayout(version).ecPerBlock);
}
ok(gradosUsados.size >= 7, "la tabla del nivel M debería usar varios grados distintos");
for (const grado of gradosUsados) {
  const generator = reedSolomonGenerator(grado);
  eq(generator.length, grado + 1, `el generador de grado ${grado} debe tener grado+1 coeficientes`);
  eq(generator[0], 1, `el generador de grado ${grado} debe ser mónico`);
  for (let i = 0; i < grado; i += 1) {
    eq(evalPoly(generator, alfa(i)), 0, `α^${i} debería ser raíz del generador de grado ${grado}`);
  }
  // Y α^d NO es raíz: si lo fuera, el generador tendría un factor de más y
  // estaríamos gastando un codeword de corrección en nada.
  ok(evalPoly(generator, alfa(grado)) !== 0, `α^${grado} no debería ser raíz`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 3 — Vectores publicados: información de formato y de versión
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Las ocho cadenas de información de formato del nivel M, tabla C.1 del
 * estándar (la del enunciado, 0b101010000010010 para máscara 0, es la primera).
 * Se comprueban las ocho porque un error de un solo bit aquí no rompe la ida y
 * vuelta —el lector propio lo corregiría con el BCH— pero sí desplaza la
 * máscara que aplica un lector real.
 */
const FORMATO_M: readonly string[] = [
  "101010000010010",
  "101000100100101",
  "101111001111100",
  "101101101001011",
  "100010111111001",
  "100000011001110",
  "100111110010111",
  "100101010100000",
];
for (let maskId = 0; maskId < 8; maskId += 1) {
  eq(
    formatInfoBits(maskId).toString(2).padStart(15, "0"),
    FORMATO_M[maskId],
    `información de formato (M, máscara ${maskId}) fuera de tabla`,
  );
}

// Información de versión, tabla D.1: versión 7 = 0x07C94, versión 10 = 0x0A4D3.
eq(versionInfoBits(7), 0x07c94, "información de versión 7 fuera de tabla");
eq(versionInfoBits(10), 0x0a4d3, "información de versión 10 fuera de tabla");
// Y por debajo de 7 no existe: pedirla es un error del que llama, no un cero.
lanza(
  () => versionInfoBits(6),
  /no lleva información de versión/,
  "versión 6 sin bloque de versión",
);

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 3 — Vectores publicados: alineación, capacidades y bloques
// ═══════════════════════════════════════════════════════════════════════════

// Centros de los patrones de alineación, tabla E.1. Incluye la versión 32, que
// es la fila que NO sigue el reparto uniforme.
eq(alignmentPatternPositions(1), [], "la versión 1 no lleva alineación");
eq(alignmentPatternPositions(2), [6, 18], "alineación de la versión 2");
eq(alignmentPatternPositions(7), [6, 22, 38], "alineación de la versión 7");
eq(alignmentPatternPositions(10), [6, 28, 50], "alineación de la versión 10");
eq(alignmentPatternPositions(20), [6, 34, 62, 90], "alineación de la versión 20");
eq(alignmentPatternPositions(32), [6, 34, 60, 86, 112, 138], "alineación de la versión 32");
eq(alignmentPatternPositions(40), [6, 30, 58, 86, 114, 142, 170], "alineación de la versión 40");

// Codewords totales por versión (tabla 9 del estándar).
eq(totalCodewords(1), 26, "codewords totales de la versión 1");
eq(totalCodewords(7), 196, "codewords totales de la versión 7");
eq(totalCodewords(40), 3706, "codewords totales de la versión 40");

/**
 * Reparto en bloques del nivel M (tabla 9). El codificador guarda sólo dos
 * números por versión y DERIVA el resto; estos vectores comprueban que la
 * derivación reproduce las cinco columnas publicadas.
 */
const BLOQUES_M: ReadonlyArray<
  readonly [
    version: number,
    ecPerBlock: number,
    cortos: number,
    datosCortos: number,
    largos: number,
  ]
> = [
  [1, 10, 1, 16, 0],
  [5, 24, 2, 43, 0],
  [8, 22, 2, 38, 2],
  [9, 22, 3, 36, 2],
  [10, 26, 4, 43, 1],
  [11, 30, 1, 50, 4],
  [21, 26, 17, 42, 0],
  [40, 28, 18, 47, 31],
];
for (const [version, ecPerBlock, cortos, datosCortos, largos] of BLOQUES_M) {
  const layout = blockLayout(version);
  eq(layout.ecPerBlock, ecPerBlock, `EC por bloque de la versión ${version}`);
  eq(layout.shortBlocks, cortos, `bloques cortos de la versión ${version}`);
  eq(layout.shortDataLength, datosCortos, `datos por bloque corto de la versión ${version}`);
  eq(layout.blocks - layout.shortBlocks, largos, `bloques largos de la versión ${version}`);
  // Invariante estructural: los bloques suman exactamente los datos, y datos
  // más corrección suman exactamente lo que cabe.
  eq(
    cortos * datosCortos + largos * (datosCortos + 1),
    layout.totalDataCodewords,
    `el reparto de la versión ${version} no suma los datos`,
  );
  eq(
    layout.totalDataCodewords + layout.blocks * layout.ecPerBlock,
    totalCodewords(version),
    `datos + corrección de la versión ${version} no llenan la matriz`,
  );
}

/**
 * LAS CUARENTA FILAS DEL NIVEL M, no una muestra.
 *
 * El apartado anterior comprueba ocho versiones contra las cinco columnas
 * publicadas, y eso NO basta: el codificador y el lector comparten la tabla, así
 * que un valor equivocado en una versión sin vector —la 14, por ejemplo— produce
 * un código internamente coherente que va y vuelve, con síndromes nulos, y que
 * ningún lector real sabe leer. Se comprobó: cambiar los 24 codewords de
 * corrección de la versión 14 por 26 pasaba todas las demás pruebas.
 *
 * El cierre son tres columnas publicadas y una identidad geométrica que las ata:
 * los datos del nivel M tienen que ser los codewords totales de la versión
 * —que salen de la fórmula de módulos, no de esta tabla— menos la corrección.
 * Una errata en cualquiera de las dos primeras columnas rompe la identidad.
 */
const EC_POR_BLOQUE_M: readonly number[] = [
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const BLOQUES_TOTALES_M: readonly number[] = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26,
  28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
/** Columna «codewords de datos, nivel M» de la tabla 9 del estándar. */
const DATOS_M: readonly number[] = [
  16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627, 669,
  714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914, 1992,
  2102, 2216, 2334,
];
for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
  const layout = blockLayout(version);
  const ec = EC_POR_BLOQUE_M[version - 1];
  const bloques = BLOQUES_TOTALES_M[version - 1];
  eq(layout.ecPerBlock, ec, `EC por bloque de la versión ${version} fuera de tabla`);
  eq(layout.blocks, bloques, `número de bloques de la versión ${version} fuera de tabla`);
  eq(
    layout.totalDataCodewords,
    DATOS_M[version - 1],
    `datos de la versión ${version} fuera de tabla`,
  );
  // La identidad que ata las tres columnas a la geometría de la matriz.
  eq(
    totalCodewords(version) - ec * bloques,
    DATOS_M[version - 1],
    `la versión ${version} no cuadra: codewords totales menos corrección deberían ser los datos`,
  );
}

// Capacidad en bytes, nivel M, modo byte (tabla 7).
eq(byteCapacity(1), 14, "capacidad de la versión 1");
eq(byteCapacity(10), 213, "capacidad de la versión 10");
eq(byteCapacity(40), 2331, "capacidad de la versión 40");
// El indicador de cuenta salta de 8 a 16 bits justo en la versión 10.
eq(characterCountBits(9), 8, "cuenta de caracteres hasta la versión 9");
eq(characterCountBits(10), 16, "cuenta de caracteres desde la versión 10");

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 4 — Penalización derivada a mano
// ═══════════════════════════════════════════════════════════════════════════

function matriz(size: number, dark = false): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(dark));
}

/**
 * Matriz 21x21 completamente clara, calculada a mano:
 *   N1: 21 filas y 21 columnas con un tramo de 21 → 42 × (3 + 16) = 798
 *   N2: 20×20 cuadros uniformes × 3 = 1200
 *   N3: los dos patrones llevan módulos oscuros → 0
 *   N4: 0 % de oscuros, |0-50|/5 = 10 → 100
 *   Total 2098
 * La toda oscura da lo mismo: N1 y N2 son simétricas y N4 mide desviación.
 */
eq(penaltyScore(matriz(21, false)), 2098, "penalización de la matriz 21x21 clara");
eq(penaltyScore(matriz(21, true)), 2098, "penalización de la matriz 21x21 oscura");

/**
 * Matriz 11x11 clara con la fila 0 puesta al patrón 00001011101 —uno de los dos
 * que imitan un localizador—, calculada a mano:
 *   N1: filas 90 (la 0 ya no tiene ningún tramo de 5) + columnas 94 = 184
 *   N2: 3 cuadros en la banda superior + 90 abajo = 93 × 3 = 279
 *   N3: una sola aparición → 40
 *   N4: 5 oscuros de 121, |5·20 - 121·10| / 121 = 9 → 90
 *   Total 593
 * Es el vector que impide que N3 sea código muerto: sin él, una regla 3 que no
 * detectara nada pasaría inadvertida detrás de las otras tres.
 */
const PATRON_LOCALIZADOR = [false, false, false, false, true, false, true, true, true, false, true];
const conPatronEnFila = matriz(11);
for (let col = 0; col < 11; col += 1) conPatronEnFila[0][col] = PATRON_LOCALIZADOR[col];
eq(penaltyScore(matriz(11)), 598, "penalización de la matriz 11x11 clara");
eq(penaltyScore(conPatronEnFila), 593, "penalización con un patrón de localizador en fila");

// La regla 3 mira filas Y columnas: la transpuesta debe puntuar igual.
const conPatronEnColumna = matriz(11);
for (let row = 0; row < 11; row += 1) conPatronEnColumna[row][0] = PATRON_LOCALIZADOR[row];
eq(
  penaltyScore(conPatronEnColumna),
  593,
  "la penalización debería ser invariante a la transposición",
);

// ── Las ocho máscaras, contra su descripción visible publicada ──────────────
// Un cambio de fila por columna en las máscaras 2, 3 o 4 es el error clásico:
// produce un QR perfectamente estructurado que ningún lector desenmascara bien,
// y la ida y vuelta contra el lector propio NO lo detectaría.
for (let row = 0; row < 12; row += 1) {
  for (let col = 0; col < 12; col += 1) {
    const producto = row * col;
    assert.equal(maskBit(0, row, col), (row + col) % 2 === 0, "máscara 0: damero");
    assert.equal(maskBit(1, row, col), row % 2 === 0, "máscara 1: filas alternas");
    assert.equal(maskBit(2, row, col), col % 3 === 0, "máscara 2: columnas de tres en tres");
    assert.equal(maskBit(3, row, col), (row + col) % 3 === 0, "máscara 3: diagonales");
    assert.equal(
      maskBit(4, row, col),
      (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
      "máscara 4: bloques de 2 filas por 3 columnas",
    );
    assert.equal(maskBit(5, row, col), producto % 2 === 0 && producto % 3 === 0, "máscara 5");
    assert.equal(maskBit(6, row, col), ((producto % 2) + (producto % 3)) % 2 === 0, "máscara 6");
    assert.equal(maskBit(7, row, col), (((row + col) % 2) + (producto % 3)) % 2 === 0, "máscara 7");
  }
}
comprobaciones += 8;
// La 1 es horizontal y la 2 vertical: no pueden confundirse entre sí.
ok(maskBit(1, 0, 1) && !maskBit(2, 0, 1), "las máscaras 1 y 2 están intercambiadas");
lanza(() => maskBit(8, 0, 0), /fuera del rango 0-7/, "máscara inexistente");

// ═══════════════════════════════════════════════════════════════════════════
// INVARIANTES DE ESTRUCTURA
// ═══════════════════════════════════════════════════════════════════════════

function verificaEstructura(matrix: QrMatrix): void {
  const { size, modules, version } = matrix;
  eq(size, 4 * version + 17, `el lado de la versión ${version} debe ser 4·v+17`);
  eq(modules.length, size, `la matriz de la versión ${version} debe tener ${size} filas`);
  for (const row of modules) {
    if (row.length !== size) assert.fail(`fila de longitud ${row.length}, esperada ${size}`);
  }
  comprobaciones += 1;

  // ── Los tres localizadores, con su anillo claro y su separador ───────────
  for (const [centerRow, centerCol] of [
    [3, 3],
    [3, size - 4],
    [size - 4, 3],
  ]) {
    for (let dr = -3; dr <= 3; dr += 1) {
      for (let dc = -3; dc <= 3; dc += 1) {
        const esperado = Math.max(Math.abs(dr), Math.abs(dc)) !== 2;
        if (modules[centerRow + dr][centerCol + dc] !== esperado) {
          assert.fail(
            `localizador en (${centerRow},${centerCol}) roto en el desplazamiento (${dr},${dc})`,
          );
        }
      }
    }
    // Separador: el anillo a distancia 4 tiene que estar claro entero.
    for (let dr = -4; dr <= 4; dr += 1) {
      for (let dc = -4; dc <= 4; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== 4) continue;
        const row = centerRow + dr;
        const col = centerCol + dc;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (modules[row][col]) assert.fail(`separador oscuro en (${row},${col})`);
      }
    }
  }
  comprobaciones += 2;

  // ── Temporización: alterna, empezando y acabando en oscuro ──────────────
  for (let i = 8; i <= size - 9; i += 1) {
    if (modules[6][i] !== (i % 2 === 0))
      assert.fail(`temporización horizontal rota en la columna ${i}`);
    if (modules[i][6] !== (i % 2 === 0)) assert.fail(`temporización vertical rota en la fila ${i}`);
  }
  comprobaciones += 1;

  // ── Módulo oscuro ────────────────────────────────────────────────────────
  ok(modules[size - 8][8], `el módulo oscuro de la versión ${version} no está oscuro`);

  // ── Información de versión, leída de los dos bloques de 6x3 ─────────────
  // Que `versionInfoBits` calcule bien no basta: hay que comprobar que los 18
  // bits ESTÁN donde el lector los busca, y que las dos copias coinciden. Un
  // bloque invertido o transpuesto no rompe nada de lo demás.
  if (version >= 7) {
    let arribaDerecha = 0;
    let abajoIzquierda = 0;
    for (let i = 0; i < 18; i += 1) {
      const lejos = size - 11 + (i % 3);
      const cerca = Math.floor(i / 3);
      if (modules[cerca][lejos]) arribaDerecha |= 1 << i;
      if (modules[lejos][cerca]) abajoIzquierda |= 1 << i;
    }
    eq(
      arribaDerecha,
      versionInfoBits(version),
      `bloque de versión superior derecho de la versión ${version}`,
    );
    eq(
      abajoIzquierda,
      versionInfoBits(version),
      `bloque de versión inferior izquierdo de la versión ${version}`,
    );
  }

  // ── Patrones de alineación ───────────────────────────────────────────────
  const positions = alignmentPatternPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const esperado = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          if (modules[positions[i] + dr][positions[j] + dc] !== esperado) {
            assert.fail(
              `alineación en (${positions[i]},${positions[j]}) rota en (${dr},${dc}) — ` +
                `o está mal dibujada, o la máscara la tocó`,
            );
          }
        }
      }
    }
  }
  comprobaciones += 1;
}

// ── El recorrido en zigzag, contra las coordenadas publicadas ──────────────
for (const version of [1, 2, 7, 10, 25, 40]) {
  const path = dataModulePath(version);
  const size = versionSize(version);

  // Cubre exactamente los módulos que no son de función, una vez cada uno.
  const functionMap = functionModuleMap(version);
  let libres = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) if (!functionMap[row][col]) libres += 1;
  }
  eq(
    path.length,
    libres,
    `el recorrido de la versión ${version} no cubre todos los módulos libres`,
  );
  eq(
    path.length,
    totalCodewords(version) * 8 + remainderBits(version),
    `el recorrido de la versión ${version} no cuadra con los codewords más los bits de resto`,
  );
  const vistos = new Set(path.map((p) => `${p.row},${p.col}`));
  eq(vistos.size, path.length, `el recorrido de la versión ${version} repite módulos`);
  ok(
    path.every((p) => !functionMap[p.row][p.col]),
    `el recorrido de la versión ${version} pisa un módulo de función`,
  );
  ok(
    path.every((p) => p.col !== 6 && p.row !== 6),
    `el recorrido de la versión ${version} entra en la línea de temporización`,
  );

  // Los ocho primeros módulos son el primer codeword, y el estándar los sitúa
  // en el bloque 2x4 de la esquina inferior derecha, leído hacia arriba.
  eq(
    path.slice(0, 8).map((p) => [p.row, p.col]),
    [
      [size - 1, size - 1],
      [size - 1, size - 2],
      [size - 2, size - 1],
      [size - 2, size - 2],
      [size - 3, size - 1],
      [size - 3, size - 2],
      [size - 4, size - 1],
      [size - 4, size - 2],
    ],
    `el primer codeword de la versión ${version} no arranca en la esquina inferior derecha`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 2 — Síndromes de Reed-Solomon sobre los bloques LEÍDOS de la matriz
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los bloques no se piden al codificador: se EXTRAEN de la matriz con el lector
 * independiente. Así, un solo cálculo cubre a la vez el ECC, el entrelazado y
 * la colocación, y ninguna de las tres puede taparse a las otras.
 *
 * Sobre las raíces: la literatura genérica de Reed-Solomon evalúa en α^1..α^2t
 * (primera raíz consecutiva = 1), pero QR genera con raíces desde α^0, así que
 * los síndromes de un bloque correcto son C(α^0)..C(α^(2t-1)). Evaluados en
 * α^1..α^2t saldrían distintos de cero con el ECC perfectamente bien.
 */
function sindromes(codeword: readonly number[], ecPerBlock: number): number[] {
  const result: number[] = [];
  for (let j = 0; j < ecPerBlock; j += 1) result.push(evalPoly(codeword, alfa(j)));
  return result;
}

function verificaSindromes(matrix: QrMatrix, etiqueta: string): void {
  const raw = readQrRaw(matrix);
  const layout = blockLayout(raw.version);
  eq(raw.blocks.length, layout.blocks, `${etiqueta}: número de bloques`);
  for (let b = 0; b < raw.blocks.length; b += 1) {
    const block = raw.blocks[b];
    const codeword = [...block.data, ...block.ec];
    eq(block.ec.length, layout.ecPerBlock, `${etiqueta}: longitud del ECC del bloque ${b}`);
    const s = sindromes(codeword, layout.ecPerBlock);
    if (s.some((value) => value !== 0)) {
      assert.fail(
        `${etiqueta}: el bloque ${b} tiene síndromes no nulos [${s.join(", ")}] — el ECC está mal`,
      );
    }
    comprobaciones += 1;

    // Y la comprobación de arriba no es vacía: un solo byte cambiado tiene que
    // encender algún síndrome. Se altera un codeword de datos y otro de ECC.
    for (const posicion of [0, block.data.length]) {
      const corrupto = [...codeword];
      corrupto[posicion] ^= 0x5a;
      ok(
        sindromes(corrupto, layout.ecPerBlock).some((value) => value !== 0),
        `${etiqueta}: un codeword corrupto en ${posicion} debería dar síndromes no nulos`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ORÁCULO 1 — Ida y vuelta estructural contra el lector independiente
// ═══════════════════════════════════════════════════════════════════════════

const CASOS: ReadonlyArray<readonly [etiqueta: string, texto: string]> = [
  ["un solo carácter", "A"],
  ["ASCII corto", "Valle Design"],
  [
    "otpauth realista",
    "otpauth://totp/Valle%20Design:sergio.valle@ejemplo.mx?secret=JBSWY3DPEHPK3PXP&issuer=Valle%20Design&algorithm=SHA1&digits=6&period=30",
  ],
  ["acentos y eñe", "Diseño de Zúñiga: ¡plano de cimentación revisado! ¿Órdenes?"],
  ["emparejamiento con símbolos", "clave: +52 55 1234 5678 — «Peña & Asociados»"],
];

for (const [etiqueta, texto] of CASOS) {
  const matrix = encodeQr(texto);
  eq(decodeQrText(matrix), texto, `${etiqueta}: el texto no vuelve igual`);
  eq(readQrRaw(matrix).ecLevelBits, 0b00, `${etiqueta}: el nivel de corrección debería ser M`);
  verificaEstructura(matrix);
  verificaSindromes(matrix, etiqueta);
}

// Los acentos y la eñe tienen que viajar como UTF-8 multibyte, no como latin-1.
const conEnie = encodeQr("ñ");
eq(readQrRaw(conEnie).dataCodewords.slice(0, 4), [0x40, 0x2c, 0x3b, 0x10], "«ñ» en UTF-8 (C3 B1)");

/**
 * Una cadena larga que fuerza versión >= 7, que es donde aparecen el bloque de
 * información de versión y el entrelazado de varios bloques. Sin este caso, ni
 * la BCH(18,6) ni el desentrelazado se ejercitarían nunca.
 */
const textoLargo = `Memoria de cálculo — ${"cimentación y losa de azotea; ".repeat(12)}`;
const largo = encodeQr(textoLargo);
ok(largo.version >= 7, `la cadena larga debería forzar versión >= 7, dio ${largo.version}`);
ok(blockLayout(largo.version).blocks > 1, "la cadena larga debería forzar varios bloques");
eq(decodeQrText(largo), textoLargo, "la cadena larga no vuelve igual");
verificaEstructura(largo);
verificaSindromes(largo, "cadena larga");

/**
 * BARRIDO DE TODAS LAS VERSIONES. Se genera un texto de EXACTAMENTE la
 * capacidad de cada versión: obliga al selector a elegir esa versión y llena la
 * matriz hasta el último codeword, que es donde el entrelazado con bloques
 * cortos y largos se rompe si el reparto está mal. Cubre las 40 filas de la
 * tabla, no sólo las que casualmente use el producto.
 */
for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
  const texto = "abcdefghij0123456789"
    .repeat(Math.ceil(byteCapacity(version) / 20))
    .slice(0, byteCapacity(version));
  const matrix = encodeQr(texto);
  eq(
    matrix.version,
    version,
    `un texto de ${texto.length} bytes debería caber justo en la versión ${version}`,
  );
  eq(decodeQrText(matrix), texto, `la versión ${version} no devuelve el texto`);
  const raw = readQrRaw(matrix);
  const layout = blockLayout(version);
  const codewordsCorrectos = raw.blocks.every((block) =>
    sindromes([...block.data, ...block.ec], layout.ecPerBlock).every((s) => s === 0),
  );
  ok(codewordsCorrectos, `la versión ${version} tiene bloques con síndromes no nulos`);
}
comprobaciones += 1;

// Un byte más de la cuenta ya no cabe en esa versión: sube a la siguiente.
const justo = "x".repeat(byteCapacity(3));
eq(encodeQr(justo).version, 3, "el texto de capacidad exacta cabe en la versión 3");
eq(encodeQr(`${justo}x`).version, 4, "un byte más obliga a subir de versión");

// ── Vector conocido derivado a mano: los codewords de datos de "A" ─────────
/**
 * Modo byte (0100) + cuenta 1 (00000001) + 'A' (01000001) + terminador (0000)
 * son 24 bits exactos = 0x40 0x14 0x10, y el resto se rellena con 0xEC/0x11
 * alternados hasta los 16 codewords de datos de la versión 1-M. Este vector se
 * deriva del estándar, no del codificador, y es lo que fija que la cuenta de
 * caracteres se escriba ANTES de los datos y con el ancho correcto.
 */
const esperadoA = [
  0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec,
];
eq(
  [...readQrRaw(encodeQr("A")).dataCodewords],
  esperadoA,
  "los codewords de datos de «A» no cuadran",
);

// ═══════════════════════════════════════════════════════════════════════════
// ELECCIÓN DE MÁSCARA
// ═══════════════════════════════════════════════════════════════════════════

for (const [etiqueta, texto] of CASOS) {
  const penalties = maskPenalties(texto);
  eq(penalties.length, 8, `${etiqueta}: deberían evaluarse las ocho máscaras`);
  const minima = Math.min(...penalties);
  const elegida = penalties.indexOf(minima);
  eq(
    readQrRaw(encodeQr(texto)).maskId,
    elegida,
    `${etiqueta}: la máscara escrita en el formato no es la de menor penalización`,
  );
  // Si las ocho puntuaran igual, elegir la mejor no significaría nada.
  ok(new Set(penalties).size > 1, `${etiqueta}: las ocho máscaras no pueden puntuar igual`);
}

/**
 * LAS OCHO MÁSCARAS, DE PUNTA A PUNTA. La selección por penalización elige casi
 * siempre las mismas: en trescientos `otpauth://` distintos no sale ni una vez
 * la máscara 7. Imponerla es la única forma de que escribir y leer las ocho sea
 * una prueba y no una casualidad.
 */
for (let maskId = 0; maskId < 8; maskId += 1) {
  for (const [etiqueta, texto] of CASOS) {
    const matrix = encodeQrWithMask(texto, maskId);
    const raw = readQrRaw(matrix);
    eq(raw.maskId, maskId, `${etiqueta}: el formato debería anunciar la máscara ${maskId}`);
    eq(decodeQrText(matrix), texto, `${etiqueta}: no vuelve con la máscara ${maskId}`);
  }
  // La estructura tampoco puede depender de la máscara: los patrones de
  // función quedan intactos con las ocho.
  verificaEstructura(encodeQrWithMask(textoLargo, maskId));
}
lanza(() => encodeQrWithMask("A", 8), /fuera del rango 0-7/, "máscara impuesta inexistente");

// Y la matriz elegida por `encodeQr` es exactamente la de su máscara impuesta:
// la selección no toca nada más que la elección.
for (const [etiqueta, texto] of CASOS) {
  const elegida = encodeQr(texto);
  eq(
    elegida.modules,
    encodeQrWithMask(texto, readQrRaw(elegida).maskId).modules,
    `${etiqueta}: la matriz elegida no coincide con la de su propia máscara`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISMO Y ERRORES
// ═══════════════════════════════════════════════════════════════════════════

const uno = encodeQr("otpauth://totp/Valle?secret=ABC");
const dos = encodeQr("otpauth://totp/Valle?secret=ABC");
eq(uno.modules, dos.modules, "la misma entrada debe dar exactamente la misma matriz");
eq(uno.version, dos.version, "la misma entrada debe dar la misma versión");
ok(
  JSON.stringify(encodeQr("otpauth://totp/Valle?secret=ABD").modules) !==
    JSON.stringify(uno.modules),
  "un secreto distinto no puede dar la misma matriz",
);

// `minVersion` se respeta hacia arriba, nunca hacia abajo.
eq(encodeQr("A", { minVersion: 5 }).version, 5, "minVersion debe forzar el tamaño");
eq(decodeQrText(encodeQr("A", { minVersion: 5 })), "A", "minVersion no debe romper la lectura");
eq(encodeQr("A", { minVersion: 1 }).version, 1, "sin presión, la versión mínima que quepa");

// Lo que no cabe falla con un mensaje que dice qué hacer, no con una matriz rota.
lanza(
  () => encodeQr("x".repeat(byteCapacity(QR_MAX_VERSION) + 1)),
  /no cabe en un código QR de nivel M/,
  "un texto por encima de la versión 40 debe lanzar",
);
lanza(() => encodeQr("A", { minVersion: 0 }), /Versión de QR inválida/, "minVersion 0");
lanza(() => encodeQr("A", { minVersion: 41 }), /Versión de QR inválida/, "minVersion 41");
// El caso extremo del mínimo forzado: la versión 40 con un solo carácter, que
// es la matriz más grande con el relleno más largo posible.
const enormeVacia = encodeQr("A", { minVersion: QR_MAX_VERSION });
eq(enormeVacia.version, QR_MAX_VERSION, "minVersion 40 debe dar la versión 40");
eq(decodeQrText(enormeVacia), "A", "la versión 40 con un carácter debe leerse igual");
verificaEstructura(enormeVacia);
verificaSindromes(enormeVacia, "versión 40 con un carácter");

console.log(
  `qr: ${comprobaciones} comprobaciones verdes — GF(256) contra aritmética independiente, ` +
    `síndromes nulos en todos los bloques leídos de la matriz (y no nulos al corromperlos), ` +
    `ida y vuelta con acentos y otpauth, barrido de las 40 versiones, ` +
    `formato/versión/alineación/capacidades contra los vectores publicados, ` +
    `penalización derivada a mano y máscara de mínimo verificada.`,
);
