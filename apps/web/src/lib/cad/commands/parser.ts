import type { CadCommandInput, CadParseResult } from "./types";

const numberWithUnit = /(\d+(?:[.,]\d+)?)\s*(mm|m|in|ft)?/i;
const lastTwoTargets = (text: string) =>
  text
    .split(/\b(?:entre| y | e | a )\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-2);

export function parseCadCommand(text: string): CadParseResult {
  const raw = text.trim();
  const q = raw.toLocaleLowerCase("es-MX");
  if (!q)
    return {
      ok: false,
      confidence: 0,
      clarification: "Escribe un comando CAD.",
    };

  if (/pasillo|holgura|separa|separar|clearance/.test(q)) {
    const match = q.match(numberWithUnit);
    const [targetA, targetB] = lastTwoTargets(raw);
    if (!targetA || !targetB)
      return {
        ok: false,
        confidence: 0.55,
        clarification: "¿Entre qué dos objetos quieres crear el pasillo?",
      };
    if (!match?.[1])
      return {
        ok: false,
        confidence: 0.55,
        clarification: "¿De cuánto debe ser la holgura?",
      };
    const value = Number(match[1].replace(",", "."));
    const unit = match[2] ?? "m";
    return {
      ok: true,
      confidence: 0.86,
      input: {
        id: "create_clearance_aisle",
        targetA,
        targetB,
        distance: unit === "m" ? value * 1000 : value,
        unit: unit === "m" ? "mm" : unit,
        axis: /vertical|norte|sur|arriba|abajo/.test(q) ? "y" : "x",
      },
    };
  }
  if (/aline(a|ar)|align/.test(q)) {
    const mode = /derecha|right/.test(q)
      ? "right"
      : /izquierda|left/.test(q)
        ? "left"
        : /arriba|top/.test(q)
          ? "top"
          : /abajo|bottom/.test(q)
            ? "bottom"
            : /medio|middle/.test(q)
              ? "middle"
              : "center";
    return {
      ok: true,
      confidence: 0.82,
      input: { id: "align_selection", mode } as CadCommandInput,
    };
  }
  if (/distribu|espacia|equal/.test(q))
    return {
      ok: true,
      confidence: 0.8,
      input: {
        id: "distribute_selection",
        axis: /vertical/.test(q) ? "vertical" : "horizontal",
      },
    };
  if (/conecta|flujo|secuencia/.test(q))
    return { ok: true, confidence: 0.74, input: { id: "connect_flow" } };
  if (/acomoda|ordena|reacomoda|layout/.test(q))
    return {
      ok: true,
      confidence: 0.74,
      input: {
        id: "arrange_line",
        direction: /vertical|arriba|abajo/.test(q)
          ? "top_to_bottom"
          : "left_to_right",
      },
    };
  if (/mide|medir|distancia/.test(q)) {
    const [targetA, targetB] = lastTwoTargets(raw);
    if (!targetA || !targetB)
      return {
        ok: false,
        confidence: 0.55,
        clarification: "¿Entre qué dos objetos quieres medir?",
      };
    return {
      ok: true,
      confidence: 0.78,
      input: { id: "measure_distance", targetA, targetB },
    };
  }
  if (/colisi|traslape|overlap/.test(q))
    return { ok: true, confidence: 0.82, input: { id: "find_collisions" } };
  if (/enfoca|zoom|fit/.test(q))
    return { ok: true, confidence: 0.7, input: { id: "fit_to_view" } };
  return { ok: false, confidence: 0.1, error: "No reconocí el comando CAD." };
}
