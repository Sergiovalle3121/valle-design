#!/usr/bin/env node
/**
 * Spec del artefacto de ganancia del kernel en el render.
 *
 * ## Qué protege, y de qué fallo concreto
 *
 * Un benchmark que compara dos motores tiene una forma de fallar que no se ve
 * en su salida: **ir más rápido haciendo menos trabajo**. Si el binario
 * devolviera un punto menos por curva, el reloj bajaría, el ×N subiría y el
 * artefacto se leería como una victoria. Sería un plano mal dibujado publicado
 * como una optimización. Por eso aquí la paridad no es una comprobación más:
 * es la condición sin la cual la ganancia no se publica.
 *
 * ## Por qué se prueban las DOS direcciones
 *
 * Comprobar sólo que el artefacto de hoy pasa es la trampa de siempre: un
 * verificador que siempre dijera «pasa» también lo haría. Así que el spec
 * fabrica artefactos rotos —sin `environment`, declarando GPU, con las dos
 * ejecuciones sobre corpus distintos, con ganancia y con los recuentos
 * descuadrados— y exige que cada uno sea RECHAZADO por su motivo. Sólo después
 * se lee el fichero publicado.
 *
 * ## Por qué exige que NO sea GPU ni navegador
 *
 * Porque el generador corre en un contenedor sin GPU y sin navegadores de
 * Playwright, y una cifra de CPU en Node leída como si fuera de navegador es
 * exactamente el error que la regla 4 de la matriz competitiva vino a impedir.
 * Un artefacto salido de aquí que declarara `gpu: true` estaría mintiendo por
 * construcción, así que el spec lo rechaza aunque todo lo demás cuadre.
 *
 *   node scripts/perf/curve-kernel-render-bench.spec.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BENCH_MIXES,
  EVIDENCE_FILE,
  median,
  verificarArtefacto,
} from "./curve-kernel-render-bench.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

/** Rechaza, y por el motivo que toca: un rechazo por otra cosa no vale. */
const rechaza = (artifact, patron, message) => {
  const verdict = verificarArtefacto(artifact);
  assert.ok(!verdict.passed, `${message} — pero el verificador lo aceptó`);
  assert.ok(
    verdict.violations.some((violation) => patron.test(violation)),
    `${message} — rechazado, pero por otra razón: ${verdict.violations.join("; ")}`,
  );
  checks += 1;
};

const clonar = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// Un artefacto sintético válido, del que salen todos los rotos
// ---------------------------------------------------------------------------

const SHA = "a".repeat(64);

const artefactoValido = () => ({
  kernel: { abi: 1, binarySha256: "0".repeat(64), binaryBytes: 29_258 },
  environment: {
    node: "v22.22.2",
    platform: "linux",
    cpuModel: "Intel(R) Xeon(R) Processor @ 2.10GHz",
    logicalCpuCount: 4,
    measurementKind: "cpu-node",
    gpu: false,
    browser: false,
    declaredMachine: "Xeon de 4 hilos, 15,7 GB de RAM, contenedor cloud de la sesión.",
  },
  measurements: [
    {
      mix: "mechanical",
      entities: 100_000,
      corpus: { documentSha256: SHA, matchesManifest: true },
      workerGate: { sameCountsAsTimedFunction: true },
      runs: [
        {
          engine: "wasm",
          backend: "wasm",
          fallbackReason: null,
          corpusSha256: SHA,
          pointCount: 2_315_764,
          pathCount: 100_000,
          pointCountsDigest: "deadbeef",
          kernelEntities: 70_000,
          adapterEntities: 30_000,
          kernelCalls: 14_006,
          stageMedianMs: 600,
        },
        {
          engine: "javascript",
          backend: "javascript",
          fallbackReason: null,
          corpusSha256: SHA,
          pointCount: 2_315_764,
          pathCount: 100_000,
          pointCountsDigest: "deadbeef",
          kernelEntities: 70_000,
          adapterEntities: 30_000,
          kernelCalls: 14_006,
          stageMedianMs: 860,
        },
      ],
      pointParity: { entitiesCompared: 100_000, mismatchedEntities: 0 },
      speedup: { stageMedian: 1.43, stageFloor: 1.35 },
      zeroByConstruction: null,
      runToRunDiscrepancies: [],
    },
  ],
});

// --- 0. control positivo: el sintético válido pasa --------------------------
{
  const verdict = verificarArtefacto(artefactoValido());
  ok(
    verdict.passed,
    `el artefacto sintético válido debe pasar: ${verdict.violations.join("; ")}`,
  );
}

// --- 1. la máquina, declarada ----------------------------------------------
{
  const sinEntorno = artefactoValido();
  delete sinEntorno.environment;
  rechaza(sinEntorno, /environment/i, "un artefacto sin `environment` no dice en qué máquina midió");

  for (const campo of ["node", "cpuModel", "logicalCpuCount", "declaredMachine"]) {
    const roto = artefactoValido();
    delete roto.environment[campo];
    rechaza(roto, new RegExp(campo, "i"), `falta environment.${campo}`);
  }

  const maquinaVaga = artefactoValido();
  maquinaVaga.environment.declaredMachine = "una máquina";
  rechaza(maquinaVaga, /declaredMachine/, "«una máquina» no es declarar la máquina");
}

// --- 1-bis. qué binario se midió -------------------------------------------
{
  const sinKernel = artefactoValido();
  delete sinKernel.kernel;
  rechaza(sinKernel, /kernel/, "sin el binario declarado, el ×N no está atado a nada compilado");

  const shaCorto = artefactoValido();
  shaCorto.kernel.binarySha256 = "abc";
  rechaza(shaCorto, /binarySha256/, "el binario se identifica por su sha256 completo");

  const sinAbi = artefactoValido();
  delete sinAbi.kernel.abi;
  rechaza(sinAbi, /kernel.abi/, "la ABI medida es parte de qué se midió");
}

// --- 2. ni GPU ni navegador -------------------------------------------------
// Éste es el que impide que una cifra de CPU en Node se lea como si fuera de
// navegador. El generador no puede medir ninguna de las dos cosas aquí.
{
  const conGpu = artefactoValido();
  conGpu.environment.gpu = true;
  rechaza(conGpu, /gpu/i, "un artefacto de este generador no puede declarar GPU");

  const conNavegador = artefactoValido();
  conNavegador.environment.browser = true;
  rechaza(conNavegador, /browser/i, "un artefacto de este generador no puede declarar navegador");

  const otroTipo = artefactoValido();
  otroTipo.environment.measurementKind = "browser-frame";
  rechaza(otroTipo, /measurementKind/, "el tipo de medida sólo puede ser cpu-node");
}

// --- 3. las DOS ejecuciones, sobre el mismo corpus y el mismo sha -----------
{
  const unaSola = artefactoValido();
  unaSola.measurements[0].runs = [unaSola.measurements[0].runs[0]];
  rechaza(unaSola, /DOS ejecuciones/, "una sola ejecución no compara nada");

  const shaDistinto = artefactoValido();
  shaDistinto.measurements[0].runs[1].corpusSha256 = "b".repeat(64);
  rechaza(
    shaDistinto,
    /mismo sha de corpus/,
    "dos ejecuciones sobre corpus distintos no son comparables",
  );

  const fueraDeManifiesto = artefactoValido();
  fueraDeManifiesto.measurements[0].corpus.matchesManifest = false;
  rechaza(
    fueraDeManifiesto,
    /corpus-mixes-manifest/,
    "un corpus que no es el versionado invalida la comparación",
  );

  const sinSha = artefactoValido();
  sinSha.measurements[0].corpus.documentSha256 = "corto";
  rechaza(sinSha, /sha256/, "el corpus tiene que traer su sha256 completo");

  const caidoAlFallback = artefactoValido();
  caidoAlFallback.measurements[0].runs[0].backend = "javascript";
  caidoAlFallback.measurements[0].runs[0].fallbackReason = "no bajó el binario";
  rechaza(
    caidoAlFallback,
    /cayó al motor/,
    "si la ejecución «wasm» corrió en JavaScript, se está comparando el motor consigo mismo",
  );
}

// --- 4. GANANCIA SIN PARIDAD: el fallo que este artefacto existe para cerrar -
{
  const menosPuntos = artefactoValido();
  menosPuntos.measurements[0].speedup = { stageMedian: 3.2, stageFloor: 3.0 };
  menosPuntos.measurements[0].runs[0].pointCount = 2_100_000;
  rechaza(
    menosPuntos,
    /total de puntos/,
    "×3 dibujando 200.000 puntos menos no es una optimización, es un plano mal dibujado",
  );

  const menosCaminos = artefactoValido();
  menosCaminos.measurements[0].runs[0].pathCount = 99_000;
  rechaza(menosCaminos, /número de caminos/, "perder mil caminos tampoco es ir más rápido");

  const huellaDistinta = artefactoValido();
  huellaDistinta.measurements[0].runs[0].pointCountsDigest = "0badcafe";
  rechaza(
    huellaDistinta,
    /huella de recuentos/,
    "mismo total y distinto reparto por entidad es geometría movida de sitio",
  );

  const descuadre = artefactoValido();
  descuadre.measurements[0].pointParity.mismatchedEntities = 3;
  rechaza(descuadre, /distinto recuento de puntos/, "tres entidades descuadradas bastan");

  const sinComparar = artefactoValido();
  sinComparar.measurements[0].pointParity.entitiesCompared = 0;
  rechaza(sinComparar, /no comparó/, "una paridad que no comparó nada es una paridad vacía");
}

// --- 5. lo cronometrado es el camino del worker -----------------------------
{
  const sinPuerta = artefactoValido();
  sinPuerta.measurements[0].workerGate.sameCountsAsTimedFunction = false;
  rechaza(
    sinPuerta,
    /camino del worker/,
    "medir una función que se PARECE a la del producto no es evidencia",
  );
}

// --- 6. el cero por construcción se declara, no se calla --------------------
{
  const ceroCallado = artefactoValido();
  for (const run of ceroCallado.measurements[0].runs) {
    run.kernelEntities = 0;
    run.kernelCalls = 0;
    run.adapterEntities = 100_000;
  }
  rechaza(
    ceroCallado,
    /cero por construcción/,
    "una mezcla donde el kernel no interviene no puede publicarse como si interviniera",
  );

  const ceroSinRazon = clonar(ceroCallado);
  ceroSinRazon.measurements[0].zeroByConstruction = { declared: true, reason: "porque sí", gain: 0 };
  rechaza(ceroSinRazon, /sin explicar/, "«porque sí» no es una razón publicable");

  const ceroBienDeclarado = clonar(ceroCallado);
  ceroBienDeclarado.measurements[0].zeroByConstruction = {
    declared: true,
    reason:
      "la mezcla no emite arco, círculo, elipse ni spline de primer nivel; sus curvas viven " +
      "dentro de las definiciones de bloque y las tesela insertRenderPaths.",
    gain: 0,
  };
  const verdict = verificarArtefacto(ceroBienDeclarado);
  ok(verdict.passed, `el cero declarado con su razón debe pasar: ${verdict.violations.join("; ")}`);

  const ceroFalso = artefactoValido();
  ceroFalso.measurements[0].zeroByConstruction = { declared: true, reason: "x".repeat(60), gain: 0 };
  rechaza(
    ceroFalso,
    /cruzaron la frontera/,
    "declarar cero con 70.000 curvas cruzando sería esconder la medida",
  );
}

// --- 7. corridas no reproducibles ------------------------------------------
{
  const inestable = artefactoValido();
  inestable.measurements[0].runToRunDiscrepancies = ["corpus: {\"a\":1} ≠ {\"a\":2}"];
  rechaza(inestable, /no reproducibles/, "si el corpus cambia entre procesos, no se midió lo mismo");
}

// --- 8. sin mediciones no hay artefacto ------------------------------------
{
  const vacio = artefactoValido();
  vacio.measurements = [];
  rechaza(vacio, /no trae mediciones/, "un artefacto sin mediciones no es evidencia de nada");
}

// --- 9. la mediana es mediana ----------------------------------------------
{
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([9, 1, 2, 8, 3]), 3);
  checks += 1;
}

// --- 10. y ahora sí: el artefacto PUBLICADO --------------------------------
{
  ok(
    fs.existsSync(EVIDENCE_FILE),
    `debe existir ${EVIDENCE_FILE}: genéralo con ` +
      "`node scripts/perf/curve-kernel-render-bench.mjs`",
  );
  const publicado = JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf8"));
  const verdict = verificarArtefacto(publicado);
  ok(
    verdict.passed,
    `el artefacto publicado debe pasar el mismo verificador: ${verdict.violations.join("; ")}`,
  );
  ok(
    publicado.verdict?.passed === true,
    "el artefacto tiene que traer su propio veredicto en verde, no sólo pasar al releerlo",
  );

  // El artefacto tiene que estar atado al binario QUE HAY EN EL ÁRBOL. Si el
  // crate se recompila, la ganancia publicada pasa a describir otro binario y
  // este spec lo dice en vez de dejar que la cifra envejezca en silencio.
  const manifiestoKernel = JSON.parse(
    fs.readFileSync(
      path.resolve(EVIDENCE_FILE, "../../../..", "crates/valle-cad-kernel/kernel-manifest.json"),
      "utf8",
    ),
  );
  ok(
    publicado.kernel.binarySha256 === manifiestoKernel.binary.sha256,
    `el artefacto midió el binario ${String(publicado.kernel.binarySha256).slice(0, 12)}… y el ` +
      `árbol tiene ${String(manifiestoKernel.binary.sha256).slice(0, 12)}…: regenera con ` +
      "`node scripts/perf/curve-kernel-render-bench.mjs`",
  );
  ok(
    publicado.kernel.abi === manifiestoKernel.abi,
    `la ABI del artefacto (${publicado.kernel.abi}) no es la del manifiesto (${manifiestoKernel.abi})`,
  );

  const medidas = new Map(publicado.measurements.map((item) => [item.mix, item]));
  for (const mix of BENCH_MIXES)
    ok(medidas.has(mix), `el artefacto debe publicar ${mix}: callar una mezcla es elegir la cifra`);

  // Las dos mezclas con trabajo traen ganancia MEDIDA, sea cual sea.
  for (const mix of ["mechanical", "plano-real"]) {
    const medida = medidas.get(mix);
    ok(medida.runs[0].kernelEntities > 0, `${mix}: alguna curva tiene que cruzar al kernel`);
    ok(
      Number.isFinite(medida.speedup.stageFloor) && medida.speedup.stageFloor > 0,
      `${mix}: el suelo del ×N tiene que ser un número, llegue o no llegue`,
    );
    ok(
      medida.speedup.stageFloor <= medida.speedup.stageMedian + 1e-9,
      `${mix}: el suelo no puede ser mayor que la mediana`,
    );
    // La ganancia de la etapa sin la fracción que el kernel toca es una cifra
    // sin explicación: un ×1,0 se leería como «el kernel no sirve» cuando lo
    // que dice es «aquí las curvas son el 0,2 % del trabajo».
    const share = medida.amdahl?.curveShareOfStage;
    ok(
      Number.isFinite(share) && share > 0 && share <= 1,
      `${mix}: el artefacto tiene que publicar qué fracción de la etapa tocan las curvas`,
    );
  }

  // Y la que no lo tiene se publica en cero, con su razón.
  const arquitectura = medidas.get("architecture");
  ok(
    arquitectura.runs[0].kernelEntities === 0 && arquitectura.zeroByConstruction?.declared === true,
    "architecture se publica en cero por construcción, no se omite",
  );

  // El artefacto no puede colar un claim que el producto no cumple.
  //
  // Se busca por CLAVES y no por texto a propósito: el artefacto menciona
  // «fps» y «GPU» en prosa justamente para declarar que NO los mide, y un
  // `doesNotMatch` sobre el JSON entero castigaría la honestidad y dejaría
  // pasar un campo `browserFrameMs` metido en silencio. Lo que no puede haber
  // es un DATO de navegador, que es lo que un lector citaría.
  const clavesProhibidas = /^(fps|frameMs|browserFrameMs|gpuModel|framesTo[A-Z]|renderer)/;
  const buscarClaveDeNavegador = (value, ruta) => {
    if (!value || typeof value !== "object") return null;
    for (const [clave, hijo] of Object.entries(value)) {
      if (clavesProhibidas.test(clave)) return `${ruta}.${clave}`;
      const hallazgo = buscarClaveDeNavegador(hijo, `${ruta}.${clave}`);
      if (hallazgo) return hallazgo;
    }
    return null;
  };
  // Control de que el rastreo muerde: si no, sería un `null` con aspecto de gate.
  ok(
    buscarClaveDeNavegador({ measurements: [{ browserFrameMs: 1159.5 }] }, "falso") !== null,
    "el rastreo tiene que encontrar un dato de navegador cuando lo hay",
  );
  const hallazgo = buscarClaveDeNavegador(publicado, "artefacto");
  ok(
    hallazgo === null,
    `${hallazgo}: una medida de CPU en Node no puede publicar un dato de navegador`,
  );

  console.log(
    `curve-kernel-render-bench: ${checks} comprobaciones — ` +
      `${path.basename(EVIDENCE_FILE)} declara máquina sin GPU ni navegador, sus dos ejecuciones ` +
      `miden el mismo corpus (sha ${String(medidas.get("mechanical").corpus.documentSha256).slice(0, 12)}…) ` +
      `y coinciden punto a punto; ganancia publicada mechanical ×${
        medidas.get("mechanical").speedup.stageFloor
      } y plano-real ×${medidas.get("plano-real").speedup.stageFloor} en la peor corrida, ` +
      "architecture en cero por construcción.",
  );
}
