/**
 * T-35 · LA LISTA DE LÍNEAS, EN EL PDF TRAZADO — no sólo en el documento.
 *
 * `plant-schedule-table.spec.ts` (junto a `data-extraction-commands.spec.ts`)
 * ya prueba que `DATAEXTRACTION líNeas`/`Materiales` insertan una `TABLE` de
 * verdad en el documento. Lo que falta —el mismo patrón que
 * `paper-space-table.spec.ts` fija para el cuadro de superficies y
 * `electrical-attributes-plot.spec.ts` para la etiqueta eléctrica (T-15)— es
 * la prueba de que esa tabla llega al PAPEL: documento → plan de publicación
 * → trazado real → PDF → `measureCadPdf` leyendo los bytes.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import { buildCadPlantLineScheduleTable } from "./plant-schedule-table";
import { buildCadPublishPlan } from "../paper-space";
import { cadPageSetupFromLayout } from "../plot/page-setup";
import { buildCadPlotJob } from "../plot/plot-job";
import { createCadMonochromeTable } from "../plot/plot-style-table";
import { renderCadPlotPdf } from "../plot/plot-pdf";
import { measureCadPdf } from "../plot/pdf-measure";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const linea: CadEntity = {
  id: "l1",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 10_000, y: 0, z: 0 },
  ],
  closed: false,
  layer: "TU-PROC",
  context: {
    metadata: { "pl:linea": '6"-P-1001-CS150', "pl:servicio": "P", "pl:especificacion": "CS150" },
  },
} as never;

function documento(): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta-industrial",
    name: "Planta industrial",
    templateId: "a3-landscape",
    modelBounds: { x: 0, y: 0, width: 12_000, height: 3_000 },
    unit: "mm",
    metadata: {
      project: "Refinería", drawingNumber: "PL-001", title: "Lista de líneas",
      sheetNumber: "PL-01", revision: "P01", discipline: "Planta",
    },
    scale: 100,
  });
  const tabla = buildCadPlantLineScheduleTable({ entities: [linea] }, { x: 0, y: 2_000 }, "0", () => "tabla-lineas", "mm");
  const entities = [linea, tabla];
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

const document = documento();

// (1) El plan de publicación lleva las celdas de la tabla como texto vectorial.
{
  const plan = buildCadPublishPlan(document);
  const commands = plan.sheets[0].viewports[0].commands;
  ok(
    commands.some((command) => command.kind === "text" && command.text === '6"-P-1001-CS150'),
    "el número de línea sale como texto vectorial en la lámina",
  );
  ok(
    commands.some((command) => command.kind === "text" && command.text === "10.0"),
    "y su longitud, también",
  );
}

// (2) El PDF trazado la lleva en sus BYTES.
{
  const pageSetup = { ...cadPageSetupFromLayout(document.paperSpaces[0]), paper: "A3" as const, orientation: "landscape" as const };
  const job = buildCadPlotJob({ document, pageSetup, plotStyleTable: createCadMonochromeTable("estudio") });
  void renderCadPlotPdf(job.sheets, { compress: false, metadata: { title: "Lista de líneas" } }).then((pdf) => {
    const measured = measureCadPdf(pdf.bytes);
    const read = measured.labels.map((label) => label.text);
    ok(
      read.includes('6"-P-1001-CS150'),
      `el PDF trazado lleva el número de línea en sus bytes (leyó: ${read.join(" · ")})`,
    );
    ok(read.includes("10.0"), `y la longitud (leyó: ${read.join(" · ")})`);
    console.log(
      `plant-schedule-table-plot: ${checks} comprobaciones verdes — la lista de líneas de Planta llega al PDF trazado, no sólo al renglón de PIDLIST`,
    );
  });
}
