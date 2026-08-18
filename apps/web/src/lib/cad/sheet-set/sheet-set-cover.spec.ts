/**
 * Serie de láminas: un solo PDF, numerado, con portada coherente.
 *
 * ## Qué se afirma, y contra qué
 *
 * Contra el ARCHIVO. No basta con que las estructuras internas cuadren: lo que
 * el arquitecto entrega son unos bytes, y la comprobación que vale es abrir
 * esos bytes y leer que en la página de la lámina 3 pone «3/6» y que en la
 * portada, junto a su número de plano, pone lo mismo. Una portada que dice
 * «A-103» sobre una lámina rotulada «A-104» es un juego que manda a obra el
 * plano equivocado, y ningún tipo de TypeScript lo impide.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadPaperSpace } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import { measureCadPdf } from "../plot/pdf-measure";
import { cadCoverRowCapacity, buildCadCoverSheet } from "./sheet-set-cover";
import { createCadSheetSet, renumberCadSheetSet, type CadSheetSet } from "./sheet-set";
import { publishCadSheetSet } from "./sheet-set-publish";

const TITLES = [
  "Planta de conjunto",
  "Planta baja",
  "Planta alta",
  "Cortes A-A y B-B",
  "Fachadas",
  "Detalles constructivos",
];

function drawing(): CadDocument {
  let spaces: CadPaperSpace[] = [];
  TITLES.forEach((title, index) => {
    spaces = [
      ...spaces,
      createCadLayout(spaces, {
        id: `layout:${index + 1}`,
        name: title,
        templateId: "a1-landscape",
        modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
        unit: "mm",
        metadata: {
          project: "Casa Vallarta",
          drawingNumber: "A-0001",
          title,
          sheetNumber: "",
          revision: "B",
          discipline: "Arquitectura",
          preparedBy: "S. Valle",
        },
        scale: 50,
      }),
    ];
  });
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "MURO", name: "MURO", color: "#0000ff", visible: true, locked: false, lineweight: 0.18 },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        layer: "MURO",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10_000, y: 0, z: 0 },
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur"] },
    paperSpaces: spaces,
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    externalReferences: [],
  } as unknown as CadDocument;
}

function sheetSet(): CadSheetSet {
  const base = createCadSheetSet({
    id: "set:vallarta",
    name: "Casa Vallarta — Arquitectónico",
    description: "Juego arquitectónico para licencia municipal",
    fields: { cliente: "Familia Vallarta" },
  });
  return renumberCadSheetSet({
    ...base,
    sheets: TITLES.map((title, index) => ({
      id: `sheet:${index + 1}`,
      order: index,
      documentId: "doc:1",
      layoutId: `layout:${index + 1}`,
      title,
      number: "",
      revision: "B",
    })),
  });
}

async function specs(): Promise<void> {
  const document = drawing();
  const set = sheetSet();
  const result = await publishCadSheetSet({
    set,
    documents: new Map([["doc:1", document]]),
    date: "2026-08-18",
    pdf: { compress: false },
  });

  // --- UN SOLO PDF, PAGINADO -------------------------------------------------
  assert.equal(result.plan.skipped.length, 0, `hojas omitidas: ${JSON.stringify(result.plan.skipped)}`);
  assert.equal(result.hasCover, true, "un juego se entrega con índice");
  assert.equal(
    result.pageCount,
    TITLES.length + 1,
    "una portada más seis láminas, en un único archivo",
  );
  assert.equal(result.fileName, "Casa Vallarta — Arquitectónico.pdf");
  assert.deepEqual(
    result.pages.slice(1).map((page) => page.sheetId),
    TITLES.map((_, index) => `layout:${index + 1}`),
    "las láminas salen en el orden del conjunto",
  );

  // --- LA NUMERACIÓN ES LA DEL CONJUNTO, NO LA DEL TRABAJO -------------------
  assert.deepEqual(
    result.plan.coverRows.map((row) => row.number),
    ["A-101", "A-102", "A-103", "A-104", "A-105", "A-106"],
  );
  assert.deepEqual(
    result.plan.coverRows.map((row) => row.sheetOf),
    ["1/6", "2/6", "3/6", "4/6", "5/6", "6/6"],
    "la portada NO consume número: seis láminas son 1/6 … 6/6",
  );
  assert.deepEqual(
    result.plan.titleBlocks.map((block) => block.fields.sheetOf),
    result.plan.coverRows.map((row) => row.sheetOf),
    "el índice se deriva de los cajetines: no puede discrepar de ellos",
  );
  for (const block of result.plan.titleBlocks)
    assert.equal(block.fields.scale, "1:50", "la escala del cajetín sale de la ventana gráfica");

  // --- Y AHORA, CONTRA LOS BYTES DEL ARCHIVO ---------------------------------
  const measurement = measureCadPdf(result.bytes);
  assert.equal(measurement.pages.length, TITLES.length + 1);

  const textOn = (page: number) =>
    measurement.labels.filter((label) => label.page === page).map((label) => label.text);

  const cover = textOn(1);
  assert.ok(cover.includes("Casa Vallarta — Arquitectónico"), "la portada lleva el nombre del juego");
  // Y NO lleva cajetín. Un índice no es una lámina: no tiene número de plano ni
  // escala, y un cajetín vacío en la portada rotularía una posición de serie que
  // no le corresponde —«1/7» sobre un juego de seis— contradiciendo a las hojas.
  for (const label of ["PROYECTO", "Nº DE PLANO", "DIBUJÓ", "REVISÓ"])
    assert.ok(
      !cover.includes(label),
      `la portada trae un cajetín que no le toca: apareció «${label}» en ${JSON.stringify(cover)}`,
    );
  for (const row of result.plan.coverRows) {
    assert.ok(cover.includes(row.number), `la portada no lista ${row.number}`);
    assert.ok(cover.includes(row.title), `la portada no lista «${row.title}»`);
  }

  // La coherencia de verdad: lo impreso en la portada y lo impreso en la lámina.
  result.plan.coverRows.forEach((row, index) => {
    const printed = textOn(index + 2);
    assert.ok(
      printed.includes(row.sheetOf),
      `la lámina ${index + 1} no imprime «${row.sheetOf}»; imprime ${JSON.stringify(printed)}`,
    );
    assert.ok(
      printed.includes(row.number),
      `la lámina ${index + 1} no imprime su número «${row.number}»`,
    );
    assert.ok(printed.includes(row.title), `la lámina ${index + 1} no imprime su título`);
    assert.ok(printed.includes("2026-08-18"), "la fecha de publicación va en el cajetín");
  });

  // --- PUBLICAR UN SUBCONJUNTO NO MIENTE SOBRE EL TOTAL ----------------------
  const partial = await publishCadSheetSet({
    set,
    documents: new Map([["doc:1", document]]),
    date: "2026-08-18",
    sheetIds: ["sheet:2", "sheet:4"],
    pdf: { compress: false },
  });
  assert.equal(partial.pageCount, 3, "portada más dos láminas");
  assert.deepEqual(
    partial.plan.coverRows.map((row) => row.sheetOf),
    ["1/2", "2/2"],
    "dos láminas entregadas son «1/2» y «2/2», no «2/6» y «4/6»: el total es lo que se entrega",
  );
  assert.deepEqual(
    partial.plan.coverRows.map((row) => row.number),
    ["A-102", "A-104"],
    "el número de plano sí es el del conjunto: es contractual y no se renumera al publicar",
  );

  // --- UNA PORTADA QUE NO CABE LO DICE ---------------------------------------
  const capacity = cadCoverRowCapacity({ height: 297 }, { top: 10, right: 10, bottom: 10, left: 20 });
  const many = buildCadCoverSheet({
    setName: "Juego enorme",
    page: { width: 210, height: 297, orientation: "portrait" },
    margins: { top: 10, right: 10, bottom: 10, left: 20 },
    rows: Array.from({ length: capacity + 5 }, (_, index) => ({
      index: index + 1,
      sheetOf: `${index + 1}/${capacity + 5}`,
      number: `A-${101 + index}`,
      title: `Lámina ${index + 1}`,
      scale: "1:50",
      revision: "A",
    })),
  });
  assert.equal(many.overflowRows.length, 5, "las filas que no caben se cuentan, no se tiran");

  console.log(
    `serie: 1 portada + ${TITLES.length} láminas en un PDF de ${result.bytes.length} bytes; ` +
      `numeración ${result.plan.coverRows.map((row) => row.sheetOf).join(" ")}`,
  );
}

specs().then(
  () => {
    console.log("cad sheet set cover specs passed");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
