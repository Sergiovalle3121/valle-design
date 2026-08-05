/**
 * Limpiar anotaciones (VD-CAD-CLEAN-001): 'quita las cotas', 'borra las
 * notas' o 'limpia las anotaciones'. Las anotaciones no son objetos del
 * plano (no viven en context.objects), así que el preview emite la orden y
 * el estudio decide si había algo que limpiar — con undo por historial.
 */
import type { CadCommandInput, CadCommandPreview } from "./types";

const KIND_LABELS: Record<"dims" | "notes" | "all", string> = {
  dims: "las cotas",
  notes: "las notas de texto",
  all: "todas las anotaciones",
};

export function clearAnnotationsPreview(
  input: Extract<CadCommandInput, { id: "clear_annotations" }>,
): CadCommandPreview {
  const kind = input.kind ?? "dims";
  return {
    summary: `Quitar ${KIND_LABELS[kind]} del plano.`,
    affectedObjectIds: [],
    operations: [{ type: "clear_annotations", kind }],
    issues: [],
  };
}
