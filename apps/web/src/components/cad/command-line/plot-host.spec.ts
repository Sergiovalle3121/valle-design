/**
 * El anfitrión de trazado produce un ARCHIVO.
 *
 * La prueba que importa: teclear PLOT tiene que acabar en unos bytes de PDF
 * entregados al usuario, con el número de páginas y el tamaño de papel
 * correctos. Un anfitrión que compone la petición y no emite nada pasaría
 * cualquier prueba que sólo mire el renglón que devuelve.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "@/lib/cad/cad-document";
import { createCadLayout } from "@/lib/cad/layout/layout-operations";
import { cadPageSetupFromLayout } from "@/lib/cad/plot/page-setup";
import { createCadMonochromeTable } from "@/lib/cad/plot/plot-style-table";
import { inspectCadPdf } from "@/lib/cad/plot/plot-pdf";
import { CadPlotHost } from "./plot-host";

function drawing(): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a3-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: {
      project: "Nave",
      drawingNumber: "A-0001",
      title: "Planta",
      sheetNumber: "S-001",
      revision: "P01",
      discipline: "Arquitectura",
    },
  });
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "MURO", name: "MURO", color: "#0000ff", visible: true, locked: false, lineweight: 0.18 },
    ],
    entities: [
      {
        id: "muro",
        type: "line",
        layer: "MURO",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10_000, y: 0, z: 0 },
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro"] },
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

interface Downloaded {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
}

async function specs(): Promise<void> {
  const document = drawing();
  const pageSetup = cadPageSetupFromLayout(document.paperSpaces[0]);
  const downloads: Downloaded[] = [];
  const results: Array<{ message: string; level: string }> = [];
  let previewed = 0;
  let space: string | null = null;

  const host = new CadPlotHost({
    document: () => document,
    plotStyleTables: () => new Map([["estudio", createCadMonochromeTable("estudio")]]),
    download: (fileName, bytes, mimeType) => downloads.push({ fileName, bytes, mimeType }),
    preview: () => {
      previewed += 1;
    },
    setSpace: (next, layoutId) => {
      space = `${next}:${layoutId ?? ""}`;
    },
    onResult: (message, level) => results.push({ message, level }),
  });

  // --- cambio de espacio ---------------------------------------------------
  assert.match(host.handle({ kind: "space", space: "paper", layoutId: "layout:planta" }), /papel/i);
  assert.equal(space, "paper:layout:planta");
  assert.match(host.handle({ kind: "space", space: "model" }), /modelo/i);

  // --- vista previa --------------------------------------------------------
  const previewMessage = host.handle({
    kind: "plot",
    mode: "preview",
    request: { layoutId: "layout:planta", pageSetup, fileName: "planta", copies: 1 },
  });
  assert.equal(previewed, 1);
  assert.match(previewMessage, /Vista previa de 1 hoja/);

  // --- trazado: sale un PDF de verdad --------------------------------------
  const message = host.handle({
    kind: "plot",
    mode: "plot",
    request: { layoutId: "layout:planta", pageSetup, fileName: "planta-general", copies: 1 },
  });
  assert.match(message, /Trazando planta-general/);

  // La emisión es asíncrona a propósito: la línea de comandos no espera.
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let attempt = 0; attempt < 200 && downloads.length === 0; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(downloads.length, 1, "el trazado entregó un archivo");
  assert.equal(downloads[0].fileName, "planta-general.pdf");
  assert.equal(downloads[0].mimeType, "application/pdf");

  const inspected = inspectCadPdf(downloads[0].bytes);
  assert.equal(inspected.pageCount, 1);
  // A3 apaisado: 420 × 297 mm.
  assert.ok(Math.abs(inspected.pageSizesMm[0].width - 420) < 0.05);
  assert.ok(Math.abs(inspected.pageSizesMm[0].height - 297) < 0.05);
  assert.ok(inspected.baseFonts.length > 0);
  assert.ok(
    results.some((entry) => entry.level === "info" && /1 página/.test(entry.message)),
    `los renglones fueron: ${results.map((entry) => entry.message).join(" | ")}`,
  );

  // --- una CTB que no está cargada se niega ANTES de trazar ----------------
  const refused = host.handle({
    kind: "plot",
    mode: "plot",
    request: {
      layoutId: "layout:planta",
      pageSetup: { ...pageSetup, plotStyleTable: "no-existe" },
      fileName: "x",
      copies: 1,
    },
  });
  assert.match(refused, /no está cargada/);
  assert.equal(downloads.length, 1, "y no se descargó nada");

  // --- sin dibujo abierto, se dice ----------------------------------------
  const empty = new CadPlotHost({ document: () => null, download: () => {} });
  assert.match(
    empty.handle({
      kind: "plot",
      mode: "plot",
      request: { layoutId: "layout:planta", pageSetup, fileName: "x", copies: 1 },
    }),
    /ningún dibujo abierto/,
  );
  assert.match(empty.handle({ kind: "page-setup", layoutId: "layout:planta" }), /no está disponible/);

  console.log(
    `PLOT → ${downloads[0].fileName}: ${inspected.pageCount} página, ${inspected.pageSizesMm[0].width} × ${inspected.pageSizesMm[0].height} mm`,
  );
}

specs().then(
  () => {
    console.log("cad plot host specs passed");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
