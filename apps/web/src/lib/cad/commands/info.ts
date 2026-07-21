/**
 * Info de objeto (AXOS-CAD-QUERY-002): '¿cuánto mide la mesa?' o 'info de
 * la barra' responde medidas reales, posición y rotación de cada
 * coincidencia, resaltándolas en el lienzo. El plano responde — AutoCAD
 * te deja midiendo con el mouse.
 */
import { matchObjectsByName } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

const MAX_ROWS = 8;

export function objectInfoPreview(
  input: Extract<CadCommandInput, { id: "object_info" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const raw = input.query?.trim() ?? "";
  if (!raw) {
    issues.push(
      error("info_query", "Dime de qué objeto ('¿cuánto mide la mesa?')."),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const matched = matchObjectsByName(context, raw);
  if (!matched.length) {
    issues.push(error("info_not_found", `No encontré '${raw}' en el plano.`));
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const rows = matched.slice(0, MAX_ROWS).map((o) => ({
    label: o.label,
    value: `${o.w}×${o.h} mm en (${Math.round(o.x)}, ${Math.round(o.y)})${o.rotation ? ` · ${o.rotation}°` : ""}`,
  }));
  if (matched.length > MAX_ROWS) {
    rows.push({ label: "…", value: `${matched.length - MAX_ROWS} más` });
  }
  const first = matched[0];

  return {
    summary:
      matched.length === 1
        ? `${first.label}: ${first.w}×${first.h} mm en (${Math.round(first.x)}, ${Math.round(first.y)}).`
        : `${matched.length} coincidencias con '${raw}'.`,
    affectedObjectIds: matched.map((o) => o.id),
    operations: [
      { type: "report", title: `Info: '${raw}'`, rows },
    ],
    issues,
  };
}
