/**
 * Borrar selección (AXOS-CAD-DELETE-001): ERASE de AutoCAD, conversacional.
 * 'borra la selección' / 'elimina lo seleccionado' emite una operación
 * delete por objeto; el estudio decide si puede aplicarla (capas bloqueadas)
 * y limpia la selección. Sin selección, el error dice qué hacer.
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

export function deleteSelectionPreview(
  input: Extract<CadCommandInput, { id: "delete_selection" }>,
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
        "delete_empty_selection",
        "Selecciona al menos un objeto para borrar.",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const operations: CadOperation[] = objs.map((o) => ({
    type: "delete",
    objectId: o.id,
  }));
  const names = objs
    .slice(0, 3)
    .map((o) => o.label)
    .join(", ");
  const extra = objs.length > 3 ? ` y ${objs.length - 3} más` : "";

  return {
    summary: `Borrar ${objs.length} objeto(s): ${names}${extra}.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
