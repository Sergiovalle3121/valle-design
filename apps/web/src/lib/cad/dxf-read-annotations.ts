/**
 * Lectura de las ANOTACIONES de un DXF: el texto con formato y las semánticas
 * que escribe este producto —cotas y directrices múltiples—.
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
  CadDxfMText,
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
    const annotativeHeightMm = numericMetadata("annotative");
    /*
     * ESQUEMA 10. Cada uno entra sólo si viene con valor: la clave vacía
     * significa «esta cota no lo trae», y fabricar un valor por defecto aquí
     * cambiaría el dibujo de un DXF exportado antes del esquema 10.
     */
    const textHeight = numericMetadata("textHeight");
    const textStyle = metadata.get("textStyle") ?? "";
    const textColor = metadata.get("textColor") ?? "";
    const dimLineColor = metadata.get("dimLineColor") ?? "";
    const extensionLineColor = metadata.get("extensionLineColor") ?? "";
    const textVertical = metadata.get("textVertical") ?? "";
    const textJustification = metadata.get("textJustification") ?? "";
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
      ...(textHeight !== null && textHeight > 0 ? { textHeight } : {}),
      ...(textStyle ? { textStyle } : {}),
      ...(textColor ? { textColor } : {}),
      ...(dimLineColor ? { dimLineColor } : {}),
      ...(extensionLineColor ? { extensionLineColor } : {}),
      ...(textVertical === "centered" || textVertical === "above"
        ? { textVertical }
        : {}),
      ...(textJustification === "centered" ||
      textJustification === "first" ||
      textJustification === "second"
        ? { textJustification }
        : {}),
      ...(textOverride ? { text: textOverride } : {}),
      ...(annotativeHeightMm !== null && annotativeHeightMm > 0
        ? { annotativeHeightMm }
        : {}),
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

/**
 * MTEXT, leído a mano.
 *
 * Sale de `dxf-import.ts` porque ese archivo está en su asignación exacta del
 * trinquete y porque un texto con formato es una anotación como las otras dos:
 * `dxf-parser` lo entrega sin su codificación de estilos —la fuente, la
 * negrita, el enmascaramiento— y sin eso llega un párrafo plano donde había un
 * bloque de notas maquetado.
 */
function mtextAlignment(value: number): NonNullable<CadDxfMText["alignment"]> {
  return [
    "top-left", "top-center", "top-right",
    "middle-left", "middle-center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
  ][Math.max(1, Math.min(9, value)) - 1] as NonNullable<CadDxfMText["alignment"]>;
}

function decodeMTextContent(value: string): Pick<CadDxfMText, "text" | "fontFamily" | "bold" | "italic" | "underline" | "paragraphAlignment"> {
  const font = /\\f([^|;]+)\|b([01])\|i([01]);/i.exec(value);
  const paragraph = /\\p([crj]);/i.exec(value)?.[1]?.toLowerCase();
  const underline = /\\L/.test(value);
  const text = value
    .replace(/\\p[crj];/gi, "")
    .replace(/\{?\\f[^;]+;/gi, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/\\P/g, "\n")
    .replace(/[{}]/g, "")
    .replace(/\\\\/g, "\\")
    .trim();
  return {
    text,
    ...(font?.[1] ? { fontFamily: font[1] } : {}),
    ...(font ? { bold: font[2] === "1", italic: font[3] === "1" } : {}),
    underline,
    paragraphAlignment: paragraph === "c" ? "center" : paragraph === "r" ? "right" : paragraph === "j" ? "justify" : "left",
  };
}

export function parseRawDxfMTexts(text: string): CadDxfMText[] {
  const pairs = rawDxfPairs(text);
  const result: CadDxfMText[] = [];
  for (let start = 0; start < pairs.length && result.length < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "MTEXT") continue;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const x = num(first(10));
    const y = num(first(20));
    const content = entityPairs.filter((pair) => pair.code === 1 || pair.code === 3).map((pair) => pair.value).join("");
    const decoded = decodeMTextContent(content);
    if (x !== null && y !== null && decoded.text) {
      const trueColor = num(first(420));
      const backgroundPadding = num(first(45));
      result.push({
        layer: first(8) || DEFAULT_LAYER,
        insertion: { x, y },
        ...decoded,
        ...(num(first(41)) !== null ? { width: num(first(41))! } : {}),
        ...(num(first(40)) !== null ? { height: num(first(40))! } : {}),
        ...(num(first(50)) !== null ? { rotation: num(first(50))! } : {}),
        alignment: mtextAlignment(Number(first(71) ?? 1)),
        style: first(7) || "Standard",
        ...(num(first(44)) !== null ? { lineSpacing: num(first(44))! } : {}),
        backgroundMask: (Number(first(90) ?? 0) & 1) === 1,
        ...(trueColor !== null ? { backgroundColor: `#${Math.max(0, trueColor).toString(16).padStart(6, "0").slice(-6)}` } : {}),
        ...(backgroundPadding !== null ? { backgroundPadding: Math.max(0, backgroundPadding - 1) } : {}),
        columns: Math.max(1, Math.min(8, Number(first(76) ?? 1) || 1)),
      });
    }
    start = end - 1;
  }
  return result;
}
