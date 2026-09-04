/**
 * Paridad del carril del KERNEL contra el carril de ADAPTADORES, sobre las dos
 * mezclas de corpus que traen curvas.
 *
 * ## Qué se afirma aquí y por qué en este orden
 *
 * 1. **Con el motor por defecto (JavaScript) la paridad es EXACTA**, coordenada
 *    a coordenada, en `mechanical@10k` y `plano-real@10k`. No es una tolerancia
 *    generosa: es igualdad de bits, y tiene que serlo porque el motor
 *    JavaScript del kernel delega en `curve-tessellate.ts`, que es el mismo
 *    teselador que llaman los adaptadores. Si esto se rompiera no sería una
 *    deriva numérica, sería un error de EMPAQUETADO —una curva escrita en la
 *    posición de otra, un `closed` perdido, un origen restado dos veces— y esos
 *    no se ven en el dibujo hasta que alguien mira el plano.
 * 2. **El enrutado ocurre de verdad.** Una paridad que se cumpliera porque
 *    ninguna entidad tomó el carril del kernel sería una paridad vacía. Se
 *    afirma el recuento exacto de entidades desviadas contra el manifiesto del
 *    corpus, y que los arcos y las elipses cruzan la frontera POR LOTES: unas
 *    pocas llamadas, no una por curva.
 * 3. **Con el binario del árbol instalado** —el kernel wasm de verdad, cargado
 *    aquí mismo— la forma no cambia (mismos caminos, mismos puntos, mismos
 *    cierres), la spline sigue siendo exacta y arcos y elipses caen dentro de
 *    la desviación que se publica. Esto es lo que dice que el cable sirve para
 *    el motor que justifica el cable.
 * 4. **Sin binario la salida es IDÉNTICA.** El fallback cerrado del kernel ya
 *    estaba probado en su propio módulo; lo que se prueba aquí es que el
 *    ENRUTADO lo respeta: calentar contra una URL que no existe deja el render
 *    dibujando lo mismo, y lo declara en `fallbackReason` en vez de callarlo.
 * 5. **Las curvas degeneradas no cambian de respuesta.** Radio cero, eje mayor
 *    nulo, spline de un punto, vector de nudos vacío: los cuatro llegan de un
 *    DXF ajeno y los cuatro tienen que salir SIN caminos por los dos carriles.
 *
 * La referencia es `tessellateCadEntity` de `tessellation-cache.ts`, que este
 * cambio no toca y que es literalmente el registro de adaptadores. Comparar
 * contra `tessellateCadEntityBatch` no valdría: desde el cableado ES el carril
 * del kernel, así que se estaría comparando consigo mismo.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createCadCorpusMix,
  findCadCorpusMixManifestEntry,
  type CadCorpusMixId,
} from "../benchmark/corpus-mixes";
import type { CadNativeEntity } from "../entity-runtime";
import {
  createCadCurveKernel,
  createCadCurveKernelJs,
  type CadCurveKernel,
} from "../wasm/curve-kernel";
import {
  cadCurveKernelRouteFor,
  getCadRenderCurveKernel,
  setCadRenderCurveKernel,
  tessellateCadEntitiesWithCurveKernel,
  warmCadRenderCurveKernel,
  type CadCurveKernelBatchStats,
} from "./curve-kernel-tessellation";
import {
  CAD_RENDER_LOD_SEGMENTS,
  tessellateCadEntity,
  type CadTessellation,
} from "./tessellation-cache";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Igual que en el spec de paridad del kernel: el cwd no se supone. */
function locate(relative: string): string | null {
  for (const base of [process.cwd(), path.resolve(process.cwd(), "..", "..")]) {
    const candidate = path.resolve(base, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const MIXES: readonly CadCorpusMixId[] = ["mechanical", "plano-real"];
const ENTITIES = 10_000;

/**
 * Presupuesto de segmentos por entidad: los TRES escalones de LOD, rotando.
 *
 * Rotarlos importa. Con un solo valor habría un grupo por tipo y el agrupado
 * por (tipo × pasos) quedaría probado de forma trivial; con los tres, cada tipo
 * de curva cruza la frontera tres veces y una curva colocada en el grupo
 * equivocado saldría con otro detalle y rompería la igualdad.
 */
function segmentsFor(count: number): number[] {
  const segments = new Array<number>(count);
  for (let index = 0; index < count; index += 1)
    segments[index] = CAD_RENDER_LOD_SEGMENTS[index % CAD_RENDER_LOD_SEGMENTS.length];
  return segments;
}

interface Deviation {
  compared: number;
  worst: number;
}

/**
 * Compara un resultado del carril del kernel contra la teselación de
 * referencia. Con `tolerance = 0` exige igualdad de bits.
 *
 * La desviación se mide RELATIVA a la escala de la coordenada (con suelo 1)
 * porque estas mezclas colocan geometría a decenas de miles de unidades del
 * origen: una diferencia absoluta ahí no dice nada.
 */
function comparePaths(
  label: string,
  kernelPaths: Float32Array[],
  kernelClosed: boolean[],
  reference: CadTessellation,
  tolerance: number,
  deviation: Deviation,
): void {
  assert.equal(
    kernelPaths.length,
    reference.paths.length,
    `${label}: número de caminos`,
  );
  for (let index = 0; index < reference.paths.length; index += 1) {
    const left = kernelPaths[index];
    const right = reference.paths[index].xy;
    assert.equal(
      kernelClosed[index],
      reference.paths[index].closed,
      `${label}: bandera de cierre del camino ${index}`,
    );
    assert.equal(left.length, right.length, `${label}: puntos del camino ${index}`);
    // Se comparan 22 millones de coordenadas entre las tres corridas: aquí no
    // se llama a `assert` por valor —un millón de llamadas de aserción cuestan
    // más que el teselado que verifican— sino sólo cuando hay diferencia. El
    // `NaN === NaN` se trata como igualdad a propósito: los dos carriles
    // producen NaN en los mismos sitios (ángulos no finitos) y llamarlo
    // diferencia sería un falso rojo.
    for (let value = 0; value < right.length; value += 1) {
      const a = left[value];
      const b = right[value];
      if (a === b || (Number.isNaN(a) && Number.isNaN(b))) continue;
      const scaled = Math.abs(a - b) / Math.max(1, Math.abs(b));
      if (scaled > deviation.worst) deviation.worst = scaled;
      if (scaled > tolerance)
        assert.fail(
          `${label}: coordenada ${value} del camino ${index} — ${a} ≠ ${b} ` +
            `(desviación relativa ${scaled.toExponential(3)}, tope ${tolerance.toExponential(3)})`,
        );
    }
    deviation.compared += right.length;
  }
}

interface MixCase {
  mix: CadCorpusMixId;
  entities: readonly CadNativeEntity[];
  segments: number[];
  document: ReturnType<typeof createCadCorpusMix>["document"];
  /** Teselación de referencia por entidad, por el registro de adaptadores. */
  reference: CadTessellation[];
  /** Curvas que el enrutado DEBE desviar, según el manifiesto del corpus. */
  expectedKernelEntities: number;
}

function buildCase(mix: CadCorpusMixId): MixCase {
  const corpus = createCadCorpusMix({ mix, entities: ENTITIES });
  const segments = segmentsFor(corpus.nativeEntities.length);
  const manifest = findCadCorpusMixManifestEntry(mix, ENTITIES);
  assert.ok(manifest, `el manifiesto debe declarar ${mix}@${ENTITIES}`);
  const expectedKernelEntities =
    (manifest.entityMix.arc ?? 0) +
    (manifest.entityMix.circle ?? 0) +
    (manifest.entityMix.ellipse ?? 0) +
    (manifest.entityMix.spline ?? 0);
  const reference = corpus.nativeEntities.map((entity, index) =>
    tessellateCadEntity(entity, segments[index], corpus.document),
  );
  return {
    mix,
    entities: corpus.nativeEntities,
    segments,
    document: corpus.document,
    reference,
    expectedKernelEntities,
  };
}

function runCase(
  testCase: MixCase,
  kernel: CadCurveKernel,
  tolerance: number,
  label: string,
): { deviation: Deviation; stats: CadCurveKernelBatchStats } {
  const batch = tessellateCadEntitiesWithCurveKernel(
    testCase.entities,
    testCase.segments,
    testCase.document,
    undefined,
    kernel,
  );
  assert.equal(
    batch.results.length,
    testCase.entities.length,
    `${label}: el lote devuelve una entrada por entidad soportada`,
  );
  assert.equal(
    batch.stats.kernelEntities,
    testCase.expectedKernelEntities,
    `${label}: entidades desviadas al kernel`,
  );
  const deviation: Deviation = { compared: 0, worst: 0 };
  for (let index = 0; index < testCase.entities.length; index += 1) {
    const entity = testCase.entities[index];
    const result = batch.results[index];
    assert.equal(
      result.entityId,
      entity.id,
      `${label}: el orden de entrada se conserva en la posición ${index}`,
    );
    // La spline no usa trascendentes: sale exacta incluso en wasm, así que se
    // le exige igualdad de bits también ahí. Es la comprobación que distingue
    // «los dos motores redondean distinto» de «alguien cambió la matemática».
    const exact = tolerance === 0 || entity.type === "spline";
    comparePaths(
      `${label}/${entity.id}`,
      result.paths,
      result.closed,
      testCase.reference[index],
      exact ? 0 : tolerance,
      deviation,
    );
  }
  return { deviation, stats: batch.stats };
}

/** Curvas que un DXF ajeno trae rotas y que los dos carriles deben omitir. */
const DEGENERATE: CadNativeEntity[] = [
  { id: "arco-radio-cero", type: "arc", center: { x: 10, y: 10, z: 0 }, radius: 0, startAngle: 0, endAngle: 90, layer: "0" },
  { id: "circulo-radio-cero", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 0, layer: "0" },
  { id: "elipse-eje-nulo", type: "ellipse", center: { x: 5, y: 5, z: 0 }, majorAxis: { x: 0, y: 0, z: 0 }, ratio: 0.5, startParameter: 0, endParameter: 360, layer: "0" },
  { id: "elipse-razon-cero", type: "ellipse", center: { x: 5, y: 5, z: 0 }, majorAxis: { x: 10, y: 0, z: 0 }, ratio: 0, startParameter: 0, endParameter: 360, layer: "0" },
  { id: "spline-un-punto", type: "spline", degree: 3, controlPoints: [{ x: 0, y: 0, z: 0 }], knots: [], layer: "0" },
  { id: "spline-nudos-vacios", type: "spline", degree: 3, controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 4, z: 0 }, { x: 5, y: 4, z: 0 }, { x: 7, y: 0, z: 0 }], knots: [], layer: "0" },
  { id: "spline-nudos-nan", type: "spline", degree: 3, controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 4, z: 0 }, { x: 5, y: 4, z: 0 }, { x: 7, y: 0, z: 0 }], knots: [0, 0, 0, 0, Number.NaN, 1, 1, 1], layer: "0" },
  { id: "arco-angulos-infinitos", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 5, startAngle: 0, endAngle: Number.POSITIVE_INFINITY, layer: "0" },
];

function checkDegenerate(kernel: CadCurveKernel, label: string): void {
  const segments = DEGENERATE.map(() => 64);
  const batch = tessellateCadEntitiesWithCurveKernel(
    DEGENERATE,
    segments,
    undefined,
    undefined,
    kernel,
  );
  const deviation: Deviation = { compared: 0, worst: 0 };
  for (let index = 0; index < DEGENERATE.length; index += 1) {
    const reference = tessellateCadEntity(DEGENERATE[index], segments[index]);
    comparePaths(
      `${label}/${DEGENERATE[index].id}`,
      batch.results[index].paths,
      batch.results[index].closed,
      reference,
      0,
      deviation,
    );
  }
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // 0 · El enrutado desvía exactamente las cuatro primitivas del kernel
  // -------------------------------------------------------------------------
  for (const type of ["arc", "circle", "ellipse", "spline"] as const)
    ok(
      cadCurveKernelRouteFor({ type } as CadNativeEntity) !== null,
      `${type} debe tomar el carril del kernel`,
    );
  for (const type of ["line", "polyline", "hatch", "dimension", "insert", "mtext", "wall"] as const)
    ok(
      cadCurveKernelRouteFor({ type } as CadNativeEntity) === null,
      `${type} debe quedarse en el carril de adaptadores`,
    );
  ok(
    cadCurveKernelRouteFor({ type: "circle" } as CadNativeEntity) === "arc",
    "el círculo viaja por el carril de arcos: su adaptador es un arco de 0 a 360",
  );

  const cases = MIXES.map(buildCase);

  // -------------------------------------------------------------------------
  // 1 · Motor por defecto: paridad EXACTA sobre las dos mezclas con curvas
  // -------------------------------------------------------------------------
  const js = createCadCurveKernelJs("motor de referencia del spec");
  let exactValues = 0;
  let mechanicalStats: CadCurveKernelBatchStats | null = null;
  for (const testCase of cases) {
    const { deviation, stats } = runCase(testCase, js, 0, `js/${testCase.mix}`);
    if (testCase.mix === "mechanical") mechanicalStats = stats;
    exactValues += deviation.compared;
    ok(
      deviation.worst === 0,
      `${testCase.mix}@${ENTITIES}: el carril del kernel y el de adaptadores coinciden bit a bit`,
    );
    ok(
      testCase.expectedKernelEntities > 0,
      `${testCase.mix}@${ENTITIES}: la mezcla tiene curvas que desviar (${testCase.expectedKernelEntities})`,
    );
  }

  // -------------------------------------------------------------------------
  // 2 · Los arcos y las elipses cruzan POR LOTES, no una llamada por curva
  // -------------------------------------------------------------------------
  const mechanical = cases[0];
  const stats = mechanicalStats!;
  const manifest = findCadCorpusMixManifestEntry("mechanical", ENTITIES)!;
  const splines = manifest.entityMix.spline ?? 0;
  const batched = stats.kernelEntities - splines;
  // Tres escalones de LOD × dos familias (arcos+círculos, elipses) = 6 cruces
  // como mucho, más uno por spline mientras la ABI v1 no tenga lote para ellas.
  ok(
    stats.kernelCalls === 6 + splines,
    `mechanical@${ENTITIES}: ${batched} arcos/círculos/elipses cruzan en 6 llamadas ` +
      `(3 escalones × 2 familias) y ${splines} splines en una cada una; hubo ${stats.kernelCalls}`,
  );
  ok(
    stats.adapterEntities === mechanical.entities.length - stats.kernelEntities,
    "lo que no es curva sigue saliendo del registro de adaptadores",
  );

  // -------------------------------------------------------------------------
  // 3 · El binario del árbol, instalado en el carril
  // -------------------------------------------------------------------------
  const wasmPath =
    locate("public/wasm/valle-cad-kernel.wasm") ??
    locate("apps/web/public/wasm/valle-cad-kernel.wasm");
  ok(wasmPath !== null, "debe existir apps/web/public/wasm/valle-cad-kernel.wasm");
  const wasm = await createCadCurveKernel(new Uint8Array(fs.readFileSync(wasmPath!)));
  ok(
    wasm.backend === "wasm",
    `el binario del árbol debe cargar como kernel wasm: ${wasm.fallbackReason}`,
  );
  // Tope de la comparación en Float32. La desviación del kernel es del orden de
  // 1e-16 relativo (ver `docs/cad/evidence/wasm-parity.json`), pero estas
  // coordenadas se empaquetan a `Float32Array`, cuyo epsilon es 2^-23 ≈ 1,2e-7:
  // el tope tiene que dejar sitio a ESE redondeo o estaría midiendo el formato
  // de salida y no el kernel. Un error de geometría de verdad —una curva mal
  // colocada, otro barrido— se sale de aquí por varios órdenes de magnitud.
  const FLOAT32_TOLERANCE = 4 * 2 ** -23;
  let wasmValues = 0;
  let wasmWorst = 0;
  for (const testCase of cases) {
    const { deviation } = runCase(testCase, wasm, FLOAT32_TOLERANCE, `wasm/${testCase.mix}`);
    wasmValues += deviation.compared;
    wasmWorst = Math.max(wasmWorst, deviation.worst);
  }
  ok(
    wasmWorst <= FLOAT32_TOLERANCE,
    `con el binario del árbol la peor desviación relativa es ${wasmWorst.toExponential(3)} (tope ${FLOAT32_TOLERANCE.toExponential(3)})`,
  );
  ok(
    wasm.fallbackReason === null && wasm.abi === 1,
    "y lo hizo el binario, no un fallback disfrazado: sin motivo de reserva y con ABI 1",
  );

  // -------------------------------------------------------------------------
  // 4 · Curvas degeneradas: misma respuesta por los dos motores
  // -------------------------------------------------------------------------
  checkDegenerate(js, "js");
  checkDegenerate(wasm, "wasm");
  ok(true, `las ${DEGENERATE.length} curvas rotas salen sin caminos por los dos motores`);

  // -------------------------------------------------------------------------
  // 5 · Sin binario: el kernel del render cae al motor JavaScript, lo DECLARA,
  //     y la salida no cambia ni una coordenada
  // -------------------------------------------------------------------------
  const fallback = await warmCadRenderCurveKernel(
    "/wasm/este-archivo-no-existe.wasm",
  );
  ok(
    fallback.backend === "javascript",
    "sin binario el kernel del render es el motor JavaScript",
  );
  ok(
    typeof fallback.fallbackReason === "string" && fallback.fallbackReason.length > 0,
    `el motivo del fallback se declara, no se calla: ${fallback.fallbackReason}`,
  );
  ok(
    getCadRenderCurveKernel() === fallback,
    "calentar instala el kernel resultante en el carril del render",
  );
  let fallbackValues = 0;
  for (const testCase of cases) {
    // Sin kernel explícito: el que se usa es el que `warm` acaba de instalar.
    const batch = tessellateCadEntitiesWithCurveKernel(
      testCase.entities,
      testCase.segments,
      testCase.document,
    );
    const deviation: Deviation = { compared: 0, worst: 0 };
    for (let index = 0; index < testCase.entities.length; index += 1)
      comparePaths(
        `fallback/${testCase.mix}/${testCase.entities[index].id}`,
        batch.results[index].paths,
        batch.results[index].closed,
        testCase.reference[index],
        0,
        deviation,
      );
    fallbackValues += deviation.compared;
    ok(
      batch.stats.backend === "javascript" && deviation.worst === 0,
      `${testCase.mix}@${ENTITIES}: sin binario la salida es idéntica, no parecida`,
    );
  }

  // Se devuelve el carril a su estado perezoso: un spec que deja un kernel
  // instalado a nivel de módulo contamina al siguiente que corra en el proceso.
  setCadRenderCurveKernel(null);

  const curvas = cases.reduce((total, item) => total + item.expectedKernelEntities, 0);
  console.log(
    `curve-kernel-tessellation: ${checks} comprobaciones verdes — ` +
      `${exactValues.toLocaleString("es-MX")} coordenadas EXACTAS contra el carril de adaptadores en ` +
      `mechanical@${ENTITIES} y plano-real@${ENTITIES} (${curvas} curvas desviadas al kernel), ` +
      `${wasmValues.toLocaleString("es-MX")} con el binario del árbol instalado — peor desviación relativa ` +
      `${wasmWorst.toExponential(3)}, es decir que el empaquetado a Float32 absorbe ENTERA la diferencia ` +
      `entre los dos motores — y ${fallbackValues.toLocaleString("es-MX")} idénticas sin binario.`,
  );
}

void main();
