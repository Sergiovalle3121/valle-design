/* eslint-disable @typescript-eslint/no-explicit-any */
import DxfParser from 'dxf-parser';

/**
 * Minimal DXF → polylines reader for the layout background (Fase 2, read-only).
 *
 * Returns each drawable entity as a flat point list in NORMALISED coordinates:
 * origin at the drawing's top-left and Y growing downward (screen orientation,
 * the opposite of DXF's Y-up), so the editor can place it over the footprint
 * with a plain scale + offset. We approximate curves as segments — enough to use
 * a client/plant plan as a backdrop, not to re-engineer it.
 */
export interface DxfModel {
  /** Each polyline is a flat [x0,y0,x1,y1,…] array in normalised units. */
  polylines: number[][];
  width: number;
  height: number;
}

const MAX_ENTITIES = 40000; // guardrail against pathological files
const ARC_STEPS = 48;

function arcPoints(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  const steps = Math.max(2, Math.ceil((sweep / 360) * ARC_STEPS));
  for (let i = 0; i <= steps; i++) {
    const a = ((startDeg + (sweep * i) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function entityToPoints(e: any): Array<[number, number]> | null {
  switch (e?.type) {
    case 'LINE':
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = Array.isArray(e.vertices) ? e.vertices : [];
      const pts = verts
        .filter((v: any) => Number.isFinite(v?.x) && Number.isFinite(v?.y))
        .map((v: any) => [v.x, v.y] as [number, number]);
      if (pts.length >= 2 && (e.shape || e.closed)) pts.push(pts[0]);
      return pts.length >= 2 ? pts : null;
    }
    case 'CIRCLE': {
      const c = e.center;
      if (!c || !Number.isFinite(e.radius)) return null;
      return arcPoints(c.x, c.y, e.radius, 0, 360);
    }
    case 'ARC': {
      const c = e.center;
      if (!c || !Number.isFinite(e.radius)) return null;
      return arcPoints(
        c.x,
        c.y,
        e.radius,
        Number(e.startAngle) || 0,
        Number(e.endAngle) || 0,
      );
    }
    default:
      return null;
  }
}

export function parseDxf(text: string): DxfModel | null {
  let dxf: any;
  try {
    dxf = new (DxfParser as any)().parseSync(text);
  } catch {
    return null;
  }
  const entities: any[] = Array.isArray(dxf?.entities) ? dxf.entities : [];
  const raw: Array<Array<[number, number]>> = [];
  for (const e of entities) {
    const pts = entityToPoints(e);
    if (pts) raw.push(pts);
    if (raw.length >= MAX_ENTITIES) break;
  }
  if (raw.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of raw) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  // Normalise: origin at top-left, flip Y to screen orientation.
  const polylines = raw.map((poly) => {
    const flat: number[] = [];
    for (const [x, y] of poly) flat.push(x - minX, maxY - y);
    return flat;
  });

  return { polylines, width, height };
}
