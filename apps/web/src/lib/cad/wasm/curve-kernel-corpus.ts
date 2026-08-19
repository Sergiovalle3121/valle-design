/**
 * Corpus de curvas y comparador de paridad para el kernel de teselado.
 *
 * ## Por qué el corpus vive aquí y no dentro del script de evidencia
 *
 * Porque lo usan tres consumidores —el spec de paridad, el spec de fallback y
 * la sonda que genera `docs/cad/evidence/wasm-parity.json`— y si cada uno se
 * fabricase el suyo estarían midiendo cosas distintas mientras publican el
 * mismo número. El corpus es DETERMINISTA: mismo `seed`, mismos `f64`, en
 * cualquier máquina. Sin eso, «la tolerancia es 1 ULP» sería una frase sobre la
 * corrida de aquel día.
 *
 * ## Qué se mete en el corpus y por qué
 *
 * No curvas bonitas. Un plano importado trae arcos con barrido negativo, arcos
 * que declaran más de una vuelta, radios de micras y radios de kilómetros,
 * elipses casi degeneradas y splines de grado mayor que sus puntos de control.
 * Cada una de esas familias entra a propósito, porque la divergencia numérica
 * entre dos motores no aparece en el caso fácil: aparece en el cancelativo, en
 * el que satura el exponente y en el que toca una rama distinta del código.
 *
 * ## Cómo se compara
 *
 * En ULP, no sólo en milímetros. Dos coordenadas que difieren en 1e-9 mm son
 * indistinguibles sobre papel, cierto, pero el ULP dice si la diferencia es
 * ruido de la última cifra de un `f64` —lo esperable entre dos libm— o un error
 * algorítmico que en otro punto del dominio será enorme. Un umbral sólo en
 * milímetros dejaría pasar un fallo que se manifiesta lejos del origen.
 */

/** Semilla del corpus publicado. Cambiarla invalida la tolerancia publicada. */
export const CAD_KERNEL_CORPUS_SEED = 0x5adc0de;

/** Épsilon de la máquina para `f64`: el valor de 1 ULP relativo. */
export const F64_EPSILON = 2 ** -52;

/**
 * Tolerancia de paridad PUBLICADA. La cumplen a la vez el spec y el artefacto.
 *
 * ## De dónde sale cada número
 *
 * `maxScaledDelta` — medido: 2,98·10⁻¹⁶, o sea 1,34 ULP de la magnitud sobre la
 * que se hace la cuenta. Se publica 4 ULP: tres veces el peor caso medido, que
 * es margen para que un cambio de versión de `rustc` o de V8 mueva la última
 * cifra de `sin`/`cos` sin poner el gate rojo, y sigue siendo lo bastante
 * estrecho para que un error ALGORÍTMICO —una fórmula reordenada, un índice
 * corrido— no quepa dentro. Un error algorítmico se sale de esto por órdenes de
 * magnitud, no por un factor de tres.
 *
 * `splineMaxUlp = 0` — no es una tolerancia, es una exigencia. De Boor sólo
 * suma, resta, multiplica y divide, y esas cuatro son exactas en IEEE-754 dada
 * la misma secuencia de operaciones. Si un día la spline dejara de coincidir
 * BIT A BIT, el que ha cambiado es el orden de las operaciones y eso es un
 * defecto, no ruido de la libm.
 *
 * `shapeMismatches = 0` — dos motores que devuelven distinto número de puntos
 * para la misma curva han tomado ramas distintas. No hay tolerancia posible.
 *
 * ## Qué significa en el papel
 *
 * Sobre un plano de 100 m acotado en milímetros (10⁵ unidades), 4 ULP de escala
 * son 4·10⁻¹¹ mm. La fidelidad de trazado ya publicada por el repositorio
 * trabaja con una tolerancia de 10⁻³ mm y la justifica diciendo que es dos
 * órdenes por debajo de lo que distingue un escalímetro. Esto está OCHO órdenes
 * por debajo de aquélla.
 */
export const CAD_KERNEL_PARITY_TOLERANCE = {
  /** Desviación relativa a la escala de la curva, adimensional. */
  maxScaledDelta: 4 * F64_EPSILON,
  /** La misma cifra dicha en ULP de la escala, que es como se lee. */
  maxScaledDeltaUlp: 4,
  /** La spline no negocia: igualdad bit a bit. */
  splineMaxUlp: 0,
  /** Distinto número de puntos = ramas distintas. Cero, siempre. */
  maxShapeMismatches: 0,
} as const;

/**
 * PRNG explícito (mulberry32). NO se usa `Math.random`: la paridad tiene que
 * poder reproducirse dentro de un año con el mismo comando.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CadKernelCorpus {
  /** `f64[count * 5]`: cx, cy, r, inicio°, fin°. */
  arcs: Float64Array;
  arcCount: number;
  /** `f64[count * 7]`: cx, cy, mx, my, razón, inicio°, fin°. */
  ellipses: Float64Array;
  ellipseCount: number;
  /** Splines con longitud de control variable. */
  splines: {
    control: Float64Array;
    degree: number;
    knots: Float64Array | null;
    label: string;
  }[];
  /** Familias representadas, para que la evidencia diga QUÉ se probó. */
  families: string[];
}

/**
 * Casos límite fijos, escritos a mano, que van SIEMPRE los primeros.
 *
 * El PRNG cubre el dominio; estos cubren las esquinas. Si un día el generador
 * cambia, estas filas siguen ahí y la comparación sigue tocando las mismas
 * ramas del código.
 */
const ARC_EDGE_CASES: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 1, 0, 360], // vuelta completa
  [0, 0, 1, 0, 0], // barrido nulo → se normaliza a 360
  [0, 0, 1, 350, 10], // cruza el origen de ángulos
  [0, 0, 1, 90, 45], // barrido negativo
  [0, 0, 1, 0, 720], // dos vueltas declaradas: MÁS puntos que `steps`
  [0, 0, 1e-6, 0, 90], // radio de micra
  [0, 0, 1e7, 0, 90], // radio de decenas de kilómetros
  [1e6, -1e6, 25, 30, 300], // lejos del origen: cancelación al sumar el centro
  [0, 0, 0, 0, 90], // radio cero: cero puntos, no excepción
  [0, 0, -5, 0, 90], // radio negativo: ídem
];

const ELLIPSE_EDGE_CASES: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
])[] = [
  [0, 0, 10, 0, 1, 0, 360], // círculo por la vía de la elipse
  [0, 0, 10, 0, 0.02, 0, 360], // casi un segmento
  [0, 0, 0, 10, 0.5, 0, 360], // eje mayor vertical
  [0, 0, 7.07, 7.07, 0.5, 45, 315], // rotada 45°, arco de elipse
  [-1e5, 1e5, 250, -120, 0.33, 200, 120], // lejos, rotada y con barrido negativo
  [0, 0, 0, 0, 0.5, 0, 360], // eje mayor nulo: cero puntos
  [0, 0, 10, 0, 0, 0, 360], // razón nula: cero puntos
];

/**
 * Construye el corpus.
 *
 * `arcCount` y `ellipseCount` son el TOTAL, casos límite incluidos: así el
 * número que se publica («paridad comprobada sobre N arcos») no tiene que
 * explicar dos sumandos.
 */
export function buildCadKernelCorpus(
  arcCount = 20_000,
  ellipseCount = 5_000,
  seed = CAD_KERNEL_CORPUS_SEED,
): CadKernelCorpus {
  const random = mulberry32(seed);
  const arcs = new Float64Array(arcCount * 5);
  for (let index = 0; index < Math.min(ARC_EDGE_CASES.length, arcCount); index += 1)
    arcs.set(ARC_EDGE_CASES[index], index * 5);
  for (let index = ARC_EDGE_CASES.length; index < arcCount; index += 1) {
    const base = index * 5;
    // Escalas repartidas por décadas: un corpus todo del mismo orden de
    // magnitud no ejercita el exponente, y el exponente es donde dos libm
    // pueden separarse de verdad.
    const decade = 10 ** (Math.floor(random() * 8) - 3);
    arcs[base] = (random() - 0.5) * 200_000;
    arcs[base + 1] = (random() - 0.5) * 200_000;
    arcs[base + 2] = decade * (0.1 + random() * 9.9);
    arcs[base + 3] = (random() - 0.5) * 900;
    arcs[base + 4] = arcs[base + 3] + (random() - 0.25) * 700;
  }

  const ellipses = new Float64Array(ellipseCount * 7);
  for (let index = 0; index < Math.min(ELLIPSE_EDGE_CASES.length, ellipseCount); index += 1)
    ellipses.set(ELLIPSE_EDGE_CASES[index], index * 7);
  for (let index = ELLIPSE_EDGE_CASES.length; index < ellipseCount; index += 1) {
    const base = index * 7;
    const decade = 10 ** (Math.floor(random() * 6) - 2);
    const rotation = random() * Math.PI * 2;
    const major = decade * (0.5 + random() * 9.5);
    ellipses[base] = (random() - 0.5) * 100_000;
    ellipses[base + 1] = (random() - 0.5) * 100_000;
    ellipses[base + 2] = Math.cos(rotation) * major;
    ellipses[base + 3] = Math.sin(rotation) * major;
    ellipses[base + 4] = 0.01 + random() * 0.99;
    ellipses[base + 5] = (random() - 0.5) * 720;
    ellipses[base + 6] = ellipses[base + 5] + (random() - 0.25) * 500;
  }

  const splines: CadKernelCorpus["splines"] = [];
  // Grados 1..5 y longitudes de control 2..12: cubre el caso «grado mayor que
  // los puntos de control», que el teselador recorta, y el caso de nudos
  // externos con longitud correcta, que es la rama que NO los sintetiza.
  for (let degree = 1; degree <= 5; degree += 1) {
    for (let controls = 2; controls <= 12; controls += 1) {
      const control = new Float64Array(controls * 2);
      for (let point = 0; point < controls; point += 1) {
        control[point * 2] = (random() - 0.5) * 50_000;
        control[point * 2 + 1] = (random() - 0.5) * 50_000;
      }
      splines.push({ control, degree, knots: null, label: `g${degree}-c${controls}-clamped` });
      // Nudos no uniformes con la longitud exacta: fuerza la rama que los
      // acepta tal cual, donde De Boor divide por diferencias pequeñas.
      const effective = Math.max(1, Math.min(degree, controls - 1));
      const knotCount = controls + effective + 1;
      const knots = new Float64Array(knotCount);
      let accumulated = 0;
      for (let index = 0; index < knotCount; index += 1) {
        accumulated += index <= effective || index >= knotCount - effective - 1 ? 0 : random();
        knots[index] = accumulated;
      }
      const span = knots[knotCount - 1] || 1;
      for (let index = 0; index < knotCount; index += 1) knots[index] /= span;
      splines.push({ control, degree, knots, label: `g${degree}-c${controls}-nudos` });
    }
  }

  return {
    arcs,
    arcCount,
    ellipses,
    ellipseCount,
    splines,
    families: [
      "arcos: vuelta completa, barrido nulo, cruce del origen, barrido negativo, dos vueltas, radio de micra, radio de decenas de km, centro a 10^6, radio cero y radio negativo",
      "elipses: círculo, casi degenerada, eje vertical, rotada 45°, lejana con barrido negativo, eje nulo y razón nula",
      "splines: grados 1–5 × 2–12 puntos de control, con nudos clamped sintetizados y con nudos no uniformes externos",
    ],
  };
}

// ---------------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------------

const ULP_VIEW = new Float64Array(1);
const ULP_WORDS = new Uint32Array(ULP_VIEW.buffer);
/**
 * Índice de la palabra ALTA del `f64`, deducido y no supuesto.
 *
 * `1.0` es `0x3FF0000000000000`: la palabra que sale distinta de cero es la
 * alta. Se detecta en vez de dar por hecho el orden del x86 porque un `f64`
 * mal partido no falla ruidosamente — devuelve distancias absurdas y la
 * tolerancia publicada dejaría de significar nada.
 */
const ULP_HIGH = (() => {
  ULP_VIEW[0] = 1;
  return ULP_WORDS[0] === 0 ? 1 : 0;
})();
const ULP_LOW = 1 - ULP_HIGH;

/**
 * Distancia en ULP entre dos `f64`.
 *
 * ## Por qué a mano y no con `BigInt`
 *
 * La forma corta sería leer los 64 bits como `BigInt64Array` y restar. El
 * objetivo de compilación del web es anterior a ES2020 y los literales
 * `BigInt` no existen ahí, así que la resta se hace con las dos mitades de 32
 * bits. No es sólo un rodeo por el compilador: restar las mitades es EXACTO
 * mientras la diferencia quepa en 2^53, mientras que convertir a `Number` un
 * entero de 64 bits pierde las cifras bajas justo en el rango donde se miden
 * cientos de ULP.
 *
 * ## Por qué el cero se trata aparte
 *
 * `+0` y `-0` tienen signos distintos y magnitud nula. Sin el atajo de
 * igualdad de la primera línea saldrían separados por medio dominio, y un cero
 * con el signo cambiado arruinaría el peor caso publicado sin que nadie tenga
 * un problema real.
 */
export function ulpDistance(a: number, b: number): number {
  if (a === b) return 0;
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  ULP_VIEW[0] = a;
  const leftHigh = ULP_WORDS[ULP_HIGH];
  const leftLow = ULP_WORDS[ULP_LOW];
  ULP_VIEW[0] = b;
  const rightHigh = ULP_WORDS[ULP_HIGH];
  const rightLow = ULP_WORDS[ULP_LOW];
  const leftNegative = (leftHigh & 0x80000000) !== 0;
  const rightNegative = (rightHigh & 0x80000000) !== 0;
  const leftMagnitudeHigh = leftHigh & 0x7fffffff;
  const rightMagnitudeHigh = rightHigh & 0x7fffffff;
  if (leftNegative === rightNegative)
    return Math.abs((leftMagnitudeHigh - rightMagnitudeHigh) * 4294967296 + (leftLow - rightLow));
  // Signos distintos: la distancia pasa por el cero, así que es la suma de las
  // dos magnitudes contadas desde él.
  return (
    leftMagnitudeHigh * 4294967296 + leftLow + (rightMagnitudeHigh * 4294967296 + rightLow)
  );
}

export interface CadKernelParityReport {
  family: string;
  /** Valores `f64` comparados. Cero significaría que no se comparó nada. */
  comparedValues: number;
  /** Curvas comparadas. */
  comparedCurves: number;
  /** Coordenadas idénticas bit a bit. */
  identicalValues: number;
  maxAbsoluteDelta: number;
  maxUlpDelta: number;
  /**
   * Peor desviación RELATIVA A LA ESCALA DE LA CURVA, adimensional.
   *
   * Es la cifra que de verdad describe el kernel, y hace falta porque el ULP
   * del resultado engaña por cancelación: `cx + r·cos θ` con un centro de
   * 50.000 y un radio de 50.000 puede dar 122, y entonces un error de una
   * última cifra del SUMANDO —inevitable, viene de que dos libm no dan el
   * mismo `cos`— aparece como cientos de ULP del RESULTADO. Dividir por
   * `máx(|cx|,|cy|) + r` devuelve la magnitud sobre la que se hizo la cuenta y
   * la cifra vuelve a ser del orden del epsilon de la máquina.
   */
  maxScaledDelta: number;
  /** Dónde ocurrió el peor ULP: índice de curva y de coordenada. */
  worstAt: { curve: number; value: number; js: number; wasm: number } | null;
  /** Discrepancias de FORMA: distinto número de puntos. Deben ser cero. */
  shapeMismatches: number;
}

function emptyReport(family: string): CadKernelParityReport {
  return {
    family,
    comparedValues: 0,
    comparedCurves: 0,
    identicalValues: 0,
    maxAbsoluteDelta: 0,
    maxUlpDelta: 0,
    maxScaledDelta: 0,
    worstAt: null,
    shapeMismatches: 0,
  };
}

/**
 * Escala de una curva del lote: la magnitud mayor que entra en la suma final.
 *
 * Para `cx + r·cos θ` la magnitud que domina el error es `|cx| + r`, no el
 * resultado. Se toma el máximo de los dos ejes para tener UN número por curva,
 * y nunca menos de 1 para que una curva unitaria en el origen no convierta la
 * división en un cociente enorme.
 */
function curveScale(input: Float64Array | null, curve: number, stride: number): number {
  if (!input) return 1;
  const base = curve * stride;
  const centerX = Math.abs(input[base]);
  const centerY = Math.abs(input[base + 1]);
  // Arco: el radio está en +2. Elipse: el semieje mayor son las componentes
  // +2/+3, y el menor no puede superarlo salvo con razón > 1, que también se
  // contempla multiplicando por la razón cuando ésta es mayor que uno.
  const extent =
    stride === 5
      ? Math.abs(input[base + 2])
      : Math.hypot(input[base + 2], input[base + 3]) * Math.max(1, input[base + 4]);
  const scale = Math.max(centerX, centerY) + extent;
  return Number.isFinite(scale) && scale > 1 ? scale : 1;
}

/**
 * Compara dos salidas planas del mismo lote.
 *
 * Una diferencia de FORMA —distinto número de puntos en una curva— no es una
 * tolerancia que negociar: significa que los dos motores tomaron ramas
 * distintas, y a partir de ahí las coordenadas ya no están alineadas. Se cuenta
 * aparte y se corta la comparación de esa curva.
 */
export function compareCadKernelBatch(
  family: string,
  jsCounts: Uint32Array,
  jsPoints: Float64Array,
  wasmCounts: Uint32Array,
  wasmPoints: Float64Array,
  /** Entrada del lote y su paso, para poder normalizar por escala de curva. */
  input: Float64Array | null = null,
  stride = 0,
): CadKernelParityReport {
  const report = emptyReport(family);
  const curves = Math.min(jsCounts.length, wasmCounts.length);
  let jsCursor = 0;
  let wasmCursor = 0;
  for (let curve = 0; curve < curves; curve += 1) {
    const jsPointCount = jsCounts[curve];
    const wasmPointCount = wasmCounts[curve];
    if (jsPointCount !== wasmPointCount) {
      report.shapeMismatches += 1;
      jsCursor += jsPointCount * 2;
      wasmCursor += wasmPointCount * 2;
      continue;
    }
    report.comparedCurves += 1;
    const scale = input ? curveScale(input, curve, stride) : 1;
    for (let value = 0; value < jsPointCount * 2; value += 1) {
      const js = jsPoints[jsCursor + value];
      const wasm = wasmPoints[wasmCursor + value];
      report.comparedValues += 1;
      if (Object.is(js, wasm)) {
        report.identicalValues += 1;
        continue;
      }
      const absolute = Math.abs(js - wasm);
      if (absolute > report.maxAbsoluteDelta) report.maxAbsoluteDelta = absolute;
      const scaled = absolute / scale;
      if (scaled > report.maxScaledDelta) report.maxScaledDelta = scaled;
      const ulp = ulpDistance(js, wasm);
      if (ulp > report.maxUlpDelta) {
        report.maxUlpDelta = ulp;
        report.worstAt = { curve, value, js, wasm };
      }
    }
    jsCursor += jsPointCount * 2;
    wasmCursor += wasmPointCount * 2;
  }
  return report;
}

/**
 * Compara dos curvas sueltas (la spline no viaja en lote).
 *
 * `scale` se pasa explícito porque una spline no tiene centro ni radio de los
 * que deducirlo: lo aporta el llamador desde sus puntos de control.
 */
export function compareCadKernelCurve(
  family: string,
  js: Float64Array,
  wasm: Float64Array,
  scale = 1,
): CadKernelParityReport {
  const counts = new Uint32Array([js.length / 2]);
  const wasmCounts = new Uint32Array([wasm.length / 2]);
  // Se sintetiza una entrada de un solo "arco" cuyo único cometido es llevar la
  // escala: centro en el origen y extensión igual a `scale`.
  const carrier = new Float64Array([0, 0, scale, 0, 0]);
  return compareCadKernelBatch(family, counts, js, wasmCounts, wasm, carrier, 5);
}

/** Funde varios informes en uno, para publicar el total de una familia. */
export function mergeCadKernelParity(
  family: string,
  reports: readonly CadKernelParityReport[],
): CadKernelParityReport {
  const merged = emptyReport(family);
  for (const report of reports) {
    merged.comparedValues += report.comparedValues;
    merged.comparedCurves += report.comparedCurves;
    merged.identicalValues += report.identicalValues;
    merged.shapeMismatches += report.shapeMismatches;
    if (report.maxAbsoluteDelta > merged.maxAbsoluteDelta)
      merged.maxAbsoluteDelta = report.maxAbsoluteDelta;
    if (report.maxScaledDelta > merged.maxScaledDelta)
      merged.maxScaledDelta = report.maxScaledDelta;
    if (report.maxUlpDelta > merged.maxUlpDelta) {
      merged.maxUlpDelta = report.maxUlpDelta;
      merged.worstAt = report.worstAt;
    }
  }
  return merged;
}
