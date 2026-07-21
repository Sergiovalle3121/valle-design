/**
 * Contar objetos (AXOS-CAD-QUERY-001): el plano que responde. 'cuenta las
 * mesas' o '¿cuántas sillas hay?' emite un reporte con el total y el
 * desglose por tipo. Cero es una respuesta válida (no un error), y el
 * plural se pliega ('mesas' encuentra 'Mesa 4 personas').
 */
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
} from "./types";

const fold = (s: string) =>
  s
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function countObjectsPreview(
  input: Extract<CadCommandInput, { id: "count_objects" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const raw = input.query?.trim() ?? "";
  // Plural → singular por recorte: 'mesas'→'mesa', 'sillones'→'sillon'.
  const candidates = raw
    ? [fold(raw), fold(raw).replace(/es$/, ""), fold(raw).replace(/s$/, "")]
    : [""];
  let matched = context.objects;
  if (raw) {
    for (const needle of candidates) {
      if (!needle) continue;
      const hits = context.objects.filter((o) =>
        fold(`${o.label} ${o.kind ?? ""}`).includes(needle),
      );
      if (hits.length) {
        matched = hits;
        break;
      }
      matched = [];
    }
  }

  const byLabel = new Map<string, number>();
  for (const o of matched) {
    byLabel.set(o.label, (byLabel.get(o.label) ?? 0) + 1);
  }
  const rows = [...byLabel.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, value: String(count) }));

  return {
    summary: raw
      ? `${matched.length} objeto(s) con '${raw}'.`
      : `${matched.length} objeto(s) en el plano.`,
    affectedObjectIds: matched.map((o) => o.id),
    operations: [
      {
        type: "report",
        title: raw ? `Conteo: '${raw}'` : "Conteo del plano",
        rows: rows.length ? rows : [{ label: "Sin coincidencias", value: "0" }],
      },
    ],
    issues: [],
  };
}
