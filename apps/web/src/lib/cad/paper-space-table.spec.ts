import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "./cad-document";
import { createCadLayout } from "./layout/layout-operations";
import { buildCadPublishPlan } from "./paper-space";
import { cadPageSetupFromLayout } from "./plot/page-setup";
import { buildCadPlotJob, buildCadPlotPreview } from "./plot/plot-job";
import { createCadMonochromeTable } from "./plot/plot-style-table";
import { renderCadPlotPdf } from "./plot/plot-pdf";
import { measureCadPdf } from "./plot/pdf-measure";

/**
 * LOS CUADROS SALEN EN LA LÁMINA (Ola E, 2026-09-02).
 *
 * Medido antes: un cuadro de 2 × 2 con las cuatro celdas llenas llegaba al
 * plan de publicación como 3 caminos y 0 textos, sin advertencia. Aquí se
 * fija la cadena entera con el mismo cuadro:
 *
 *   1. el plan lleva un texto por celda llena, con la ancla del visor
 *      (middle-left, relleno 0,15 × fila, línea base bajo el centro), medida
 *      contra un MTEXT colocado a mano en ese mismo punto del modelo;
 *   2. la vista previa de trazado lo lista entre sus rótulos;
 *   3. el PDF lo lleva en sus bytes, leído de vuelta por el lector de
 *      medición (`measureCadPdf`), que no comparte código con el emisor.
 */
let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const METADATA = { project: "Casa", drawingNumber: "A-0001", title: "Planta", sheetNumber: "S-001", revision: "P01", discipline: "Arquitectura" };

const table: CadEntity = {
  id: "cuadro",
  type: "table",
  insertion: { x: 1_000, y: 4_000, z: 0 },
  rows: 3,
  columns: 2,
  rowHeights: [220, 220, 220],
  columnWidths: [1_400, 1_000],
  cells: [
    { row: 0, column: 0, text: "Local", textHeight: 100 },
    { row: 0, column: 1, text: "Área (m²)", textHeight: 100, alignment: "middle-right" },
    { row: 1, column: 0, text: "Recámara", textHeight: 90 },
    { row: 1, column: 1, text: "12.50", textHeight: 90, alignment: "middle-right" },
    { row: 2, column: 0, text: "   " },
    { row: 7, column: 0, text: "fuera de la tabla" },
  ],
  layer: "0",
};

/** La ancla de «Recámara» según la regla documentada en paper-space-table.ts. */
const RECAMARA_ANCHOR = { x: 1_000 + 220 * 0.15, y: 4_000 - (220 + 110 + 90 * 0.35) };

function documento(extra: CadEntity[] = []): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a3-landscape",
    modelBounds: { x: 0, y: 0, width: 6_000, height: 5_000 },
    unit: "mm",
    metadata: METADATA,
    scale: 50,
  });
  const entities = [table, ...extra];
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
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

/* ── 1. El plan de publicación ───────────────────────────────────────────── */
{
  const probe: CadEntity = { id: "sonda", type: "mtext", insertion: { x: RECAMARA_ANCHOR.x, y: RECAMARA_ANCHOR.y, z: 0 }, text: "sonda", layer: "0" };
  const plan = buildCadPublishPlan(documento([probe]));
  const commands = plan.sheets[0].viewports[0].commands;
  const mine = commands.filter((command) => command.entityId === "cuadro");
  const texts = mine.filter((command) => command.kind === "text");
  // Marco + (filas − 1) + (columnas − 1) = 1 + 2 + 1: la rejilla del registro, intacta.
  eq(mine.filter((command) => command.kind === "path").length, 4, "la rejilla sigue viniendo del registro: 4 caminos");
  eq(texts.map((command) => (command.kind === "text" ? command.text : "")), ["Local", "Área (m²)", "Recámara", "12.50"], "un texto por celda llena; la vacía y la de fuera no");
  eq(texts.map((command) => (command.kind === "text" ? command.align : "")), ["left", "right", "left", "right"], "la alineación de la celda manda");
  const recamara = texts[2];
  const sonda = commands.find((command) => command.entityId === "sonda");
  assert.ok(recamara.kind === "text" && sonda?.kind === "text");
  checks += 1;
  ok(Math.hypot(recamara.point.x - sonda.point.x, recamara.point.y - sonda.point.y) < 1e-6, "la celda se ancla EXACTAMENTE donde un MTEXT en middle-left con la línea base bajo el centro (misma matriz)");
  // 90 mm × (1/50) = 1,8 mm de papel: dentro de la horquilla [1,5; 12].
  ok(Math.abs(recamara.size - 1.8) < 1e-9, `altura de texto 1,8 mm de papel (medida: ${recamara.size})`);
  eq(plan.warnings.filter((warning) => warning.entityId === "cuadro"), [], "y sin advertencias: ya no hay nada que declarar");
}

/* ── 2. La vista previa de trazado y 3. el PDF ───────────────────────────── */
{
  const document = documento();
  const pageSetup = { ...cadPageSetupFromLayout(document.paperSpaces[0]), paper: "A3" as const, orientation: "landscape" as const };
  const preview = buildCadPlotPreview({ document, pageSetup, plotStyleTable: createCadMonochromeTable("estudio") });
  const labels = preview.sheets[0].labels.map((label) => label.text);
  for (const text of ["Local", "Área (m²)", "Recámara", "12.50"]) ok(labels.includes(text), `la vista previa rotula «${text}»`);

  const job = buildCadPlotJob({ document, pageSetup, plotStyleTable: createCadMonochromeTable("estudio") });
  void renderCadPlotPdf(job.sheets, { compress: false, metadata: { title: "Cuadro" } }).then((pdf) => {
    const measured = measureCadPdf(pdf.bytes);
    const read = measured.labels.map((label) => label.text);
    for (const text of ["Local", "12.50"]) ok(read.includes(text), `el PDF lleva «${text}» en sus bytes, leído por el lector de medición (leyó: ${read.join(" · ")})`);
    ok(read.some((text) => text.startsWith("Rec")), "y el nombre del local (con o sin tilde según la codificación de la fuente)");
    console.log(`paper-space-table: ${checks} comprobaciones · un cuadro de 3 × 2 da 4 caminos y 4 textos en el plan, sus rótulos en la vista previa y su texto en los bytes del PDF`);
  });
}
