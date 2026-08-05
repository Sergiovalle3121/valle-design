/**
 * Texto en el plano (VD-CAD-TEXT-001): el TEXT de AutoCAD, conversacional.
 * "escribe 'Recepción' en 2000,1000" emite una anotación kind:text que el
 * estudio crea con el mismo flujo que el botón de notas. Sin coordenadas,
 * la nota cae al centro del footprint para arrastrarla a su sitio.
 */
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function addLabelPreview(
  input: Extract<CadCommandInput, { id: "add_label" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const text = input.text?.trim();
  if (!text) {
    issues.push(
      error(
        "add_label_text",
        "Dime qué texto escribir (p. ej. escribe 'Recepción' en 2000,1000).",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const W = context.footprintW ?? 10000;
  const H = context.footprintH ?? 6000;
  const x = Math.max(
    0,
    Math.min(
      W,
      Number.isFinite(input.x) ? Math.round(input.x as number) : Math.round(W / 2),
    ),
  );
  const y = Math.max(
    0,
    Math.min(
      H,
      Number.isFinite(input.y) ? Math.round(input.y as number) : Math.round(H / 2),
    ),
  );

  return {
    summary: `Texto "${text}" en (${x}, ${y}).`,
    affectedObjectIds: [],
    operations: [
      { type: "annotate", annotation: { kind: "text", x, y, text } },
    ],
    issues,
  };
}
