#!/usr/bin/env node
/**
 * El CONTRATO del artefacto de ganancia del kernel: qué tiene que declarar un
 * `docs/cad/evidence/curve-kernel-render-100k.json` para ser publicable.
 *
 * ## Por qué vive aparte del generador
 *
 * Porque son dos cosas distintas y se leen en momentos distintos. El generador
 * es maquinaria: lanza sondas, agrega medianas, escribe el fichero. Esto es la
 * REGLA por la que ese fichero se acepta o se rechaza, y tiene que poder leerse
 * —y probarse— sin abrir el benchmark. Un verificador enterrado dentro del
 * programa que produce lo verificado invita a que los dos se muevan juntos y a
 * que nadie note que la regla se aflojó para que el número pasara.
 *
 * Lo importan los tres: el generador (para poner su propio veredicto dentro del
 * artefacto), `--check` (para releer el publicado) y el spec (que además le mete
 * artefactos rotos a propósito y exige que los rechace uno a uno).
 *
 * ## Las cinco cosas que se exigen, y de qué fallo protege cada una
 *
 * 1. **La máquina, declarada**, y declarada como lo que es: CPU en Node, sin GPU
 *    y sin navegador. Una cifra de CPU leída como si fuera de fotogramas es el
 *    error que la regla 4 de la matriz competitiva vino a impedir.
 * 2. **Qué binario se midió**, por su sha256. Sin eso el ×N no está atado a nada
 *    compilado y una recompilación lo deja caduco en silencio.
 * 3. **Las dos ejecuciones, sobre el mismo corpus y el mismo sha.** Dos motores
 *    medidos sobre documentos distintos no se comparan.
 * 4. **La paridad de puntos, exacta.** Es la importante: una etapa que va más
 *    rápido porque dibuja menos puntos no es una optimización, es un plano mal
 *    dibujado. Un artefacto con ganancia y sin paridad se rechaza.
 * 5. **El cero por construcción, declarado y explicado.** Una mezcla donde el
 *    kernel no interviene se publica en cero con su razón; omitirla sería elegir
 *    la cifra favorable, y publicarla como si hubiera ganancia sería inventarla.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const EVIDENCE_FILE = path.join(
  root,
  "docs/cad/evidence/curve-kernel-render-100k.json",
);

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
