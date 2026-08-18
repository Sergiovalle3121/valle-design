/**
 * Sonda de fidelidad de trazado: UNA corrida, medida y volcada a stdout.
 *
 * Imprime un JSON por stdout y nada más. `plot-fidelity-evidence.mjs` la
 * ejecuta tres veces con `tsx`, cruza los resultados y publica la mediana. El
 * reparto es deliberado: aquí vive lo que hay que MEDIR, allí lo que hay que
 * declarar de la máquina y cómo se resume — y así ninguna de las dos mitades
 * puede maquillar a la otra.
 *
 * Todo lo que sale de aquí se lee del PDF emitido. Ni una sola cifra procede de
 * preguntarle al código qué creía estar haciendo.
 */
import { performance } from "node:perf_hooks";
import type { CadDocument, CadPaperSpace } from "../../apps/web/src/lib/cad/cad-document";
import { createCadCorpusMix } from "../../apps/web/src/lib/cad/benchmark/corpus-mixes";
import { createCadPaperSpace } from "../../apps/web/src/lib/cad/paper-space";
import { cadPageSetupFromLayout } from "../../apps/web/src/lib/cad/plot/page-setup";
import { buildCadPlotJob } from "../../apps/web/src/lib/cad/plot/plot-job";
import { createCadMonochromeTable } from "../../apps/web/src/lib/cad/plot/plot-style-table";
import { renderCadPlotPdf } from "../../apps/web/src/lib/cad/plot/plot-pdf";
import { measureCadPdf } from "../../apps/web/src/lib/cad/plot/pdf-measure";
import {
  measureCadPlotCharacterSet,
  measureCadPlotFidelity,
  type CadPlotFidelityReport,
} from "../../apps/web/src/lib/cad/plot/plot-fidelity";
import {
  createCadSheetSet,
  renumberCadSheetSet,
  type CadSheetSet,
} from "../../apps/web/src/lib/cad/sheet-set/sheet-set";
import { publishCadSheetSet } from "../../apps/web/src/lib/cad/sheet-set/sheet-set-publish";

/** Entidades del corpus. Es el escalón que el repositorio ya publica como realista. */
const CORPUS_ENTITIES = 10_000;
const SHEET_COUNT = 6;
const SHEET_TITLES = [
  "Planta de conjunto",
  "Planta baja",
  "Planta alta",
  "Cortes A-A y B-B",
  "Fachadas",
  "Detalles constructivos",
];

function corpus(entities = CORPUS_ENTITIES): { document: CadDocument; sheetSet: CadSheetSet } {
  const built = createCadCorpusMix({ mix: "plano-real", entities });
  const bounds = built.nativeEntities.reduce(
    (box, entity) => {
      const point = "start" in entity ? entity.start : "center" in entity ? entity.center : null;
      if (!point) return box;
      return {
        minX: Math.min(box.minX, point.x),
        minY: Math.min(box.minY, point.y),
        maxX: Math.max(box.maxX, point.x),
        maxY: Math.max(box.maxY, point.y),
      };
    },
    { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  );
  const modelBounds = {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };

  const paperSpaces: CadPaperSpace[] = SHEET_TITLES.slice(0, SHEET_COUNT).map((title, index) =>
    createCadPaperSpace({
      id: `layout:${index + 1}`,
      name: title,
      order: index,
      paper: "A1",
      orientation: "landscape",
      modelBounds,
      unit: "mm",
      metadata: {
        project: "Casa Vallarta",
        drawingNumber: "A-0001",
        title,
        sheetNumber: "",
        revision: "B",
        discipline: "Arquitectura",
        preparedBy: "S. Valle",
        checkedBy: "M. Ruiz",
      },
    }),
  );

  const document: CadDocument = { ...built.document, paperSpaces };
  const sheetSet = renumberCadSheetSet({
    ...createCadSheetSet({
      id: "set:vallarta",
      name: "Casa Vallarta — Arquitectónico",
      description: "Juego arquitectónico para licencia municipal",
    }),
    sheets: SHEET_TITLES.slice(0, SHEET_COUNT).map((title, index) => ({
      id: `sheet:${index + 1}`,
      order: index,
      documentId: "doc:1",
      layoutId: `layout:${index + 1}`,
      title,
      number: "",
      revision: "B",
    })),
  });
  return { document, sheetSet };
}

/** Trazado de UNA lámina, cronometrado de punta a punta. */
async function timeSingleSheet(document: CadDocument): Promise<Record<string, number>> {
  const pageSetup = cadPageSetupFromLayout(document.paperSpaces[0]);
  const table = createCadMonochromeTable("estudio");

  const startJob = performance.now();
  const job = buildCadPlotJob({
    document,
    layoutIds: ["layout:1"],
    pageSetup,
    plotStyleTable: table,
    generatedAt: "1970-01-01T00:00:00.000Z",
    titleBlock: { date: "2026-08-18" },
  });
  const jobMs = performance.now() - startJob;

  const startPdf = performance.now();
  const pdf = await renderCadPlotPdf(job.sheets, {
    titleBlocks: job.titleBlocks,
    fontUsage: job.fontUsage,
    fontByEntity: job.fontByEntity,
    metadata: { title: "Casa Vallarta" },
  });
  const pdfMs = performance.now() - startPdf;

  return {
    jobMs,
    pdfMs,
    totalMs: jobMs + pdfMs,
    bytes: pdf.bytes.length,
    vectorCommands: job.plan.vectorCommandCount,
    pages: pdf.pageCount,
  };
}

/** Publicación de la SERIE entera a un único PDF, cronometrada. */
async function timeSeries(
  document: CadDocument,
  sheetSet: CadSheetSet,
): Promise<Record<string, number>> {
  const start = performance.now();
  const result = await publishCadSheetSet({
    set: sheetSet,
    documents: new Map([["doc:1", document]]),
    plotStyleTables: new Map([["estudio", createCadMonochromeTable("estudio")]]),
    date: "2026-08-18",
  });
  const totalMs = performance.now() - start;
  return {
    totalMs,
    msPerSheet: totalMs / result.pageCount,
    bytes: result.bytes.length,
    pages: result.pageCount,
    sheets: result.plan.sheets.length,
    skipped: result.plan.skipped.length,
  };
}

/** Los casos de escalímetro que se publican en el artefacto. */
const FIDELITY_CASES = [
  { id: "a1-1-50", label: "A1 apaisado, 1:50, dibujo en mm", paper: "A1", orientation: "landscape", scaleDenominator: 50, wallLengthUnits: 10_000, wallHeightUnits: 6_000, textHeightUnits: 125 },
  { id: "a3-1-100", label: "A3 apaisado, 1:100, dibujo en mm", paper: "A3", orientation: "landscape", scaleDenominator: 100, wallLengthUnits: 30_000, wallHeightUnits: 18_000, textHeightUnits: 250 },
  { id: "a4-1-20", label: "A4 vertical, 1:20, dibujo en mm", paper: "A4", orientation: "portrait", scaleDenominator: 20, wallLengthUnits: 3_000, wallHeightUnits: 2_000, textHeightUnits: 50 },
  { id: "a2-1-50-metros", label: "A2 apaisado, 1:50, dibujo en METROS", paper: "A2", orientation: "landscape", scaleDenominator: 50, wallLengthUnits: 10, wallHeightUnits: 6, textHeightUnits: 0.125, unit: "m" },
  { id: "a0-1-25", label: "A0 apaisado, 1:25, dibujo en mm", paper: "A0", orientation: "landscape", scaleDenominator: 25, wallLengthUnits: 20_000, wallHeightUnits: 12_000, textHeightUnits: 62.5 },
] as const;

function summarize(report: CadPlotFidelityReport) {
  return {
    paperMm: report.page.expectedMm,
    paperErrorMm: report.page.errorMm,
    horizontal: report.horizontal,
    vertical: report.vertical,
    text: report.text,
    geometry: report.geometry,
    segmentsOutsidePage: report.segmentsOutsidePage,
    unreadable: report.unreadable,
    fonts: report.fonts.declared.map((font) => ({
      family: font.family,
      baseFont: font.baseFont,
      disposition: font.disposition,
      substitutedBy: font.substitutedBy,
      usageCount: font.usageCount,
    })),
    pdfBytes: report.pdfBytes,
  };
}

async function main(): Promise<void> {
  const { document, sheetSet } = corpus();

  const single = await timeSingleSheet(document);
  const series = await timeSeries(document, sheetSet);

  const fidelity: Record<string, unknown> = {};
  for (const testCase of FIDELITY_CASES) {
    const report = await measureCadPlotFidelity({
      paper: testCase.paper,
      orientation: testCase.orientation,
      scaleDenominator: testCase.scaleDenominator,
      wallLengthUnits: testCase.wallLengthUnits,
      wallHeightUnits: testCase.wallHeightUnits,
      textHeightUnits: testCase.textHeightUnits,
      fontFamily: "Arial",
      unit: "unit" in testCase ? testCase.unit : "mm",
    });
    fidelity[testCase.id] = { label: testCase.label, ...summarize(report) };
  }

  // El defecto conocido: cambiar el papel no recoloca la ventana gráfica.
  const paperChanged = await measureCadPlotFidelity({
    paper: "A1",
    orientation: "landscape",
    scaleDenominator: 100,
    wallLengthUnits: 30_000,
    wallHeightUnits: 18_000,
    textHeightUnits: 250,
    fontFamily: "Arial",
    unit: "mm",
    plotOnPaper: "A3",
  });

  // Fuentes: una que se sustituye, y una que sí viaja dentro.
  const substituted = await measureCadPlotFidelity({
    paper: "A3",
    orientation: "landscape",
    scaleDenominator: 100,
    wallLengthUnits: 30_000,
    wallHeightUnits: 18_000,
    textHeightUnits: 250,
    fontFamily: "ISOCPEUR",
    unit: "mm",
  });

  const charset = await measureCadPlotCharacterSet();

  // Y una lectura del PDF de la serie, para afirmar la numeración IMPRESA.
  //
  // Sobre un corpus mínimo a propósito: leer la numeración exige emitir sin
  // comprimir, y hacerlo sobre el corpus de la medida de tiempos duplicaría la
  // corrida entera para comprobar algo que no depende del tamaño del dibujo.
  const small = corpus(200);
  const published = await publishCadSheetSet({
    set: small.sheetSet,
    documents: new Map([["doc:1", small.document]]),
    date: "2026-08-18",
    pdf: { compress: false },
  });
  const measurement = measureCadPdf(published.bytes);
  const printedNumbering = published.plan.coverRows.map((row, index) => ({
    sheetOf: row.sheetOf,
    number: row.number,
    onCover: measurement.labels.some(
      (label) => label.page === 1 && label.text === row.sheetOf,
    ),
    onSheet: measurement.labels.some(
      (label) => label.page === index + 2 && label.text === row.sheetOf,
    ),
  }));

  process.stdout.write(
    JSON.stringify({
      corpus: {
        mix: "plano-real",
        entities: CORPUS_ENTITIES,
        sheets: SHEET_COUNT,
        vectorCommandsPerSheet: single.vectorCommands,
      },
      slo: { singleSheet: single, series },
      fidelity,
      paperChangedAfterLayout: {
        label:
          "La presentación se creó en A1 y se traza en A3: PAGESETUP cambia la hoja pero la ventana gráfica sigue colocada para el papel anterior.",
        ...summarize(paperChanged),
      },
      fonts: {
        substituted: summarize(substituted).fonts,
        substitutedInPdf: substituted.fonts.inPdf,
        charset,
      },
      series: {
        pageCount: published.pageCount,
        hasCover: published.hasCover,
        coverRows: published.plan.coverRows,
        printedNumbering,
        warnings: published.warnings,
      },
    }),
  );
}

await main();
