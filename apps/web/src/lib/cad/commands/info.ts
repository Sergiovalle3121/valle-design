/**
 * Info de objeto (AXOS-CAD-QUERY-002): '¿cuánto mide la mesa?' o 'info de
 * la barra' responde medidas reales, posición y rotación de cada
 * coincidencia, resaltándolas en el lienzo. El plano responde — AutoCAD
 * te deja midiendo con el mouse.
 */
import { matchObjectsByName } from "./targets";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

const MAX_ROWS = 8;
const CONTAINER_KINDS = new Set(["room", "zone", "wall"]);

/**
 * Ubicación (AXOS-CAD-QUERY-007): el cuarto/zona MÁS PEQUEÑO que contiene
 * el centro del objeto — el muro perimetral contiene todo, así que gana el
 * contenedor específico.
 */
function containerOf(
  context: CadCommandContext,
  o: CadBox,
): CadBox | undefined {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  return context.objects
    .filter(
      (c) =>
        c.id !== o.id &&
        CONTAINER_KINDS.has(c.kind ?? "") &&
        cx >= c.x &&
        cx <= c.x + c.w &&
        cy >= c.y &&
        cy <= c.y + c.h,
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

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
  // Reporte de cuartos (AXOS-CAD-QUERY-011): '¿cuánto miden los cuartos?'
  // lista cada contenedor (cuarto/zona) con medidas y área, más el total.
  if (/^(cada\s+)?(cuartos?|habitaciones|zonas)$/.test(folded)) {
    const rooms = context.objects.filter((o) =>
      CONTAINER_KINDS.has(o.kind ?? ""),
    );
    if (!rooms.length) {
      issues.push(
        error("info_no_rooms", "No hay cuartos ni zonas en el plano."),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    const totalRoomsM2 = rooms.reduce(
      (sum, o) => sum + (o.w / 1000) * (o.h / 1000),
      0,
    );
    return {
      summary: `${rooms.length} cuarto(s)/zona(s) — ${totalRoomsM2.toFixed(2)} m² en total.`,
      affectedObjectIds: rooms.map((o) => o.id),
      operations: [
        {
          type: "report",
          title: "Cuartos y zonas",
          rows: rooms.map((o) => ({
            label: o.label,
            value: `${(o.w / 1000).toFixed(1)}×${(o.h / 1000).toFixed(1)} m · ${((o.w / 1000) * (o.h / 1000)).toFixed(2)} m²`,
          })),
        },
      ],
      issues,
    };
  }
  if (/^(el\s+)?(plano|layout|plan|terreno|footprint)$/.test(folded)) {
    const w = context.footprintW ?? 0;
    const h = context.footprintH ?? 0;
    const areaM2 = (w / 1000) * (h / 1000);
    const assets = context.objects.filter((o) => o.type === "asset").length;
    const stations = context.objects.length - assets;
    // Área ocupada (AXOS-CAD-QUERY-004): suma de equipos/muebles; los
    // contenedores (cuartos, zonas, muros) no cuentan como ocupación.
    const occupiedM2 = context.objects.reduce(
      (sum, o) =>
        CONTAINER_KINDS.has(o.kind ?? "")
          ? sum
          : sum + (o.w / 1000) * (o.h / 1000),
      0,
    );
    const freeM2 = Math.max(0, areaM2 - occupiedM2);
    return {
      summary: `Plano de ${(w / 1000).toFixed(1)}×${(h / 1000).toFixed(1)} m (${areaM2.toFixed(1)} m²) con ${context.objects.length} objeto(s); ~${freeM2.toFixed(1)} m² libres.`,
      affectedObjectIds: [],
      operations: [
        {
          type: "report",
          title: "Info del plano",
          rows: [
            { label: "Ancho", value: `${w} mm (${(w / 1000).toFixed(2)} m)` },
            { label: "Alto", value: `${h} mm (${(h / 1000).toFixed(2)} m)` },
            { label: "Área", value: `${areaM2.toFixed(2)} m²` },
            { label: "Área ocupada", value: `${occupiedM2.toFixed(2)} m²` },
            { label: "Área libre (aprox)", value: `${freeM2.toFixed(2)} m²` },
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

  const rows = matched.slice(0, MAX_ROWS).map((o) => {
    const inside = containerOf(context, o);
    return {
      label: o.label,
      value: `${o.w}×${o.h} mm en (${Math.round(o.x)}, ${Math.round(o.y)})${o.rotation ? ` · ${o.rotation}°` : ""}${inside ? ` · en '${inside.label}'` : ""}`,
    };
  });
  if (matched.length > MAX_ROWS) {
    rows.push({ label: "…", value: `${matched.length - MAX_ROWS} más` });
  }
  // Área total (AXOS-CAD-QUERY-005): con varias coincidencias, la suma en m².
  const totalM2 = matched.reduce(
    (sum, o) => sum + (o.w / 1000) * (o.h / 1000),
    0,
  );
  if (matched.length > 1) {
    rows.push({ label: "Área total", value: `${totalM2.toFixed(2)} m²` });
  }
  const first = matched[0];
  // INFO de cuarto (AXOS-CAD-QUERY-009): si la coincidencia única es un
  // contenedor, el reporte suma su contenido (no-contenedores con centro
  // dentro) y responde área ocupada y libre del cuarto.
  if (matched.length === 1 && CONTAINER_KINDS.has(first.kind ?? "")) {
    const contents = context.objects.filter((o) => {
      if (o.id === first.id || CONTAINER_KINDS.has(o.kind ?? "")) return false;
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      return (
        cx >= first.x &&
        cx <= first.x + first.w &&
        cy >= first.y &&
        cy <= first.y + first.h
      );
    });
    const roomM2 = (first.w / 1000) * (first.h / 1000);
    const usedM2 = contents.reduce(
      (sum, o) => sum + (o.w / 1000) * (o.h / 1000),
      0,
    );
    rows.push({ label: "Contiene", value: `${contents.length} objeto(s)` });
    rows.push({ label: "Área del cuarto", value: `${roomM2.toFixed(2)} m²` });
    rows.push({ label: "Área ocupada", value: `${usedM2.toFixed(2)} m²` });
    rows.push({
      label: "Área libre (aprox)",
      value: `${Math.max(0, roomM2 - usedM2).toFixed(2)} m²`,
    });
  }
  const firstInside = containerOf(context, first);

  return {
    summary:
      matched.length === 1
        ? `${first.label}: ${first.w}×${first.h} mm en (${Math.round(first.x)}, ${Math.round(first.y)})${firstInside ? `, dentro de '${firstInside.label}'` : ""}.`
        : `${matched.length} coincidencias con '${raw}' — ${totalM2.toFixed(2)} m² en total.`,
    affectedObjectIds: matched.map((o) => o.id),
    operations: [
      { type: "report", title: `Info: '${raw}'`, rows },
    ],
    issues,
  };
}
