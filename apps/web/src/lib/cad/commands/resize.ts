/**
 * Cambiar tamaño (VD-CAD-RESIZE-001): 'cambia el tamaño de la mesa a
 * 1500x900' — fija ancho×alto exactos en mm conservando la esquina superior
 * izquierda. Emite ops move (before/after) para que el editor y el undo lo
 * traten igual que un arrastre. Con `like` (VD-CAD-RESIZE-002: 'haz la
 * mesa del tamaño del escritorio') copia el w×h de la referencia. Con
 * `dw`/`dh` (VD-CAD-RESIZE-003: 'haz la mesa 500 más ancha') ajusta en
 * mm relativos sobre el tamaño actual de cada objeto.
 */
import { matchObjectsByName, resolveCommandTargets } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function resizeObjectPreview(
  input: Extract<CadCommandInput, { id: "resize_object" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const { objs, usedTarget } = resolveCommandTargets(
    context,
    input.objectIds,
    input.target,
  );
  if (!objs.length) {
    issues.push(
      usedTarget
        ? error(
            "resize_target_not_found",
            `No encontré '${input.target?.trim()}' en el plano.`,
          )
        : error(
            "resize_empty_selection",
            "Selecciona o nombra el objeto a redimensionar.",
          ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  let w = Number.isFinite(input.w)
    ? Math.round(input.w as number)
    : undefined;
  let h = Number.isFinite(input.h)
    ? Math.round(input.h as number)
    : undefined;
  let refLabel: string | undefined;
  const likeName = input.like?.trim();
  if (likeName && w === undefined && h === undefined) {
    const targetIds = new Set(objs.map((o) => o.id));
    const ref = matchObjectsByName(context, likeName).find(
      (o) => !targetIds.has(o.id),
    );
    if (!ref) {
      issues.push(
        error(
          "resize_like_not_found",
          `No encontré '${likeName}' para copiar su tamaño.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    w = ref.w;
    h = ref.h;
    refLabel = ref.label;
  }
  const dw = Number.isFinite(input.dw) ? Math.round(input.dw as number) : 0;
  const dh = Number.isFinite(input.dh) ? Math.round(input.dh as number) : 0;
  if (w === undefined && h === undefined && (dw !== 0 || dh !== 0)) {
    const bad = objs.find((o) => o.w + dw <= 0 || o.h + dh <= 0);
    if (bad) {
      issues.push(
        error(
          "resize_invalid_size",
          `'${bad.label}' quedaría sin tamaño con ese ajuste; usa un valor menor.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    const parts = [
      dw !== 0 ? `${dw > 0 ? "+" : ""}${dw} mm de ancho` : "",
      dh !== 0 ? `${dh > 0 ? "+" : ""}${dh} mm de alto` : "",
    ].filter(Boolean);
    return {
      summary: `Ajustar ${objs.length} objeto(s): ${parts.join(" y ")}.`,
      affectedObjectIds: objs.map((o) => o.id),
      operations: objs.map((o) => ({
        type: "move",
        objectId: o.id,
        before: o,
        after: { ...o, w: o.w + dw, h: o.h + dh },
      })),
      issues,
    };
  }
  if (
    (w !== undefined && w <= 0) ||
    (h !== undefined && h <= 0) ||
    (w === undefined && h === undefined)
  ) {
    issues.push(
      error(
        "resize_invalid_size",
        "Dime el tamaño nuevo en mm, p. ej. 'a 1500x900'.",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const operations: CadOperation[] = objs.map((o) => ({
    type: "move",
    objectId: o.id,
    before: o,
    after: { ...o, w: w ?? o.w, h: h ?? o.h },
  }));
  return {
    summary: `Cambiar tamaño de ${objs.length} objeto(s) a ${w ?? "ancho actual"}×${h ?? "alto actual"} mm${refLabel ? ` (como '${refLabel}')` : ""}.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
