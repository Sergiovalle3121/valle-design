/**
 * Lectura de las anotaciones SEMÁNTICAS de un DXF escrito por este producto:
 * cotas y directrices múltiples.
 *
 * Vuelven a entrar como entidades de pleno derecho —no como la geometría
 * suelta de su bloque anónimo— porque el fichero lleva su XDATA con el tipo,
 * las unidades, el prefijo, la flecha y el resto de lo que las define. Sin esta
 * lectura, exportar y volver a importar convertía una cota en seis líneas y un
 * texto.
 *
 * Salen de `dxf-import.ts` porque ese archivo está en su asignación exacta del
 * trinquete de tamaño y porque son una familia coherente por su cuenta.
 */
import { isDxfXdataApp } from "@valle-design/contracts";
import type {
  CadDxfPoint,
  CadDxfSemanticDimension,
  CadDxfSemanticMleader,
} from "./dxf-import";
import { num, rawDxfPairs } from "./dxf-read-core";

const MAX_DXF_ENTITIES = 50000;
const DEFAULT_LAYER = "0";

const DIMENSION_KINDS = new Set<CadDxfSemanticDimension["dimensionKind"]>([
  "linear", "aligned", "angular", "radius", "diameter", "ordinate", "arc-length",
]);
const DIMENSION_UNITS = new Set<NonNullable<CadDxfSemanticDimension["units"]>>(["mm", "cm", "m", "in", "ft"]);
const DIMENSION_ARROWS = new Set<NonNullable<CadDxfSemanticDimension["arrowhead"]>>([
  "closed-filled", "open", "architectural-tick", "dot",
]);

/**
 * Valle Design dimensions use ordinary DIMENSION entities plus registered XDATA. The
 * metadata retains semantic formatting while the anonymous *D block keeps the
 * drawing visible in CAD readers that do not understand the XDATA.
 */
export function parseRawDxfSemanticDimensions(text: string): CadDxfSemanticDimension[] {
  const pairs = rawDxfPairs(text);
  const dimensions: CadDxfSemanticDimension[] = [];
  for (let start = 0; start < pairs.length && dimensions.length < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "DIMENSION") continue;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const applicationIndex = entityPairs.findIndex((pair) => pair.code === 1001 && isDxfXdataApp('dimension', pair.value));
    if (applicationIndex < 0) { start = end - 1; continue; }
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const point = (xCode: number, yCode: number): CadDxfPoint | null => {
      const x = num(first(xCode));
      const y = num(first(yCode));
      return x === null || y === null ? null : { x, y };
    };
    const metadata = new Map<string, string>();
    for (const pair of entityPairs.slice(applicationIndex + 1)) {
      if (pair.code !== 1000) continue;
      const separator = pair.value.indexOf("=");
      if (separator > 0) metadata.set(pair.value.slice(0, separator), pair.value.slice(separator + 1));
    }
    const rawKind = metadata.get("kind") as CadDxfSemanticDimension["dimensionKind"] | undefined;
    const kind = rawKind && DIMENSION_KINDS.has(rawKind) ? rawKind : null;
    const a = point(13, 23);
    const b = point(14, 24) ?? point(10, 20);
    const blockName = first(2) ?? "";
    if (!kind || !a || !b || !blockName) { start = end - 1; continue; }
    const numericMetadata = (key: string) => num(metadata.get(key));
    const rawUnits = metadata.get("units") as NonNullable<CadDxfSemanticDimension["units"]> | undefined;
    const rawSourceUnit = metadata.get("sourceUnit") as NonNullable<CadDxfSemanticDimension["sourceUnit"]> | undefined;
    const rawAlternate = metadata.get("alternateUnits") as NonNullable<CadDxfSemanticDimension["alternateUnits"]> | undefined;
    const rawArrow = metadata.get("arrowhead") as NonNullable<CadDxfSemanticDimension["arrowhead"]> | undefined;
    const c = point(15, 25);
    const precision = num(first(271));
    const offset = numericMetadata("offset");
    const radius = numericMetadata("radius");
    const arrowSize = numericMetadata("arrowSize");
    const extensionGap = numericMetadata("extensionGap");
    const extensionOvershoot = numericMetadata("extensionOvershoot");
    const textGap = numericMetadata("textGap");
    const textOverride = metadata.get("textOverride") ?? "";
    dimensions.push({
      blockName,
      layer: first(8) || DEFAULT_LAYER,
      dimensionKind: kind,
      a,
      b,
      ...(c ? { c } : {}),
      axis: metadata.get("axis") === "y" ? "y" : "x",
      ...(offset !== null ? { offset } : {}),
      ...(radius !== null && radius > 0 ? { radius } : {}),
      style: first(3) || "Standard",
      ...(precision !== null ? { precision: Math.max(0, Math.min(8, Math.floor(precision))) } : {}),
      ...(rawUnits && DIMENSION_UNITS.has(rawUnits) ? { units: rawUnits } : {}),
      ...(rawSourceUnit && DIMENSION_UNITS.has(rawSourceUnit) ? { sourceUnit: rawSourceUnit } : {}),
      ...(rawAlternate && DIMENSION_UNITS.has(rawAlternate) ? { alternateUnits: rawAlternate } : {}),
      prefix: metadata.get("prefix") ?? "",
      suffix: metadata.get("suffix") ?? "",
      extensionLines: metadata.get("extensionLines") !== "0",
      ...(rawArrow && DIMENSION_ARROWS.has(rawArrow) ? { arrowhead: rawArrow } : {}),
      ...(arrowSize !== null && arrowSize > 0 ? { arrowSize } : {}),
      ...(extensionGap !== null && extensionGap >= 0 ? { extensionGap } : {}),
      ...(extensionOvershoot !== null && extensionOvershoot >= 0 ? { extensionOvershoot } : {}),
      ...(textGap !== null && textGap >= 0 ? { textGap } : {}),
      ...(textOverride ? { text: textOverride } : {}),
    });
    start = end - 1;
  }
  return dimensions;
}

const MLEADER_ARROWS = new Set<NonNullable<CadDxfSemanticMleader["arrowhead"]>>([
  "closed-filled", "open", "architectural-tick", "dot", "none",
]);

export function parseRawDxfSemanticMleaders(text: string): CadDxfSemanticMleader[] {
  const pairs = rawDxfPairs(text);
  const mleaders: CadDxfSemanticMleader[] = [];
  let sourceOrdinal = -1;
  for (let start = 0; start < pairs.length && mleaders.length < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "MLEADER") continue;
    sourceOrdinal += 1;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const applicationIndex = entityPairs.findIndex((pair) => pair.code === 1001 && isDxfXdataApp('mleader', pair.value));
    if (applicationIndex < 0) { start = end - 1; continue; }
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const metadataPairs = entityPairs.slice(applicationIndex + 1).filter((pair) => pair.code === 1000);
    const metadata = new Map<string, string>();
    const lines = new Map<number, Map<number, CadDxfPoint>>();
    for (const pair of metadataPairs) {
      const separator = pair.value.indexOf("=");
      if (separator <= 0) continue;
      const key = pair.value.slice(0, separator);
      const value = pair.value.slice(separator + 1);
      if (key === "line") {
        const [rawLine, rawPoint, rawX, rawY] = value.split(",");
        const lineIndex = Number(rawLine); const pointIndex = Number(rawPoint); const x = num(rawX); const y = num(rawY);
        if (Number.isInteger(lineIndex) && Number.isInteger(pointIndex) && lineIndex >= 0 && pointIndex >= 0 && x !== null && y !== null) {
          const line = lines.get(lineIndex) ?? new Map<number, CadDxfPoint>();
          line.set(pointIndex, { x, y });
          lines.set(lineIndex, line);
        }
      } else metadata.set(key, value);
    }
    const leaderLines = [...lines.entries()].sort(([a], [b]) => a - b)
      .map(([, line]) => [...line.entries()].sort(([a], [b]) => a - b).map(([, point]) => point))
      .filter((line) => line.length >= 2);
    const textX = num(metadata.get("textX")); const textY = num(metadata.get("textY"));
    if (!leaderLines.length || textX === null || textY === null) { start = end - 1; continue; }
    const decode = (value: string | undefined, fallback = "") => {
      try { return decodeURIComponent(value ?? fallback); } catch { return fallback; }
    };
    const textChunks = [...metadata.entries()].filter(([key]) => /^text\d+$/.test(key)).sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4))).map(([, value]) => value).join("");
    const arrow = metadata.get("arrowhead") as NonNullable<CadDxfSemanticMleader["arrowhead"]> | undefined;
    const numeric = (key: string) => num(metadata.get(key));
    const textWidth = numeric("textWidth"); const textHeight = numeric("textHeight"); const textRotation = numeric("textRotation");
    const lineSpacing = numeric("lineSpacing"); const backgroundPadding = numeric("backgroundPadding");
    const doglegLength = numeric("doglegLength"); const arrowSize = numeric("arrowSize");
    const alignment = metadata.get("textAlignment");
    mleaders.push({
      sourceOrdinal,
      layer: first(8) || DEFAULT_LAYER,
      vertices: leaderLines[0].map((point) => ({ ...point, z: 0 })),
      leaderLines: leaderLines.map((line) => line.map((point) => ({ ...point, z: 0 }))),
      text: decode(textChunks),
      textPosition: { x: textX, y: textY, z: 0 },
      contentType: metadata.get("contentType") === "text" ? "text" : "mtext",
      style: decode(metadata.get("style"), "Standard"),
      ...(textWidth !== null && textWidth > 0 ? { textWidth } : {}),
      ...(textHeight !== null && textHeight > 0 ? { textHeight } : {}),
      ...(textRotation !== null ? { textRotation } : {}),
      ...(alignment && ["left", "center", "right", "justify"].includes(alignment) ? { textAlignment: alignment as NonNullable<CadDxfSemanticMleader["textAlignment"]> } : {}),
      fontFamily: decode(metadata.get("fontFamily"), "Arial"),
      ...(lineSpacing !== null && lineSpacing > 0 ? { lineSpacing } : {}),
      bold: metadata.get("bold") === "1", italic: metadata.get("italic") === "1", underline: metadata.get("underline") === "1",
      backgroundMask: metadata.get("backgroundMask") === "1", backgroundColor: metadata.get("backgroundColor") || undefined,
      ...(backgroundPadding !== null && backgroundPadding >= 0 ? { backgroundPadding } : {}),
      landing: metadata.get("landing") !== "0",
      ...(doglegLength !== null && doglegLength > 0 ? { doglegLength } : {}),
      ...(arrow && MLEADER_ARROWS.has(arrow) ? { arrowhead: arrow } : {}),
      ...(arrowSize !== null && arrowSize > 0 ? { arrowSize } : {}),
    });
    start = end - 1;
  }
  return mleaders;
}

/**
 * dxf-parser currently drops HATCH. Parse polyline boundary paths directly
 * from ASCII group codes so solid and predefined-pattern hatches survive the
 * same import pipeline. Edge paths (arc/spline loops) remain explicit warnings.
 */
