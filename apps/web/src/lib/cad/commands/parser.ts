import type { CadCommandInput, CadParseResult } from "./types";

const numberWithUnit = /(\d+(?:[.,]\d+)?)\s*(mm|m|in|ft)?/i;
const numberWithTimeUnit =
  /(\d+(?:[.,]\d+)?)\s*(s|sec|seg|segundos|min|mins|minutos)\b/i;
const lastTwoTargets = (text: string) =>
  text
    .split(/\b(?:entre| y | e | a )\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-2);

function unitValueToMm(match: RegExpMatchArray | null): number | undefined {
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  return match[2]?.toLowerCase() === "m" ? value * 1000 : value;
}

function unitValueToSeconds(match: RegExpMatchArray | null): number | undefined {
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  const unit = match[2]?.toLowerCase() ?? "s";
  return unit.startsWith("min") ? value * 60 : value;
}

function numberNear(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

export function parseCadCommand(text: string): CadParseResult {
  const raw = text.trim();
  const q = raw.toLocaleLowerCase("es-MX");
  if (!q)
    return {
      ok: false,
      confidence: 0,
      clarification: "Escribe un comando CAD.",
    };

  if (/valida|validaci[oó]n|diagn[oó]stic|revisa.*layout/.test(q)) {
    const match = q.match(numberWithUnit);
    const requiredClearance = unitValueToMm(match);
    return {
      ok: true,
      confidence: 0.8,
      input: { id: "validate_layout", requiredClearance },
    };
  }
  if (/balance|balanceo|yamazumi|takt|tacto|bottleneck|cuello/.test(q)) {
    const taktTimeSec = unitValueToSeconds(
      q.match(
        /(?:takt|tacto|objetivo|target)\D*(\d+(?:[.,]\d+)?)\s*(s|sec|seg|segundos|min|mins|minutos)?/i,
      ) ?? q.match(numberWithTimeUnit),
    );
    return {
      ok: true,
      confidence: 0.82,
      input: { id: "analyze_line_balance", taktTimeSec },
    };
  }
  if (
    /(ruta|recorrido|traza|trazar|trace|from-to|from to|camino|path)/.test(q) &&
    /(material|materiales|flujo|flow|route|ruta|recorrido)/.test(q)
  ) {
    return {
      ok: true,
      confidence: 0.82,
      input: { id: "trace_material_route" },
    };
  }
  if (
    /(rack|racks|estante|estantes|almacen|warehouse|supermarket)/.test(
      q,
    ) &&
    /(acomoda|ordena|organiza|fila|filas|row|rows|bahia|bahias|bays|pasillo|aisle)/.test(
      q,
    )
  ) {
    const aisleWidth = unitValueToMm(
      q.match(/(?:pasillo|aisle)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(mm|m)?/i),
    );
    const bayGap = unitValueToMm(
      q.match(
        /(?:gap|separacion|entre racks)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(mm|m)?/i,
      ),
    );
    return {
      ok: true,
      confidence: 0.83,
      input: {
        id: "arrange_rack_rows",
        orientation: /vertical|norte|sur|top|bottom/.test(q)
          ? "vertical"
          : "horizontal",
        rows: numberNear(q, /(\d+)\s*(?:filas|hileras|rows)/i),
        baysPerRow: numberNear(q, /(\d+)\s*(?:bahia|bahias|bays)/i),
        aisleWidth,
        bayGap,
      },
    };
  }
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
  if (
    /(acomoda|ordena|reacomoda).*(conecta|flujo|secuencia)|linea de flujo|flow line|flujo conectado/.test(
      q,
    )
  ) {
    const match = q.match(numberWithUnit);
    const value = match?.[1] ? Number(match[1].replace(",", ".")) : undefined;
    const gap =
      value == null ? undefined : match?.[2] === "m" ? value * 1000 : value;
    return {
      ok: true,
      confidence: 0.82,
      input: {
        id: "arrange_flow_line",
        direction: /vertical|arriba|abajo/.test(q)
          ? "top_to_bottom"
          : "left_to_right",
        gap,
      },
    };
  }
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
