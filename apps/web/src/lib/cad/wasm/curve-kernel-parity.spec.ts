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
import { tessellateCadEntityBatch } from "../render/tessellate.worker";
import { CadRenderPipeline, type CadOffThreadTessellator } from "../render/pipeline";
import {
  cadRenderSegmentBudget,
  CadTessellationCache,
  tessellateCadEntity,
  type CadRenderLodTier,
  type CadTessellation,
} from "../render/tessellation-cache";
import type { CadNativeEntity } from "../entity-runtime";

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

  // La utilidad de ULP tiene que cruzar el cero sin discontinuidad: si no, el
  // peor caso publicado lo fijaría un `-0` y no un defecto.
  ok(ulpDistance(0, -0) === 0, "+0 y -0 distan cero ULP");
  ok(ulpDistance(1, 1 + Number.EPSILON) === 1, "un ULP en 1.0 debe medir 1");

  // ---------------------------------------------------------------------------
  // 6 · El cableado del worker (A.4): el mismo binario, por el camino que de
  // verdad usa el carril fuera de hilo — agrupado por familia y por `steps`,
  // no curva a curva — da la MISMA geometría que sin kernel.
  //
  // Va ANTES de liberar `wasm` (más abajo): las secciones 7 y 8 lo siguen
  // usando de verdad, y la 9 es la única que lo agota a propósito.
  // ---------------------------------------------------------------------------
  const mixedEntities: CadNativeEntity[] = [
    { id: "c1", type: "circle", center: { x: 12, y: -8, z: 0 }, radius: 40, layer: "0" },
    { id: "c2", type: "circle", center: { x: -200, y: 300, z: 0 }, radius: 5, layer: "0" },
    { id: "a1", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 25, startAngle: 10, endAngle: 260, layer: "0" },
    { id: "a2", type: "arc", center: { x: 500, y: -500, z: 0 }, radius: 90, startAngle: 350, endAngle: 10, layer: "0" },
    {
      id: "e1",
      type: "ellipse",
      center: { x: 30, y: 30, z: 0 },
      majorAxis: { x: 40, y: 10, z: 0 },
      ratio: 0.4,
      startParameter: 0,
      endParameter: 360,
      layer: "0",
    },
    {
      id: "e2",
      type: "ellipse",
      center: { x: -50, y: 10, z: 0 },
      majorAxis: { x: 20, y: -5, z: 0 },
      ratio: 0.7,
      startParameter: 45,
      endParameter: 200,
      layer: "0",
    },
    {
      id: "s1",
      type: "spline",
      degree: 3,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 30, z: 0 },
        { x: 25, y: -10, z: 0 },
        { x: 40, y: 20, z: 0 },
        { x: 55, y: 5, z: 0 },
      ],
      knots: [],
      layer: "0",
    },
    {
      id: "s2",
      type: "spline",
      degree: 2,
      controlPoints: [
        { x: -30, y: 0, z: 0 },
        { x: -10, y: 20, z: 0 },
        { x: 10, y: -20, z: 0 },
        { x: 30, y: 0, z: 0 },
      ],
      knots: [],
      closed: false,
      layer: "0",
    },
  ];
  const mixedSegments = [64, 8, 32, 32, 96, 24, 24, 16];
  // Origen no nulo: el kernel resta el mismo origen ANTES de entrar a
  // `Float32Array` que el camino sin kernel (ver `tessellation-cache.ts`).
  const wiringOrigin = { x: 100, y: -100 };
  const withoutKernel = tessellateCadEntityBatch(mixedEntities, mixedSegments, undefined, wiringOrigin, null);
  const withKernel = tessellateCadEntityBatch(mixedEntities, mixedSegments, undefined, wiringOrigin, wasm);
  ok(
    withKernel.results.length === withoutKernel.results.length,
    `el cableado del kernel debe dar ${withoutKernel.results.length} resultados, no ${withKernel.results.length}`,
  );
  const byId = new Map(withKernel.results.map((result) => [result.entityId, result]));
  // f32 de por medio: la divergencia sin/cos entre motores (~1e-16 relativo en
  // f64) se pierde en el redondeo a 24 bits de mantisa casi siempre, pero la
  // tolerancia absoluta —no cero— es la honesta para coordenadas de esta escala.
  const WIRING_TOLERANCE = 1e-3;
  for (const expected of withoutKernel.results) {
    const actual = byId.get(expected.entityId);
    ok(actual !== undefined, `${expected.entityId}: el kernel también debe teselarla`);
    if (!actual) continue;
    ok(
      actual.paths.length === expected.paths.length,
      `${expected.entityId}: ${actual.paths.length} caminos frente a ${expected.paths.length}`,
    );
    for (let path = 0; path < expected.paths.length; path += 1) {
      ok(actual.closed[path] === expected.closed[path], `${expected.entityId}: mismo cerrado/abierto`);
      ok(
        actual.paths[path].length === expected.paths[path].length,
        `${expected.entityId}: ${actual.paths[path].length} coordenadas frente a ${expected.paths[path].length}`,
      );
      let worst = 0;
      for (let coordinate = 0; coordinate < expected.paths[path].length; coordinate += 1)
        worst = Math.max(worst, Math.abs(actual.paths[path][coordinate] - expected.paths[path][coordinate]));
      ok(
        worst <= WIRING_TOLERANCE,
        `${expected.entityId}: el kernel se separa ${worst} del camino sin kernel (tope ${WIRING_TOLERANCE})`,
      );
    }
  }
  ok(
    true,
    "tessellateCadEntityBatch con el kernel wasm da la MISMA geometría —círculo, arco, elipse y spline, " +
      "agrupados por steps— que sin kernel, con origen flotante restado igual en los dos caminos",
  );

  // ---------------------------------------------------------------------------
  // 7 · Manejo de memoria del motor WASM: el MISMO kernel, reutilizado en
  // decenas de lotes de tamaño variable, para que `ensure()` en `curve-kernel.ts`
  // crezca (`valle_alloc`) y libere (`valle_free`) reservas repetidamente en
  // vez de una sola vez. Un fallo de alojamiento cruzado entre lotes saldría
  // aquí como una excepción o una cuenta de resultados equivocada.
  // ---------------------------------------------------------------------------
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const size = 1 + (iteration % mixedEntities.length);
    const subset = mixedEntities.slice(0, size);
    const subsetSegments = mixedSegments.slice(0, size);
    const out = tessellateCadEntityBatch(subset, subsetSegments, undefined, wiringOrigin, wasm);
    assert.equal(
      out.results.length,
      subset.length,
      `iteración ${iteration}: ${out.results.length} resultados de ${subset.length} entidades`,
    );
  }
  checks += 1;
  ok(
    true,
    "el kernel wasm cargado una vez se reutiliza en 40 lotes de tamaño variable sin perder resultados " +
      "(valle_alloc crece y valle_free libera entre llamadas, nunca por curva)",
  );

  // ---------------------------------------------------------------------------
  // 8 · Cancelación contra el motor WASM: una entidad que sale de vista —o se
  // edita— A MEDIO TESELAR no debe resucitar en caché. El carril fuera de hilo
  // ya descarta respuestas de época vieja (`pipeline-offthread.ts`); esto
  // prueba que la propiedad se sostiene cuando quien teseló fue el kernel, no
  // el motor JavaScript.
  // ---------------------------------------------------------------------------
  {
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    interface RecordedWasmRequest {
      entities: CadNativeEntity[];
      segments: number[];
      resolve: (outcome: { results: ReturnType<typeof tessellateCadEntityBatch>["results"]; source: "worker" }) => void;
    }
    const requests: RecordedWasmRequest[] = [];
    const offThread: CadOffThreadTessellator = (entities, segments) =>
      new Promise((resolve) => {
        requests.push({ entities: [...entities], segments: [...segments], resolve });
      });
    const cache = new CadTessellationCache();
    const pipeline = new CadRenderPipeline({ offThread, cache });
    const curves: CadNativeEntity[] = [
      { id: "arc-a", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 30, startAngle: 0, endAngle: 180, layer: "0" },
      { id: "circle-b", type: "circle", center: { x: 200, y: 0, z: 0 }, radius: 20, layer: "0" },
    ];
    pipeline.replace(curves, ["arc-a", "circle-b"]);
    pipeline.setView({ bounds: { minX: -50, minY: -50, maxX: 250, maxY: 50 }, pixelsPerUnit: 2 });
    let guard = 0;
    while (requests.length === 0 && pipeline.runFrame().ran > 0) {
      if (++guard > 10_000) throw new Error("el arco/círculo nunca piden teselado");
    }
    ok(requests.length > 0, "el arco y el círculo piden teselado al carril fuera de hilo");
    const stale = requests.splice(0);

    // La entidad se edita —el mismo efecto, visto desde la caché, que salir de
    // vista a medio teselar: la petición en vuelo ya no describe lo que hay
    // que dibujar— ANTES de que llegue la respuesta.
    const moved: CadNativeEntity = {
      id: "arc-a",
      type: "arc",
      center: { x: 5, y: 5, z: 0 },
      radius: 30,
      startAngle: 0,
      endAngle: 180,
      layer: "0",
    };
    pipeline.invalidate(["arc-a"], [moved]);

    // La respuesta VIEJA llega tarde, teselada por el motor WASM de verdad.
    for (const request of stale)
      request.resolve({
        results: tessellateCadEntityBatch(request.entities, request.segments, undefined, undefined, wasm).results,
        source: "worker",
      });
    await flush();

    let settleGuard = 0;
    while (!pipeline.settled) {
      if (++settleGuard > 10_000) throw new Error("el pipeline no asienta tras la edición");
      if (pipeline.runFrame().ran === 0) {
        if (requests.length > 0) {
          const request = requests.shift()!;
          request.resolve({
            results: tessellateCadEntityBatch(request.entities, request.segments, undefined, undefined, wasm)
              .results,
            source: "worker",
          });
        }
        await flush();
      }
    }
    const settled = pipeline.stats();
    assert.equal(settled.renderedEntities, settled.visibleEntities, "asienta con las dos entidades detalladas");

    let cached: CadTessellation | null = null;
    let cachedTier: CadRenderLodTier | null = null;
    for (const tier of [0, 1, 2] as const) {
      cached = cache.peek("arc-a", tier);
      if (cached) {
        cachedTier = tier;
        break;
      }
    }
    ok(cached !== null && cachedTier !== null, "la entidad editada tiene teselado wasm en caché");
    const expectedAfterEdit = tessellateCadEntity(moved, cadRenderSegmentBudget(cachedTier!));
    assert.deepEqual(
      [...cached!.paths[0].xy],
      [...expectedAfterEdit.paths[0].xy],
      "el teselado en caché es el de DESPUÉS de la edición, no la respuesta wasm vieja",
    );
    ok(
      true,
      "una respuesta wasm pedida antes de una edición se descarta y no resucita la geometría de antes " +
        "— la cancelación del carril fuera de hilo se sostiene con el motor WASM, no sólo con JavaScript",
    );
    pipeline.dispose();
  }

  // -------------------------------------------------------------------------
  // 9 · La ABI falla cerrado. Va AL FINAL a propósito: agota el kernel de
  // verdad (`dispose()`) y todo lo de arriba lo necesitaba vivo.
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

  console.log(
    `curve-kernel-parity: ${checks} comprobaciones verdes — ` +
      `${arc.comparedValues + ellipse.comparedValues + spline.comparedValues} coordenadas comparadas, ` +
      `spline exacta (${spline.comparedValues} valores, 0 ULP), ` +
      `peor desviación relativa ${Math.max(arc.maxScaledDelta, ellipse.maxScaledDelta).toExponential(3)} ` +
      `(tope ${CAD_KERNEL_PARITY_TOLERANCE.maxScaledDelta.toExponential(3)}).`,
  );
}

void main();
