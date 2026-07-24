import type { NormalizedBox, NormalizedPoint } from "./documents";

export type PdfQuarterTurn = 0 | 90 | 180 | 270;

export interface PdfPointBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function assertUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1`);
  }
}

export function assertNormalizedBox(box: NormalizedBox): void {
  assertUnit(box.x, "box.x");
  assertUnit(box.y, "box.y");
  assertUnit(box.width, "box.width");
  assertUnit(box.height, "box.height");
  if (
    box.width <= 0 ||
    box.height <= 0 ||
    box.x + box.width > 1 ||
    box.y + box.height > 1
  ) {
    throw new RangeError("Normalized box must stay inside the page");
  }
}

/**
 * Converts a point measured in a rotated PDF.js viewport back to the canonical
 * unrotated page. Both systems use a top-left origin and normalized units.
 */
export function viewportPointToPage(
  point: NormalizedPoint,
  rotation: PdfQuarterTurn,
): NormalizedPoint {
  assertUnit(point.x, "point.x");
  assertUnit(point.y, "point.y");
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: point.y, y: 1 - point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: 1 - point.y, y: point.x };
  }
}

export function viewportBoxToPage(
  box: NormalizedBox,
  rotation: PdfQuarterTurn,
): NormalizedBox {
  assertNormalizedBox(box);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((point) => viewportPointToPage(point, rotation));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

/**
 * Converts the canonical normalized top-left box to pdf-lib points, whose
 * origin is bottom-left. This is the only server-side placement conversion.
 */
export function normalizedBoxToPdfPoints(
  box: NormalizedBox,
  pageWidth: number,
  pageHeight: number,
): PdfPointBox {
  assertNormalizedBox(box);
  if (
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    throw new RangeError("Page dimensions must be positive");
  }
  return {
    x: box.x * pageWidth,
    y: (1 - box.y - box.height) * pageHeight,
    width: box.width * pageWidth,
    height: box.height * pageHeight,
  };
}
