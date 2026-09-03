/**
 * Publicación por lotes: un conjunto de planos, un PDF paginado.
 *
 * ## Qué hace y en qué orden
 *
 * Recorre las hojas del conjunto EN SU ORDEN, y por cada una:
 *
 * 1. busca su documento y su presentación;
 * 2. resuelve los campos del cajetín contra el conjunto (`%<SheetNumber>%` →
 *    `A-103`, `%<SheetOf>%` → `3 de 12`);
 * 3. construye el trabajo de trazado con la configuración de página y la tabla
 *    de plumas de esa hoja;
 * 4. acumula la hoja resultante.
 *
 * Y al final emite UN PDF con todas las páginas. No veinte archivos que alguien
 * junta después: la carpeta que se manda al cliente es un documento, y que lo
 * sea desde el principio evita que una hoja se quede fuera.
 *
 * ## Los documentos entran, no se buscan
 *
 * Este módulo no sabe abrir un dibujo. Recibe los que ya están cargados y dice
 * cuáles le faltan. Es lo que le permite correr entero en Node —sin red y sin
 * SDK— y lo que hace que un fallo de red al traer un dibujo sea un problema del
 * anfitrión y no un PDF con diecinueve hojas presentado como completo.
 */
import type { CadDocument, CadPaperSpace } from "../cad-document";
import { cadFindPlotStyleTable } from "../plot/plot-style-table";
import type { CadPublishSheet } from "../paper-space";
import { cadPageSetupFromLayout, type CadPageSetup } from "../plot/page-setup";
import { buildCadPlotJob } from "../plot/plot-job";
import type { CadPlotStyleTable } from "../plot/plot-style-table";
import {
  renderCadPlotPdf,
  type CadPlotPdfOptions,
  type CadPlotPdfResult,
} from "../plot/plot-pdf";
import type { CadPlotFontUsage } from "../plot/plot-fonts";
import type { CadTitleBlockLayout } from "../plot/title-block";
import { resolveCadSheetTitleBlock } from "./sheet-set-fields";
import {
  buildCadCoverSheet,
  cadCoverRowsFromTitleBlocks,
  type CadCoverRow,
} from "./sheet-set-cover";
import { ordered, validateCadSheetSet, type CadSheetSet, type CadSheetSetIssue } from "./sheet-set";

export interface CadSheetSetPublishRequest {
  sheetSetId: string;
  /** Sólo estas hojas. Vacío o ausente = todas las publicables. */
  sheetIds?: readonly string[];
  fileName: string;
}

export interface CadSheetSetPublishInput {
  set: CadSheetSet;
  /** Documentos ya cargados, por id. */
  documents: ReadonlyMap<string, CadDocument>;
  /** Tablas de plumas cargadas, por nombre. */
  plotStyleTables?: ReadonlyMap<string, CadPlotStyleTable>;
  /** Fecha de publicación, inyectada para que el resultado sea reproducible. */
  date: string;
  sheetIds?: readonly string[];
  /** Configuración de página común. Sin ella, la de cada presentación. */
  pageSetup?: CadPageSetup;
  /**
   * Anteponer la portada con el índice del juego. Encendida por defecto: lo
   * que se entrega es un documento, y un documento de veinte láminas sin
   * índice obliga a hojearlo entero para saber si están todas.
   */
  cover?: boolean;
}

export interface CadSheetSetPublishPage {
  sheetId: string;
  number: string;
  title: string;
  documentId: string;
  layoutId: string;
  /** Campos del cajetín ya resueltos. */
  titleBlock: Record<string, string>;
  /** Campos que quedaron sin resolver en esta hoja. */
  unresolvedFields: string[];
}

export interface CadSheetSetPublishPlan {
  pages: CadSheetSetPublishPage[];
  /** Hojas listas para el emisor, en el orden del conjunto. */
  sheets: CadPublishSheet[];
  issues: CadSheetSetIssue[];
  /** Hojas omitidas y por qué. Nunca se omite en silencio. */
  skipped: Array<{ sheetId: string; reason: string }>;
  /** Cajetín colocado de cada lámina, en el mismo orden que `sheets`. */
  titleBlocks: CadTitleBlockLayout[];
  /** Índice del juego, derivado de esos cajetines. */
  coverRows: CadCoverRow[];
  /** Familias que piden los rótulos de todo el juego. */
  fontUsage: CadPlotFontUsage[];
  fontByEntity: Map<string, string>;
  /** Familias que ya viajan dibujadas con sus trazos (`plot-stroke-text.ts`). */
  strokedFamilies: string[];
}

/** Cajetín resuelto sobre una presentación, sin tocar el documento original. */
function withResolvedTitleBlock(
  layout: CadPaperSpace,
  attributes: Record<string, string>,
): CadPaperSpace {
  return { ...layout, titleBlock: { ...(layout.titleBlock ?? {}), attributes } };
}

export function buildCadSheetSetPublishPlan(
  input: CadSheetSetPublishInput,
): CadSheetSetPublishPlan {
  const wanted =
    input.sheetIds && input.sheetIds.length > 0 ? new Set(input.sheetIds) : null;
  const sheets = ordered(input.set).filter(
    (sheet) => sheet.includeInPublish !== false && (!wanted || wanted.has(sheet.id)),
  );

  const layoutIdsByDocument = new Map<string, ReadonlySet<string>>();
  for (const [documentId, document] of input.documents)
    layoutIdsByDocument.set(
      documentId,
      new Set(document.paperSpaces.map((space) => space.id)),
    );

  const issues = validateCadSheetSet(input.set, {
    documentIds: new Set(input.documents.keys()),
    layoutIdsByDocument,
  });

  const pages: CadSheetSetPublishPage[] = [];
  const publishSheets: CadPublishSheet[] = [];
  const skipped: CadSheetSetPublishPlan["skipped"] = [];
  const titleBlocks: CadTitleBlockLayout[] = [];
  const fontByEntity = new Map<string, string>();
  const strokedFamilies = new Set<string>();
  const fontCounts = new Map<string, CadPlotFontUsage>();

  // Las hojas que de verdad van a salir se resuelven ANTES de numerar.
  //
  // La serie es lo que se ENTREGA, no lo que el conjunto contiene. Numerar
  // sobre la lista completa y descartar después rotula «1/4 … 3/4» en un juego
  // de tres láminas: quien lo recibe busca una cuarta que nadie imprimió, y no
  // hay forma de que sepa si se perdió en el correo o nunca existió.
  const resolved: Array<{ sheet: (typeof sheets)[number]; document: CadDocument; layout: CadPaperSpace }> = [];
  for (const sheet of sheets) {
    const document = input.documents.get(sheet.documentId);
    if (!document) {
      skipped.push({ sheetId: sheet.id, reason: `El dibujo ${sheet.documentId} no está cargado.` });
      continue;
    }
    const layout = document.paperSpaces.find((space) => space.id === sheet.layoutId);
    if (!layout) {
      skipped.push({
        sheetId: sheet.id,
        reason: `La presentación ${sheet.layoutId} ya no existe en ${sheet.documentId}.`,
      });
      continue;
    }
    resolved.push({ sheet, document, layout });
  }

  const seriesTotal = resolved.length;
  const indexBySheetId = new Map(
    resolved.map((entry, index) => [entry.sheet.layoutId, index + 1]),
  );
  const numbersBySheetId = new Map(
    resolved.map((entry) => [entry.sheet.layoutId, entry.sheet.number]),
  );

  for (const { sheet, document, layout } of resolved) {
    const resolved = resolveCadSheetTitleBlock({
      set: input.set,
      sheet,
      layout,
      date: input.date,
    });
    const stamped = withResolvedTitleBlock(layout, resolved.attributes);
    const pageSetup = input.pageSetup ?? cadPageSetupFromLayout(stamped);
    // La MISMA regla de nombre que el trazado y su comprobación previa: un
    // `Monochrome.CTB` escrito con otra caja no puede convertir una hoja del
    // juego en una hoja OMITIDA (`plot-style-table.ts`).
    const table = pageSetup.plotStyleTable
      ? cadFindPlotStyleTable(
          input.plotStyleTables ?? new Map(),
          pageSetup.plotStyleTable,
        )
      : null;
    if (pageSetup.plotStyleTable && !table)
      skipped.push({
        sheetId: sheet.id,
        reason: `La tabla de plumas «${pageSetup.plotStyleTable}» no está cargada; la hoja saldría con grosores equivocados.`,
      });

    const job = buildCadPlotJob({
      // Sólo se sustituye la presentación de esta hoja: el resto del documento
      // viaja por referencia, porque clonarlo por hoja convertiría publicar
      // veinte planos en veinte copias de un dibujo de cien mil entidades.
      document: {
        ...document,
        paperSpaces: document.paperSpaces.map((space) =>
          space.id === stamped.id ? stamped : space,
        ),
      },
      layoutIds: [stamped.id],
      pageSetup,
      plotStyleTable: table,
      generatedAt: input.date,
      titleBlock: { date: input.date },
      series: { total: seriesTotal, indexBySheetId, numbersBySheetId },
    });

    publishSheets.push(...job.sheets);
    titleBlocks.push(...job.titleBlocks);
    for (const [entityId, family] of job.fontByEntity) fontByEntity.set(entityId, family);
    for (const family of job.strokedFamilies) strokedFamilies.add(family);
    for (const entry of job.fontUsage) {
      const accumulated = fontCounts.get(entry.family) ?? { family: entry.family, usageCount: 0 };
      accumulated.usageCount += entry.usageCount;
      fontCounts.set(entry.family, accumulated);
    }
    pages.push({
      sheetId: sheet.id,
      number: sheet.number,
      title: sheet.title,
      documentId: sheet.documentId,
      layoutId: sheet.layoutId,
      titleBlock: resolved.attributes,
      unresolvedFields: resolved.unresolved,
    });
  }

  return {
    pages,
    sheets: publishSheets,
    issues,
    skipped,
    titleBlocks,
    coverRows: cadCoverRowsFromTitleBlocks(titleBlocks),
    fontUsage: [...fontCounts.values()].sort((a, b) => a.family.localeCompare(b.family, "es")),
    fontByEntity,
    strokedFamilies: [...strokedFamilies].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export interface CadSheetSetPublishResult extends CadPlotPdfResult {
  plan: CadSheetSetPublishPlan;
  fileName: string;
  /** `true` cuando la página 1 del PDF es la portada y no una lámina. */
  hasCover: boolean;
}

/**
 * Publica el conjunto a un único PDF paginado.
 *
 * El nombre del archivo sale del conjunto, no de la primera hoja: lo que se
 * entrega es «Nave industrial — planos», no «A-101».
 */
export async function publishCadSheetSet(
  input: CadSheetSetPublishInput & { fileName?: string; pdf?: CadPlotPdfOptions },
): Promise<CadSheetSetPublishResult> {
  const plan = buildCadSheetSetPublishPlan(input);
  const warnings: string[] = [];

  // La portada toma el papel de la PRIMERA lámina: un juego cuyo índice sale en
  // A4 y cuyas láminas salen en A1 no se archiva junto, y ése es el motivo por
  // el que se entrega un único PDF.
  const first = plan.sheets[0];
  const cover =
    (input.cover ?? true) && first
      ? buildCadCoverSheet({
          setName: input.set.name,
          ...(input.set.description ? { subtitle: input.set.description } : {}),
          page: { width: first.width, height: first.height, orientation: first.orientation },
          margins: input.pageSetup?.margins ?? { top: 10, right: 10, bottom: 10, left: 20 },
          rows: plan.coverRows,
          colorMode: first.colorMode,
        })
      : null;
  if (cover && cover.overflowRows.length > 0)
    warnings.push(
      `La portada no pudo listar ${cover.overflowRows.length} lámina(s) —${cover.overflowRows
        .map((row) => row.number)
        .join(", ")}— porque no caben en la hoja: el índice está incompleto.`,
    );

  const pdf = await renderCadPlotPdf(cover ? [cover.sheet, ...plan.sheets] : plan.sheets, {
    ...input.pdf,
    titleBlocks: plan.titleBlocks,
    // La portada es un índice, no una lámina: no lleva cajetín, y se dice por
    // su nombre para que no acabe con uno vacío y una numeración que no es suya.
    ...(cover ? { sheetsWithoutTitleBlock: [cover.sheet.id] } : {}),
    fontUsage: plan.fontUsage,
    fontByEntity: plan.fontByEntity,
    strokedFamilies: plan.strokedFamilies,
    metadata: {
      title: input.set.name,
      subject: input.set.description ?? "Conjunto de planos",
      ...input.pdf?.metadata,
    },
  });
  return {
    ...pdf,
    plan,
    hasCover: cover !== null,
    fileName: `${input.fileName ?? input.set.name}.pdf`,
    warnings: [
      ...pdf.warnings,
      ...warnings,
      ...plan.skipped.map((entry) => `Hoja ${entry.sheetId} omitida: ${entry.reason}`),
    ],
  };
}
