import { parseCoordinate, type Point } from "../precision-input";
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

function unitValueToSeconds(
  match: RegExpMatchArray | null,
): number | undefined {
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

function parseDraftPointPair(
  raw: string,
): { from: Point; to: Point } | { error: string } {
  const tokens =
    raw.match(/@?-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?|<-?\d+(?:\.\d+)?)?/g) ?? [];
  if (tokens.length < 2)
    return { error: "Indica dos puntos, por ejemplo: 0,0 @5000,0" };
  const first = parseCoordinate(tokens[0]!);
  if (!first.ok) return { error: first.error };
  const second = parseCoordinate(tokens[1]!, { last: first.point });
  if (!second.ok) return { error: second.error };
  return { from: first.point, to: second.point };
}

function labelAfter(raw: string): string | undefined {
  return raw.match(/(?:label|etiqueta|nombre)\s+(.+)$/i)?.[1]?.trim();
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

  if (/^(line|linea|línea|muro|wall)\b/.test(q) && /(\d|@)/.test(raw)) {
    const pair = parseDraftPointPair(raw);
    if ("error" in pair)
      return { ok: false, confidence: 0.62, clarification: pair.error };
    const thickness = unitValueToMm(
      q.match(
        /(?:grosor|espesor|thickness)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(mm|m)?/i,
      ),
    );
    return {
      ok: true,
      confidence: 0.88,
      input: {
        id: "draw_wall_segment",
        from: pair.from,
        to: pair.to,
        thickness,
        label: labelAfter(raw),
      },
    };
  }
  if (
    /^(rect|rectangle|rectangulo|rectángulo|room|cuarto|zona)\b/.test(q) &&
    /(\d|@)/.test(raw)
  ) {
    const pair = parseDraftPointPair(raw);
    if ("error" in pair)
      return { ok: false, confidence: 0.62, clarification: pair.error };
    return {
      ok: true,
      confidence: 0.87,
      input: {
        id: "draw_rect_zone",
        from: pair.from,
        to: pair.to,
        kind: /room|cuarto/.test(q) ? "room" : "zone",
        label: labelAfter(raw),
      },
    };
  }
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
    /(rack|racks|estante|estantes|almacen|warehouse|supermarket)/.test(q) &&
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
  // Edición de muros (ADR §218) — extend/trim/chamfer estilo AutoCAD.
  const extendMatch = raw.match(/exti\w+\s+(.+?)\s+(?:hasta|hacia)\s+(.+)$/i);
  if (extendMatch && /exti(e|é)nde|extender|extend/i.test(q)) {
    return {
      ok: true,
      confidence: 0.85,
      input: {
        id: "extend_wall",
        target: extendMatch[1].trim(),
        boundary: extendMatch[2].trim(),
      },
    };
  }
  const trimMatch = raw.match(
    /recort\w+\s+(.+?)\s+(?:en|con|donde cruza)\s+(.+)$/i,
  );
  if (trimMatch && /recorta|recortar|trim/i.test(q)) {
    const keep = /conserva\w*\s+(?:el\s+)?inicio/i.test(q)
      ? ("start" as const)
      : /conserva\w*\s+(?:el\s+)?fin(al)?/i.test(q)
        ? ("end" as const)
        : undefined;
    const cutter = trimMatch[2].replace(/\s+conserva[\s\S]*$/i, "").trim();
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "trim_wall", target: trimMatch[1].trim(), cutter, keep },
    };
  }
  if (/chafl[aá]n|chamfer/i.test(q)) {
    const distance = unitValueToMm(q.match(numberWithUnit));
    const pair = raw.match(/entre\s+(.+?)\s+y\s+(.+)$/i);
    if (!distance)
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿De cuánto es la distancia del chaflán?",
      };
    return {
      ok: true,
      confidence: 0.84,
      input: {
        id: "chamfer_walls",
        distance,
        wallA: pair?.[1]?.trim(),
        wallB: pair?.[2]?.trim(),
      },
    };
  }
  // Patrones de creación (ADR §214) — ANTES del pasillo/clearance porque
  // "separación" y "alrededor" colisionan con esos patrones más genéricos.
  if (
    /(polar|circular|radial)/.test(q) &&
    /(arreglo|matriz|array|copia|patron|patrón)/.test(q)
  ) {
    const count =
      numberNear(q, /(\d+)\s*(?:copias|elementos|piezas|posiciones|veces)/i) ??
      numberNear(q, /(?:de)\s*(\d+)\b/i);
    if (!count)
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Cuántas copias quieres en el arreglo polar?",
      };
    const angleSpanDeg = numberNear(
      q,
      /(?:en|abanico de)\s*(\d+(?:[.,]\d+)?)\s*(?:grados|°)/i,
    );
    const centerLabel = (
      raw.match(/alrededor de\s+(.+)$/i)?.[1] ??
      raw.match(/centrado en\s+(.+)$/i)?.[1]
    )?.trim();
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "array_polar", count, angleSpanDeg, centerLabel },
    };
  }
  const grid = q.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (grid && /(arreglo|matriz|array|rejilla|grid|copia)/.test(q)) {
    const gap = unitValueToMm(
      q.match(
        /(?:separaci[oó]n|gap|espacio|paso)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(mm|m)?/i,
      ),
    );
    return {
      ok: true,
      confidence: 0.86,
      input: {
        id: "array_rectangular",
        cols: Number(grid[1]),
        rows: Number(grid[2]),
        gapX: gap,
        gapY: gap,
      },
    };
  }
  if (
    /(a lo largo|siguiendo)\s+(?:de\s|del\s|la\s|el\s)?.*(flujo|ruta|recorrido)/.test(
      q,
    )
  ) {
    const count = numberNear(q, /(\d+)/);
    if (!count)
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Cuántas copias quieres a lo largo del flujo?",
      };
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "array_along_flow", count },
    };
  }
  // Auto-acotado (ADR §225) — ANTES de mide/medir.
  if (/(acota|acotar|acotado|dimensiona|dimensionar)/.test(q)) {
    const mode = /hueco|gap|espacio|entre/.test(q)
      ? ("gaps" as const)
      : /tama[nñ]o|ancho|alto|size/.test(q)
        ? ("size" as const)
        : undefined;
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "auto_dimension", mode },
    };
  }
  // Medición de regiones y zona envolvente (ADR §221) — ANTES de mide/medir
  // (distancia entre dos) y de pasillo/clearance ("zona" no debe caer ahí).
  if (/(área|area|superficie)/.test(q)) {
    const targetLabel = raw
      .match(
        /(?:área|area|superficie)\s+(?:de\s+)?(?:la\s+|el\s+)?(?:zona\s+)?(.+)$/i,
      )?.[1]
      ?.trim();
    const generic =
      !targetLabel ||
      /^(selecci[oó]n|grupo|zona seleccionada|esto)$/i.test(targetLabel);
    return {
      ok: true,
      confidence: 0.84,
      input: {
        id: "measure_area",
        targetLabel: generic ? undefined : targetLabel,
      },
    };
  }
  if (
    /(zona|envolvente|envuelve).*(alrededor|envolvente)|alrededor de la selecci[oó]n|envuelve/.test(
      q,
    )
  ) {
    const margin = unitValueToMm(
      q.match(/(?:margen|holgura)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(mm|m)?/i),
    );
    return {
      ok: true,
      confidence: 0.83,
      input: { id: "create_zone_around", margin },
    };
  }
  if (/(espejo|espejea|mirror|refleja)/.test(q)) {
    const axis = /horizontal/.test(q)
      ? ("horizontal" as const)
      : ("vertical" as const);
    const copy = /(sin\s+copia|en\s+sitio|sin\s+copiar|mover)/.test(q)
      ? false
      : undefined;
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "mirror_selection", axis, copy },
    };
  }
  if (/(offset|desfasa|desfase|paralela)/.test(q)) {
    const distance =
      unitValueToMm(q.match(/(?:de|a)\s+(\d+(?:[.,]\d+)?)\s*(mm|m)?\b/i)) ??
      unitValueToMm(q.match(numberWithUnit));
    if (!distance)
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿A qué distancia quieres la copia paralela?",
      };
    const side = /arriba|encima|norte/.test(q)
      ? ("up" as const)
      : /abajo|debajo|sur/.test(q)
        ? ("down" as const)
        : /izquierda|oeste/.test(q)
          ? ("left" as const)
          : /derecha|este/.test(q)
            ? ("right" as const)
            : undefined;
    const copies = numberNear(q, /(\d+)\s*(?:copias|veces)/i);
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "offset_object", distance, side, copies },
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
