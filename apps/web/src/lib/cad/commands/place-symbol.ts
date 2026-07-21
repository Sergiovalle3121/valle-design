/**
 * Colocar símbolo (AXOS-CAD-PLACE-001): 'pon una puerta', 'coloca una cama
 * en 3000,2000' — el copiloto busca en la biblioteca (universal + EMS) y
 * emite el create con las medidas reales del símbolo. Sin coordenadas, lo
 * centra en el footprint para que el usuario lo arrastre a su sitio.
 */
import { normalizeDeg } from "../../../components/line-engineering/precision-input";
import { searchCadSymbols } from "../symbols";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

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
  const matches = searchCadSymbols(q);
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
  const x = Number.isFinite(input.x)
    ? Math.round(input.x as number)
    : Math.round((context.footprintW ?? 10000) / 2 - symbol.defaultWidth / 2);
  const y = Number.isFinite(input.y)
    ? Math.round(input.y as number)
    : Math.round((context.footprintH ?? 6000) / 2 - symbol.defaultHeight / 2);

  return {
    summary: `${symbol.label} colocado en (${x}, ${y}).`,
    affectedObjectIds: [],
    operations: [
      {
        type: "create",
        object: {
          kind: symbol.id,
          type: "asset",
          label: symbol.label,
          x,
          y,
          w: symbol.defaultWidth,
          h: symbol.defaultHeight,
          rotation: Number.isFinite(input.rotation)
            ? normalizeDeg(input.rotation as number)
            : undefined,
        },
      },
    ],
    issues,
  };
}
