/**
 * Paridad numérica del kernel WASM contra el teselador de JavaScript.
 *
 * ## Por qué esto es un gate y no sólo un artefacto
 *
 * `docs/cad/evidence/wasm-parity.json` publica la medida con su máquina y su
 * dispersión; se genera a mano cuando alguien quiere la cifra. Este spec, en
 * cambio, corre en CADA `npm run test:specs`, y por eso es el que impide que la
 * paridad se rompa sin que nadie se entere. Un kernel que da otro número no es
 * una optimización lenta de detectar: es un plano mal dibujado.
 *
 * ## Qué comprueba, en orden de gravedad
 *
 * 1. Que el binario del árbol es el que dice su manifiesto. Sin esto, todo lo
 *    demás mide un archivo que nadie sabe de dónde salió.
 * 2. Que los DOS motores caen sobre una referencia ANALÍTICA cerrada. Este
 *    punto no estaba y su ausencia costó cara: comparar los motores entre sí
 *    dice si se parecen, nunca cuál tiene razón, y un gate que sólo sabe medir
 *    parecido acepta que los dos se equivoquen de acuerdo.
 * 3. Que la SPLINE coincide bit a bit. No usa trascendentes, así que cualquier
 *    diferencia es un cambio en el orden de las operaciones.
 * 4. Que arcos y elipses caen dentro de la tolerancia publicada, medida
 *    relativa a la escala de la curva.
 * 5. Que ninguna curva cambia de FORMA: mismo número de puntos siempre.
 * 6. Que los errores de la ABI son excepciones TIPADAS y no coordenadas raras.
 *
 * El corpus es más corto que el del artefacto (4.000 arcos frente a 20.000)
 * para caber en el presupuesto del runner de specs. La tolerancia es LA MISMA:
 * si un cambio la rompe, se rompe aquí primero.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CAD_ARC_STRIDE,
  CAD_ELLIPSE_STRIDE,
  CadCurveKernelError,
  createCadCurveKernel,
  createCadCurveKernelJs,
} from "./curve-kernel";
import {
  buildCadKernelCorpus,
  CAD_KERNEL_PARITY_TOLERANCE,
  compareCadKernelBatch,
  compareCadKernelCurve,
  mergeCadKernelParity,
  ulpDistance,
  type CadKernelParityReport,
} from "./curve-kernel-corpus";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/**
 * Localiza un archivo del repositorio desde donde sea que se haya lanzado.
 *
 * El runner de specs pone el cwd en `apps/web`, pero un desarrollador lo lanza
 * desde la raíz. Se prueban los dos en vez de suponer uno: un spec que sólo
 * funciona desde un directorio se convierte en un spec que la gente se salta.
 */
function locate(relative: string): string | null {
  for (const base of [process.cwd(), path.resolve(process.cwd(), "..", "..")]) {
    const candidate = path.resolve(base, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const STEPS = [24, 96] as const;

/**
 * Bézier cúbica en forma de Bernstein: la referencia ANALÍTICA de la spline.
 *
 * Una B-spline de grado 3 con cuatro puntos de control y nudos clamped ES la
 * Bézier cúbica de esos mismos puntos. No es una segunda implementación de De
 * Boor con la que compararse —eso volvería a medir un parecido— sino la forma
 * cerrada del mismo objeto por otro camino: pesos de Bernstein en vez de
 * subdivisión repetida. Por eso puede arbitrar cuando los dos motores
 * discrepan.
 */
function bernsteinCubic(control: Float64Array, t: number): [number, number] {
  const m = 1 - t;
  const weights = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
  let x = 0;
  let y = 0;
  for (let index = 0; index < 4; index += 1) {
    x += weights[index] * control[index * 2];
    y += weights[index] * control[index * 2 + 1];
  }
  return [x, y];
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1 · El binario del árbol es el del manifiesto
  // -------------------------------------------------------------------------
  const wasmPath =
    locate("public/wasm/valle-cad-kernel.wasm") ??
    locate("apps/web/public/wasm/valle-cad-kernel.wasm");
  const manifestPath =
    locate("../../crates/valle-cad-kernel/kernel-manifest.json") ??
    locate("crates/valle-cad-kernel/kernel-manifest.json");
  ok(wasmPath !== null, "debe existir apps/web/public/wasm/valle-cad-kernel.wasm");
  ok(manifestPath !== null, "debe existir crates/valle-cad-kernel/kernel-manifest.json");

  const bytes = fs.readFileSync(wasmPath!);
  const manifest = JSON.parse(fs.readFileSync(manifestPath!, "utf8"));
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  ok(
    digest === manifest.binary.sha256,
    `el binario del árbol (sha256 ${digest.slice(0, 16)}…) no es el del manifiesto ` +
      `(${String(manifest.binary.sha256).slice(0, 16)}…): recompila con node scripts/wasm/build-kernel.mjs`,
  );
  ok(
    bytes.length === manifest.binary.bytes,
    `el binario mide ${bytes.length} B y el manifiesto declara ${manifest.binary.bytes} B`,
  );

  const wasm = await createCadCurveKernel(new Uint8Array(bytes));
  ok(
    wasm.backend === "wasm",
    `el binario del árbol debe cargar como kernel wasm, no caer al fallback: ${wasm.fallbackReason}`,
  );
  ok(wasm.abi === manifest.abi, `ABI ${wasm.abi} ≠ ${manifest.abi} declarada en el manifiesto`);
  const js = createCadCurveKernelJs(null);

  // -------------------------------------------------------------------------
  // 2 · Los dos motores caen sobre la MISMA curva analítica
  // -------------------------------------------------------------------------
  // La tercera fila es la que importa: un vector de nudos con la longitud
  // exacta pero de dominio nulo, que es lo que trae un DXF cuyo escritor emitió
  // los grupos 40 vacíos. `curve-tessellate.ts` lo descarta y sintetiza nudos
  // clamped; un motor que se lo crea divide por cero en cada nivel de De Boor,
  // toma alfa cero y devuelve el primer punto de control repetido `steps + 1`
  // veces. Ese fallo no cambia el NÚMERO de puntos, así que la comprobación de
  // forma lo deja pasar: hace falta una referencia externa para verlo.
  const ANCHOR_CONTROL = new Float64Array([0, 0, 10, 30, 40, 30, 50, 0]);
  const ANCHOR_SCALE = 50;
  const ANCHOR_CASES: readonly (readonly [string, Float64Array | null])[] = [
    ["sin nudos", null],
    ["nudos clamped explícitos", new Float64Array([0, 0, 0, 0, 1, 1, 1, 1])],
    ["nudos con dominio nulo", new Float64Array(8)],
  ];
  // 1e-12 relativo. Entre De Boor y Bernstein el orden de las operaciones es
  // distinto, así que la igualdad exacta no es exigible: lo medido es ~1e-16 de
  // escala. La cifra deja cuatro órdenes de margen sobre ese ruido y sigue doce
  // por debajo de un colapso, que vale una escala entera.
  const ANCHOR_TOLERANCE = 1e-12;
  for (const [caso, anchorKnots] of ANCHOR_CASES) {
    for (const [motor, kernel] of [
      ["javascript", js],
      ["wasm", wasm],
    ] as const) {
      const curve = kernel.tessellateSpline(ANCHOR_CONTROL, 3, anchorKnots, 24);
      ok(
        curve.length === 50,
        `${motor} · ${caso}: la spline debe traer 25 puntos, no ${curve.length / 2}`,
      );
      let worst = 0;
      for (let step = 0; step <= 24; step += 1) {
        const [x, y] = bernsteinCubic(ANCHOR_CONTROL, step / 24);
        worst = Math.max(
          worst,
          Math.abs(curve[step * 2] - x),
          Math.abs(curve[step * 2 + 1] - y),
        );
      }
      ok(
        worst / ANCHOR_SCALE <= ANCHOR_TOLERANCE,
        `${motor} · ${caso}: se separa ${(worst / ANCHOR_SCALE).toExponential(3)} de la ` +
          "Bézier cúbica analítica de sus propios puntos de control, y una B-spline de grado 3 " +
          "con cuatro puntos de control y nudos clamped ES esa Bézier",
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3, 4 y 5 · Paridad por familia
  // -------------------------------------------------------------------------
  const corpus = buildCadKernelCorpus(4_000, 1_000);
  const arcReports: CadKernelParityReport[] = [];
  const ellipseReports: CadKernelParityReport[] = [];
  const splineReports: CadKernelParityReport[] = [];

  for (const steps of STEPS) {
    const left = js.tessellateArcs(corpus.arcs, corpus.arcCount, steps);
    const right = wasm.tessellateArcs(corpus.arcs, corpus.arcCount, steps);
    arcReports.push(
      compareCadKernelBatch(
        `arc@${steps}`,
        left.counts,
        left.points,
        right.counts,
        right.points,
        corpus.arcs,
        CAD_ARC_STRIDE,
      ),
    );
    const leftEllipse = js.tessellateEllipses(corpus.ellipses, corpus.ellipseCount, steps);
    const rightEllipse = wasm.tessellateEllipses(corpus.ellipses, corpus.ellipseCount, steps);
    ellipseReports.push(
      compareCadKernelBatch(
        `ellipse@${steps}`,
        leftEllipse.counts,
        leftEllipse.points,
        rightEllipse.counts,
        rightEllipse.points,
        corpus.ellipses,
        CAD_ELLIPSE_STRIDE,
      ),
    );
    for (const spline of corpus.splines) {
      const leftSpline = js.tessellateSpline(spline.control, spline.degree, spline.knots, steps);
      const rightSpline = wasm.tessellateSpline(spline.control, spline.degree, spline.knots, steps);
      let scale = 1;
      for (const coordinate of spline.control)
        if (Math.abs(coordinate) > scale) scale = Math.abs(coordinate);
      splineReports.push(compareCadKernelCurve(`spline@${steps}`, leftSpline, rightSpline, scale));
    }
  }

  const arc = mergeCadKernelParity("arc", arcReports);
  const ellipse = mergeCadKernelParity("ellipse", ellipseReports);
  const spline = mergeCadKernelParity("spline", splineReports);

  for (const report of [arc, ellipse, spline]) {
    ok(
      report.comparedValues > 0,
      `${report.family}: no se comparó ningún valor — el corpus no llegó al kernel`,
    );
    ok(
      report.shapeMismatches === CAD_KERNEL_PARITY_TOLERANCE.maxShapeMismatches,
      `${report.family}: ${report.shapeMismatches} curva(s) con distinto número de puntos; ` +
        "los dos motores tomaron ramas distintas y eso no es tolerancia, es defecto",
    );
    ok(
      report.maxScaledDelta <= CAD_KERNEL_PARITY_TOLERANCE.maxScaledDelta,
      `${report.family}: desviación relativa ${report.maxScaledDelta} > ` +
        `${CAD_KERNEL_PARITY_TOLERANCE.maxScaledDelta} (${CAD_KERNEL_PARITY_TOLERANCE.maxScaledDeltaUlp} ULP de escala)`,
    );
  }

  ok(
    spline.maxUlpDelta === CAD_KERNEL_PARITY_TOLERANCE.splineMaxUlp,
    `spline: ${spline.maxUlpDelta} ULP de diferencia. De Boor sólo suma, resta, multiplica y ` +
      "divide: cualquier diferencia significa que alguien reordenó las operaciones",
  );
  ok(
    spline.identicalValues === spline.comparedValues,
    `spline: ${spline.comparedValues - spline.identicalValues} coordenadas no idénticas bit a bit`,
  );

  // -------------------------------------------------------------------------
  // 6 · La ABI falla cerrado
  // -------------------------------------------------------------------------
  // Un `steps` de cero no debe producir coordenadas raras: produce cero puntos.
  const vacio = wasm.tessellateArcs(corpus.arcs, 4, 0);
  ok(
    vacio.points.length === 0 && Array.from(vacio.counts).every((count) => count === 0),
    "con steps = 0 el kernel devuelve cero puntos, no basura",
  );
  assert.throws(
    () => {
      const liberado = wasm;
      liberado.dispose();
      liberado.tessellateArcs(corpus.arcs, 1, 24);
    },
    CadCurveKernelError,
    "usar el kernel después de liberarlo debe ser un error tipado",
  );
  checks += 1;

  // La utilidad de ULP tiene que cruzar el cero sin discontinuidad: si no, el
  // peor caso publicado lo fijaría un `-0` y no un defecto.
  ok(ulpDistance(0, -0) === 0, "+0 y -0 distan cero ULP");
  ok(ulpDistance(1, 1 + Number.EPSILON) === 1, "un ULP en 1.0 debe medir 1");

  console.log(
    `curve-kernel-parity: ${checks} comprobaciones verdes — ` +
      `${arc.comparedValues + ellipse.comparedValues + spline.comparedValues} coordenadas comparadas, ` +
      `spline exacta (${spline.comparedValues} valores, 0 ULP), ` +
      `peor desviación relativa ${Math.max(arc.maxScaledDelta, ellipse.maxScaledDelta).toExponential(3)} ` +
      `(tope ${CAD_KERNEL_PARITY_TOLERANCE.maxScaledDelta.toExponential(3)}).`,
  );
}

void main();
