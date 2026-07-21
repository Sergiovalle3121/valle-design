/**
 * Colocar símbolo (AXOS-CAD-PLACE-001): 'pon una puerta', 'coloca una cama
 * en 3000,2000' — el copiloto busca en la biblioteca (universal + EMS) y
 * emite el create con las medidas reales del símbolo. Sin coordenadas, lo
 * centra en el footprint para que el usuario lo arrastre a su sitio.
 */
import { normalizeDeg } from "../../../components/line-engineering/precision-input";
import { searchCadSymbols } from "../symbols";
import { matchObjectsByName } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error, warning } from "./validators";

const MAX_ROW = 30;

/** Busca tolerando plural español ('sillas' → 'silla', 'estantes' → 'estante'). */
function searchWithPlural(q: string) {
  const attempts = [q];
  if (q.length > 3 && /es$/i.test(q)) attempts.push(q.slice(0, -2));
  if (q.length > 2 && /s$/i.test(q)) attempts.push(q.slice(0, -1));
  for (const attempt of attempts) {
    const matches = searchCadSymbols(attempt);
    if (matches.length) return matches;
  }
  return [];
}

export function placeSymbolPreview(
  input: Extract<CadCommandInput, { id: "place_symbol" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const q = input.query?.trim();
  if (!q) {
    issues.push(
      error(
        "place_symbol_query",
        "Dime qué símbolo colocar (p. ej. 'puerta', 'cama', 'mostrador').",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const matches = searchWithPlural(q);
  if (!matches.length) {
    issues.push(
      error(
        "place_symbol_not_found",
        `No encontré '${q}' en la biblioteca de símbolos.`,
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const symbol = matches[0];
  let count = Math.max(1, Math.floor(input.count ?? 1));
  if (count > MAX_ROW) {
    issues.push(
      warning(
        "place_count_clamped",
        `Una fila lleva máximo ${MAX_ROW} piezas; coloco ${MAX_ROW}.`,
      ),
    );
    count = MAX_ROW;
  }
  const gap = Math.max(0, input.gap ?? 100);
  const step = symbol.defaultWidth + gap;
  const totalW = symbol.defaultWidth + (count - 1) * step;
  // Ancla relacional (AXOS-CAD-PLACE-004): 'junto a la mesa' cae a la
  // derecha del ancla, misma altura; con coordenadas explícitas ganan ellas.
  const anchorQuery = input.anchor?.trim();
  let anchorBox: { x: number; w: number; y: number } | undefined;
  if (anchorQuery) {
    const anchors = matchObjectsByName(context, anchorQuery);
    if (!anchors.length) {
      issues.push(
        error(
          "place_anchor_not_found",
          `No encontré '${anchorQuery}' para colocar junto a él.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    anchorBox = anchors[0];
  }
  const x = Number.isFinite(input.x)
    ? Math.round(input.x as number)
    : anchorBox
      ? Math.round(anchorBox.x + anchorBox.w + gap)
      : Math.round((context.footprintW ?? 10000) / 2 - totalW / 2);
  const y = Number.isFinite(input.y)
    ? Math.round(input.y as number)
    : anchorBox
      ? Math.round(anchorBox.y)
      : Math.round((context.footprintH ?? 6000) / 2 - symbol.defaultHeight / 2);

  const rotation = Number.isFinite(input.rotation)
    ? normalizeDeg(input.rotation as number)
    : undefined;
  const operations: CadOperation[] = Array.from({ length: count }, (_, i) => ({
    type: "create",
    object: {
      kind: symbol.id,
      type: "asset",
      label: count > 1 ? `${symbol.label} ${i + 1}` : symbol.label,
      x: x + i * step,
      y,
      w: symbol.defaultWidth,
      h: symbol.defaultHeight,
      rotation,
    },
  }));

  return {
    summary:
      count > 1
        ? `${count} × ${symbol.label} en fila desde (${x}, ${y}).`
        : `${symbol.label} colocado en (${x}, ${y}).`,
    affectedObjectIds: [],
    operations,
    issues,
  };
}
