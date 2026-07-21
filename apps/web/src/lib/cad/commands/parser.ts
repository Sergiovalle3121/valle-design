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

/**
 * Cadenas de comandos (AXOS-CAD-CHAIN-001): 'pon una puerta y luego
 * céntrala' / 'quita las cotas; borra las notas'. Separadores EXPLÍCITOS
 * (';', 'y luego', 'luego', 'y después', 'después') — el ' y ' pelón es
 * ambiguo dentro de nombres y NO separa.
 */
export function splitCadCommandChain(text: string): string[] {
  return text
    .split(/\s*;\s*|\s+y\s+luego\s+|\s+luego\s+|\s+y\s+despu[eé]s\s+|\s+despu[eé]s\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
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
  // CAMBIAR TAMAÑO (AXOS-CAD-RESIZE-001): 'cambia el tamaño de la mesa a
  // 1500x900' — fija w×h exactos conservando la esquina superior izquierda.
  const resizeMatch = raw.match(
    /^(?:cambia\s+el\s+tama[ñn]o|redimensiona|ajusta\s+el\s+tama[ñn]o)\s+(.+)$/i,
  );
  if (resizeMatch) {
    const dims = q.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/);
    if (!dims)
      return {
        ok: false,
        confidence: 0.6,
        clarification:
          "¿A qué tamaño? Dímelo en mm, p. ej. 'cambia el tamaño de la mesa a 1500x900'.",
      };
    const target = resizeMatch[1]!
      .replace(/\ba?\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:mm)?\b/gi, " ")
      .replace(
        /\b(?:la\s+selecci[oó]n|lo\s+seleccionado|esto|estos\s+objetos|esos\s+objetos)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:de|del)\s+/i, "")
      .replace(/^(?:el|la|los|las)\s+/i, "")
      .replace(/^(?:de|del)$/i, "")
      .trim();
    return {
      ok: true,
      confidence: 0.86,
      input: {
        id: "resize_object",
        w: Number(dims[1]!.replace(",", ".")),
        h: Number(dims[2]!.replace(",", ".")),
        target: target || undefined,
      },
    };
  }
  // FILA/REPETIR (AXOS-CAD-ARRAY-001): 'repite la silla 4 veces cada 600
  // a la derecha' — arreglo lineal conversacional con objetivo por nombre.
  const repeatMatch = raw.match(/^rep[ií]te(?:me|l[ao]s?)?\s+(.+)$/i);
  if (repeatMatch) {
    const times = numberNear(q, /(\d+)\s*veces\b/i);
    if (!times || times < 1)
      return {
        ok: false,
        confidence: 0.6,
        clarification:
          "¿Cuántas veces lo repito? (ej. 'repite la silla 4 veces')",
      };
    const gap = unitValueToMm(
      q.match(/cada\s*(\d+(?:[.,]\d+)?)\s*(mm|m)?\b/i),
    );
    const vertical = /(abajo|arriba|columna|vertical)/.test(q);
    const negative = /(izquierda|arriba)/.test(q);
    const target = repeatMatch[1]!
      .replace(/\b\d+\s*veces\b/gi, " ")
      .replace(/\bcada\s*\d+(?:[.,]\d+)?\s*(?:mm|m)?\b/gi, " ")
      .replace(
        /\b(?:hacia\s+)?(?:a\s+la\s+)?(?:derecha|izquierda|arriba|abajo)\b/gi,
        " ",
      )
      .replace(/\ben\s+(?:fila|columna|l[ií]nea)\b/gi, " ")
      .replace(
        /\b(?:la\s+selecci[oó]n|lo\s+seleccionado|esto|estos\s+objetos|esos\s+objetos)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/i, "")
      .replace(/^(?:de|del)\s+/i, "")
      .replace(/^(?:de|del)$/i, "")
      .trim();
    return {
      ok: true,
      confidence: 0.86,
      input: {
        id: "array_rectangular",
        cols: vertical ? 1 : times + 1,
        rows: vertical ? times + 1 : 1,
        gapX: vertical ? undefined : gap,
        gapY: vertical ? gap : undefined,
        dirX: !vertical && negative ? -1 : undefined,
        dirY: vertical && negative ? -1 : undefined,
        target: target || undefined,
      },
    };
  }
  const grid = q.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (grid && /(arreglo|matriz|array|rejilla|grid|copia)/.test(q)) {
    const gap = unitValueToMm(
      q.match(
        /(?:separaci[oó]n|gap|espacio|paso)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(mm|m)?/i,
      ),
    );
    // 'arreglo 3x4 de mesas': el resto tras la rejilla es el objetivo.
    const gridTarget = raw
      .match(/[x×]\s*\d+\s+(?:de|con)\s+(.+)$/i)?.[1]
      ?.replace(
        /\b(?:separaci[oó]n|gap|espacio|paso)\s*(?:de\s*)?\d+(?:[.,]\d+)?\s*(?:mm|m)?\b/gi,
        " ",
      )
      .replace(/\bcada\s*\d+(?:[.,]\d+)?\s*(?:mm|m)?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:el|la|los|las)\s+/i, "")
      .trim();
    return {
      ok: true,
      confidence: 0.86,
      input: {
        id: "array_rectangular",
        cols: Number(grid[1]),
        rows: Number(grid[2]),
        gapX: gap,
        gapY: gap,
        target: gridTarget || undefined,
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
    const dimTarget = q
      .replace(/^.*?\b(?:acota|acotar|acotado|dimensiona|dimensionar)\b\s*/, "")
      .replace(/\b(huecos?|gaps?|espacios?|entre|tama[nñ]os?|anchos?|altos?|size|todo)\b/g, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "auto_dimension", mode, target: dimTarget || undefined },
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
  if (/(^|\s)(pon|coloca|inserta)\s/.test(q)) {
    const coords = q.match(/(\d+)\s*[,x]\s*(\d+)/);
    const rot = q.match(/(?:girad[ao]|rotad[ao])\s+(-?\d+(?:[.,]\d+)?)/);
    let query = q
      .replace(/(^|\s)(pon|coloca|inserta)\s+(una?|unos?|el|la|los|las)?\s*/, " ")
      .trim();
    query = query
      .replace(/\b(?:girad[ao]|rotad[ao])\s+-?\d[\d.,]*\s*/, "")
      .replace(/\ben\s+\d[\d\s.,x]*$/, "")
      .trim();
    // 'pon 3 sillas en fila cada 200' (AXOS-CAD-PLACE-003): N en fila.
    const countMatch = query.match(/^(\d{1,2})\s+/);
    let count: number | undefined;
    if (countMatch) {
      count = Number(countMatch[1]);
      query = query.slice(countMatch[0].length).trim();
    }
    const rowGap = unitValueToMm(
      query.match(/cada\s*(\d+(?:[.,]\d+)?)\s*(mm|m)?\b/i),
    );
    query = query
      .replace(/\bcada\s*\d+(?:[.,]\d+)?\s*(?:mm|m)?\b/gi, " ")
      .replace(/\ben\s+(?:fila|l[ií]nea)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    // 'pon una silla junto a la mesa' (AXOS-CAD-PLACE-004/005): ancla por
    // nombre con lado opcional (izquierda/derecha/arriba/abajo).
    const anchorMatch = query.match(
      /\b(junto\s+al?|al\s+lado\s+del?|a\s+un\s+lado\s+del?|a\s+la\s+izquierda\s+del?|a\s+la\s+derecha\s+del?|arriba\s+del?|encima\s+del?|abajo\s+del?|debajo\s+del?)\s+(.+)$/i,
    );
    let anchor: string | undefined;
    let anchorSide: "left" | "right" | "above" | "below" | undefined;
    let anchorEach: boolean | undefined;
    if (anchorMatch) {
      let anchorResidue = anchorMatch[2]!.replace(/\s+/g, " ").trim();
      // 'junto a cada mesa' (AXOS-CAD-PLACE-006): uno por coincidencia.
      if (/^cada\s+/i.test(anchorResidue)) {
        anchorEach = true;
        anchorResidue = anchorResidue.replace(/^cada\s+/i, "");
      }
      anchor =
        anchorResidue.replace(/^(?:el|la|los|las|un|una)\s+/i, "").trim() ||
        undefined;
      const phrase = anchorMatch[1]!;
      anchorSide = /izquierda/i.test(phrase)
        ? "left"
        : /arriba|encima/i.test(phrase)
          ? "above"
          : /abajo|debajo/i.test(phrase)
            ? "below"
            : undefined;
      query = query.slice(0, anchorMatch.index).trim();
    }
    // 'pon una planta en cada esquina' (AXOS-CAD-PLACE-008): 4 piezas en
    // las esquinas del footprint.
    let corners: boolean | undefined;
    if (/\ben\s+cada\s+esquina\b/.test(query)) {
      corners = true;
      query = query.replace(/\ben\s+cada\s+esquina\b/g, " ").replace(/\s+/g, " ").trim();
    }
    // 'pon una silla en cada cuarto' (AXOS-CAD-PLACE-009): una pieza
    // centrada en cada cuarto hoja del plano.
    let perRoom: boolean | undefined;
    if (/\ben\s+cada\s+(?:cuarto|habitaci[oó]n|zona)\b/.test(query)) {
      perRoom = true;
      query = query
        .replace(/\ben\s+cada\s+(?:cuarto|habitaci[oó]n|zona)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    // 'pon una silla en la cocina' (AXOS-CAD-PLACE-007): colocar dentro
    // de un cuarto/zona por nombre — solo sin coordenadas y sin ancla;
    // las direcciones sueltas no son zonas.
    let into: string | undefined;
    if (!coords && !anchor) {
      const intoMatch =
        query.match(
          /\b(?:dentro\s+de|adentro\s+de|en|a)\s+(?:la|el|los|las|una?)\s+(.+)$/i,
        ) ?? query.match(/\bal\s+(.+)$/i);
      const intoName = intoMatch?.[1]?.replace(/\s+/g, " ").trim();
      if (
        intoName &&
        !/^(?:derecha|izquierda|arriba|abajo|centro|frente|fondo)$/i.test(
          intoName,
        )
      ) {
        into = intoName;
        query = query.slice(0, intoMatch!.index).trim();
      }
    }
    if (!query) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Qué símbolo coloco? (p. ej. 'puerta', 'cama')",
      };
    }
    return {
      ok: true,
      confidence: 0.82,
      input: {
        id: "place_symbol",
        query,
        x: coords ? Number(coords[1]) : undefined,
        y: coords ? Number(coords[2]) : undefined,
        rotation: rot ? Number(rot[1].replace(",", ".")) : undefined,
        count,
        gap: rowGap,
        anchor,
        anchorSide,
        anchorEach,
        into,
        corners,
        perRoom,
      },
    };
  }
  if (/(rota|gira|rotate)/.test(q) && !/(ruta|rotación de inventario)/.test(q)) {
    const m = q.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°|grados|deg)?/);
    const angle = m ? Number(m[1].replace(",", ".")) : NaN;
    if (!Number.isFinite(angle) || angle === 0) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Cuántos grados giro la selección? (p. ej. 90 o -45)",
      };
    }
    const rotTarget = q
      .replace(/^.*?\b(?:rota|gira|rotar|girar|rotate)\b\s*/, "")
      .replace(/-?\d+(?:[.,]\d+)?\s*(?:°|grados|deg)?/g, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "rotate_selection", angle, target: rotTarget || undefined },
    };
  }
  if (/(escala|scale|agranda|reduce)/.test(q)) {
    const pct = q.match(/(\d+(?:[.,]\d+)?)\s*%/);
    const num = q.match(/(?:por|x|×)?\s*(\d+(?:[.,]\d+)?)/);
    const factor = pct
      ? Number(pct[1].replace(",", ".")) / 100
      : num
        ? Number(num[1].replace(",", "."))
        : NaN;
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Con qué factor escalo? (p. ej. 2, 0.5 o 150%)",
      };
    }
    const scaleTarget = q
      .replace(/^.*?\b(?:escala|escalar|scale|agranda|agrandar|reduce|reducir)\b\s*/, "")
      .replace(/\b(?:al?|por|x|×)?\s*\d+(?:[.,]\d+)?\s*%?/g, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "scale_selection", factor, target: scaleTarget || undefined },
    };
  }
  if (/(espejo|espejea|mirror|refleja)/.test(q)) {
    const axis = /horizontal/.test(q)
      ? ("horizontal" as const)
      : ("vertical" as const);
    const copy = /(sin\s+copia|en\s+sitio|sin\s+copiar|mover)/.test(q)
      ? false
      : undefined;
    const mirrorTarget = q
      .replace(/^.*?\b(?:espejo|espejea|espejear|mirror|refleja|reflejar)\b\s*/, "")
      .replace(/\b(vertical|horizontal|sin\s+copiar?|en\s+sitio|mover)\b/g, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:de\s+)?(?:una?|el|la|los|las)\s+/, "")
      .replace(/^de\s+/, "")
      .replace(/^(?:de|del)$/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "mirror_selection", axis, copy, target: mirrorTarget || undefined },
    };
  }
  if (
    /\b(quita|quitar|borra|borrar|limpia|limpiar|elimina|eliminar)\b/.test(q) &&
    /\b(cotas?|medidas|notas?|anotaciones|textos?)\b/.test(q)
  ) {
    const kind = /\b(anotaciones)\b/.test(q)
      ? ("all" as const)
      : /\b(notas?|textos?)\b/.test(q)
        ? ("notes" as const)
        : ("dims" as const);
    return {
      ok: true,
      confidence: 0.86,
      input: { id: "clear_annotations", kind },
    };
  }
  // 'despeja la cocina' (AXOS-CAD-ZONE-003): vaciar una zona con un
  // verbo — arma 'lo que está en X' y la contención borra el contenido
  // del cuarto sin tocar al cuarto mismo.
  if (/\b(despeja|despejar|vac[ií]a|vaciar)\b/.test(q)) {
    const residue = q
      .replace(/^.*?\b(?:despeja|despejar|vac[ií]a|vaciar)\b\s*/, "")
      .replace(/[¿?¡!.]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    if (!residue) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Qué despejo? ('despeja la cocina')",
      };
    }
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "delete_selection", target: `lo que está en ${residue}` },
    };
  }
  if (/\b(borra|borrar|elimina|eliminar|quita|quitar|suprime|delete)\b/.test(q)) {
    // Residuo tras el verbo = objetivo por nombre ('borra la puerta');
    // 'la selección/esto/esos objetos' siguen siendo la selección actual.
    const target = q
      .replace(/^.*?\b(?:borra|borrar|elimina|eliminar|quita|quitar|suprime|delete)\b\s*/, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?|todo)\b/g, "")
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.85,
      input: { id: "delete_selection", target: target || undefined },
    };
  }
  if (/\b(escribe|escribir|anota|rotula|texto|nota)\b/.test(q)) {
    const coords = q.match(/(\d+)\s*[,x]\s*(\d+)/);
    // El texto: entre comillas (conserva mayúsculas) o el residuo tras el verbo.
    const quoted = raw.match(/['"“”‘’]([^'"“”‘’]+)['"“”‘’]/);
    let label = quoted?.[1]?.trim() ?? "";
    if (!label) {
      label = raw
        .replace(/^.*?\b(?:escribe|escribir|anota|rotula|texto|nota)\b\s*/i, "")
        .replace(/\ben\s+\d[\d\s.,x]*$/i, "")
        .trim();
    }
    if (!label) {
      return {
        ok: false,
        confidence: 0.6,
        clarification:
          "¿Qué texto escribo? (p. ej. escribe 'Recepción' en 2000,1000)",
      };
    }
    return {
      ok: true,
      confidence: 0.82,
      input: {
        id: "add_label",
        text: label,
        x: coords ? Number(coords[1]) : undefined,
        y: coords ? Number(coords[2]) : undefined,
      },
    };
  }
  if (/\b(duplica|duplicar|copia|copiar|clona|clonar)\b/.test(q)) {
    const off = q.match(/\b(?:a|en)\s+(-?\d+)\s*[,x]\s*(-?\d+)/);
    // 'duplica la mesa en la bodega' (AXOS-CAD-DUP-002): la copia
    // aterriza centrada en la zona — solo sin offset explícito.
    let into: string | undefined;
    if (!off) {
      const intoM =
        q.match(
          /\b(?:dentro\s+de|adentro\s+de|en|a|hacia)\s+(?:la|el|los|las|una?)\s+(.+)$/,
        ) ?? q.match(/\bal\s+(.+)$/);
      const intoName = intoM?.[1]?.replace(/\s+/g, " ").trim();
      if (
        intoName &&
        !/^(?:derecha|izquierda|arriba|abajo|centro|frente|fondo)$/.test(
          intoName,
        )
      ) {
        into = intoName;
      }
    }
    const target = q
      .replace(/^.*?\b(?:duplica|duplicar|copia|copiar|clona|clonar)\b\s*/, "")
      .replace(/\b(?:a|en)\s+-?\d+\s*[,x]\s*-?\d+.*$/, "")
      .replace(into ? /\b(?:dentro\s+de|adentro\s+de|en|a|hacia)\s+(?:la|el|los|las|una?)\s+.+$|\bal\s+.+$/ : /$^/, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.83,
      input: {
        id: "duplicate_selection",
        target: target || undefined,
        dx: off ? Number(off[1]) : undefined,
        dy: off ? Number(off[2]) : undefined,
        into,
      },
    };
  }
  if (/\b(ayuda|help|comandos)\b/.test(q) || /qu[eé] puedes hacer/.test(q)) {
    return { ok: true, confidence: 0.9, input: { id: "help_commands" } };
  }
  if (/^(guarda|guardar|salva|salvar|save)\b/.test(q) && !/\b(vista|versi[oó]n|bloque)\b/.test(q)) {
    return { ok: true, confidence: 0.88, input: { id: "studio_save" } };
  }
  if (/\b(vista|modo)\s*(2\s*d|3\s*d)\b/.test(q) || /\b(planta|cenital)\b/.test(q)) {
    const mode = /2\s*d|planta|cenital/.test(q) ? ("2d" as const) : ("3d" as const);
    return { ok: true, confidence: 0.88, input: { id: "studio_view", mode } };
  }
  if (/\b(imprime|imprimir|plotea|plot|exporta|exportar|descarga|descargar)\b/.test(q)) {
    const format = /\bdxf\b/.test(q)
      ? ("dxf" as const)
      : /\b(png|imagen)\b/.test(q)
        ? ("png" as const)
        : /\b(glb|3d|blender)\b/.test(q)
          ? ("glb" as const)
          : ("pdf" as const);
    const paperMatch = q.match(/\b(a[0-4])\b/);
    const paper = paperMatch
      ? paperMatch[1].toUpperCase()
      : /\bcarta\b/.test(q)
        ? "letter"
        : /\btabloide\b/.test(q)
          ? "tabloid"
          : undefined;
    return {
      ok: true,
      confidence: 0.86,
      input: { id: "studio_export", format, paper },
    };
  }
  if (/^(deshaz|deshacer|undo)\b/.test(q)) {
    return { ok: true, confidence: 0.9, input: { id: "history_step", action: "undo" } };
  }
  if (/^(rehaz|rehacer|redo)\b/.test(q)) {
    return { ok: true, confidence: 0.9, input: { id: "history_step", action: "redo" } };
  }
  if (/\b(selecciona|seleccionar|resalta|resaltar|elige|escoge)\b/.test(q)) {
    let query = q
      .replace(/^.*?\b(?:selecciona|seleccionar|resalta|resaltar|elige|escoge)\b\s*/, "")
      .replace(/\b(en\s+el\s+plano|en\s+el\s+layout)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:tod[oa]s\s+(?:las|los)\s+|una?\s+|el\s+|la\s+|los\s+|las\s+)/, "")
      .trim();
    // Exclusión (AXOS-CAD-SELECT-002): 'selecciona todo menos las mesas'.
    let exclude: string | undefined;
    const exclM = query.match(/\b(?:menos|excepto|salvo)\s+(.+)$/);
    if (exclM) {
      exclude =
        exclM[1]!.replace(/^(?:una?|el|la|los|las)\s+/, "").trim() ||
        undefined;
      query = query.slice(0, exclM.index).trim();
    }
    if (!query) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Qué selecciono? (p. ej. 'las mesas', 'la barra' o 'todo')",
      };
    }
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "select_objects", query, exclude },
    };
  }
  if (/\b(renombra|renombrar|rename)\b/.test(q)) {
    const m = raw.match(
      /\brenombra(?:r)?\s+(?:la\s+|el\s+|los\s+|las\s+)?(.+?)\s+(?:a|como)\s+(.+)$/i,
    );
    if (!m) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Qué renombro y cómo? (\"renombra la mesa a 'Mesa VIP'\")",
      };
    }
    const name = m[2].trim().replace(/^['"“”‘’]|['"“”‘’]$/g, "").trim();
    return {
      ok: true,
      confidence: 0.86,
      input: { id: "rename_object", target: m[1].trim(), name },
    };
  }
  // '¿dónde está la estufa?' (AXOS-CAD-QUERY-007): INFO responde también
  // la ubicación — en qué cuarto/zona vive cada coincidencia.
  // OJO: \b de JS es ASCII — tras 'á' no hay frontera, por eso lookahead.
  if (/d[oó]nde\s+(?:est[aá]n?|queda|anda)(?=[\s?!.]|$)/.test(q)) {
    const query = q
      .replace(/^.*?d[oó]nde\s+(?:est[aá]n?|queda|anda)(?=[\s?!.]|$)\s*/, "")
      .replace(/[¿?¡!.]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    if (!query) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿Qué busco? ('¿dónde está la estufa?')",
      };
    }
    return { ok: true, confidence: 0.86, input: { id: "object_info", query } };
  }
  if (/cu[aá]nto\s+mide[ns]?\b/.test(q) || /^info\s+/.test(q)) {
    const query = q
      .replace(/^.*?(?:cu[aá]nto\s+mide[ns]?|^info)\s*/, "")
      .replace(/\b(de|del|la|el|los|las|una?)\b/g, " ")
      .replace(/[¿?¡!.]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!query) {
      return {
        ok: false,
        confidence: 0.6,
        clarification: "¿De qué objeto? ('¿cuánto mide la mesa?')",
      };
    }
    return { ok: true, confidence: 0.86, input: { id: "object_info", query } };
  }
  // '¿qué hay en la cocina?' (AXOS-CAD-QUERY-008): inventario de zona —
  // arma 'lo que hay en la X' y la contención (ZONE-001) hace el resto.
  // Sin residuo (o 'en el plano') cuenta todo. Lookahead, no \b (ASCII).
  if (/qu[eé]\s+(?:hay|tenemos|tengo)(?=[\s?!.]|$)/.test(q)) {
    const residue = q
      .replace(/^.*?qu[eé]\s+(?:hay|tenemos|tengo)(?=[\s?!.]|$)\s*/, "")
      .replace(/\ben\s+el\s+(?:plano|layout)\b/g, "")
      .replace(/[¿?¡!.]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const query = residue
      ? /^(?:en|dentro\s+de|adentro\s+de)(?:\s|$)/.test(residue)
        ? `lo que hay ${residue}`
        : residue.replace(/^(?:una?|el|la|los|las)\s+/, "")
      : undefined;
    return {
      ok: true,
      confidence: 0.84,
      input: { id: "count_objects", query },
    };
  }
  if (/\b(cuenta|cuentame|cuéntame|cuantas|cuántas|cuantos|cuántos)\b/.test(q)) {
    // '¿cuántas mesas hay en cada cuarto?' (AXOS-CAD-QUERY-010): el
    // conteo se desglosa por el cuarto que contiene cada coincidencia.
    const byRoom = /\ben\s+cada\s+(?:cuarto|habitaci[oó]n|zona|espacio)\b/.test(
      q,
    );
    const query = q
      .replace(/^.*?\b(?:cuenta|cuentame|cuéntame|cuantas|cuántas|cuantos|cuántos)\b\s*/, "")
      .replace(/\ben\s+cada\s+(?:cuarto|habitaci[oó]n|zona|espacio)\b/g, "")
      .replace(/\b(hay|tengo|tenemos|existen|en\s+el\s+plano|en\s+el\s+layout)\b/g, "")
      .replace(/[¿?¡!.]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.85,
      input: {
        id: "count_objects",
        query: query || undefined,
        byRoom: byRoom || undefined,
      },
    };
  }
  if (/\b(centra|centrar|centralo|centrala|céntralo|céntrala)\b/.test(q)) {
    const target = q
      .replace(/^.*?\b(?:centra|centrar|centralo|centrala|céntralo|céntrala)\b\s*/, "")
      .replace(/\b(en\s+el\s+plano|en\s+el\s+centro|al\s+centro|del\s+plano)\b/g, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.85,
      input: {
        id: "move_selection",
        center: true,
        target: target || undefined,
      },
    };
  }
  if (/\b(mueve|mover|lleva|llevar|desplaza|desplazar|mete|meter)\b/.test(q)) {
    const abs = q.match(/\b(?:a|en|hasta)\s+(-?\d+)\s*[,x]\s*(-?\d+)/);
    const rel = q.match(
      /(\d+(?:[.,]\d+)?)\s*(mm|m)?\s*(?:a\s+la|hacia\s+la|hacia\s+el|al)?\s*(derecha|izquierda|arriba|abajo)/,
    );
    let dx: number | undefined;
    let dy: number | undefined;
    if (!abs && rel) {
      const mag = Number(rel[1].replace(",", ".")) * (rel[2] === "m" ? 1000 : 1);
      if (rel[3] === "derecha") dx = mag;
      else if (rel[3] === "izquierda") dx = -mag;
      else if (rel[3] === "abajo") dy = mag;
      else dy = -mag;
    }
    // Destino relacional (AXOS-CAD-MOVE-003): 'mueve la silla junto a la
    // mesa' / 'a la izquierda del tocador'.
    const moveAnchorM = q.match(
      /\b(junto\s+al?|al\s+lado\s+del?|a\s+la\s+izquierda\s+del?|a\s+la\s+derecha\s+del?|arriba\s+del?|encima\s+del?|abajo\s+del?|debajo\s+del?)\s+(.+)$/,
    );
    let moveAnchor: string | undefined;
    let moveAnchorSide: "left" | "right" | "above" | "below" | undefined;
    if (moveAnchorM && !abs && dx === undefined && dy === undefined) {
      moveAnchor =
        moveAnchorM[2]!
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^(?:el|la|los|las|un|una)\s+/, "")
          .trim() || undefined;
      const phrase = moveAnchorM[1]!;
      moveAnchorSide = /izquierda/.test(phrase)
        ? "left"
        : /arriba|encima/.test(phrase)
          ? "above"
          : /abajo|debajo/.test(phrase)
            ? "below"
            : undefined;
    }
    // Destino de zona (AXOS-CAD-MOVE-004): 'mete la mesa en la cocina',
    // 'lleva la silla al comedor' — solo cuando no hay coords, relativo
    // ni ancla; las direcciones sueltas siguen pidiendo aclaración.
    let into: string | undefined;
    if (!abs && dx === undefined && dy === undefined && !moveAnchor) {
      const intoM =
        q.match(
          /\b(?:dentro\s+de|adentro\s+de|en|a|hacia)\s+(?:la|el|los|las|una?)\s+(.+)$/,
        ) ?? q.match(/\bal\s+(.+)$/);
      const intoName = intoM?.[1]?.replace(/\s+/g, " ").trim();
      if (
        intoName &&
        !/^(?:derecha|izquierda|arriba|abajo|centro|frente|fondo)$/.test(
          intoName,
        )
      ) {
        into = intoName;
      }
    }
    const target = q
      .replace(/^.*?\b(?:mueve|mover|lleva|llevar|desplaza|desplazar|mete|meter)\b\s*/, "")
      .replace(/\b(?:a|en|hasta)\s+-?\d+\s*[,x]\s*-?\d+.*$/, "")
      .replace(/\d+(?:[.,]\d+)?\s*(?:mm|m)?\s*(?:a\s+la|hacia\s+la|hacia\s+el|al)?\s*(?:derecha|izquierda|arriba|abajo).*$/, "")
      .replace(/\b(?:junto\s+al?|al\s+lado\s+del?|a\s+la\s+izquierda\s+del?|a\s+la\s+derecha\s+del?|arriba\s+del?|encima\s+del?|abajo\s+del?|debajo\s+del?)\s+.+$/, "")
      .replace(into ? /\b(?:dentro\s+de|adentro\s+de|en|a|hacia)\s+(?:la|el|los|las|una?)\s+.+$|\bal\s+.+$/ : /$^/, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    if (!abs && dx === undefined && dy === undefined && !moveAnchor && !into) {
      return {
        ok: false,
        confidence: 0.6,
        clarification:
          "¿A dónde lo muevo? ('a 2000,650', '500 a la derecha', 'junto a la mesa' o 'a la cocina')",
      };
    }
    return {
      ok: true,
      confidence: 0.85,
      input: {
        id: "move_selection",
        target: target || undefined,
        x: abs ? Number(abs[1]) : undefined,
        y: abs ? Number(abs[2]) : undefined,
        dx,
        dy,
        anchor: moveAnchor,
        anchorSide: moveAnchorSide,
        into,
      },
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
    // ALINEAR con ancla (AXOS-CAD-ALIGN-002): 'alinea las sillas con la mesa'.
    let alignAnchor: string | undefined;
    const alignAnchorM = q.match(/\bcon\s+(.+)$/);
    if (alignAnchorM) {
      alignAnchor =
        alignAnchorM[1]!
          .replace(/\b(al?\s+)?(derecha|izquierda|arriba|abajo|medio|middle|centro|center|top|bottom|left|right)\b/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^(?:una?|el|la|los|las)\s+/, "")
          .trim() || undefined;
    }
    const alignTarget = q
      .replace(/^.*?\b(?:alinea|alinear|align)\b\s*/, "")
      .replace(/\bcon\s+.+$/, "")
      .replace(/\b(al?\s+)?(derecha|izquierda|arriba|abajo|medio|middle|centro|center|top|bottom|left|right)\b/g, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .replace(/^(?:de|del|al)$/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.82,
      input: {
        id: "align_selection",
        mode,
        target: alignTarget || undefined,
        anchor: alignAnchor,
      } as CadCommandInput,
    };
  }
  if (/distribu|espacia|equal/.test(q)) {
    // Separación fija (AXOS-CAD-DIST-002): 'distribuye las mesas cada 800'.
    const distGap = unitValueToMm(
      q.match(/cada\s*(\d+(?:[.,]\d+)?)\s*(mm|m)?\b/i),
    );
    const distTarget = q
      .replace(/^.*?\b(?:distribuye|distribuir|espacia|espaciar)\b\s*/, "")
      .replace(/\b(vertical(mente)?|horizontal(mente)?)\b/g, "")
      .replace(/\bcada\s*\d+(?:[.,]\d+)?\s*(?:mm|m)?\b/gi, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|esto|estos|esos?\s*(objetos)?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.8,
      input: {
        id: "distribute_selection",
        axis: /vertical/.test(q) ? "vertical" : "horizontal",
        target: distTarget || undefined,
        gap: distGap,
      } as CadCommandInput,
    };
  }
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
  if (/enfoca|zoom|fit/.test(q)) {
    const target = q
      .replace(/^.*?\b(?:enfoca|enfocar|zoom|fit)\b\s*/, "")
      .replace(/\b(la\s+selecci[oó]n|lo\s+seleccionado|todo|el\s+layout|el\s+plano|a|en)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:una?|el|la|los|las)\s+/, "")
      .trim();
    return {
      ok: true,
      confidence: 0.7,
      input: { id: "fit_to_view", target: target || undefined },
    };
  }
  return { ok: false, confidence: 0.1, error: "No reconocí el comando CAD." };
}
