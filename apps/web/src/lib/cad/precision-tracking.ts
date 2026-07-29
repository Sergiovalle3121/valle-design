import { polarSnap, type PolarResult } from './polar-tracking';
import type { CadVec2 } from './primitives';

export interface CadTrackingGuide {
  axis: 'x' | 'y' | 'polar';
  value: number;
  source: CadVec2;
}

export interface CadObjectTrackingResult {
  point: CadVec2;
  snapped: boolean;
  guides: CadTrackingGuide[];
}

export function cadWorldToleranceFromView(input: {
  cameraDistance: number;
  verticalFovDeg: number;
  viewportHeightPx: number;
  drawingToSceneScale: number;
  aperturePx?: number;
  min?: number;
  max?: number;
}): number {
  const viewportHeight = Math.max(1, input.viewportHeightPx);
  const scale = Math.max(Number.EPSILON, Math.abs(input.drawingToSceneScale));
  const sceneHeight = 2 * Math.max(0, input.cameraDistance)
    * Math.tan((Math.max(1, input.verticalFovDeg) * Math.PI) / 360);
  const tolerance = (sceneHeight / viewportHeight / scale) * (input.aperturePx ?? 12);
  return Math.max(input.min ?? 1e-6, Math.min(input.max ?? Number.POSITIVE_INFINITY, tolerance));
}

export function acquireCadTrackingPoint(
  acquired: readonly CadVec2[],
  point: CadVec2,
  tolerance: number,
  limit = 8,
): CadVec2[] {
  const duplicate = acquired.some((candidate) =>
    Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance);
  if (duplicate) return [...acquired];
  return [...acquired, { ...point }].slice(-Math.max(1, limit));
}

export function trackFromAcquiredPoints(
  cursor: CadVec2,
  acquired: readonly CadVec2[],
  tolerance: number,
): CadObjectTrackingResult {
  let x = cursor.x;
  let y = cursor.y;
  const guides: CadTrackingGuide[] = [];
  let bestX = tolerance + Number.EPSILON;
  let bestY = tolerance + Number.EPSILON;
  for (const point of acquired) {
    const dx = Math.abs(cursor.x - point.x);
    if (dx <= tolerance && dx < bestX) {
      bestX = dx;
      x = point.x;
      const existing = guides.findIndex((guide) => guide.axis === 'x');
      if (existing >= 0) guides.splice(existing, 1);
      guides.push({ axis: 'x', value: point.x, source: point });
    }
    const dy = Math.abs(cursor.y - point.y);
    if (dy <= tolerance && dy < bestY) {
      bestY = dy;
      y = point.y;
      const existing = guides.findIndex((guide) => guide.axis === 'y');
      if (existing >= 0) guides.splice(existing, 1);
      guides.push({ axis: 'y', value: point.y, source: point });
    }
  }
  return { point: { x, y }, snapped: guides.length > 0, guides };
}

export function resolveCadPolarTracking(
  base: CadVec2,
  cursor: CadVec2,
  incrementDeg: number,
  toleranceDeg = Math.min(6, incrementDeg / 4),
): PolarResult & { guide: CadTrackingGuide | null } {
  const result = polarSnap(base, cursor, incrementDeg, toleranceDeg);
  return {
    ...result,
    guide: result.snapped
      ? { axis: 'polar', value: result.angle, source: base }
      : null,
  };
}
