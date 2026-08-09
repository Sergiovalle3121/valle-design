/**
 * Trazado: colocación sobre el papel, y el PDF que sale.
 *
 * Lo que se afirma del PDF es el ARCHIVO —número de páginas, `MediaBox` en
 * milímetros, fuentes declaradas— leído de sus bytes con `inspectCadPdf`. No se
 * afirma sobre el objeto que lo generó: un emisor comprobado contra su propia
 * intención no comprueba nada.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import { setCadViewportOn, setCadViewportScale } from "../layout/viewport-operations";
import {
  applyCadPageSetupToLayout,
  cadLayoutPlotStyleTable,
  cadPageSetupFromLayout,
  cadPageSize,
  cadPlotProject,
  cadPrintableArea,
  computeCadPlotPlacement,
  defaultCadPageSetup,
  preflightCadPageSetup,
  resolveCadPlotArea,
} from "./page-setup";
import { buildCadPlotJob, buildCadPlotPreview, cadPlotAreaSources } from "./plot-job";
import { createCadMonochromeTable } from "./plot-style-table";
import { inspectCadPdf, renderCadPlotPdf, MM_TO_POINTS } from "./plot-pdf";

const METADATA = {
  project: "Nave",
  drawingNumber: "A-0001",
  title: "Planta",
  sheetNumber: "S-001",
  revision: "P01",
  discipline: "Arquitectura",
};

/** Dibujo conocido: un rectángulo de 10.000 × 6.000 mm y un rótulo. */
function drawing(): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: METADATA,
    scale: 50,
  });
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "MURO", name: "MURO", color: "#0000ff", visible: true, locked: false, lineweight: 0.18 },
      { id: "EJES", name: "EJES", color: "#00ffff", visible: true, locked: false, lineweight: 0.18 },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        layer: "MURO",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10_000, y: 0, z: 0 },
      },
      {
        id: "eje-1",
        type: "line",
        layer: "EJES",
        start: { x: 0, y: 3_000, z: 0 },
        end: { x: 10_000, y: 3_000, z: 0 },
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "eje-1"] },
    paperSpaces: [layout],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

// --- papel y zona imprimible, en milímetros exactos ---------------------------
{
  const a3 = defaultCadPageSetup({ paper: "A3", orientation: "landscape" });
  assert.deepEqual(cadPageSize(a3), { width: 420, height: 297 });
  assert.deepEqual(cadPageSize({ ...a3, orientation: "portrait" }), { width: 297, height: 420 });
  assert.deepEqual(cadPrintableArea(a3), { x: 10, y: 10, width: 400, height: 277 });

  const custom = defaultCadPageSetup({ paper: "custom", customSize: { width: 300, height: 500 } });
  assert.deepEqual(cadPageSize(custom), { width: 500, height: 300 });
}

// --- ANCLA: a 1:50, un muro de 5 m mide 100 mm sobre el papel -----------------
{
  const setup = {
    ...defaultCadPageSetup({ paper: "A1", orientation: "landscape" }),
    area: { kind: "window" as const, corner1: { x: 0, y: 0 }, corner2: { x: 10_000, y: 6_000 } },
    scale: { kind: "ratio" as const, paperMm: 1, drawingUnits: 50 },
  };
  const resolution = resolveCadPlotArea(setup.area, cadPlotAreaSources(setup, null))!;
  const placement = computeCadPlotPlacement(setup, resolution, 1);

  assert.equal(placement.mmPerDrawingUnit, 0.02, "1 mm de papel por cada 50 unidades");
  assert.equal(placement.effectiveRatio, 50);
  assert.equal(placement.size.width, 200, "10.000 mm a 1:50 son 200 mm");
  assert.equal(placement.size.height, 120);
  assert.equal(placement.overflows, false);

  // Centrado sobre A1 apaisado (841 × 594) con 10 mm de margen:
  // zona imprimible 821 × 574 → origen en (10 + (821−200)/2, 10 + (574−120)/2).
  assert.equal(placement.origin.x, 10 + (821 - 200) / 2);
  assert.equal(placement.origin.y, 10 + (574 - 120) / 2);

  // Y un muro de 5 m proyecta a 100 mm exactos.
  const a = cadPlotProject(placement, resolution, { x: 0, y: 0 });
  const b = cadPlotProject(placement, resolution, { x: 5_000, y: 0 });
  assert.equal(b.x - a.x, 100);

  // Sin centrar, el desfase manda.
  const offset = computeCadPlotPlacement(
    { ...setup, centered: false, offset: { x: 5, y: 7 } },
    resolution,
    1,
  );
  assert.equal(offset.origin.x, 15);
  assert.equal(offset.origin.y, 17);

  // Ajustar a la hoja: 10.000 × 6.000 en 821 × 574. 821/10.000 = 0,0821 frente
  // a 574/6.000 = 0,0957 — manda el HORIZONTAL, que es el que se queda corto.
  const fitted = computeCadPlotPlacement({ ...setup, scale: { kind: "fit" } }, resolution, 1);
  assert.ok(Math.abs(fitted.mmPerDrawingUnit - 0.0821) < 1e-12);
  assert.ok(Math.abs(fitted.size.width - 821) < 1e-9);
  assert.ok(Math.abs(fitted.size.height - 492.6) < 1e-9);
  assert.equal(fitted.overflows, false);
}

// --- áreas de trazado --------------------------------------------------------
{
  const setup = defaultCadPageSetup({ paper: "A3" });
  const extents = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
  const sources = cadPlotAreaSources(setup, extents, { minX: -5, minY: -5, maxX: 5, maxY: 5 });

  assert.equal(resolveCadPlotArea({ kind: "layout" }, sources)?.space, "paper");
  assert.deepEqual(resolveCadPlotArea({ kind: "extents" }, sources)?.bounds, extents);
  assert.deepEqual(resolveCadPlotArea({ kind: "display" }, sources)?.bounds, {
    minX: -5,
    minY: -5,
    maxX: 5,
    maxY: 5,
  });
  assert.equal(
    resolveCadPlotArea({ kind: "extents" }, { ...sources, extents: null }),
    null,
    "un dibujo vacío no tiene extensión, y se dice",
  );
  assert.equal(
    resolveCadPlotArea(
      { kind: "window", corner1: { x: 1, y: 1 }, corner2: { x: 1, y: 9 } },
      sources,
    ),
    null,
    "una ventana sin área no es un área",
  );
}

// --- comprobación previa: la escala que no cabe se avisa ANTES ---------------
{
  const setup = {
    ...defaultCadPageSetup({ paper: "A4", orientation: "portrait" }),
    area: { kind: "extents" as const },
    scale: { kind: "ratio" as const, paperMm: 1, drawingUnits: 1 },
    plotStyleTable: "estudio",
  };
  const sources = cadPlotAreaSources(setup, { minX: 0, minY: 0, maxX: 5_000, maxY: 3_000 });
  const issues = preflightCadPageSetup(setup, sources, []);
  assert.ok(issues.some((issue) => issue.code === "overflows_printable_area"));
  assert.ok(
    issues.some((issue) => issue.code === "missing_plot_style_table" && issue.severity === "error"),
    "una CTB que no está cargada es un error, no un detalle",
  );
  assert.equal(preflightCadPageSetup({ ...setup, plotStyleTable: null }, sources, []).length, 1);
}

// --- la configuración de página persiste en la presentación -------------------
{
  const document = drawing();
  const setup = {
    ...cadPageSetupFromLayout(document.paperSpaces[0]),
    paper: "A3" as const,
    orientation: "portrait" as const,
    colorMode: "color" as const,
    lineweightScale: 1.5,
    plotStyleTable: "estudio-2004",
  };
  const written = applyCadPageSetupToLayout(document.paperSpaces[0], setup);
  assert.equal(written.page.width, 297);
  assert.equal(written.page.height, 420);
  assert.equal(written.page.orientation, "portrait");
  assert.equal(written.pageSetup?.paper, "A3");
  assert.equal(written.pageSetup?.lineweightScale, 1.5);
  assert.equal(cadLayoutPlotStyleTable(written), "estudio-2004");

  // Y se vuelve a leer igual: es lo que hace que reabrir el dibujo trace lo mismo.
  const back = cadPageSetupFromLayout(written);
  assert.equal(back.paper, "A3");
  assert.equal(back.orientation, "portrait");
  assert.equal(back.lineweightScale, 1.5);
  assert.equal(back.plotStyleTable, "estudio-2004");

  const cleared = applyCadPageSetupToLayout(written, { ...setup, plotStyleTable: null });
  assert.equal(cadLayoutPlotStyleTable(cleared), null);
}

// --- ANCLA: la CTB decide el grosor de cada trazo -----------------------------
{
  const document = drawing();
  const setup = {
    ...cadPageSetupFromLayout(document.paperSpaces[0]),
    colorMode: "color" as const,
  };

  const bare = buildCadPlotJob({ document, pageSetup: setup });
  const bareStrokes = bare.sheets[0].viewports.flatMap((viewport) =>
    viewport.commands.filter((command) => command.kind === "path"),
  );
  assert.ok(bareStrokes.length >= 2);
  // Sin tabla, manda el grosor de la capa: 0,18 mm para las dos.
  for (const stroke of bareStrokes)
    assert.ok(Math.abs(stroke.style.lineWidth - 0.18) < 1e-9, "sin CTB manda la capa");

  const withTable = buildCadPlotJob({
    document,
    pageSetup: setup,
    plotStyleTable: createCadMonochromeTable("estudio"),
  });
  const byWidth = new Map(
    withTable.sheets[0].viewports
      .flatMap((viewport) => viewport.commands)
      .filter((command) => command.kind === "path")
      .map((command) => [command.entityId, command.style]),
  );
  // El muro es azul (ACI 5) → 0,50 mm; el eje es cian (ACI 4) → 0,13 mm. Ese
  // contraste ES el plano: sin CTB los dos salen a 0,18 y son la misma línea.
  assert.equal(byWidth.get("muro-sur")?.lineWidth, 0.5);
  assert.equal(byWidth.get("eje-1")?.lineWidth, 0.13);
  assert.equal(byWidth.get("muro-sur")?.stroke, "#000000");

  // Con el factor de grosores a 2, todo se dobla.
  const doubled = buildCadPlotJob({
    document,
    pageSetup: { ...setup, lineweightScale: 2 },
    plotStyleTable: createCadMonochromeTable("estudio"),
  });
  const doubledWall = doubled.sheets[0].viewports
    .flatMap((viewport) => viewport.commands)
    .find((command) => command.kind === "path" && command.entityId === "muro-sur");
  assert.equal(doubledWall?.kind === "path" ? doubledWall.style.lineWidth : 0, 1);
}

// --- una ventana apagada no se traza -----------------------------------------
{
  const document = drawing();
  const viewportId = document.paperSpaces[0].viewports![0].id;
  const off = {
    ...document,
    paperSpaces: [setCadViewportOn(document.paperSpaces[0], viewportId, false)],
  } as CadDocument;
  const job = buildCadPlotJob({ document: off, pageSetup: cadPageSetupFromLayout(off.paperSpaces[0]) });
  assert.deepEqual(job.skippedViewports, [{ sheetId: "layout:planta", viewportId }]);
  assert.equal(job.sheets[0].viewports.length, 0);
}

// --- la vista previa es la MISMA geometría que el PDF -------------------------
{
  const document = drawing();
  const table = createCadMonochromeTable("estudio");
  const pageSetup = cadPageSetupFromLayout(document.paperSpaces[0]);
  const preview = buildCadPlotPreview({ document, pageSetup, plotStyleTable: table });
  const job = buildCadPlotJob({ document, pageSetup, plotStyleTable: table });

  const jobStrokes = job.sheets[0].viewports.flatMap((viewport) =>
    viewport.commands.filter((command) => command.kind === "path"),
  );
  assert.equal(preview.sheets[0].strokes.length, jobStrokes.length);
  assert.deepEqual(
    preview.sheets[0].strokes.map((stroke) => stroke.lineWidth).sort(),
    jobStrokes.map((stroke) => stroke.style.lineWidth).sort(),
  );
  assert.deepEqual(preview.sheets[0].printable, cadPrintableArea(pageSetup));
  assert.equal(preview.area?.kind, "layout");
}

// --- EL PDF: se afirma sobre sus bytes ----------------------------------------
async function pdfSpecs(): Promise<void> {
  const document = drawing();
  const second = createCadLayout(document.paperSpaces, {
    id: "layout:detalle",
    name: "Detalle",
    templateId: "a3-landscape",
    modelBounds: { x: 0, y: 0, width: 2_000, height: 1_500 },
    unit: "mm",
    metadata: { ...METADATA, title: "Detalle", sheetNumber: "S-002" },
  });
  const twoSheets = {
    ...document,
    paperSpaces: [
      setCadViewportScale(document.paperSpaces[0], document.paperSpaces[0].viewports![0].id, {
        denominator: 50,
        lock: true,
      }),
      second,
    ],
  } as CadDocument;

  const pageSetup = {
    ...cadPageSetupFromLayout(twoSheets.paperSpaces[0]),
    paper: "A1" as const,
    orientation: "landscape" as const,
  };
  const job = buildCadPlotJob({
    document: twoSheets,
    pageSetup,
    plotStyleTable: createCadMonochromeTable("estudio"),
  });
  assert.equal(job.sheets.length, 2, "dos presentaciones, dos hojas");

  const pdf = await renderCadPlotPdf(job.sheets, {
    compress: false,
    metadata: { title: "Nave — planos" },
  });

  const inspected = inspectCadPdf(pdf.bytes);
  assert.equal(pdf.pageCount, 2);
  assert.equal(inspected.pageCount, 2, "el PDF declara dos páginas");
  assert.equal(inspected.pageSizesMm.length, 2);
  // A1 apaisado: 841 × 594 mm, con la tolerancia de la conversión a puntos.
  for (const size of inspected.pageSizesMm) {
    assert.ok(Math.abs(size.width - 841) < 0.05, `ancho ${size.width} ≠ 841 mm`);
    assert.ok(Math.abs(size.height - 594) < 0.05, `alto ${size.height} ≠ 594 mm`);
  }

  // Fuentes: el PDF declara la que se usó, y el informe dice si va incrustada.
  assert.ok(inspected.baseFonts.length > 0, "el PDF declara al menos una fuente");
  assert.ok(
    inspected.baseFonts.some((font) => /helvetica/i.test(font)),
    `las fuentes declaradas fueron ${inspected.baseFonts.join(", ")}`,
  );
  assert.equal(pdf.fonts.length, 1);
  assert.equal(pdf.fonts[0].baseFont, "helvetica");
  assert.equal(pdf.fonts[0].embedded, false);
  assert.equal(
    inspected.embeddedFonts,
    0,
    "sin programa de fuente no se incrusta ninguna, y el informe lo dice",
  );
  assert.ok(pdf.warnings.some((warning) => warning.includes("estándar")));

  assert.deepEqual(
    pdf.pages.map((page) => page.sheetId),
    ["layout:planta", "layout:detalle"],
  );

  // Un PDF vacío se declara vacío en vez de salir con una página en blanco.
  const none = await renderCadPlotPdf([]);
  assert.equal(none.pageCount, 0);
  assert.equal(none.bytes.length, 0);

  // Y una fuente que no se puede incrustar se AVISA, no se silencia.
  const broken = await renderCadPlotPdf(job.sheets.slice(0, 1), {
    compress: false,
    fonts: [{ family: "ISOCPEUR", style: "normal", fileName: "isocpeur.ttf", base64: "no-es-una-fuente" }],
  });
  assert.ok(
    broken.warnings.some((warning) => warning.includes("ISOCPEUR")) ||
      broken.fonts.some((font) => font.family === "ISOCPEUR"),
    "una fuente que falla al incrustarse deja rastro",
  );

  assert.ok(Math.abs(MM_TO_POINTS - 2.834645669291339) < 1e-12);
  console.log(
    `PDF trazado: ${inspected.pageCount} páginas, ${inspected.pageSizesMm[0].width} × ${inspected.pageSizesMm[0].height} mm, fuentes [${inspected.baseFonts.join(", ")}]`,
  );
}

// Sin `await` de nivel superior: el runner de specs compila a CommonJS. El
// renglón final se imprime DENTRO de la resolución, para que un fallo asíncrono
// no salga con éxito y sin haber comprobado nada.
pdfSpecs().then(
  () => {
    console.log("cad plot output specs passed");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
