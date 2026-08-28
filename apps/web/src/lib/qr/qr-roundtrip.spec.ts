import { strict as assert } from "node:assert";
import {
  alignmentPatternPositions,
  blockLayout,
  byteCapacity,
  maskPenalties,
  dataModulePath,
  encodeQr,
  encodeQrWithMask,
  QR_MAX_VERSION,
  remainderBits,
  totalCodewords,
  versionInfoBits,
  versionSize,
  type QrMatrix,
} from "./qr-encode";
import { decodeQrText, functionModuleMap, readQrRaw } from "./qr-decode";
import { alfa, contador, evalPoly } from "./qr-oracle";

/**
 * SEGUNDA MITAD: LA MATRIZ.
 *
 * Aquí se comprueba lo que sólo se ve dibujando: que los patrones de
 * localización, separación, temporización y alineación están donde deben; que
 * el recorrido en zigzag cubre cada módulo de datos una sola vez y salta la
 * columna 6; que los síndromes de Reed-Solomon leídos DE LA MATRIZ son nulos (y
 * no nulos al corromperla); y que el texto vuelve intacto a través de un lector
 * escrito aparte, con acentos, con `otpauth://` y en las 40 versiones.
 *
 * La otra mitad —campo, tablas, vectores y máscaras— está en
 * `qr-encode.spec.ts`.
 */
const cuenta = contador();
const { eq, ok, lanza } = cuenta;

/** Ver la nota del mismo nombre en `qr-encode.spec.ts`. */
let comprobadas = 0;

function verificaEstructura(matrix: QrMatrix): void {
  const { size, modules, version } = matrix;
  eq(
    size,
    4 * version + 17,
    `el lado de la versión ${version} debe ser 4·v+17`,
  );
  eq(
    modules.length,
    size,
    `la matriz de la versión ${version} debe tener ${size} filas`,
  );
  for (const row of modules) {
    if (row.length !== size)
      assert.fail(`fila de longitud ${row.length}, esperada ${size}`);
  }
  comprobadas += 1;

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
        if (modules[row][col])
          assert.fail(`separador oscuro en (${row},${col})`);
      }
    }
  }
  comprobadas += 2;

  // ── Temporización: alterna, empezando y acabando en oscuro ──────────────
  for (let i = 8; i <= size - 9; i += 1) {
    if (modules[6][i] !== (i % 2 === 0))
      assert.fail(`temporización horizontal rota en la columna ${i}`);
    if (modules[i][6] !== (i % 2 === 0))
      assert.fail(`temporización vertical rota en la fila ${i}`);
  }
  comprobadas += 1;

  // ── Módulo oscuro ────────────────────────────────────────────────────────
  ok(
    modules[size - 8][8],
    `el módulo oscuro de la versión ${version} no está oscuro`,
  );

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
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      )
        continue;
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
  comprobadas += 1;
}

// ── El recorrido en zigzag, contra las coordenadas publicadas ──────────────
for (const version of [1, 2, 7, 10, 25, 40]) {
  const path = dataModulePath(version);
  const size = versionSize(version);

  // Cubre exactamente los módulos que no son de función, una vez cada uno.
  const functionMap = functionModuleMap(version);
  let libres = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1)
      if (!functionMap[row][col]) libres += 1;
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
  eq(
    vistos.size,
    path.length,
    `el recorrido de la versión ${version} repite módulos`,
  );
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
  for (let j = 0; j < ecPerBlock; j += 1)
    result.push(evalPoly(codeword, alfa(j)));
  return result;
}

function verificaSindromes(matrix: QrMatrix, etiqueta: string): void {
  const raw = readQrRaw(matrix);
  const layout = blockLayout(raw.version);
  eq(raw.blocks.length, layout.blocks, `${etiqueta}: número de bloques`);
  for (let b = 0; b < raw.blocks.length; b += 1) {
    const block = raw.blocks[b];
    const codeword = [...block.data, ...block.ec];
    eq(
      block.ec.length,
      layout.ecPerBlock,
      `${etiqueta}: longitud del ECC del bloque ${b}`,
    );
    const s = sindromes(codeword, layout.ecPerBlock);
    if (s.some((value) => value !== 0)) {
      assert.fail(
        `${etiqueta}: el bloque ${b} tiene síndromes no nulos [${s.join(", ")}] — el ECC está mal`,
      );
    }
    comprobadas += 1;

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
  [
    "acentos y eñe",
    "Diseño de Zúñiga: ¡plano de cimentación revisado! ¿Órdenes?",
  ],
  [
    "emparejamiento con símbolos",
    "clave: +52 55 1234 5678 — «Peña & Asociados»",
  ],
];

for (const [etiqueta, texto] of CASOS) {
  const matrix = encodeQr(texto);
  eq(decodeQrText(matrix), texto, `${etiqueta}: el texto no vuelve igual`);
  eq(
    readQrRaw(matrix).ecLevelBits,
    0b00,
    `${etiqueta}: el nivel de corrección debería ser M`,
  );
  verificaEstructura(matrix);
  verificaSindromes(matrix, etiqueta);
}

// Los acentos y la eñe tienen que viajar como UTF-8 multibyte, no como latin-1.
const conEnie = encodeQr("ñ");
eq(
  readQrRaw(conEnie).dataCodewords.slice(0, 4),
  [0x40, 0x2c, 0x3b, 0x10],
  "«ñ» en UTF-8 (C3 B1)",
);

/**
 * Una cadena larga que fuerza versión >= 7, que es donde aparecen el bloque de
 * información de versión y el entrelazado de varios bloques. Sin este caso, ni
 * la BCH(18,6) ni el desentrelazado se ejercitarían nunca.
 */
const textoLargo = `Memoria de cálculo — ${"cimentación y losa de azotea; ".repeat(12)}`;
const largo = encodeQr(textoLargo);
ok(
  largo.version >= 7,
  `la cadena larga debería forzar versión >= 7, dio ${largo.version}`,
);
ok(
  blockLayout(largo.version).blocks > 1,
  "la cadena larga debería forzar varios bloques",
);
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
    sindromes([...block.data, ...block.ec], layout.ecPerBlock).every(
      (s) => s === 0,
    ),
  );
  ok(
    codewordsCorrectos,
    `la versión ${version} tiene bloques con síndromes no nulos`,
  );
}
comprobadas += 1;

// Un byte más de la cuenta ya no cabe en esa versión: sube a la siguiente.
const justo = "x".repeat(byteCapacity(3));
eq(
  encodeQr(justo).version,
  3,
  "el texto de capacidad exacta cabe en la versión 3",
);
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
  0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
  0xec, 0x11, 0xec,
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
  ok(
    new Set(penalties).size > 1,
    `${etiqueta}: las ocho máscaras no pueden puntuar igual`,
  );
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
    eq(
      raw.maskId,
      maskId,
      `${etiqueta}: el formato debería anunciar la máscara ${maskId}`,
    );
    eq(
      decodeQrText(matrix),
      texto,
      `${etiqueta}: no vuelve con la máscara ${maskId}`,
    );
  }
  // La estructura tampoco puede depender de la máscara: los patrones de
  // función quedan intactos con las ocho.
  verificaEstructura(encodeQrWithMask(textoLargo, maskId));
}
lanza(
  () => encodeQrWithMask("A", 8),
  /fuera del rango 0-7/,
  "máscara impuesta inexistente",
);

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
eq(
  uno.modules,
  dos.modules,
  "la misma entrada debe dar exactamente la misma matriz",
);
eq(uno.version, dos.version, "la misma entrada debe dar la misma versión");
ok(
  JSON.stringify(encodeQr("otpauth://totp/Valle?secret=ABD").modules) !==
    JSON.stringify(uno.modules),
  "un secreto distinto no puede dar la misma matriz",
);

// `minVersion` se respeta hacia arriba, nunca hacia abajo.
eq(
  encodeQr("A", { minVersion: 5 }).version,
  5,
  "minVersion debe forzar el tamaño",
);
eq(
  decodeQrText(encodeQr("A", { minVersion: 5 })),
  "A",
  "minVersion no debe romper la lectura",
);
eq(
  encodeQr("A", { minVersion: 1 }).version,
  1,
  "sin presión, la versión mínima que quepa",
);

// Lo que no cabe falla con un mensaje que dice qué hacer, no con una matriz rota.
lanza(
  () => encodeQr("x".repeat(byteCapacity(QR_MAX_VERSION) + 1)),
  /no cabe en un código QR de nivel M/,
  "un texto por encima de la versión 40 debe lanzar",
);
lanza(
  () => encodeQr("A", { minVersion: 0 }),
  /Versión de QR inválida/,
  "minVersion 0",
);
lanza(
  () => encodeQr("A", { minVersion: 41 }),
  /Versión de QR inválida/,
  "minVersion 41",
);
// El caso extremo del mínimo forzado: la versión 40 con un solo carácter, que
// es la matriz más grande con el relleno más largo posible.
const enormeVacia = encodeQr("A", { minVersion: QR_MAX_VERSION });
eq(enormeVacia.version, QR_MAX_VERSION, "minVersion 40 debe dar la versión 40");
eq(
  decodeQrText(enormeVacia),
  "A",
  "la versión 40 con un carácter debe leerse igual",
);
verificaEstructura(enormeVacia);
verificaSindromes(enormeVacia, "versión 40 con un carácter");

console.log(
  `qr-roundtrip: ${cuenta.total() + comprobadas} comprobaciones verdes — estructura de la ` +
    `matriz, recorrido en zigzag contra las coordenadas publicadas, síndromes nulos en los ` +
    `bloques leídos DE LA MATRIZ (y no nulos al corromperlos) e ida y vuelta con acentos, ` +
    `otpauth y las 40 versiones.`,
);
