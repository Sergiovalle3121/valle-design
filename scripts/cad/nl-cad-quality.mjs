#!/usr/bin/env node
/**
 * Banco de calidad NL→CAD — mide y publica.
 *
 * ## Por qué existe
 *
 * El producto acepta instrucciones en español y produce geometría. Esa frase
 * estaba en la rúbrica desde el principio y NADIE la había medido nunca: no
 * había una cifra que decir cuando un despacho pregunta «¿de verdad me entiende
 * si le dicto?». Este script la produce, y la produce entera —también la mitad
 * incómoda.
 *
 * ## Las dos mitades, y por qué la segunda pesa más
 *
 * El corpus de despacho mide si entiende cómo se habla en obra en México. El
 * corpus adversarial mide si sabe DECIR QUE NO a lo que no se puede ejecutar:
 * lo ambiguo, lo contradictorio, lo geométricamente imposible, las unidades
 * irreconciliables y las cantidades absurdas.
 *
 * La segunda importa más porque el fallo que cuesta dinero no es el rechazo —el
 * arquitecto lo ve y reescribe— sino el resultado plausible y equivocado: un
 * muro de 15 mm donde se dictó uno de 15 cm se ve bien en pantalla, viaja al
 * DXF y se descubre en la obra. Por eso el artefacto publica `graveRate` como
 * cifra de cabecera, y por eso la regla de la casa dice que debe ser cero.
 *
 * ## La regla de este script
 *
 * Publica lo que mide. No hay bandera para ocultar casos, ni para reintentar
 * los que fallan, ni para excluir familias. Si la nota baja, la nota baja: un
 * fallo medido vale más que un verde inventado.
 *
 * ## Máquina declarada
 *
 * El banco es DETERMINISTA (mismo árbol ⇒ mismas cifras: no mide tiempos), así
 * que la máquina no cambia el resultado. Se declara igualmente porque el resto
 * de la evidencia del repositorio lo hace y porque el artefacto tiene que poder
 * leerse solo dentro de cinco meses.
 *
 * Uso:
 *   node scripts/cad/nl-cad-quality.mjs
 *   node scripts/cad/nl-cad-quality.mjs --check      (falla si el artefacto quedó viejo)
 *   node scripts/cad/nl-cad-quality.mjs --output docs/cad/evidence/x.json
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const WEB = path.join(REPO_ROOT, "apps/web");
const PROBE = path.join(here, "nl-cad-quality-probe.mts");
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  "docs/cad/evidence/nl-cad-quality-benchmark.json",
);
const require = createRequire(import.meta.url);

/**
 * Umbrales del banco. Se fijaron ANTES de la primera medición y salen de reglas
 * del repositorio, no de la cifra que salió:
 *
 *  · 120 casos y 40 adversariales: por debajo de eso el banco no distingue un
 *    80 % de un 90 % —cada caso valdría más de un punto porcentual— y una
 *    tasa así no sirve para decidir nada.
 *  · 80 % en el corpus de despacho: un copiloto que falla una de cada cinco
 *    órdenes dictadas cuesta más tiempo del que ahorra. Es el suelo de que la
 *    función exista, no la meta.
 *  · 90 % de rechazos TIPADOS en el adversarial: «fallo cerrado» exige error
 *    tipado y explícito. Un rechazo que sólo trae prosa no se puede ramificar,
 *    ni traducir, ni convertir en una sugerencia; cuenta a medias y por eso no
 *    entra en esta cifra.
 *  · 0 fallos graves: la regla de la casa no admite margen. Un resultado a
 *    medias que parece correcto es el peor resultado posible.
 *
 * NO SE TOCAN para que la fila de la rúbrica se conceda. Si el producto no
 * llega, la fila no se concede y eso es exactamente lo que la rúbrica debe
 * decir.
 */
const THRESHOLDS = {
  minCases: 120,
  minAdversarialCases: 40,
  minDespachoAccuracy: 0.8,
  minAdversarialTypedRejectionRate: 0.9,
  maxGraveRate: 0,
};

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, check: false, quiet: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--check") options.check = true;
    else if (flag === "--quiet") options.quiet = true;
    else if (flag === "--output") {
      const value = argv[index + 1];
      if (value === undefined) {
        console.error("--output requiere una ruta.");
        process.exit(1);
      }
      options.output = path.resolve(REPO_ROOT, value);
      index += 1;
    }
  }
  return options;
}

/**
 * Ejecuta la sonda dentro de `apps/web` con `tsx`.
 *
 * Si `tsx` no está (falta `npm ci`), se aborta con un mensaje claro en vez de
 * escribir un artefacto vacío: publicar un JSON sin medición es peor que no
 * publicar nada, porque la rúbrica lo leería como evidencia.
 */
function probe() {
  let tsx;
  try {
    tsx = require.resolve("tsx/cli", { paths: [WEB, REPO_ROOT] });
  } catch {
    throw new Error(
      "No encuentro tsx. Ejecuta `npm ci` en la raíz antes de medir el banco.",
    );
  }
  const out = execFileSync(process.execPath, [tsx, PROBE], {
    cwd: WEB,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 600_000,
  });
  return JSON.parse(out);
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function environment() {
  const cpu = os.cpus()[0]?.model?.trim() ?? "desconocida";
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpu,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    declaredMachine:
      process.env.VALLE_DECLARED_MACHINE ??
      `${cpu} (${os.cpus().length} hilos lógicos), ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, Node ${process.version}`,
  };
}

/** Compara los umbrales con lo medido. Informativo: nunca cambia la salida. */
function verdict(summary) {
  return {
    thresholds: THRESHOLDS,
    corpusSuficiente: summary.corpus.total >= THRESHOLDS.minCases,
    adversarialSuficiente:
      summary.corpus.adversarial >= THRESHOLDS.minAdversarialCases,
    despachoSobreUmbral:
      summary.despacho.accuracy >= THRESHOLDS.minDespachoAccuracy,
    rechazoTipadoSobreUmbral:
      summary.adversarial.typedRejectionRate >=
      THRESHOLDS.minAdversarialTypedRejectionRate,
    sinFallosGraves: summary.global.graveRate <= THRESHOLDS.maxGraveRate,
  };
}

function buildArtifact(run) {
  return {
    $schema: "urn:valle-design:schema:cad-nl-quality-evidence:v1",
    schemaVersion: 1,
    benchmarkId: run.benchmarkId,
    measuredAt: new Date().toISOString(),
    commit: currentCommit(),
    enforcement: "report-only",
    enforcementRationale:
      "La corrida es determinista y no mide tiempos, así que `--check` sí puede exigir que el artefacto coincida con el árbol. Lo que NO bloquea es la NOTA: un banco que impide mergear cuando baja la tasa se convierte en dos semanas en un banco al que se le quitan los casos difíciles.",
    method: {
      pipeline:
        "parseCadCommand (español → comando tipado) + executeCadCommand (comando → operaciones sobre el documento), los dos del producto, sin capa intermedia ni normalización del texto.",
      deterministic: true,
      determinismRationale:
        "No interviene ningún modelo de lenguaje: se mide el intérprete determinista que el producto ejecuta en la barra de comandos. Mismo árbol, mismas cifras, en cualquier máquina.",
      scene:
        "Casa de interés medio mexicana de dos recámaras sobre lote de 10 × 20 m, con cochera, patio de servicio, medio baño, castillos, dala, trabe y sardinel. Las instrucciones de despacho son relacionales y sobre un lienzo vacío no se podrían juzgar.",
      corpusProvenance:
        "Escrito desde el vocabulario de obra mexicano, NO leyendo el parser. El corpus no se ajustó después de medir: ningún caso se retiró ni se reescribió por fallar.",
      argumentComparison:
        "Los NÚMEROS se comparan exactos (un 15 donde iba un 150 es el fallo que este banco caza). El texto libre que después se resuelve contra el plano admite el artículo o el adjetivo sobrante, porque el resolvedor de objetivos hace substring plegando acentos.",
      graveDefinition:
        "`grave` = el producto APLICÓ un resultado plausible y equivocado: comando equivocado, medidas equivocadas, o geometría producida ante una instrucción irrealizable. Un rechazo nunca es grave, por caro que sea.",
    },
    environment: environment(),
    summary: run.summary,
    verdict: verdict(run.summary),
    /** Los fallos graves con su instrucción exacta: es lo que hay que arreglar. */
    graves: run.results
      .filter((result) => result.grave)
      .map(({ id, lane, text, outcome, detail, argMismatches }) => ({
        id,
        lane,
        text,
        outcome,
        detail,
        argMismatches,
      })),
    /** La corrida completa, para que cualquiera audite caso por caso. */
    cases: run.results,
  };
}

function render(artifact) {
  const s = artifact.summary;
  const pct = (value) => `${(value * 100).toFixed(1)} %`;
  const mark = (ok) => (ok ? "✅" : "❌");
  const v = artifact.verdict;
  return [
    "BANCO DE CALIDAD NL→CAD — Valle Design",
    `Corpus: ${s.corpus.total} casos (${s.corpus.despacho} de despacho, ${s.corpus.adversarial} adversariales)`,
    "",
    `${mark(v.despachoSobreUmbral)} Despacho — acierto ${pct(s.despacho.accuracy)} (${s.despacho.aciertos}/${s.despacho.cases}), umbral ${pct(THRESHOLDS.minDespachoAccuracy)}`,
    `      no entendió ${s.despacho.rechazoIndebido} · lo paró la validación ${s.despacho.bloqueadoAlEjecutar} · medidas equivocadas ${s.despacho.argumentosEquivocados} · comando equivocado ${s.despacho.comandoEquivocado}`,
    `${mark(v.rechazoTipadoSobreUmbral)} Adversarial — rechazo TIPADO ${pct(s.adversarial.typedRejectionRate)} (${s.adversarial.rechazoTipado}/${s.adversarial.cases}), umbral ${pct(THRESHOLDS.minAdversarialTypedRejectionRate)}`,
    `      rechazó sin código ${s.adversarial.rechazoSinCodigo} · rechazo total ${pct(s.adversarial.rejectionRate)}`,
    `${mark(v.sinFallosGraves)} FALLOS GRAVES ${s.global.graves}/${s.global.cases} (${pct(s.global.graveRate)}) — geometría plausible y equivocada; la casa exige 0`,
    "",
    ...artifact.graves.map((g) => `      × ${g.id} «${g.text}» → ${g.detail}`),
  ].join("\n");
}

const options = parseArgs(process.argv.slice(2));

let artifact;
try {
  artifact = buildArtifact(probe());
} catch (err) {
  // Fallo cerrado también aquí. Si el banco no se puede correr, NO se dice que
  // la evidencia está bien: se dice que no se pudo comprobar y se sale con
  // error. Un `--check` que pasa cuando no midió nada deja pasar un artefacto
  // viejo, que es exactamente el agujero que este script vino a tapar.
  console.error(`No se pudo medir el banco NL→CAD: ${err.message}`);
  process.exit(1);
}

if (options.check) {
  if (!fs.existsSync(options.output)) {
    console.error(
      `No existe ${path.relative(REPO_ROOT, options.output)}. Ejecuta \`npm run evidence:nl-cad\`.`,
    );
    process.exit(1);
  }
  const published = JSON.parse(fs.readFileSync(options.output, "utf8"));
  const fresh = JSON.stringify(artifact.summary);
  if (JSON.stringify(published.summary) !== fresh) {
    console.error(
      "El banco NL→CAD publicado ya no coincide con el árbol. Vuelve a medir con `npm run evidence:nl-cad` y comitea el artefacto: una evidencia que nadie revalida se pudre en silencio.",
    );
    console.error(`  publicado: ${JSON.stringify(published.summary?.global)}`);
    console.error(`  medido   : ${JSON.stringify(artifact.summary.global)}`);
    process.exit(1);
  }
  if (!options.quiet) console.log(render(artifact));
  console.log("Banco NL→CAD: el artefacto publicado coincide con el árbol.");
} else {
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(render(artifact));
  console.log(`\nArtefacto: ${path.relative(REPO_ROOT, options.output)}`);
}
