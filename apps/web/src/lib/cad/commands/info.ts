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
  // INFO del plano (AXOS-CAD-QUERY-003): '¿cuánto mide el plano?' responde
  // footprint, área y conteo total sin necesitar un objeto.
  const folded = raw
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/^(el\s+)?(plano|layout|plan|terreno|footprint)$/.test(folded)) {
    const w = context.footprintW ?? 0;
    const h = context.footprintH ?? 0;
    const areaM2 = (w / 1000) * (h / 1000);
    const assets = context.objects.filter((o) => o.type === "asset").length;
    const stations = context.objects.length - assets;
    return {
      summary: `Plano de ${(w / 1000).toFixed(1)}×${(h / 1000).toFixed(1)} m (${areaM2.toFixed(1)} m²) con ${context.objects.length} objeto(s).`,
      affectedObjectIds: [],
      operations: [
        {
          type: "report",
          title: "Info del plano",
          rows: [
            { label: "Ancho", value: `${w} mm (${(w / 1000).toFixed(2)} m)` },
            { label: "Alto", value: `${h} mm (${(h / 1000).toFixed(2)} m)` },
            { label: "Área", value: `${areaM2.toFixed(2)} m²` },
            { label: "Objetos", value: `${context.objects.length}` },
            { label: "Equipos/muebles", value: `${assets}` },
            { label: "Estaciones", value: `${stations}` },
          ],
        },
      ],
      issues,
    };
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
