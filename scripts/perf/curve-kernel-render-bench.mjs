#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/curve-kernel-render-100k.json`: la GANANCIA del
 * kernel de curvas medida en la etapa de teselado del render, o la cifra real
 * si la ganancia no llega.
 *
 * ## Por qué hacía falta este artefacto y no bastaba con el que ya había
 *
 * `docs/cad/evidence/wasm-parity.json` mide el kernel EN AISLADO: 100.000 arcos
 * sintéticos, un lote perfecto, nada más. Esa cifra dice lo que el motor puede
 * hacer, no lo que el producto gana. Desde que el kernel está cableado al
 * teselado del render (2026-09-04), la pregunta que hay que contestar es otra:
 * **con el corpus del producto y por la función que el worker ejecuta de
 * verdad, ¿cuánto se ahorra?** Sin esta medida, «enchufado» es un claim sin
 * evidencia.
 *
 * ## Cómo se contesta: la misma etapa, dos veces
 *
 * La sonda corre `tessellateCadEntitiesWithCurveKernel` —el cuerpo de
 * `tessellateCadEntityBatch`, que es la puerta que importa el worker— sobre el
 * MISMO corpus versionado, con los MISMOS presupuestos de segmentos, cambiando
 * sólo el kernel inyectado: el binario `.wasm` del árbol y el motor JavaScript.
 * Y comprueba que los dos motores devuelven EL MISMO número de puntos por
 * entidad antes de publicar ninguna ganancia.
 *
 * Esa condición no es un adorno. Una etapa que va más rápido porque dibuja
 * menos puntos no es una optimización: es un plano mal dibujado. Por eso el
 * spec de este artefacto rechaza cualquier fichero que traiga ganancia y no
 * traiga paridad, y por eso la paridad viaja dentro del artefacto en vez de
 * quedarse en la salida de la sonda.
 *
 * ## Las tres mezclas, y por qué la tercera se publica en cero
 *
 * - `mechanical@100k` y `plano-real@100k` son las mezclas donde el kernel tiene
 *   trabajo: 70.000 y 12.000 curvas de primer nivel respectivamente.
 * - `architecture@100k` **no emite curvas de primer nivel** (sus 34.000 INSERT
 *   sí traen arcos dentro de la definición del bloque, pero ésos los tesela
 *   `insertRenderPaths` por su cuenta y NO pasan por el enrutador). Se mide
 *   igual y se publica en cero, porque callarla insinuaría una ganancia que ahí
 *   no existe — y de paso deja escrito dónde está el siguiente cable.
 *
 * ## La máquina se declara, y se declara lo que NO es
 *
 * Este contenedor no tiene GPU y no tiene navegadores de Playwright (el egreso
 * para bajarlos está denegado). Así que esto es trabajo de CPU en Node y se
 * dice con todas sus letras: no es una medida de fotogramas, ni de detalle
 * completo en pantalla, ni sustituye a `browser-slo-100k.json`. El spec lo
 * exige: un artefacto que declarara GPU o navegador saliendo de aquí sería
 * mentira por construcción.
 *
 * Uso:
 *   node scripts/perf/curve-kernel-render-bench.mjs
 *   node scripts/perf/curve-kernel-render-bench.mjs --check   # sólo verifica el publicado
 *   node scripts/perf/curve-kernel-render-bench.mjs --mix mechanical --entities 10000 --runs 1
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(here, "curve-kernel-render-probe.mts");

export const EVIDENCE_FILE = path.join(
  root,
  "docs/cad/evidence/curve-kernel-render-100k.json",
);

/**
 * Las tres mezclas del artefacto, en el orden en que se publican.
 *
 * `architecture` va la última a propósito: es la que se publica en cero y la
 * que más tarda (34.000 INSERT expandiendo su bloque), así que las dos que
 * traen la cifra que importa salen antes por si alguien corta la corrida.
 */
export const BENCH_MIXES = ["mechanical", "plano-real", "architecture"];

/** Impar, para que la mediana entre procesos sea un dato y no un promedio. */
const RUNS = 3;
/**
 * Repeticiones DENTRO de cada proceso. Impar por lo mismo, y NUEVE porque con
 * tres la mediana todavía la mueve una pausa del recolector: medido aquí, tres
 * repeticiones dan un ×N que salta entre 0,9 y 1,5 sobre la misma máquina y el
 * mismo corpus, y nueve lo dejan quieto en la primera cifra decimal.
 */
const REPEATS = 9;
/**
 * Repeticiones del sublote de curvas. Van aparte de `REPEATS` porque el sublote
 * cuesta órdenes de magnitud menos que la etapa entera y se puede repetir más
 * sin encarecer el benchmark: es lo que impide que una pausa del recolector
 * sobre 40 ms decida la cifra que se publica.
 */
const CURVE_REPEATS = 9;
/** Vueltas de calentamiento por corrida. No entran en la mediana. */
const WARMUP = 1;
const ENTITIES = 100_000;

/**
 * Presupuesto de corridas por mezcla, y por qué no es el mismo para las tres.
 *
 * Una pasada del lote entero cuesta cosas muy distintas según la mezcla, MEDIDO
 * en esta máquina: `mechanical@100k` ~0,9 s, `plano-real@100k` ~24 s (7.000
 * sombreados y 14.000 INSERT que el kernel no toca) y `architecture@100k` ~143 s
 * (34.000 INSERT expandiendo su bloque; 237 millones de puntos). Con el
 * presupuesto por defecto para las tres, este benchmark pasaría de quince
 * minutos a varias horas.
 *
 * El recorte NO es un atajo, y se puede defender mezcla a mezcla:
 *
 * - `plano-real` baja a una repetición por proceso, pero mantiene los TRES
 *   procesos: la cifra citable es el suelo entre procesos, y para eso hacen
 *   falta procesos, no repeticiones dentro de uno. Conserva su calentamiento,
 *   que es lo que evita medir la compilación de V8 en vez de la etapa.
 * - `architecture` baja a una corrida, una repetición y ningún calentamiento
 *   porque su cifra publicada es un CERO POR CONSTRUCCIÓN: ninguna entidad
 *   cruza al kernel, así que lo que hay que comprobar es el alcance del
 *   enrutador y la paridad, no un tiempo. Calentar V8 para un número que el
 *   propio artefacto dice que no se cite no compra nada.
 */
const MIX_BUDGET = {
  "plano-real": { runs: 3, repeats: 1, warmup: 1 },
  architecture: { runs: 1, repeats: 1, warmup: 0 },
};

/**
 * Mezclas que NO tienen curvas de primer nivel y por qué. El artefacto las
 * publica en cero en vez de omitirlas.
 */
const ZERO_BY_CONSTRUCTION = {
  architecture:
    "La mezcla architecture no emite arco, círculo, elipse ni spline de primer " +
    "nivel: su reparto es línea, polilínea, sombreado, MTEXT, cota e INSERT. Los " +
    "arcos que un plano así tiene de verdad —el barrido de una puerta, por " +
    "ejemplo— viven DENTRO de la definición del bloque y los tesela " +
    "`insertRenderPaths` al expandir la instancia, un camino que no pasa por el " +
    "enrutador del kernel. Así que aquí el kernel no toca una sola entidad y la " +
    "ganancia es CERO por construcción, no por casualidad de la medida.",
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const round = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function environment() {
  const cpus = os.cpus();
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model?.trim() ?? "desconocida",
    logicalCpuCount: cpus.length,
    availableParallelism: os.availableParallelism?.() ?? cpus.length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    // Las tres banderas que el spec exige. No son adorno: son lo que impide
    // que este artefacto se lea como si fuera evidencia de navegador.
    measurementKind: "cpu-node",
    gpu: false,
    browser: false,
    declaredMachine:
      `${cpus[0]?.model?.trim() ?? "CPU desconocida"} (${cpus.length} hilos lógicos), ` +
      `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, ` +
      "contenedor cloud de la sesión de agente que generó el artefacto.",
    whatThisIsNot:
      "NO es una medida de navegador ni de GPU. En este contenedor no hay GPU y no hay " +
      "navegadores de Playwright (bajarlos sale por egreso denegado), así que aquí no se " +
      "puede medir ni un fotograma ni el tiempo hasta detalle completo en pantalla. Esta " +
      "cifra no sustituye a docs/cad/evidence/browser-slo-100k.json y no se compara con " +
      "ella número a número.",
  };
}

// ---------------------------------------------------------------------------
// Sonda
// ---------------------------------------------------------------------------

function resolveTsx() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("tsx/cli");
  } catch {
    // Mismo mensaje accionable que sus scripts hermanos: un MODULE_NOT_FOUND
    // crudo no le dice a nadie qué hacer.
    console.error("No se encontró tsx. Corre `npm ci` en la raíz del repo.");
    process.exit(1);
  }
}

function runProbe(tsx, mix, entities, budget, index) {
  process.stderr.write(`· ${mix}@${entities} — corrida ${index + 1}/${budget.runs}…\n`);
  const stdout = execFileSync(
    process.execPath,
    [
      tsx,
      probe,
      "--mix",
      mix,
      "--entities",
      String(entities),
      "--repeats",
      String(budget.repeats),
      "--curve-repeats",
      String(budget.curveRepeats),
      "--warmup",
      String(budget.warmup),
    ],
    {
      cwd: web,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 128 * 1024 * 1024,
      timeout: 3_600_000,
    },
  );
  return JSON.parse(stdout);
}

/** Verifica que un valor sea IDÉNTICO en todas las corridas de una mezcla. */
function invariant(probes, pick, label, discrepancies) {
  const values = probes.map((item) => JSON.stringify(pick(item)));
  if (new Set(values).size > 1) discrepancies.push(`${label}: ${values.join(" ≠ ")}`);
  return pick(probes[0]);
}

function engineOf(probeResult, engine) {
  return probeResult.runs.find((run) => run.engine === engine);
}

/**
 * Agrega las corridas de UNA mezcla.
 *
 * `stageFloor` y `curveOnlyFloor` son la PEOR corrida, no la mediana. Es la
 * misma regla que ya fija `wasm-parity.json`: en una máquina con vecinos la
 * mediana puede caer del lado favorable por suerte del planificador del sistema
 * operativo, y el mínimo por corrida no puede. Fuera de este archivo se cita el
 * suelo.
 */
export function aggregateMix(mix, entities, probes, budget = { runs: probes.length, repeats: probes[0]?.repeats ?? 0 }) {
  const discrepancies = [];
  const corpus = invariant(probes, (item) => item.corpus, "corpus", discrepancies);
  const segmentPolicy = invariant(
    probes,
    (item) => item.segmentPolicy,
    "política de segmentos",
    discrepancies,
  );
  const batchPolicy = invariant(
    probes,
    (item) => item.batchPolicy,
    "política de troceado",
    discrepancies,
  );
  const parity = invariant(
    probes,
    (item) => ({
      entitiesCompared: item.pointParity.entitiesCompared,
      mismatchedEntities: item.pointParity.mismatchedEntities,
      totalPointsJavascript: item.pointParity.totalPointsJavascript,
      totalPointsWasm: item.pointParity.totalPointsWasm,
    }),
    "paridad de puntos",
    discrepancies,
  );
  const workerGate = invariant(
    probes,
    (item) => item.workerGate,
    "puerta del worker",
    discrepancies,
  );
  // Qué binario se midió. Sin esto, el ×N publicado no está atado a ningún
  // artefacto compilado y una recompilación lo dejaría caduco en silencio.
  const kernelManifest = invariant(
    probes,
    (item) => item.kernelManifest,
    "manifiesto del kernel",
    discrepancies,
  );

  const build = (engine) => {
    const runs = probes.map((item) => engineOf(item, engine));
    const medians = runs.map((run) => run.medianMs);
    const curveMedians = runs.map((run) => run.curveOnlyMedianMs);
    return {
      engine,
      backend: runs[0].backend,
      fallbackReason: runs[0].fallbackReason,
      // El sha viaja DENTRO de cada ejecución, no sólo en el bloque `corpus`
      // de arriba: así el spec puede exigir que las dos ejecuciones midieran el
      // mismo documento sin tener que fiarse de un campo compartido.
      corpusSha256: corpus.documentSha256,
      stageMedianMsPerRun: medians.map((value) => round(value)),
      stageMedianMs: round(median(medians)),
      stageWorstMs: round(Math.max(...medians)),
      curveOnlyMedianMsPerRun: curveMedians.map((value) => round(value)),
      curveOnlyMedianMs: round(median(curveMedians)),
      pointCount: invariant(
        probes,
        (item) => engineOf(item, engine).pointCount,
        `puntos de ${engine}`,
        discrepancies,
      ),
      pathCount: invariant(
        probes,
        (item) => engineOf(item, engine).pathCount,
        `caminos de ${engine}`,
        discrepancies,
      ),
      pointCountsDigest: invariant(
        probes,
        (item) => engineOf(item, engine).pointCountsDigest,
        `huella de recuentos de ${engine}`,
        discrepancies,
      ),
      kernelEntities: runs[0].kernelEntities,
      adapterEntities: runs[0].adapterEntities,
      kernelCalls: runs[0].kernelCalls,
    };
  };

  const wasm = build("wasm");
  const javascript = build("javascript");
  const stagePerRun = probes.map((item) => item.speedup.stageMedian);
  // En una mezcla sin curvas el sublote no existe y la sonda publica `null`:
  // aquí se respeta ese null en vez de convertirlo en un cero que se leería
  // como «el kernel va infinitamente peor».
  const curvePerRun = probes
    .map((item) => item.speedup.curveOnlyMedian)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  return {
    mix,
    entities,
    budget: {
      runs: budget.runs,
      repeatsPerRun: budget.repeats,
      curveRepeatsPerRun: budget.curveRepeats,
      warmupPerRun: budget.warmup,
      note:
        wasm.kernelEntities === 0
          ? "una corrida, una repetición y ningún calentamiento bastan: aquí no se publica un " +
            "tiempo sino un cero por construcción, y lo que hay que comprobar es el alcance del " +
            "enrutador y la paridad. Una pasada de esta mezcla cuesta minutos —34.000 INSERT " +
            "expandiendo su bloque— y calentar V8 para un número que nadie va a citar no compra " +
            "nada. Por eso sus tiempos NO se citan: se publican para que se vea que se corrió."
          : `mediana de ${budget.runs} proceso(s) × ${budget.repeats} repetición(es) de la etapa ` +
            `y ${budget.curveRepeats} del sublote de curvas, alternando los dos motores, tras ` +
            `${budget.warmup} vuelta(s) de calentamiento que no cuentan. El sublote se repite más ` +
            "porque cuesta menos: repetir donde es barato es lo que impide que una pausa del " +
            "recolector decida la cifra.",
    },
    corpus,
    kernelManifest,
    segmentPolicy,
    batchPolicy,
    kernelReach: {
      kernelEntities: wasm.kernelEntities,
      adapterEntities: wasm.adapterEntities,
      kernelCalls: wasm.kernelCalls,
      curveShareOfEntities: corpus.curveShare,
      note:
        wasm.kernelEntities > 0
          ? `${wasm.kernelEntities.toLocaleString("es-MX")} entidades cruzan la frontera en ` +
            `${wasm.kernelCalls.toLocaleString("es-MX")} llamadas: arcos y elipses agrupados por ` +
            "(tipo × pasos), y una llamada por spline porque la ABI v1 no tiene lote para nudos " +
            "de longitud libre."
          : "ninguna entidad cruza la frontera en esta mezcla.",
    },
    workerGate,
    runs: [wasm, javascript],
    pointParity: {
      ...parity,
      digestsMatch: wasm.pointCountsDigest === javascript.pointCountsDigest,
      pointCountsMatch: wasm.pointCount === javascript.pointCount,
      pathCountsMatch: wasm.pathCount === javascript.pathCount,
      criterion:
        "puntos POR ENTIDAD, índice a índice, no sólo el total: dos motores pueden sumar lo " +
        "mismo repartiéndolo distinto. La huella FNV-1a de la secuencia de recuentos lo cierra.",
    },
    /**
     * Por qué la etapa gana lo que gana, y no más: la fracción del coste que
     * las curvas representan de verdad. Es lo que convierte un ×1,0 de
     * `plano-real` en un dato en vez de en una decepción.
     */
    amdahl: {
      stageMedianMsJavascript: javascript.stageMedianMs,
      stageMedianMsWasm: wasm.stageMedianMs,
      curveOnlyMedianMsJavascript: javascript.curveOnlyMedianMs,
      curveOnlyMedianMsWasm: wasm.curveOnlyMedianMs,
      curveShareOfStage:
        javascript.stageMedianMs > 0
          ? round(javascript.curveOnlyMedianMs / javascript.stageMedianMs, 4)
          : 0,
      whereTheRestIs:
        "en el carril de adaptadores: sombreados, INSERT expandiendo su definición, cotas y " +
        "polilíneas. El kernel no los toca hoy y ninguna mejora suya puede moverlos — el " +
        "siguiente cable está ahí, no en el binario.",
    },
    speedup: {
      stageMedian: round(median(stagePerRun), 3),
      stageFloor: round(Math.min(...stagePerRun), 3),
      stagePerRun: stagePerRun.map((value) => round(value, 3)),
      curveOnlyMedian: curvePerRun.length ? round(median(curvePerRun), 3) : null,
      curveOnlyFloor: curvePerRun.length ? round(Math.min(...curvePerRun), 3) : null,
      curveOnlyPerRun: curvePerRun.map((value) => round(value, 3)),
      whatToCite:
        wasm.kernelEntities > 0
          ? "stageFloor — la peor corrida de la etapa entera — es la cifra defendible fuera de " +
            "este archivo. curveOnly* dice cuánto gana el motor donde el motor trabaja, y sirve " +
            "para explicar la diferencia entre las dos, no para citarse suelta."
          : "ninguna: en esta mezcla el kernel no interviene y cualquier razón entre los dos " +
            "tiempos es ruido de la máquina, no ganancia.",
    },
    zeroByConstruction:
      wasm.kernelEntities === 0
        ? {
            declared: true,
            reason:
              ZERO_BY_CONSTRUCTION[mix] ??
              "esta mezcla no emite curvas de primer nivel, así que el kernel no interviene.",
            gain: 0,
          }
        : null,
    runToRunDiscrepancies: discrepancies,
  };
}

// ---------------------------------------------------------------------------
// Verificación del artefacto — la comparte el spec
// ---------------------------------------------------------------------------

/**
 * Comprueba que un artefacto es publicable. Devuelve las violaciones, no lanza.
 *
 * Es la MISMA función que corre `--check` y que corre el spec: un verificador
 * que sólo existe dentro del generador se prueba a sí mismo, y eso no es una
 * prueba. El spec le mete artefactos falsos —sin `environment`, con GPU
 * declarada, con las dos ejecuciones sobre corpus distintos, con ganancia y sin
 * paridad— y exige que los rechace uno a uno.
 */
export function verificarArtefacto(artifact) {
  const violations = [];
  const fail = (message) => violations.push(message);

  if (!artifact || typeof artifact !== "object") {
    return { passed: false, violations: ["el artefacto no es un objeto"] };
  }

  // --- 1. La máquina, declarada, y declarada como lo que es -----------------
  const env = artifact.environment;
  if (!env || typeof env !== "object") fail("falta el bloque `environment`");
  else {
    for (const field of ["node", "cpuModel", "logicalCpuCount", "platform", "declaredMachine"])
      if (env[field] === undefined || env[field] === null || env[field] === "")
        fail(`environment.${field} falta o está vacío`);
    if (typeof env.declaredMachine === "string" && env.declaredMachine.trim().length < 20)
      fail("environment.declaredMachine no describe la máquina");
    // Estas tres son la frontera del artefacto: aquí no hay GPU ni navegador y
    // un fichero que dijera lo contrario estaría mintiendo por construcción.
    if (env.gpu !== false) fail("environment.gpu debe ser false: esta medida es CPU en Node");
    if (env.browser !== false)
      fail("environment.browser debe ser false: aquí no hay navegador que medir");
    if (env.measurementKind !== "cpu-node")
      fail(`environment.measurementKind debe ser "cpu-node", no ${JSON.stringify(env.measurementKind)}`);
  }

  // --- 1-bis. Qué binario se midió ------------------------------------------
  const kernel = artifact.kernel;
  if (!kernel || typeof kernel !== "object") fail("falta el bloque `kernel`: no se sabe qué binario se midió");
  else {
    if (typeof kernel.binarySha256 !== "string" || kernel.binarySha256.length !== 64)
      fail("kernel.binarySha256 falta o no es un sha256 de 64 caracteres");
    if (!Number.isInteger(kernel.abi)) fail("kernel.abi falta o no es un entero");
  }

  // --- 2. Las mediciones ----------------------------------------------------
  const measurements = artifact.measurements;
  if (!Array.isArray(measurements) || measurements.length === 0) {
    fail("el artefacto no trae mediciones");
    return { passed: false, violations };
  }

  for (const measurement of measurements) {
    const label = `${measurement.mix}@${measurement.entities}`;

    // 2.a Las DOS ejecuciones, sobre el mismo corpus y el mismo sha.
    const runs = Array.isArray(measurement.runs) ? measurement.runs : [];
    const wasm = runs.find((run) => run.engine === "wasm");
    const javascript = runs.find((run) => run.engine === "javascript");
    if (runs.length !== 2 || !wasm || !javascript) {
      fail(`${label}: se exigen DOS ejecuciones, una por motor (wasm y javascript)`);
      continue;
    }
    if (wasm.backend !== "wasm")
      fail(`${label}: la ejecución wasm cayó al motor ${wasm.backend} (${wasm.fallbackReason})`);
    if (javascript.backend !== "javascript")
      fail(`${label}: la ejecución javascript declara el motor ${javascript.backend}`);
    const sha = measurement.corpus?.documentSha256;
    if (!sha || typeof sha !== "string" || sha.length !== 64)
      fail(`${label}: el corpus no declara un sha256 de 64 caracteres`);
    if (measurement.corpus?.matchesManifest !== true)
      fail(`${label}: el corpus medido no es el que declara corpus-mixes-manifest.json`);
    if (wasm.corpusSha256 !== sha || javascript.corpusSha256 !== sha)
      fail(
        `${label}: las dos ejecuciones no declaran el mismo sha de corpus ` +
          `(wasm ${wasm.corpusSha256}, javascript ${javascript.corpusSha256}, corpus ${sha})`,
      );

    // 2.b La paridad de puntos. Sin esto no se publica ninguna ganancia.
    const parity = measurement.pointParity ?? {};
    if (parity.mismatchedEntities !== 0)
      fail(`${label}: ${parity.mismatchedEntities} entidad(es) con distinto recuento de puntos`);
    if (!(parity.entitiesCompared > 0))
      fail(`${label}: la paridad no comparó ninguna entidad`);
    if (wasm.pointCount !== javascript.pointCount)
      fail(
        `${label}: los motores no coinciden en el total de puntos ` +
          `(wasm ${wasm.pointCount} ≠ javascript ${javascript.pointCount})`,
      );
    if (wasm.pathCount !== javascript.pathCount)
      fail(
        `${label}: los motores no coinciden en el número de caminos ` +
          `(wasm ${wasm.pathCount} ≠ javascript ${javascript.pathCount})`,
      );
    if (wasm.pointCountsDigest !== javascript.pointCountsDigest)
      fail(
        `${label}: la huella de recuentos por entidad difiere entre motores ` +
          `(${wasm.pointCountsDigest} ≠ ${javascript.pointCountsDigest})`,
      );

    // 2.c La puerta del worker: lo cronometrado es el camino del producto.
    if (measurement.workerGate?.sameCountsAsTimedFunction !== true)
      fail(`${label}: no se comprobó que lo cronometrado sea el camino del worker`);

    // 2.d Cero por construcción: se declara, no se calla y no se disfraza.
    const kernelEntities = wasm.kernelEntities;
    if (kernelEntities === 0) {
      if (!measurement.zeroByConstruction?.declared)
        fail(
          `${label}: el kernel no tocó ninguna entidad y el artefacto no lo declara ` +
            "como cero por construcción",
        );
      if (
        measurement.zeroByConstruction?.reason === undefined ||
        String(measurement.zeroByConstruction?.reason ?? "").trim().length < 40
      )
        fail(`${label}: el cero por construcción se publica sin explicar por qué`);
    } else if (measurement.zeroByConstruction) {
      fail(
        `${label}: se declara cero por construcción pero ${kernelEntities} entidades cruzaron ` +
          "la frontera",
      );
    }

    // 2.e Discrepancias entre procesos: si el corpus no es reproducible, la
    //     comparación no compara lo mismo dos veces.
    if ((measurement.runToRunDiscrepancies ?? []).length > 0)
      for (const discrepancy of measurement.runToRunDiscrepancies)
        fail(`${label}: corridas no reproducibles — ${discrepancy}`);
  }

  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

function parseCli(argv) {
  const options = {
    check: argv.includes("--check"),
    mixes: BENCH_MIXES,
    entities: ENTITIES,
    runs: RUNS,
    repeats: REPEATS,
    curveRepeats: CURVE_REPEATS,
    warmup: WARMUP,
    explicitBudget: false,
    output: EVIDENCE_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mix") options.mixes = [argv[++index]];
    else if (argument === "--entities") options.entities = Number.parseInt(argv[++index], 10);
    else if (argument === "--runs") {
      options.runs = Number.parseInt(argv[++index], 10);
      options.explicitBudget = true;
    } else if (argument === "--repeats") {
      options.repeats = Number.parseInt(argv[++index], 10);
      options.explicitBudget = true;
    } else if (argument === "--curve-repeats") {
      options.curveRepeats = Number.parseInt(argv[++index], 10);
      options.explicitBudget = true;
    } else if (argument === "--warmup") {
      options.warmup = Number.parseInt(argv[++index], 10);
      options.explicitBudget = true;
    } else if (argument === "--output")
      options.output = path.resolve(root, argv[++index]);
    else if (argument !== "--check") throw new Error(`Argumento desconocido: ${argument}`);
  }
  return options;
}

export function buildEvidence({ startedAt, finishedAt, measurements, method }) {
  const withKernel = measurements.filter((item) => !item.zeroByConstruction);
  const headline = withKernel.length
    ? {
        statement:
          withKernel
            .map(
              (item) =>
                `${item.mix}@${item.entities}: ×${item.speedup.stageFloor} en la etapa entera ` +
                `(×${item.speedup.curveOnlyFloor} sobre el sublote de curvas, que es el ` +
                `${(item.amdahl.curveShareOfStage * 100).toFixed(1)} % del coste de la etapa)`,
            )
            .join(" · ") + ".",
        whatToCite:
          "el SUELO por mezcla (`speedup.stageFloor`), con la máquina declarada al lado. Nunca " +
          "la mediana suelta y nunca la cifra de `wasm-parity.json`, que mide el motor en " +
          "aislado sobre un lote sintético y no lo que el producto ahorra.",
        whyTheNumbersDiffer:
          "porque la ganancia de la etapa es la del motor MULTIPLICADA por la fracción de la " +
          "etapa que el motor toca, y esa fracción la fija la MEZCLA, no el kernel. Ver " +
          "`measurements[].amdahl`: donde las curvas son la mayor parte del trabajo la etapa " +
          "mejora, y donde son una minoría el binario no puede mover lo que no calcula. Publicar " +
          "sólo la mezcla favorable sería elegir la cifra.",
      }
    : {
        statement: "ninguna mezcla medida tiene curvas de primer nivel: no hay ganancia que citar.",
        whatToCite: "nada.",
      };

  const kernel = measurements.find((item) => item.kernelManifest)?.kernelManifest ?? null;
  const evidence = {
    $schema: "urn:valle-design:schema:cad-curve-kernel-render-evidence:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-curve-kernel-render-100k-v1",
    startedAt,
    finishedAt,
    question:
      "Con el kernel de curvas cableado al teselado del render, ¿cuánto ahorra el binario " +
      "frente al motor JavaScript sobre el corpus del producto, por la función que el worker " +
      "ejecuta de verdad?",
    enforcement: "gate-en-spec sobre la PARIDAD y la frontera; report-only en los tiempos",
    enforcementRationale:
      "La paridad de puntos SÍ bloquea: `scripts/perf/curve-kernel-render-bench.spec.mjs` " +
      "rechaza el artefacto si los dos motores no devuelven exactamente el mismo recuento por " +
      "entidad, y la sonda ni siquiera llega a publicar en ese caso. Los TIEMPOS no fijan " +
      "presupuesto: están medidos en un contenedor cloud compartido, y convertirlos en umbral " +
      "produciría un gate que falla por contención de máquina y no por una regresión del " +
      "producto. Se publica el suelo por corrida para que la cifra citable sea la defendible.",
    verdict: { passed: true, violations: [] },
    environment: environment(),
    kernel: kernel
      ? {
          ...kernel,
          rebuildWith: "node scripts/wasm/build-kernel.mjs",
          verifyWith: "node scripts/wasm/build-kernel.mjs --check",
          note:
            "el binario que produjo estas cifras, por su sha256. Si el crate se recompila, este " +
            "artefacto queda caduco y hay que regenerarlo: el spec lo comprueba contra " +
            "crates/valle-cad-kernel/kernel-manifest.json y falla si se han separado.",
        }
      : null,
    method,
    headline,
    measurements,
    scope: {
      measured: [
        "el tiempo de la etapa de teselado del render sobre el corpus entero, con cada motor",
        "el mismo tiempo restringido al sublote de curvas, que es el numerador de Amdahl",
        "que los dos motores devuelven el MISMO número de puntos por entidad",
        "que lo cronometrado es el cuerpo de `tessellateCadEntityBatch`, la puerta del worker",
        "que el corpus medido es el que declara `corpus-mixes-manifest.json` (sha256)",
      ],
      notMeasured: [
        "fotogramas, fps o tiempo hasta detalle completo: eso es navegador y aquí no hay",
        "GPU: este contenedor no tiene",
        "el resto del pipeline (índice espacial, subida por lotes, atlas de texto): esta medida " +
          "es la etapa de teselado y sólo ella",
        "la ganancia dentro de las definiciones de bloque, que hoy no pasan por el enrutador",
      ],
    },
  };

  const verdict = verificarArtefacto(evidence);
  evidence.verdict = verdict;
  return evidence;
}

function main() {
  const options = parseCli(process.argv.slice(2));

  if (options.check) {
    if (!fs.existsSync(options.output)) {
      console.error(
        `No existe ${path.relative(root, options.output)}. Genéralo con ` +
          "`node scripts/perf/curve-kernel-render-bench.mjs`.",
      );
      process.exit(1);
    }
    const artifact = JSON.parse(fs.readFileSync(options.output, "utf8"));
    const verdict = verificarArtefacto(artifact);
    console.log(
      `${path.relative(root, options.output)}: ${
        verdict.passed ? "PASA" : `FALLA — ${verdict.violations.join("; ")}`
      }`,
    );
    if (!verdict.passed) process.exitCode = 1;
    return;
  }

  const tsx = resolveTsx();
  const startedAt = new Date().toISOString();
  const measurements = [];
  for (const mix of options.mixes) {
    const budget = options.explicitBudget
      ? {
          runs: options.runs,
          repeats: options.repeats,
          curveRepeats: options.curveRepeats,
          warmup: options.warmup,
        }
      : {
          runs: MIX_BUDGET[mix]?.runs ?? options.runs,
          repeats: MIX_BUDGET[mix]?.repeats ?? options.repeats,
          curveRepeats: MIX_BUDGET[mix]?.curveRepeats ?? options.curveRepeats,
          warmup: MIX_BUDGET[mix]?.warmup ?? options.warmup,
        };
    const probes = [];
    for (let index = 0; index < budget.runs; index += 1)
      probes.push(runProbe(tsx, mix, options.entities, budget, index));
    measurements.push(aggregateMix(mix, options.entities, probes, budget));
  }
  const finishedAt = new Date().toISOString();

  const first = measurements[0];
  const method = {
    defaultRuns: options.runs,
    defaultRepeatsPerRun: options.repeats,
    defaultCurveRepeatsPerRun: options.curveRepeats,
    defaultWarmupPerRun: options.warmup,
    aggregation:
      `por defecto, mediana de ${options.runs} corridas en PROCESOS SEPARADOS y, dentro de cada ` +
      `una, mediana de ${options.repeats} repeticiones de la etapa y ${options.curveRepeats} del ` +
      "sublote de curvas, alternando los dos motores. Los campos `default*` de este bloque son " +
      "sólo eso, el defecto: el presupuesto REAL de cada mezcla viaja en `measurements[].budget` " +
      "y dice por qué es el que es. Una mezcla cuya pasada cuesta minutos lleva menos " +
      "repeticiones, y la que se publica en cero lleva el mínimo.",
    whyAlternated:
      "medir «N veces JavaScript y luego N veces wasm» le regala al segundo motor un montón ya " +
      "crecido y unas cachés de CPU calientes con este corpus. Alternando, la mediana de cada " +
      "motor sale de repeticiones que vieron el mismo estado de la máquina.",
    whySeparateProcesses:
      "repetir en caliente dentro del mismo proceso mide un JIT ya especializado sobre este " +
      "corpus concreto, que es justo lo que NO le pasa al navegador de un arquitecto abriendo " +
      "un plano.",
    generator: "scripts/perf/curve-kernel-render-bench.mjs",
    probe: "scripts/perf/curve-kernel-render-probe.mts",
    timedFunction:
      "apps/web/src/lib/cad/render/curve-kernel-tessellation.ts · " +
      "tessellateCadEntitiesWithCurveKernel",
    workerEntryPoint:
      "apps/web/src/lib/cad/render/tessellate.worker.ts · tessellateCadEntityBatch, cuyo cuerpo " +
      "es exactamente la función cronometrada. La sonda lo comprueba llamando a la puerta y " +
      "exigiendo los mismos recuentos antes de publicar.",
    engineInjection:
      "el kernel se pasa por parámetro y NO con setCadRenderCurveKernel, porque ese instalador " +
      "libera el kernel anterior al cambiarlo: alternar motores por ahí liberaría el binario en " +
      "la primera vuelta.",
    segmentPolicy: first?.segmentPolicy ?? null,
    batchPolicy: first?.batchPolicy ?? null,
    rebuildKernelWith: "node scripts/wasm/build-kernel.mjs",
    verifyKernelWith: "node scripts/wasm/build-kernel.mjs --check",
    everyNumberReadFrom:
      "la ejecución de la etapa de teselado del render con cada motor, cronometrada con " +
      "performance.now() y con el recuento de puntos hecho FUERA de la ventana medida.",
  };

  const evidence = buildEvidence({ startedAt, finishedAt, measurements, method });

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Publicado ${path.relative(root, options.output).replaceAll(path.sep, "/")}`);
  for (const measurement of measurements) {
    const wasm = measurement.runs[0];
    const javascript = measurement.runs[1];
    if (measurement.zeroByConstruction) {
      console.log(
        `  ${measurement.mix}@${measurement.entities}: CERO por construcción — ninguna curva de ` +
          "primer nivel cruza al kernel",
      );
      continue;
    }
    console.log(
      `  ${measurement.mix}@${measurement.entities}: etapa JS ${javascript.stageMedianMs} ms · ` +
        `wasm ${wasm.stageMedianMs} ms · ×${measurement.speedup.stageMedian} mediana, ` +
        `×${measurement.speedup.stageFloor} en la peor corrida · sublote de curvas ` +
        `×${measurement.speedup.curveOnlyFloor} · paridad ${javascript.pointCount.toLocaleString(
          "es-MX",
        )} puntos idénticos`,
    );
  }
  console.log(
    `  veredicto: ${
      evidence.verdict.passed ? "PASA" : `FALLA — ${evidence.verdict.violations.join("; ")}`
    }`,
  );
  if (!evidence.verdict.passed) process.exitCode = 1;
}

// Sólo corre cuando se invoca como programa: el spec importa este módulo para
// ejercitar `verificarArtefacto` y no debe disparar una medición de minutos.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
