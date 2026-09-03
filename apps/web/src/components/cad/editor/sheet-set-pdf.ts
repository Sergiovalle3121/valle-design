/**
 * EL PDF DEL CONJUNTO DE HOJAS, COMO FUNCIÓN PURA DEL PLAN.
 *
 * Extraído de `publishSheetSetPdf` en `Layout3DEditor.tsx`: el monolito sólo
 * puede encoger, y estas ~180 líneas de jsPDF no leen ni un solo estado del
 * editor — reciben el `CadPublishPlan` que `buildCadPublishPlan` ya calculó y
 * devuelven bytes. Aquí se prueban sin montar nada; allí eran un bloque opaco
 * en medio del flujo de guardar → publicar → auditar, que es justo el flujo
 * donde vivía el 409 CAS que la auditoría del 2026-09-01 midió.
 *
 * Lo que dibuja, sin cambios: marco de hoja, cada ventana recortada a su clip
 * con sus trazos y sus textos (máscara de fondo, subrayado, alineación), el
 * rótulo de escala de la ventana, el cajetín de ocho celdas en es-MX y el pie
 * con el producto y «n/N».
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadPublishPlan } from "@/lib/cad/paper-space";
import { cadDocumentFontByEntity } from "@/lib/cad/plot/plot-fonts";
import { cadStrokeSheetText } from "@/lib/cad/plot/plot-stroke-text";

export interface CadSheetSetPdfMeta {
  model: string;
  revision: string;
  /** Rótulo del producto en el pie de cada hoja (`branding.productLabel`). */
  productLabel: string;
}

/**
 * Rasteriza el plan a un PDF vectorial y devuelve sus bytes.
 *
 * El `document` es opcional y sirve para UNA cosa: saber qué familia pide cada
 * rótulo, y así dibujar con sus trazos los que nombran una `.shx`
 * (`plot-stroke-text.ts`). Sin él el conjunto sale como salía —con la fuente
 * estándar más cercana—, que es el comportamiento que tenía este camino antes
 * de que el trazado aprendiera a dibujarlas.
 */
export async function renderCadSheetSetPdf(
  plan: CadPublishPlan,
  meta: CadSheetSetPdfMeta,
  document?: CadDocument,
): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const sheets = cadStrokeSheetText(
    plan.sheets,
    document ? cadDocumentFontByEntity(document) : new Map<string, string>(),
  ).sheets;
  const first = sheets[0];
  const pdf = new jsPDF({
    orientation: first.orientation,
    unit: "mm",
    format: [first.width, first.height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const color = (hex: string): [number, number, number] => {
    const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "334155";
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  };
  sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0)
      pdf.addPage([sheet.width, sheet.height], sheet.orientation);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, sheet.width, sheet.height, "F");
    pdf.setDrawColor(17, 24, 39);
    pdf.setLineWidth(0.45);
    pdf.rect(6, 6, sheet.width - 12, sheet.height - 12);
    sheet.viewports.forEach((viewport) => {
      pdf.saveGraphicsState();
      pdf.rect(
        viewport.clip.x,
        viewport.clip.y,
        viewport.clip.width,
        viewport.clip.height,
      );
      pdf.clip();
      pdf.discardPath();
      viewport.commands.forEach((command) => {
        if (command.kind === "path") {
          if (command.points.length < 2) return;
          const [strokeR, strokeG, strokeB] = color(command.style.stroke);
          pdf.setDrawColor(strokeR, strokeG, strokeB);
          pdf.setLineWidth(command.style.lineWidth);
          pdf.setLineDashPattern(command.style.dash ?? [], 0);
          if (command.style.fill) {
            const [fillR, fillG, fillB] = color(command.style.fill);
            pdf.setFillColor(fillR, fillG, fillB);
          }
          const [origin, ...rest] = command.points;
          const deltas = rest.map((point, index) => [
            point.x - command.points[index].x,
            point.y - command.points[index].y,
          ]);
          const style: "S" | "FD" = command.style.fill ? "FD" : "S";
          pdf.lines(
            deltas,
            origin.x,
            origin.y,
            [1, 1],
            style,
            command.closed,
          );
        } else if (command.kind === "text") {
          const [r, g, b] = color(command.color);
          const maxWidth = Math.max(
            1,
            Math.min(
              command.maxWidth ?? viewport.clip.width,
              viewport.clip.width,
            ),
          );
          const lines = command.text.replace(/\r\n?/g, "\n").split("\n");
          const lineHeight = command.size * 0.4;
          const alignOffset =
            command.align === "center"
              ? maxWidth / 2
              : command.align === "right"
                ? maxWidth
                : 0;
          if (command.backgroundMask) {
            const [mr, mg, mb] = color(
              command.backgroundColor ?? "#ffffff",
            );
            pdf.setFillColor(mr, mg, mb);
            pdf.rect(
              command.point.x - alignOffset - 0.8,
              command.point.y - command.size * 0.32,
              maxWidth + 1.6,
              Math.max(lineHeight, lines.length * lineHeight) + 1.2,
              "F",
            );
          }
          pdf.setTextColor(r, g, b);
          pdf.setFont(
            "helvetica",
            command.bold && command.italic
              ? "bolditalic"
              : command.bold
                ? "bold"
                : command.italic
                  ? "italic"
                  : "normal",
          );
          pdf.setFontSize(command.size);
          pdf.text(command.text, command.point.x, command.point.y, {
            align: command.align ?? "left",
            angle: command.rotation,
            maxWidth,
          });
          if (command.underline && Math.abs(command.rotation) < 1e-9) {
            pdf.setDrawColor(r, g, b);
            pdf.setLineWidth(Math.max(0.08, command.size * 0.015));
            lines.forEach((line, index) => {
              const width = Math.min(maxWidth, pdf.getTextWidth(line));
              const x =
                command.point.x -
                (command.align === "center"
                  ? width / 2
                  : command.align === "right"
                    ? width
                    : 0);
              const y = command.point.y + index * lineHeight + 0.5;
              pdf.line(x, y, x + width, y);
            });
          }
        }
      });
      pdf.restoreGraphicsState();
      pdf.setLineDashPattern([], 0);
      pdf.setDrawColor(100, 116, 139);
      pdf.setLineWidth(0.15);
      pdf.rect(
        viewport.clip.x,
        viewport.clip.y,
        viewport.clip.width,
        viewport.clip.height,
      );
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(71, 85, 105);
      pdf.text(
        `${viewport.name} · 1:${viewport.scale}${viewport.locked ? " · LOCK" : ""}`,
        viewport.clip.x + 1.5,
        viewport.clip.y + 4,
      );
    });
    // Las CLAVES del cajetín (PROJECT, TITLE…) son contrato del documento
    // y no se tocan; lo que se IMPRIME para el cliente va en es-MX.
    const titleBlockEntries = [
      ["PROYECTO", sheet.titleBlock.PROJECT ?? `Layout ${meta.model}`],
      ["TÍTULO", sheet.titleBlock.TITLE ?? sheet.name],
      ["NO. DE PLANO", sheet.titleBlock.DRAWING_NO ?? "-"],
      ["NO. DE HOJA", sheet.titleBlock.SHEET_NO ?? String(sheetIndex + 1)],
      ["REVISIÓN", sheet.titleBlock.REVISION ?? meta.revision],
      ["DISCIPLINA", sheet.titleBlock.DISCIPLINE ?? "-"],
      ["ELABORÓ", sheet.titleBlock.PREPARED_BY ?? "-"],
      ["REVISÓ", sheet.titleBlock.CHECKED_BY ?? "-"],
    ] as const;
    const blockX = 8,
      blockY = sheet.height - 34,
      blockW = sheet.width - 16,
      cellW = blockW / 4,
      cellH = 13;
    pdf.setDrawColor(17, 24, 39);
    titleBlockEntries.forEach(([label, value], index) => {
      const x = blockX + (index % 4) * cellW,
        y = blockY + Math.floor(index / 4) * cellH;
      pdf.rect(x, y, cellW, cellH);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(label, x + 2, y + 4);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(17, 24, 39);
      pdf.text(String(value).slice(0, 42), x + 2, y + 9.5, {
        maxWidth: cellW - 4,
      });
    });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(
      `${meta.productLabel} · ${sheetIndex + 1}/${plan.sheets.length}`,
      sheet.width - 8,
      5,
      { align: "right" },
    );
  });
  return pdf.output("arraybuffer");
}
