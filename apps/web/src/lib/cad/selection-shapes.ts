export type CadSelectionPathMode = 'polygon' | 'fence' | 'lasso';

export interface CadSelectionPoint {
  x: number;
  y: number;
}

function orientation(a: CadSelectionPoint, b: CadSelectionPoint, c: CadSelectionPoint): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: CadSelectionPoint, b: CadSelectionPoint, point: CadSelectionPoint): boolean {
  return point.x <= Math.max(a.x, b.x) && point.x >= Math.min(a.x, b.x)
    && point.y <= Math.max(a.y, b.y) && point.y >= Math.min(a.y, b.y);
}

export function cadSelectionSegmentsIntersect(
  a: CadSelectionPoint,
  b: CadSelectionPoint,
  c: CadSelectionPoint,
  d: CadSelectionPoint,
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)) return true;
  const epsilon = 1e-9;
  return (Math.abs(abC) <= epsilon && onSegment(a, b, c))
    || (Math.abs(abD) <= epsilon && onSegment(a, b, d))
    || (Math.abs(cdA) <= epsilon && onSegment(c, d, a))
    || (Math.abs(cdB) <= epsilon && onSegment(c, d, b));
}

export function cadSelectionPointInPolygon(
  point: CadSelectionPoint,
  polygon: readonly CadSelectionPoint[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const left = polygon[index];
    const right = polygon[previous];
    if (
      (left.y > point.y) !== (right.y > point.y)
      && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x
    ) inside = !inside;
  }
  return inside;
}

function pathSegments(points: readonly CadSelectionPoint[], closed: boolean): Array<[CadSelectionPoint, CadSelectionPoint]> {
  const result: Array<[CadSelectionPoint, CadSelectionPoint]> = [];
  for (let index = 1; index < points.length; index++) result.push([points[index - 1], points[index]]);
  if (closed && points.length > 2) result.push([points.at(-1)!, points[0]]);
  return result;
}

export function cadSelectionPathMatchesPolygon(
  selectionPath: readonly CadSelectionPoint[],
  objectPolygon: readonly CadSelectionPoint[],
  mode: CadSelectionPathMode,
  crossing = mode !== 'polygon',
): boolean {
  if (selectionPath.length < (mode === 'fence' ? 2 : 3) || objectPolygon.length < 3) return false;
  const selectionSegments = pathSegments(selectionPath, mode !== 'fence');
  const objectSegments = pathSegments(objectPolygon, true);
  const intersects = objectSegments.some(([a, b]) =>
    selectionSegments.some(([c, d]) => cadSelectionSegmentsIntersect(a, b, c, d)));
  if (mode === 'fence') return intersects;
  const fullyInside = objectPolygon.every((point) => cadSelectionPointInPolygon(point, selectionPath));
  if (!crossing) return fullyInside;
  return fullyInside
    || intersects
    || objectPolygon.some((point) => cadSelectionPointInPolygon(point, selectionPath))
    || selectionPath.some((point) => cadSelectionPointInPolygon(point, objectPolygon));
}
