import { strict as assert } from "node:assert";
import {
  alignmentPatternPositions,
  blockLayout,
  byteCapacity,
  characterCountBits,
  formatInfoBits,
  gfMul,
  maskBit,
  penaltyScore,
  QR_MAX_VERSION,
  reedSolomonGenerator,
  totalCodewords,
  versionInfoBits,
  versionSize,
} from "./qr-encode";
import { alfa, contador, evalPoly, gfMulLibre } from "./qr-oracle";

/**
 * PRIMERA MITAD: EL CAMPO, LAS TABLAS Y LAS MÁSCARAS.
 *
 * Todo lo que se puede contrastar contra un número PUBLICADO sin necesidad de
 * dibujar una matriz: la aritmética de GF(256) contra una implementación
 * independiente, el polinomio generador de Reed-Solomon, las cadenas de
 * información de formato y de versión, los centros de alineación de las 40
 * versiones, el reparto en bloques del nivel M y las ocho máscaras con su
 * penalización.
 *
 * La otra mitad —estructura, recorrido, ida y vuelta y barridos— está en
 * `qr-roundtrip.spec.ts`. Se partieron porque el gate del monolito corta en 800
 * líneas y la suite única llegó a 845; el corte está donde la prueba deja de
 * mirar números y empieza a mirar matrices.
 */
const cuenta = contador();
const { eq, ok, lanza } = cuenta;

/**
 * Algunas comprobaciones se hacen en bucle con `assert` directo —comparar las
 * 65 536 parejas del campo una a una con el ayudante contaría 65 536 veces y el
 * resumen dejaría de significar nada—, así que su aportación se suma a mano.
 */
let comprobadas = 0;

// ── El campo es el que dice el estándar ─────────────────────────────────────
// α^7 · α = α^8 = x^8, que módulo x^8+x^4+x^3+x^2+1 vale x^4+x^3+x^2+1 = 0x1D.
eq(gfMulLibre(0x80, 2), 0x1d, "la reducción por 0x11D define el campo");
eq(
  gfMul(0x80, 2),
  0x1d,
  "el codificador reduce con el mismo polinomio primitivo",
);

// Los dos productos coinciden en las 65 536 parejas. Si el codificador tuviera
// mal una tabla, no habría dónde esconderse.
let discrepancias = 0;
for (let a = 0; a < 256; a += 1) {
  for (let b = 0; b < 256; b += 1)
    if (gfMul(a, b) !== gfMulLibre(a, b)) discrepancias += 1;
}
eq(
  discrepancias,
  0,
  "gfMul del codificador difiere del producto independiente",
);

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
ok(
  gradosUsados.size >= 7,
  "la tabla del nivel M debería usar varios grados distintos",
);
for (const grado of gradosUsados) {
  const generator = reedSolomonGenerator(grado);
  eq(
    generator.length,
    grado + 1,
    `el generador de grado ${grado} debe tener grado+1 coeficientes`,
  );
  eq(generator[0], 1, `el generador de grado ${grado} debe ser mónico`);
  for (let i = 0; i < grado; i += 1) {
    eq(
      evalPoly(generator, alfa(i)),
      0,
      `α^${i} debería ser raíz del generador de grado ${grado}`,
    );
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

/**
 * LAS CUARENTA FILAS DE LA TABLA E.1, no una muestra.
 *
 * Aquí no basta con comprobar seis versiones sueltas, y la razón es la misma
 * que en la tabla de bloques: el lector independiente IMPORTA esta función del
 * codificador —los centros son una tabla publicada, y duplicarla a mano sólo
 * añadiría una segunda errata posible—, así que un centro equivocado desplaza
 * por igual los patrones que dibuja el codificador y los módulos que salta el
 * lector. La ida y vuelta vuelve en verde, los síndromes salen nulos, y la
 * matriz es ilegible para cualquier lector real.
 *
 * Se comprobó, y no es una hipótesis: forzar los centros de la versión 15 a
 * [6, 28, 48, 70] en vez de [6, 26, 48, 70] dejaba TODA esta suite en verde
 * mientras 288 módulos de esa matriz diferían de los de una implementación
 * ajena. Sólo la tabla entera cierra el agujero, porque el reparto uniforme
 * acierta en la mayoría de las filas y falla en unas pocas —la 32 es la
 * excepción que el estándar documenta, pero cualquier otra fila mal derivada
 * sería igual de silenciosa—.
 */
const ALINEACION_E1: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];
for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
  const centros = alignmentPatternPositions(version);
  eq(
    centros,
    [...ALINEACION_E1[version - 1]],
    `alineación de la versión ${version} fuera de tabla`,
  );
  // Invariantes que ata el dibujo del estándar: el primer centro siempre en 6,
  // el último a siete módulos del borde, y todos en coordenada PAR salvo el 6
  // —si uno cayera impar, el patrón partiría la línea de temporización—.
  if (version === 1) continue;
  eq(centros[0], 6, `el primer centro de la versión ${version} debe ser 6`);
  eq(
    centros[centros.length - 1],
    versionSize(version) - 7,
    `el último centro de la versión ${version} debe estar a siete del borde`,
  );
  ok(
    centros.every((c) => c % 2 === 0),
    `la versión ${version} tiene un centro de alineación en coordenada impar`,
  );
  eq(
    centros.length,
    Math.floor(version / 7) + 2,
    `número de centros de la versión ${version}`,
  );
}

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
  eq(
    layout.shortDataLength,
    datosCortos,
    `datos por bloque corto de la versión ${version}`,
  );
  eq(
    layout.blocks - layout.shortBlocks,
    largos,
    `bloques largos de la versión ${version}`,
  );
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
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28,
];
const BLOQUES_TOTALES_M: readonly number[] = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18,
  20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
/** Columna «codewords de datos, nivel M» de la tabla 9 del estándar. */
const DATOS_M: readonly number[] = [
  16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453,
  507, 563, 627, 669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373,
  1455, 1541, 1631, 1725, 1812, 1914, 1992, 2102, 2216, 2334,
];
for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
  const layout = blockLayout(version);
  const ec = EC_POR_BLOQUE_M[version - 1];
  const bloques = BLOQUES_TOTALES_M[version - 1];
  eq(
    layout.ecPerBlock,
    ec,
    `EC por bloque de la versión ${version} fuera de tabla`,
  );
  eq(
    layout.blocks,
    bloques,
    `número de bloques de la versión ${version} fuera de tabla`,
  );
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
  return Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(dark),
  );
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
eq(
  penaltyScore(matriz(21, false)),
  2098,
  "penalización de la matriz 21x21 clara",
);
eq(
  penaltyScore(matriz(21, true)),
  2098,
  "penalización de la matriz 21x21 oscura",
);

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
const PATRON_LOCALIZADOR = [
  false,
  false,
  false,
  false,
  true,
  false,
  true,
  true,
  true,
  false,
  true,
];
const conPatronEnFila = matriz(11);
for (let col = 0; col < 11; col += 1)
  conPatronEnFila[0][col] = PATRON_LOCALIZADOR[col];
eq(penaltyScore(matriz(11)), 598, "penalización de la matriz 11x11 clara");
eq(
  penaltyScore(conPatronEnFila),
  593,
  "penalización con un patrón de localizador en fila",
);

// La regla 3 mira filas Y columnas: la transpuesta debe puntuar igual.
const conPatronEnColumna = matriz(11);
for (let row = 0; row < 11; row += 1)
  conPatronEnColumna[row][0] = PATRON_LOCALIZADOR[row];
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
    assert.equal(
      maskBit(0, row, col),
      (row + col) % 2 === 0,
      "máscara 0: damero",
    );
    assert.equal(
      maskBit(1, row, col),
      row % 2 === 0,
      "máscara 1: filas alternas",
    );
    assert.equal(
      maskBit(2, row, col),
      col % 3 === 0,
      "máscara 2: columnas de tres en tres",
    );
    assert.equal(
      maskBit(3, row, col),
      (row + col) % 3 === 0,
      "máscara 3: diagonales",
    );
    assert.equal(
      maskBit(4, row, col),
      (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
      "máscara 4: bloques de 2 filas por 3 columnas",
    );
    assert.equal(
      maskBit(5, row, col),
      producto % 2 === 0 && producto % 3 === 0,
      "máscara 5",
    );
    assert.equal(
      maskBit(6, row, col),
      ((producto % 2) + (producto % 3)) % 2 === 0,
      "máscara 6",
    );
    assert.equal(
      maskBit(7, row, col),
      (((row + col) % 2) + (producto % 3)) % 2 === 0,
      "máscara 7",
    );
  }
}
comprobadas += 8;
// La 1 es horizontal y la 2 vertical: no pueden confundirse entre sí.
ok(
  maskBit(1, 0, 1) && !maskBit(2, 0, 1),
  "las máscaras 1 y 2 están intercambiadas",
);
lanza(() => maskBit(8, 0, 0), /fuera del rango 0-7/, "máscara inexistente");

// ═══════════════════════════════════════════════════════════════════════════
// INVARIANTES DE ESTRUCTURA
// ═══════════════════════════════════════════════════════════════════════════

console.log(
  `qr-encode: ${cuenta.total() + comprobadas} comprobaciones verdes — GF(256) contra ` +
    `aritmética independiente en las 65 536 parejas del campo, generador de Reed-Solomon, ` +
    `formato y versión BCH, centros de alineación de las 40 versiones, reparto en bloques ` +
    `del nivel M y las ocho máscaras con su penalización derivada a mano.`,
);
