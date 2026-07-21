/**
 * Duplicar selección (AXOS-CAD-DUP-001): el COPY de AutoCAD, conversacional.
 * "duplica la selección" o "copia esto a 800,0" emite creates con sourceId
 * (el estudio copia kind/etiqueta/capa del origen). Sin desplazamiento
 * explícito, la copia cae a +500,+500 mm para que no tape al original.
 */
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function duplicateSelectionPreview(
  input: Extract<CadCommandInput, { id: "duplicate_selection" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const ids = input.objectIds?.length ? input.objectIds : context.selectedIds;
  const objs = ids
    .map((id) => context.objects.find((o) => o.id === id))
    .filter((o): o is CadBox => !!o);
  if (!objs.length) {
    issues.push(
      error(
        "duplicate_empty_selection",
        "Selecciona al menos un objeto para duplicar.",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const dx = Number.isFinite(input.dx) ? Math.round(input.dx as number) : 500;
  const dy = Number.isFinite(input.dy) ? Math.round(input.dy as number) : 500;
  if (dx === 0 && dy === 0) {
    issues.push(
      error(
        "duplicate_zero_offset",
        "El desplazamiento no puede ser 0,0; dime a dónde va la copia (p. ej. 'a 800,0').",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const operations: CadOperation[] = objs.map((o) => ({
    type: "create",
    object: {
      sourceId: o.id,
      kind: o.kind,
      type: o.type,
      label: `${o.label} (copia)`,
      x: o.x + dx,
      y: o.y + dy,
      w: o.w,
      h: o.h,
      rotation: o.rotation,
    },
  }));

  return {
    summary: `Duplicar ${objs.length} objeto(s) con desplazamiento (${dx}, ${dy}).`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
