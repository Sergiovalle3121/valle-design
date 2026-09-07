/**
 * EL TRABAJO DE TRAZADO TRATA LO DIBUJADO SOBRE EL PAPEL COMO LO DE LA VENTANA.
 *
 * `buildCadPlotJob` pasaba cada comando de VENTANA por la tabla de plumas, el
 * monocromo y el factor de grosores, y `...sheet` dejaba pasar `paperCommands`
 * (T-30) con el color crudo de su capa y el grosor sin escalar: un plano en
 * monocromo salía con sus notas de papel en rojo. El recuento de fuentes, el
 * trazado de `.shx` (`plot-stroke-text.ts`) y la previa iteraban también sólo
 * las ventanas, así que la previa —documentada como «la MISMA geometría que va
 * al PDF»— omitía todo lo dibujado sobre el papel.
 *
 * Aquí se afirma sobre el trabajo ENTERO. El dibujo lleva un muro en modelo y
 * una línea y un rótulo en `paperSpace.entityIds`, que es por donde entra lo
 * que se dibuja directamente sobre la hoja.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import type { CadPublishSheet, CadVectorCommand } from "../paper-space";
import { cadPageSetupFromLayout } from "./page-setup";
import { buildCadPlotJob, buildCadPlotPreview } from "./plot-job";
import { cadStrokeSheetText } from "./plot-stroke-text";
import { createCadMonochromeTable } from "./plot-style-table";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Un muro azul en modelo; una línea y un rótulo ROJOS sobre el papel. */
function drawing(family = "Arial"): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: { project: "Nave", drawingNumber: "A-0001", title: "Planta", sheetNumber: "S-001", revision: "P01", discipline: "Arquitectura" },
    scale: 50,
  });
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "MURO", name: "MURO", color: "#0000ff", visible: true, locked: false, lineweight: 0.18 },
      { id: "NOTAS", name: "NOTAS", color: "#ff0000", visible: true, locked: false, lineweight: 0.18 },
    ],
    entities: [
      { id: "muro-sur", type: "line", layer: "MURO", start: { x: 0, y: 0, z: 0 }, end: { x: 10_000, y: 0, z: 0 } },
      // En papel: milímetros de hoja, sin proyectar por ninguna ventana.
      { id: "nota-linea", type: "line", layer: "NOTAS", start: { x: 20, y: 270, z: 0 }, end: { x: 190, y: 270, z: 0 } },
      { id: "nota-texto", type: "text", layer: "NOTAS", x: 20, y: 260, text: "NOTAS GENERALES", height: 4, style: "NOTAS" },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur"] },
    paperSpaces: [{ ...layout, entityIds: ["nota-linea", "nota-texto"] }],
    styles: { text: { NOTAS: { fontFamily: family } }, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

const path = (command: CadVectorCommand | undefined) =>
  command?.kind === "path" ? command : null;
const text = (command: CadVectorCommand | undefined) =>
  command?.kind === "text" ? command : null;

// --- 1 · plumas, monocromo y factor de grosores llegan al papel -------------
{
  const document = drawing();
  const pageSetup = {
    ...cadPageSetupFromLayout(document.paperSpaces[0]),
    colorMode: "monochrome" as const,
    lineweightScale: 3,
  };
  const job = buildCadPlotJob({
    document,
    pageSetup,
    plotStyleTable: createCadMonochromeTable("estudio"),
  });
  const sheet = job.sheets[0];
  const paper = sheet.paperCommands ?? [];
  eq(paper.length, 2, "la línea y el rótulo de papel llegan al trabajo");

  // Referencia: el muro azul (ACI 5) pasa por la CTB → 0,50 mm × 3 y negro.
  const muro = path(sheet.viewports[0].commands.find((command) => command.entityId === "muro-sur"));
  ok(muro && Math.abs(muro.style.lineWidth - 1.5) < 1e-9, "la ventana sigue pasando por la CTB y el factor");

  // Y lo de papel, IGUAL: rojo (ACI 1) → 0,25 mm × 3, negro por el monocromo.
  const linea = path(paper.find((command) => command.entityId === "nota-linea"));
  ok(linea, "la línea de papel sigue siendo un camino");
  eq(linea!.style.stroke, "#000000", "monocromo: la línea de papel NO sale en rojo");
  ok(
    Math.abs(linea!.style.lineWidth - 0.75) < 1e-9,
    `la línea de papel pasa por la CTB y el factor de grosores (0,75 mm), salió ${linea!.style.lineWidth}`,
  );
  const rotulo = text(paper.find((command) => command.entityId === "nota-texto"));
  ok(rotulo, "el rótulo de papel sigue siendo texto (Arial no se traza)");
  eq(rotulo!.color, "#000000", "monocromo: el rótulo de papel NO sale en rojo");

  // El informe de fuentes cuenta el rótulo de papel: es el ÚNICO texto del dibujo.
  eq(
    job.fontUsage.find((entry) => entry.family === "Arial")?.usageCount,
    1,
    "el recuento de familias incluye el rótulo dibujado sobre el papel",
  );

  // La previa enseña la misma geometría: muro + línea de papel, y el rótulo.
  const preview = buildCadPlotPreview({
    document,
    pageSetup,
    plotStyleTable: createCadMonochromeTable("estudio"),
  });
  eq(preview.sheets[0].strokes.length, 2, "la previa lleva el muro Y la línea de papel");
  eq(preview.sheets[0].labels.length, 1, "la previa lleva el rótulo de papel");
  eq(preview.sheets[0].labels[0]?.text, "NOTAS GENERALES", "y es el rótulo de papel");
  // El papel va DESPUÉS de las ventanas, en el mismo orden en que lo pinta el PDF.
  const ultimo = preview.sheets[0].strokes.at(-1)!;
  eq(ultimo.color, "#000000", "la previa pinta la línea de papel ya en monocromo");
  ok(Math.abs(ultimo.lineWidth - 0.75) < 1e-9, "y con el grosor final de la CTB");
}

// --- 2 · un rótulo de .shx sobre el papel también se traza -----------------
{
  const document = drawing("ISOCP.shx");
  const job = buildCadPlotJob({ document, pageSetup: cadPageSetupFromLayout(document.paperSpaces[0]) });
  eq(job.strokedFamilies.join(","), "ISOCP.shx", "la familia del rótulo de papel se declara trazada");
  const paper = job.sheets[0].paperCommands ?? [];
  ok(!paper.some((command) => command.kind === "text"), "el rótulo de papel ya NO viaja como texto");
  ok(paper.filter((command) => command.kind === "path").length > 2, "viaja como trazos, además de la línea");
  eq(
    job.fontUsage.find((entry) => entry.family === "ISOCP.shx")?.usageCount,
    1,
    "y el recuento sigue nombrando la familia que el dibujo pedía",
  );
}

// --- 3 · cadStrokeSheetText conserva la forma de la hoja -------------------
{
  const base: CadPublishSheet = {
    id: "s1",
    name: "Hoja",
    width: 297,
    height: 210,
    orientation: "landscape",
    colorMode: "color",
    lineweightScale: 1,
    titleBlock: {},
    viewports: [{ id: "vp", name: "Ventana", clip: { x: 0, y: 0, width: 297, height: 210 }, scale: 100, locked: false, commands: [] }],
  };
  const rotulo: CadVectorCommand = {
    kind: "text",
    entityId: "t-papel",
    viewportId: "s1:paper",
    point: { x: 40, y: 60 },
    text: "PLANTA BAJA",
    size: 3,
    rotation: 0,
    color: "#101010",
  };
  const fuentes = new Map([["t-papel", "ISOCP.shx"]]);

  const sinPapel = cadStrokeSheetText([base], fuentes);
  ok(!("paperCommands" in sinPapel.sheets[0]), "una hoja sin `paperCommands` sale sin el campo (forma intacta)");

  const conPapel = cadStrokeSheetText([{ ...base, paperCommands: [rotulo] }], fuentes);
  eq(conPapel.strokedFamilies.join(","), "ISOCP.shx", "la familia del rótulo de papel se declara trazada");
  ok(
    (conPapel.sheets[0].paperCommands ?? []).every((command) => command.kind === "path" && command.entityId === "t-papel"),
    "el rótulo de papel se convirtió en trazos que conservan de quién son",
  );
}

console.log(`plot-job: ${verdes} comprobaciones verdes`);
