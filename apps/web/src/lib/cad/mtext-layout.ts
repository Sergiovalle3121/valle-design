import type { CadEntity, CadPoint2 } from './cad-document';
import { cadMTextPlainText } from './mtext-codes';

export type CadMTextEntity = Extract<CadEntity, { type: 'mtext' }>;

export interface CadMTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  column: number;
  justify: boolean;
}

export interface CadMTextLayout {
  lines: CadMTextLine[];
  width: number;
  height: number;
  columnWidth: number;
  lineHeight: number;
  fontSize: number;
  corners: CadPoint2[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  fontStack: string;
}

const DEFAULT_FONT_SIZE = 120;
const DEFAULT_LINE_SPACING = 1.2;
const measurementCache = new Map<string, number>();
const MAX_MEASUREMENT_CACHE = 4_096;

export function cadMTextFontStack(fontFamily?: string): string {
  const requested = fontFamily?.trim().replace(/["']/g, '');
  return [requested, 'Arial', 'Helvetica', 'sans-serif'].filter(Boolean).join(', ');
}

export function clearCadMTextMeasurementCache(): void {
  measurementCache.clear();
}

export function cadMTextMeasurementCacheSize(): number {
  return measurementCache.size;
}

/** Deterministic and worker-safe; no DOM/canvas dependency. */
export function measureCadMText(
  text: string,
  height: number,
  options: { fontFamily?: string; bold?: boolean; italic?: boolean } = {},
): number {
  const key = `${text}\u0000${height}\u0000${options.fontFamily ?? ''}\u0000${options.bold ? 1 : 0}${options.italic ? 1 : 0}`;
  const cached = measurementCache.get(key);
  if (cached !== undefined) return cached;
  let units = 0;
  for (const character of text) {
    if (/\s/.test(character)) units += 0.33;
    else if (/[ilI1.,:;!'|]/.test(character)) units += 0.3;
    else if (/[MW@#%&]/.test(character)) units += 0.9;
    else if (character.charCodeAt(0) > 255) units += 1;
    else units += 0.58;
  }
  const value = units * height * (options.bold ? 1.05 : 1) * (options.italic ? 1.02 : 1);
  if (measurementCache.size >= MAX_MEASUREMENT_CACHE)
    measurementCache.delete(measurementCache.keys().next().value as string);
  measurementCache.set(key, value);
  return value;
}

function wrapParagraph(
  paragraph: string,
  width: number,
  fontSize: number,
  entity: CadMTextEntity,
): string[] {
  if (!paragraph) return [''];
  const words = paragraph.split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current + word;
    if (!current || measureCadMText(candidate, fontSize, entity) <= width) {
      current = candidate;
      continue;
    }
    lines.push(current.trimEnd());
    if (measureCadMText(word, fontSize, entity) <= width) current = word.trimStart();
    else {
      let chunk = '';
      for (const character of word) {
        if (chunk && measureCadMText(chunk + character, fontSize, entity) > width) {
          lines.push(chunk);
          chunk = character;
        } else chunk += character;
      }
      current = chunk;
    }
  }
  if (current || !lines.length) lines.push(current.trimEnd());
  return lines;
}

function rotate(point: CadPoint2, degrees: number): CadPoint2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function attachmentOffset(alignment: NonNullable<CadMTextEntity['alignment']>, width: number, height: number): CadPoint2 {
  const horizontal = alignment.endsWith('center') ? -width / 2 : alignment.endsWith('right') ? -width : 0;
  const vertical = alignment.startsWith('middle') ? height / 2 : alignment.startsWith('bottom') ? height : 0;
  return { x: horizontal, y: vertical };
}

export function layoutCadMText(entity: CadMTextEntity): CadMTextLayout {
  const fontSize = Math.max(1e-6, entity.height ?? DEFAULT_FONT_SIZE);
  const lineHeight = fontSize * Math.max(0.5, entity.lineSpacing ?? DEFAULT_LINE_SPACING);
  const columns = Math.max(1, Math.min(8, Math.floor(entity.columns ?? 1)));
  const requestedWidth = Math.max(fontSize, entity.width ?? fontSize * 20);
  const gap = columns > 1 ? fontSize : 0;
  const columnWidth = Math.max(fontSize, (requestedWidth - gap * (columns - 1)) / columns);
  // Los códigos de control se resuelven ANTES de medir. Antes sólo se traducía
  // `\P`, así que un apilado se dibujaba como los caracteres `\S1^2;` y ocupaba
  // el ancho de esa retahíla en vez del de la fracción.
  //
  // A MEDIAS a propósito: la maqueta mide con la altura de la ENTIDAD, así que
  // un tramo con `\H` propio se mide con la altura equivocada, y el apilado se
  // aplana a `superior/inferior` en una sola línea. La estructura por tramos ya
  // está en `parseCadMText`; consumirla exige que el render sepa dibujar tramos,
  // que es trabajo del pipeline de render y no de esta maqueta de líneas.
  const rawText = cadMTextPlainText(entity.text);
  const wrapped = rawText.split('\n').flatMap((paragraph) => {
    const paragraphLines = wrapParagraph(paragraph, columnWidth, fontSize, entity);
    return paragraphLines.map((text, index) => ({
      text,
      justify: (entity.paragraphAlignment ?? 'left') === 'justify' && index < paragraphLines.length - 1,
    }));
  });
  const rowsPerColumn = Math.max(1, Math.ceil(wrapped.length / columns));
  const contentHeight = Math.max(lineHeight, rowsPerColumn * lineHeight);
  const width = entity.width ? requestedWidth : Math.max(fontSize, Math.min(requestedWidth,
    Math.max(...wrapped.map((line) => measureCadMText(line.text, fontSize, entity)), fontSize)));
  const height = contentHeight;
  const alignment = entity.alignment ?? 'top-left';
  const offset = attachmentOffset(alignment, width, height);
  const paragraphAlignment = entity.paragraphAlignment ?? 'left';
  const lines = wrapped.map((wrappedLine, index): CadMTextLine => {
    const { text, justify } = wrappedLine;
    const column = Math.min(columns - 1, Math.floor(index / rowsPerColumn));
    const row = index % rowsPerColumn;
    const measured = measureCadMText(text, fontSize, entity);
    const alignOffset = paragraphAlignment === 'center'
      ? (columnWidth - measured) / 2
      : paragraphAlignment === 'right'
        ? columnWidth - measured
        : 0;
    return {
      text,
      x: offset.x + column * (columnWidth + gap) + Math.max(0, alignOffset),
      y: offset.y - fontSize - row * lineHeight,
      width: justify ? columnWidth : measured,
      column,
      justify,
    };
  });
  const localCorners = [
    offset,
    { x: offset.x + width, y: offset.y },
    { x: offset.x + width, y: offset.y - height },
    { x: offset.x, y: offset.y - height },
  ];
  const corners = localCorners.map((corner) => {
    const rotated = rotate(corner, entity.rotation ?? 0);
    return { x: entity.insertion.x + rotated.x, y: entity.insertion.y + rotated.y };
  });
  return {
    lines,
    width,
    height,
    columnWidth,
    lineHeight,
    fontSize,
    corners,
    bounds: {
      minX: Math.min(...corners.map((point) => point.x)),
      minY: Math.min(...corners.map((point) => point.y)),
      maxX: Math.max(...corners.map((point) => point.x)),
      maxY: Math.max(...corners.map((point) => point.y)),
    },
    fontStack: cadMTextFontStack(entity.fontFamily),
  };
}
