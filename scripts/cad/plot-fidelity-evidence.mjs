#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/plot-fidelity-slo.json`.
 *
 * ## Por qué el artefacto lo escribe un script y no una persona
 *
 * Porque un número escrito a mano no se puede volver a comprobar. Este archivo
 * ejecuta la sonda, cruza las corridas y vuelca el resultado; si alguien quiere
 * discutir una cifra, la vuelve a generar. Nada de lo que sale aquí se teclea.
 *
 * ## Tres corridas, mediana, y la máquina declarada
 *
 * Es regla del repositorio: si se cita un número de rendimiento, se cita la
 * máquina. Y se citan TRES corridas en procesos separados, no tres vueltas
 * dentro del mismo: repetir en caliente mide un intérprete ya calentado, que no
 * es lo que le pasa a quien pulsa «Trazar» una vez. La mediana de tres procesos
 * es lo más parecido a esa experiencia que se puede medir barato.
 *
 * ## Lo que NO se mide, dicho antes de que nadie lo suponga
 *
 * No hay navegador, ni GPU, ni impresora física. Se mide el trabajo de CPU
 * desde el documento hasta los bytes del PDF. El paso de esos bytes a papel
 * —el visor, el controlador, la tinta— queda fuera y se declara fuera.
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
const probe = path.join(here, "plot-fidelity-probe.mts");
const output = path.join(root, "docs/cad/evidence/plot-fidelity-slo.json");

/** Corridas en procesos separados. Impar, para que la mediana sea un dato real. */
const RUNS = 3;

function runProbe(index) {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  process.stderr.write(`· corrida ${index + 1}/${RUNS}…\n`);
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 900_000,
    env: { ...process.env, TMP: process.env.TMP, TEMP: process.env.TEMP },
  });
  return JSON.parse(stdout);
}

/** Mediana. Con tres valores es el de en medio; sin trampas de promedio. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const round = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

/**
 * Resume una medida de tiempo a lo largo de las corridas.
 *
 * Se publica la mediana Y las tres muestras. Sin las muestras, una mediana
 * puede esconder una corrida que tardó el triple, que es justo la información
 * que hace falta para saber si la máquina estaba libre.
 */
function timing(runs, pick) {
  const samples = runs.map((run) => round(pick(run)));
  return { medianMs: round(median(samples)), samplesMs: samples, runs: samples.length };
}

/** Verifica que un valor sea IDÉNTICO en las tres corridas. */
function invariant(runs, pick, label, discrepancies) {
  const values = runs.map((run) => JSON.stringify(pick(run)));
  if (new Set(values).size > 1) discrepancies.push(`${label}: ${values.join(" ≠ ")}`);
  return pick(runs[0]);
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
    cpuModel: cpus[0]?.model ?? "desconocido",
    logicalCpuCount: cpus.length,
    availableParallelism: os.availableParallelism?.() ?? cpus.length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    declaredMachine:
      `${cpus[0]?.model?.trim() ?? "CPU desconocida"} (${cpus.length} hilos lógicos), ` +
      `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, ` +
      "portátil de desarrollo con carga vecina (otros agentes trabajando en el mismo equipo)",
  };
}

const startedAt = new Date().toISOString();
const runs = [];
for (let index = 0; index < RUNS; index += 1) runs.push(runProbe(index));
const finishedAt = new Date().toISOString();

const discrepancies = [];
const fidelity = invariant(runs, (run) => run.fidelity, "fidelidad", discrepancies);
const paperChanged = invariant(
  runs,
  (run) => run.paperChangedAfterLayout,
  "papel cambiado",
  discrepancies,
);
const fonts = invariant(runs, (run) => run.fonts, "fuentes", discrepancies);
const series = invariant(runs, (run) => run.series, "serie", discrepancies);
const corpus = invariant(runs, (run) => run.corpus, "corpus", discrepancies);

const worstScaleErrorMm = Math.max(
  ...Object.values(fidelity).map((entry) =>
    Math.max(Math.abs(entry.horizontal.errorMm), Math.abs(entry.vertical.errorMm)),
  ),
);
const worstGeometryMm = Math.max(
  ...Object.values(fidelity).map((entry) => entry.geometry.maxDeviationMm),
);

const substituted = fonts.substituted.filter((font) => font.disposition === "substituted");
const numberingCoherent = series.printedNumbering.every((row) => row.onCover && row.onSheet);

const evidence = {
  $schema: "urn:valle-design:schema:cad-plot-fidelity-evidence:v1",
  schemaVersion: 1,
  evidenceId: "valle-design-plot-fidelity-v1",
  startedAt,
  finishedAt,
  enforcement: "report-only",
  enforcementRationale:
    "Las afirmaciones de FIDELIDAD (escala, geometría, fuentes, numeración) están cerradas por specs " +
    "ejecutables —plot-fidelity.spec.ts, title-block.spec.ts, sheet-set-cover.spec.ts— que fallan si " +
    "cambian. Los TIEMPOS de este artefacto no fijan presupuesto: están medidos en un portátil de " +
    "desarrollo con otros agentes trabajando en paralelo, y calibrarlos como umbral de CI produciría " +
    "un gate que falla por contención de máquina y no por una regresión del producto.",
  environment: environment(),
  method: {
    runs: RUNS,
    aggregation: "mediana de 3 corridas en PROCESOS SEPARADOS",
    generator: "scripts/cad/plot-fidelity-evidence.mjs + scripts/cad/plot-fidelity-probe.mts",
    everyNumberReadFrom:
      "los bytes del PDF emitido: coordenadas del flujo de contenido, /MediaBox, /BaseFont y /FontFile. " +
      "Ninguna cifra procede de preguntarle al código qué creía estar haciendo.",
    runToRunDiscrepancies: discrepancies,
  },
  corpus,
  slo: {
    note:
      "Trabajo de CPU desde el documento hasta los bytes del PDF, con la tabla de plumas aplicada y el " +
      "cajetín compuesto. Incluye la compresión del PDF, porque el archivo que se entrega va comprimido.",
    singleSheet: {
      buildJobMs: timing(runs, (run) => run.slo.singleSheet.jobMs),
      emitPdfMs: timing(runs, (run) => run.slo.singleSheet.pdfMs),
      totalMs: timing(runs, (run) => run.slo.singleSheet.totalMs),
      bytes: invariant(runs, (run) => run.slo.singleSheet.bytes, "bytes de una lámina", []),
      vectorCommands: corpus.vectorCommandsPerSheet,
    },
    series: {
      sheets: invariant(runs, (run) => run.slo.series.sheets, "hojas de la serie", discrepancies),
      pages: invariant(runs, (run) => run.slo.series.pages, "páginas de la serie", discrepancies),
      totalMs: timing(runs, (run) => run.slo.series.totalMs),
      msPerPage: timing(runs, (run) => run.slo.series.msPerSheet),
      bytes: invariant(runs, (run) => run.slo.series.bytes, "bytes de la serie", []),
    },
  },
  geometricFidelity: {
    verdict: {
      worstScaleErrorMm: round(worstScaleErrorMm, 15),
      worstPreviewToPdfDeviationMm: round(worstGeometryMm, 15),
      passed: worstScaleErrorMm <= 1e-3 && worstGeometryMm <= 1e-3,
      toleranceMm: 1e-3,
      toleranceRationale:
        "Una milésima de milímetro sobre el papel. Es dos órdenes de magnitud más fina que lo que " +
        "distingue un escalímetro (0,1 mm) y que la resolución de cualquier trazadora, así que un " +
        "error dentro de esta tolerancia no puede manifestarse en papel.",
    },
    cases: fidelity,
  },
  knownDefects: [
    {
      id: "paper-change-does-not-move-viewport",
      severity: "alta",
      title: "Cambiar el papel en PAGESETUP no recoloca la ventana gráfica",
      detail: paperChanged.label,
      measured: {
        segmentsOutsidePage: paperChanged.segmentsOutsidePage,
        paperMm: paperChanged.paperMm,
        scaleErrorMm: paperChanged.horizontal.errorMm,
      },
      consequence:
        "La hoja del PDF sí cambia de tamaño, pero el dibujo sigue colocado para el papel anterior y " +
        "parte de la geometría cae fuera del área imprimible: se dibuja y no se imprime. La ESCALA no " +
        "se resiente —el defecto es de colocación—, lo que acota el arreglo al espacio papel.",
      status: "medido y cerrado por spec en el valor actual; no arreglado en esta ola",
    },
    {
      id: "text-height-clamped",
      severity: "media",
      title: "La altura de todo rótulo se recorta al intervalo [1,5 – 12] mm de papel",
      detail:
        "El plan de publicación limita la altura impresa de cualquier texto. A escalas grandes un " +
        "rótulo que el dibujo pide de 15 mm sale de 12, y a escalas pequeñas uno de 1 mm sale de 1,5.",
      measured: Object.fromEntries(
        Object.entries(fidelity).map(([id, entry]) => [
          id,
          {
            pedidoMm: entry.text.unclampedExpectedMm,
            impresoMm: entry.text.measuredMm,
            recortado: entry.text.clamped,
          },
        ]),
      ),
      consequence:
        "El texto anotativo no conserva su tamaño relativo en todo el rango de escalas. Es visible en " +
        "planos de detalle (1:20 y mayores) y en planos de conjunto (1:200 y menores).",
      status: "medido y declarado; el recorte es intencional en el plan de publicación",
    },
  ],
  fontBehaviour: {
    note:
      "Ésta es la pregunta que antes no tenía respuesta: qué fuente lleva de verdad el PDF entregado. " +
      "Una familia sólo puede acabar de tres maneras y las tres se declaran — incrustada (el programa " +
      "viaja dentro), residente (una de las catorce estándar, que todo visor conforme tiene) o " +
      "sustituida (se imprime con otra distinta).",
    embedded: {
      supported: true,
      evidence:
        "Comprobado en plot-fidelity.spec.ts: con el programa de la fuente, el PDF sale con /FontFile2 " +
        "y /BaseFont propio (CIDFontType2), y el informe la declara incrustada.",
      caveat:
        "Una fuente incrustada suele traer un solo corte. Al pedirle negrita, jsPDF cambiaba en " +
        "silencio a Times-Bold y el cajetín salía en una tipografía que nadie eligió. Ahora se consulta " +
        "qué cortes existen y se pide sólo uno de ésos.",
    },
    resident: {
      families: ["helvetica", "times", "courier"],
      note:
        "No se incrustan porque todo visor conforme las tiene. Arial NO está en esta lista: se parece a " +
        "Helvetica y por eso el cambio pasa desapercibido, pero las anchuras no son idénticas y a tamaño " +
        "de cota se nota. Cuenta como sustitución.",
    },
    substitution: {
      rule:
        "Cualquier familia sin programa de fuente y que no sea una de las tres residentes se sustituye. " +
        "El destino sale de una tabla explícita (Arial/Verdana/Tahoma/Segoe UI → helvetica; Times New " +
        "Roman/Georgia → times; Courier New → courier) y todo lo desconocido cae en helvetica.",
      measuredExamples: substituted,
      basefontsInPdf: fonts.substitutedInPdf,
      declaredEverywhere:
        "plot-fidelity.spec.ts falla si una familia se sustituye sin declararlo, y también si el PDF " +
        "lleva un /BaseFont que el informe de fuentes no menciona.",
    },
    characterSet: {
      probed: fonts.charset.probed,
      rendered: fonts.charset.rendered,
      lost: fonts.charset.lost,
      criterion: fonts.charset.criterion,
      consequence:
        "Con las fuentes residentes el juego útil es WinAnsi (CP1252): acentos, eñes, signos de " +
        "apertura, grados, exponentes y la Ø escandinava entran. Los caracteres fuera de ese juego —el " +
        "signo técnico de diámetro ⌀ (U+2300) y las letras griegas— NO llegan al archivo. Para usarlos " +
        "hay que incrustar una fuente que los contenga.",
    },
  },
  sheetSeries: {
    pageCount: series.pageCount,
    hasCover: series.hasCover,
    numberingCoherent,
    convention:
      "La portada es la página 1 del PDF pero NO consume número de lámina: seis láminas se rotulan " +
      "1/6 … 6/6. El índice de la portada se DERIVA de los cajetines ya resueltos, así que no puede " +
      "discrepar de ellos.",
    coverRows: series.coverRows,
    printedNumbering: series.printedNumbering,
    verifiedAgainst:
      "los bytes del PDF: se lee el texto de la página 1 y el de cada lámina y se comprueba que la " +
      "misma etiqueta «n/N» aparece en las dos.",
  },
  scope: {
    measured: [
      "tiempo de trazado de una lámina y de una serie de seis, hasta los bytes del PDF",
      "escala impresa: longitud de un muro conocido medida en el flujo de contenido del PDF",
      "geometría: cada trazo de la vista previa emparejado con el del PDF, extremo a extremo",
      "tamaño de papel: /MediaBox contra el papel configurado",
      "altura de rótulo impresa contra la pedida por el dibujo",
      "fuentes: cuáles se incrustan, cuáles residen y cuáles se sustituyen, y por cuál",
      "juego de caracteres que sobrevive al PDF con las fuentes residentes",
      "numeración de la serie, leída del texto impreso en la portada y en cada lámina",
    ],
    notMeasured: [
      "el paso de los bytes a papel: visor de PDF, controlador de impresión, trazadora y tinta",
      "conformidad PDF/A ni firma digital: no están implementadas y no se declaran",
      "sombreados con patrón, que se publican como su contorno vectorial",
      "rasterizado de glifos y métricas de texto reales: se mide el tamaño nominal, no la caja del glifo",
      "trazado desde el navegador: estas cifras son de Node, sin GPU ni composición",
      "compatibilidad DWG",
    ],
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

if (discrepancies.length > 0) {
  // Fallo cerrado: si las corridas no coinciden en lo que DEBE ser determinista,
  // la mediana de los tiempos tampoco significa nada y el artefacto no se firma.
  console.error("Las corridas no coinciden en valores que deberían ser deterministas:");
  for (const line of discrepancies) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`Escrito ${path.relative(root, output)}`);
console.log(
  `  escala: error máximo ${worstScaleErrorMm.toExponential(3)} mm; ` +
    `previa↔PDF ${worstGeometryMm.toExponential(3)} mm`,
);
console.log(
  `  SLO (mediana de ${RUNS}): una lámina ${evidence.slo.singleSheet.totalMs.medianMs} ms; ` +
    `serie de ${evidence.slo.series.pages} páginas ${evidence.slo.series.totalMs.medianMs} ms`,
);
console.log(
  `  fuentes: ${substituted.map((font) => `${font.family}→${font.substitutedBy}`).join(", ") || "ninguna sustituida"}; ` +
    `caracteres perdidos: ${fonts.charset.lost.join("") || "ninguno"}`,
);
