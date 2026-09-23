/** PDF de entrega: reutiliza el publicador de láminas y el emisor vectorial. */
import type { CadDocument } from "../cad-document";
import { projectCadPlan } from "../collab/plan-projection";
import {
  buildCadPublishPlan,
  createCadPaperSpace,
  type CadPublishSheet,
  type CadVectorCommand,
} from "../paper-space";
import { renderCadPlotPdf, type CadPlotPdfResult } from "./plot-pdf";

export interface DeliveryPdfInput {
  document: CadDocument;
  documentName: string;
  version: number;
  deliveredAt: string;
  latestReviewUrl: string;
  latestReviewExpiresAt: string;
  educational: boolean;
  /** Sólo para inspección del flujo PDF en pruebas. */
  compress?: boolean;
}

/** Un plan desconocido se trata como gratuito; sólo se quita la marca con pago vigente. */
export function isEducationalDeliveryPlan(subscription: {
  planCode: string;
  status: string;
  effective: boolean;
} | null | undefined): boolean {
  if (!subscription?.effective || subscription.status !== "active") return true;
  return !["standalone-full", "individual", "despacho"].includes(subscription.planCode);
}

export async function renderCadDeliveryPdf(input: DeliveryPdfInput): Promise<CadPlotPdfResult> {
  const projection = projectCadPlan(input.document);
  if (projection.truncated) {
    throw new Error("El plano excede el límite de proyección para componer su lámina de entrega.");
  }
  const bounds = projection.bounds;
  const modelBounds = bounds
    ? {
        x: bounds.minX,
        y: bounds.minY,
        width: Math.max(1, bounds.maxX - bounds.minX),
        height: Math.max(1, bounds.maxY - bounds.minY),
      }
    : { x: 0, y: 0, width: 1_000, height: 1_000 };
  const document = input.document.paperSpaces.some((sheet) => sheet.includeInPublish !== false)
    ? input.document
    : {
        ...input.document,
        paperSpaces: [createCadPaperSpace({
          id: "delivery-model-sheet",
          name: "Planta",
          order: 0,
          paper: "A3",
          orientation: "landscape",
          modelBounds,
          unit: input.document.meta.unit,
          metadata: {
            project: input.documentName,
            drawingNumber: `ENT-${input.version}`,
            title: "Planta entregada",
            sheetNumber: "1",
            revision: String(input.version),
            discipline: "Arquitectura",
          },
        })],
      };
  const plan = buildCadPublishPlan(document, input.deliveredAt);
  const cover = deliveryCover(input);
  return renderCadPlotPdf([cover, ...plan.sheets], {
    metadata: {
      title: `${input.documentName} · entrega v${input.version}`,
      subject: "Plano entregado; QR a la versión más reciente",
    },
    reviewQr: {
      sheetId: cover.id,
      url: input.latestReviewUrl,
      x: 72,
      y: 82,
      sizeMm: 66,
    },
    educationalWatermark: input.educational,
    compress: input.compress,
  });
}

function deliveryCover(input: DeliveryPdfInput): CadPublishSheet {
  const delivered = localDate(input.deliveredAt);
  const expires = localDate(input.latestReviewExpiresAt);
  const text = (id: string, content: string, x: number, y: number, size = 4): CadVectorCommand => ({
    kind: "text",
    entityId: id,
    viewportId: "delivery-cover",
    point: { x, y },
    text: content,
    size,
    rotation: 0,
    color: "#111827",
  });
  return {
    id: "delivery-cover",
    name: "Carátula de entrega",
    width: 210,
    height: 297,
    orientation: "portrait",
    colorMode: "monochrome",
    lineweightScale: 1,
    viewports: [],
    titleBlock: {
      PROJECT: input.documentName,
      TITLE: "Entrega de plano",
      DRAWING_NO: `ENT-${input.version}`,
      SHEET_NO: "Portada",
      REVISION: String(input.version),
      DISCIPLINE: "Arquitectura",
      NOTES: `Entregado ${delivered}`,
    },
    paperCommands: [
      text("delivery-title", input.documentName, 30, 42, 8),
      text("delivery-version", `Versión entregada: ${input.version}`, 30, 54),
      text("delivery-date", `Entregado el ${delivered}`, 30, 64),
      text("delivery-qr-label", "Escanea para ver la versión más reciente", 36, 160, 4),
      text("delivery-qr-expiry", `El enlace vence el ${expires} o antes si se revoca.`, 30, 174, 3),
      text("delivery-frozen-note", "La entrega de este PDF permanece en la versión indicada.", 30, 186, 3),
    ],
  };
}

function localDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Fecha de entrega inválida.");
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
