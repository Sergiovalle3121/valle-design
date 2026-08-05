/**
 * Seleccionar por nombre (VD-CAD-SELECT-001): 'selecciona las mesas',
 * 'resalta la barra' o 'selecciona todo' emite la operación focus que el
 * estudio ya convierte en selección viva — y con ella cualquier comando
 * de selección (mover, rotar, borrar…) queda a una frase de distancia.
 */
import { matchObjectsByName } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function selectObjectsPreview(
  input: Extract<CadCommandInput, { id: "select_objects" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const raw = input.query?.trim() ?? "";
  if (!raw) {
    issues.push(
      error(
        "select_query",
        "Dime qué seleccionar (p. ej. 'las mesas', 'la barra' o 'todo').",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  let matched = matchObjectsByName(context, raw);
  if (!matched.length) {
    issues.push(
      error("select_not_found", `No encontré '${raw}' en el plano.`),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  // Exclusión (VD-CAD-SELECT-002): 'todo menos las mesas'.
  const excludeQuery = input.exclude?.trim();
  if (excludeQuery) {
    const excluded = new Set(
      matchObjectsByName(context, excludeQuery).map((o) => o.id),
    );
    matched = matched.filter((o) => !excluded.has(o.id));
    if (!matched.length) {
      issues.push(
        error(
          "select_all_excluded",
          `Al quitar '${excludeQuery}' no queda nada que seleccionar.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
  }

  return {
    summary: excludeQuery
      ? `Seleccionados ${matched.length} objeto(s) con '${raw}' menos '${excludeQuery}'.`
      : `Seleccionados ${matched.length} objeto(s) con '${raw}'.`,
    affectedObjectIds: matched.map((o) => o.id),
    operations: [{ type: "focus", objectIds: matched.map((o) => o.id) }],
    issues,
  };
}
