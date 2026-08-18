/**
 * Conjuntos de planos: numeración, campos y publicación por lotes.
 *
 * La numeración se ancla a los números CONCRETOS que salen (`A-101`,
 * `A-102`…), y la publicación al PDF real: número de páginas y tamaño leídos
 * de sus bytes. Una prueba que sólo comprobase «hay un plan» pasaría con un
 * plan vacío.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import { inspectCadPdf } from "../plot/plot-pdf";
import { createCadMonochromeTable } from "../plot/plot-style-table";
import {
  addCadSheet,
  cadSheetNumberAt,
  createCadSheetSet,
  moveCadSheet,
  removeCadSheet,
  renumberCadSheetSet,
  serializeCadSheetSet,
  updateCadSheet,
  validateCadSheetSet,
  ordered,
} from "./sheet-set";
import {
  cadSheetFieldValues,
  resolveCadSheetFields,
  resolveCadSheetTitleBlock,
  unresolvedCadSheetFields,
} from "./sheet-set-fields";
import { buildCadSheetSetPublishPlan, publishCadSheetSet } from "./sheet-set-publish";

const DATE = "2026-08-09";

function documentWith(layoutIds: readonly { id: string; name: string }[]): CadDocument {
  let spaces = [] as ReturnType<typeof createCadLayout>[];
  for (const entry of layoutIds)
    spaces = [
      ...spaces,
      createCadLayout(spaces, {
        id: entry.id,
        name: entry.name,
        templateId: "a3-landscape",
        modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
        unit: "mm",
        metadata: {
          project: "Nave",
          drawingNumber: "A-0001",
          title: entry.name,
          sheetNumber: "",
          revision: "P01",
          discipline: "Arquitectura",
        },
      }),
    ];
  // Cajetín con campos SIN resolver: es lo que se quiere probar.
  spaces = spaces.map((space) => ({
    ...space,
    titleBlock: {
      attributes: {
        PROJECT: "%<Proyecto>%",
        SHEET_NO: "%<SheetNumber>%",
        TITLE: "%<SheetTitle>%",
        SHEET_OF: "Hoja %<SheetOf>%",
        SCALE: "Escala %<Scale>%",
        DATE: "%<Date>%",
        CLIENT: "%<Cliente>%",
      },
    },
  }));
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
    paperSpaces: spaces,
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

// --- numeración automática ----------------------------------------------------
{
  const numbering = { prefix: "A-", start: 101, step: 1, padding: 0, suffix: "" };
  assert.equal(cadSheetNumberAt(numbering, 0), "A-101");
  assert.equal(cadSheetNumberAt(numbering, 2), "A-103");
  assert.equal(cadSheetNumberAt({ ...numbering, step: 10 }, 2), "A-121");
  assert.equal(cadSheetNumberAt({ ...numbering, start: 7, padding: 3 }, 0), "A-007");
  assert.equal(cadSheetNumberAt({ ...numbering, suffix: "-R" }, 0), "A-101-R");

  let set = createCadSheetSet({ id: "set:nave", name: "Nave industrial" });
  set = addCadSheet(set, { id: "s1", documentId: "doc", layoutId: "l1", title: "Planta" });
  set = addCadSheet(set, { id: "s2", documentId: "doc", layoutId: "l2", title: "Alzado" });
  set = addCadSheet(set, { id: "s3", documentId: "doc", layoutId: "l3", title: "Sección" });
  assert.deepEqual(
    ordered(set).map((sheet) => sheet.number),
    ["A-101", "A-102", "A-103"],
  );

  // Insertar en medio renumera lo que viene detrás — media hora y dos erratas
  // menos por cada plano que entra tarde.
  set = addCadSheet(set, {
    id: "s4",
    documentId: "doc",
    layoutId: "l4",
    title: "Detalle",
    at: 1,
  });
  assert.deepEqual(
    ordered(set).map((sheet) => [sheet.title, sheet.number]),
    [
      ["Planta", "A-101"],
      ["Detalle", "A-102"],
      ["Alzado", "A-103"],
      ["Sección", "A-104"],
    ],
  );

  // Un número fijado sobrevive y NO consume posición.
  set = updateCadSheet(set, "s2", { number: "E-999", numberLocked: true });
  set = renumberCadSheetSet(set);
  assert.deepEqual(
    ordered(set).map((sheet) => sheet.number),
    ["A-101", "A-102", "E-999", "A-103"],
  );

  set = moveCadSheet(set, "s3", 0);
  assert.deepEqual(
    ordered(set).map((sheet) => sheet.id),
    ["s3", "s1", "s4", "s2"],
  );
  assert.equal(ordered(set)[0].number, "A-101");

  set = removeCadSheet(set, "s4");
  assert.deepEqual(
    ordered(set).map((sheet) => [sheet.id, sheet.number]),
    [
      ["s3", "A-101"],
      ["s1", "A-102"],
      ["s2", "E-999"],
    ],
  );
  assert.deepEqual(
    ordered(set).map((sheet) => sheet.order),
    [0, 1, 2],
  );
}

// --- validación ---------------------------------------------------------------
{
  let set = createCadSheetSet({ id: "set:x", name: "X" });
  assert.ok(validateCadSheetSet(set).some((issue) => issue.code === "no_publishable_sheets"));

  set = addCadSheet(set, { id: "a", documentId: "doc", layoutId: "l1", title: "A" });
  set = addCadSheet(set, { id: "b", documentId: "otro", layoutId: "l9", title: "" });
  set = updateCadSheet(set, "b", { number: "A-101" });

  const issues = validateCadSheetSet(set, {
    documentIds: new Set(["doc"]),
    layoutIdsByDocument: new Map([["doc", new Set(["l1"])]]),
  });
  assert.ok(
    issues.some((issue) => issue.code === "duplicate_number" && issue.severity === "error"),
    "dos planos con el mismo número es un error, no un aviso",
  );
  assert.ok(issues.some((issue) => issue.code === "empty_title"));
  assert.ok(issues.some((issue) => issue.code === "missing_document"));
}

// --- serializado canónico ------------------------------------------------------
{
  const a = addCadSheet(createCadSheetSet({ id: "s", name: "S" }), {
    id: "x",
    documentId: "d",
    layoutId: "l",
    title: "T",
  });
  const shuffled = { ...a, sheets: [...a.sheets].reverse() };
  assert.equal(serializeCadSheetSet(a), serializeCadSheetSet(shuffled));
  assert.ok(serializeCadSheetSet(a).includes('"title": "T"'), "el contenido anidado sobrevive");
}

// --- campos que se rellenan solos ---------------------------------------------
{
  let set = createCadSheetSet({
    id: "set:nave",
    name: "Nave industrial",
    description: "Proyecto básico",
    fields: { Proyecto: "Nave Los Olivos", Autor: "SVZ" },
  });
  set = addCadSheet(set, { id: "s1", documentId: "doc", layoutId: "layout:planta", title: "Planta" });
  set = addCadSheet(set, { id: "s2", documentId: "doc", layoutId: "layout:alzado", title: "Alzado" });

  const document = documentWith([
    { id: "layout:planta", name: "Planta" },
    { id: "layout:alzado", name: "Alzado" },
  ]);

  const values = cadSheetFieldValues({
    set,
    sheet: ordered(set)[1],
    layout: document.paperSpaces[1],
    date: DATE,
  });
  assert.equal(values.sheetnumber, "A-102");
  assert.equal(values.sheettitle, "Alzado");
  assert.equal(values.sheetof, "2 de 2");
  assert.equal(values.sheetcount, "2");
  assert.equal(values.sheetset, "Nave industrial");
  assert.equal(values.proyecto, "Nave Los Olivos");
  assert.equal(values.date, DATE);
  assert.equal(values.layoutname, "Alzado");
  assert.ok(values.scale.startsWith("1:"));

  assert.equal(
    resolveCadSheetFields("Plano %<SheetNumber>% — %<SheetOf>%", values),
    "Plano A-102 — 2 de 2",
  );
  // Lo desconocido se QUEDA escrito: un hueco en blanco pasa la revisión.
  assert.equal(resolveCadSheetFields("%<Cliente>%", values), "%<Cliente>%");
  assert.deepEqual(unresolvedCadSheetFields("%<Cliente>% %<Proyecto>%", values), ["Cliente"]);

  const titleBlock = resolveCadSheetTitleBlock({
    set,
    sheet: ordered(set)[0],
    layout: document.paperSpaces[0],
    date: DATE,
  });
  assert.equal(titleBlock.attributes.SHEET_NO, "A-101");
  assert.equal(titleBlock.attributes.TITLE, "Planta");
  assert.equal(titleBlock.attributes.PROJECT, "Nave Los Olivos");
  assert.equal(titleBlock.attributes.SHEET_OF, "Hoja 1 de 2");
  assert.equal(titleBlock.attributes.DATE, DATE);
  assert.equal(titleBlock.attributes.CLIENT, "%<Cliente>%");
  assert.deepEqual(titleBlock.unresolved, ["Cliente"]);
}

// --- publicación por lotes -----------------------------------------------------
async function publishSpecs(): Promise<void> {
  let set = createCadSheetSet({
    id: "set:nave",
    name: "Nave industrial",
    fields: { Proyecto: "Nave Los Olivos" },
  });
  set = addCadSheet(set, { id: "s1", documentId: "doc-a", layoutId: "layout:planta", title: "Planta" });
  set = addCadSheet(set, { id: "s2", documentId: "doc-a", layoutId: "layout:alzado", title: "Alzado" });
  set = addCadSheet(set, { id: "s3", documentId: "doc-b", layoutId: "layout:detalle", title: "Detalle" });
  // Una hoja de un dibujo que NO está cargado: tiene que decirse, no colarse.
  set = addCadSheet(set, { id: "s4", documentId: "doc-z", layoutId: "layout:x", title: "Ausente" });

  const documents = new Map([
    ["doc-a", documentWith([{ id: "layout:planta", name: "Planta" }, { id: "layout:alzado", name: "Alzado" }])],
    ["doc-b", documentWith([{ id: "layout:detalle", name: "Detalle" }])],
  ]);

  const plan = buildCadSheetSetPublishPlan({ set, documents, date: DATE });
  assert.equal(plan.pages.length, 3, "tres hojas publicables de cuatro");
  assert.deepEqual(
    plan.pages.map((page) => page.number),
    ["A-101", "A-102", "A-103"],
  );
  assert.deepEqual(
    plan.pages.map((page) => page.titleBlock.SHEET_OF),
    ["Hoja 1 de 4", "Hoja 2 de 4", "Hoja 3 de 4"],
  );
  assert.equal(plan.pages[0].titleBlock.PROJECT, "Nave Los Olivos");
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].sheetId, "s4");
  assert.ok(plan.skipped[0].reason.includes("doc-z"));
  assert.ok(plan.issues.some((issue) => issue.code === "missing_document"));
  assert.equal(plan.sheets.length, 3, "una hoja de trazado por página");

  // El documento original NO se tocó: los campos siguen sin resolver en él.
  assert.equal(
    documents.get("doc-a")!.paperSpaces[0].titleBlock?.attributes.SHEET_NO,
    "%<SheetNumber>%",
    "publicar no muta el dibujo",
  );

  const published = await publishCadSheetSet({
    set,
    documents,
    date: DATE,
    fileName: "nave-planos",
    plotStyleTables: new Map([["estudio", createCadMonochromeTable("estudio")]]),
    pdf: { compress: false },
  });
  assert.equal(published.fileName, "nave-planos.pdf");
  // Portada más las TRES láminas publicables. La portada es página del PDF
  // pero no lámina del juego: no consume número, y por eso el índice sigue
  // numerando 1/3 … 3/3 y no 2/4 … 4/4.
  assert.equal(published.hasCover, true);
  assert.equal(published.pageCount, 4);
  assert.deepEqual(
    published.plan.coverRows.map((row) => row.sheetOf),
    ["1/3", "2/3", "3/3"],
  );

  const inspected = inspectCadPdf(published.bytes);
  assert.equal(inspected.pageCount, 4, "UN PDF con portada y láminas, no cuatro archivos");
  // A3 apaisado: 420 × 297 mm.
  for (const size of inspected.pageSizesMm) {
    assert.ok(Math.abs(size.width - 420) < 0.05, `ancho ${size.width} ≠ 420 mm`);
    assert.ok(Math.abs(size.height - 297) < 0.05, `alto ${size.height} ≠ 297 mm`);
  }
  assert.ok(inspected.baseFonts.length > 0, "el PDF declara sus fuentes");
  assert.ok(
    published.warnings.some((warning) => warning.includes("s4")),
    "la hoja omitida se dice en las advertencias, no se omite en silencio",
  );

  // Publicar un subconjunto da un PDF con SOLO esas páginas.
  const partial = await publishCadSheetSet({
    set,
    documents,
    date: DATE,
    sheetIds: ["s2"],
    pdf: { compress: false },
  });
  assert.equal(partial.pageCount, 2, "su portada y su única lámina");
  assert.equal(inspectCadPdf(partial.bytes).pageCount, 2);
  assert.equal(partial.plan.pages[0].number, "A-102");

  // Y sin portada, cuando quien publica sólo quiere las láminas.
  const bare = await publishCadSheetSet({
    set,
    documents,
    date: DATE,
    sheetIds: ["s2"],
    cover: false,
    pdf: { compress: false },
  });
  assert.equal(bare.hasCover, false);
  assert.equal(bare.pageCount, 1);

  console.log(
    `Conjunto publicado: ${inspected.pageCount} páginas en un PDF, ${inspected.pageSizesMm[0].width} × ${inspected.pageSizesMm[0].height} mm`,
  );
}

publishSpecs().then(
  () => {
    console.log("cad sheet set specs passed");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
