#!/usr/bin/env node
/**
 * Sonda de `PUBLISH`: un juego de siete láminas, publicado de una pasada, y
 * medido en los BYTES del PDF resultante — no en lo que el código cree haber
 * hecho.
 *
 * Construye siete presentaciones del MISMO documento, cada una con un muro de
 * 3,50 m dibujado a 1:50 dentro de su ventana gráfica. Publica el conjunto
 * entero con `publishCadSheetSet` (el motor real, sin atajos) y después abre
 * el PDF con `pdf-measure.ts` para comprobar que el muro de la LÁMINA 7 —la
 * que pide la campaña— sigue midiendo 70 mm sobre el papel. Es el mismo
 * criterio que ya usó el informe de lanzamiento: un muro de 3,5 m mide 70 mm
 * exactos a 1:50, leído del archivo, no de la intención.
 */
import { performance } from "node:perf_hooks";
import type { CadDocument, CadPaperSpace } from "../../apps/web/src/lib/cad/cad-document";
import { createCadLayout } from "../../apps/web/src/lib/cad/layout/layout-operations";
import { measureCadPdf, nearestCadPdfSegment } from "../../apps/web/src/lib/cad/plot/pdf-measure";
import { createCadSheetSet, renumberCadSheetSet, type CadSheetSet } from "../../apps/web/src/lib/cad/sheet-set/sheet-set";
import { publishCadSheetSet } from "../../apps/web/src/lib/cad/sheet-set/sheet-set-publish";

const SHEET_COUNT = 7;
const WALL_LENGTH_MM = 3_500;
const SCALE_DENOMINATOR = 50;
const EXPECTED_PRINTED_MM = WALL_LENGTH_MM / SCALE_DENOMINATOR;

function drawing(): CadDocument {
  let spaces: CadPaperSpace[] = [];
  for (let index = 0; index < SHEET_COUNT; index += 1) {
    const title = `Lámina ${index + 1}`;
    spaces = [
      ...spaces,
      createCadLayout(spaces, {
        id: `layout:${index + 1}`,
        name: title,
        templateId: "a1-landscape",
        modelBounds: { x: 0, y: 0, width: WALL_LENGTH_MM + 1_000, height: 3_000 },
        unit: "mm",
        metadata: {
          project: "Entrega del proyecto — sonda",
          drawingNumber: "A-0001",
          title,
          sheetNumber: "",
          revision: "P01",
          discipline: "Arquitectura",
          preparedBy: "sonda automática",
        },
        scale: SCALE_DENOMINATOR,
      }),
    ];
  }
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "MURO", name: "MURO", color: "#0000ff", visible: true, locked: false, lineweight: 0.18 }],
    entities: [
      {
        id: "muro-sonda",
        type: "line",
        layer: "MURO",
        start: { x: 0, y: 0, z: 0 },
        end: { x: WALL_LENGTH_MM, y: 0, z: 0 },
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sonda"] },
    paperSpaces: spaces,
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    externalReferences: [],
  } as unknown as CadDocument;
}

function sheetSet(): CadSheetSet {
  const base = createCadSheetSet({
    id: "set:sonda",
    name: "Entrega del proyecto — sonda de publicación",
    fields: { cliente: "Sonda de evidencia" },
  });
  return renumberCadSheetSet({
    ...base,
    sheets: Array.from({ length: SHEET_COUNT }, (_, index) => ({
      id: `sheet:${index + 1}`,
      order: index,
      documentId: "doc:sonda",
      layoutId: `layout:${index + 1}`,
      title: `Lámina ${index + 1}`,
      number: "",
      revision: "P01",
    })),
  });
}

async function main() {
  const document = drawing();
  const set = sheetSet();

  const startedAt = performance.now();
  const result = await publishCadSheetSet({
    set,
    documents: new Map([["doc:sonda", document]]),
    date: "2026-08-31",
    pdf: { compress: false },
  });
  const publishMs = performance.now() - startedAt;

  if (result.plan.skipped.length > 0)
    throw new Error(`la sonda no puede medir con hojas omitidas: ${JSON.stringify(result.plan.skipped)}`);
  if (result.pageCount !== SHEET_COUNT + 1)
    throw new Error(`se esperaban ${SHEET_COUNT + 1} páginas (portada + ${SHEET_COUNT}), salieron ${result.pageCount}`);

  const measurement = measureCadPdf(result.bytes);

  // La página 1 es la portada; la lámina N es la página N+1.
  const perSheetErrorMm = Array.from({ length: SHEET_COUNT }, (_, index) => {
    const page = index + 2;
    const segment = nearestCadPdfSegment(
      measurement.segments,
      EXPECTED_PRINTED_MM,
      (candidate) => candidate.page === page,
    );
    if (!segment) throw new Error(`no se encontró el muro en la página ${page} (lámina ${index + 1})`);
    return { sheet: index + 1, page, measuredMm: segment.lengthMm, errorMm: Math.abs(segment.lengthMm - EXPECTED_PRINTED_MM) };
  });

  const sheetSeven = perSheetErrorMm[6];
  const worstCase = perSheetErrorMm.reduce((worst, entry) => (entry.errorMm > worst.errorMm ? entry : worst));

  const output = {
    sheetCount: SHEET_COUNT,
    pageCount: result.pageCount,
    hasCover: result.hasCover,
    fileBytes: result.bytes.length,
    publishMs,
    msPerPage: publishMs / result.pageCount,
    wallLengthMm: WALL_LENGTH_MM,
    scale: `1:${SCALE_DENOMINATOR}`,
    expectedPrintedMm: EXPECTED_PRINTED_MM,
    sheetSevenMeasurement: sheetSeven,
    worstCase,
    perSheet: perSheetErrorMm,
    unreadable: measurement.unreadable,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
