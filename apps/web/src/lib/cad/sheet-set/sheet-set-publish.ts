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
import type { CadPublishSheet } from "../paper-space";
import { cadPageSetupFromLayout, type CadPageSetup } from "../plot/page-setup";
import { buildCadPlotJob } from "../plot/plot-job";
import type { CadPlotStyleTable } from "../plot/plot-style-table";
import {
  renderCadPlotPdf,
  type CadPlotPdfOptions,
  type CadPlotPdfResult,
} from "../plot/plot-pdf";
import { resolveCadSheetTitleBlock } from "./sheet-set-fields";
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

    const resolved = resolveCadSheetTitleBlock({
      set: input.set,
      sheet,
      layout,
      date: input.date,
    });
    const stamped = withResolvedTitleBlock(layout, resolved.attributes);
    const pageSetup = input.pageSetup ?? cadPageSetupFromLayout(stamped);
    const table = pageSetup.plotStyleTable
      ? (input.plotStyleTables?.get(pageSetup.plotStyleTable) ?? null)
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
    });

    publishSheets.push(...job.sheets);
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

  return { pages, sheets: publishSheets, issues, skipped };
}

export interface CadSheetSetPublishResult extends CadPlotPdfResult {
  plan: CadSheetSetPublishPlan;
  fileName: string;
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
  const pdf = await renderCadPlotPdf(plan.sheets, {
    ...input.pdf,
    metadata: {
      title: input.set.name,
      subject: input.set.description ?? "Conjunto de planos",
      ...input.pdf?.metadata,
    },
  });
  return {
    ...pdf,
    plan,
    fileName: `${input.fileName ?? input.set.name}.pdf`,
    warnings: [
      ...pdf.warnings,
      ...plan.skipped.map((entry) => `Hoja ${entry.sheetId} omitida: ${entry.reason}`),
    ],
  };
}
