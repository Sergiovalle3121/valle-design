/**
 * Snap targets from the DXF underlay — pure, side-effect-free (Fase 60).
 *
 * Completes the "trace a real plan" workflow: the backdrop is shown (Fase 2),
 * can be imported wholesale into walls (Fase 58), and now the cursor SNAPS to
 * it (object-snap to underlay — the everyday AutoCAD reflex). This extracts the
 * snap targets a drafter expects from a plan — every vertex (endpoints/corners)
 * and every segment MIDPOINT — projected into footprint coordinates with the
 * exact same transform the backdrop is drawn with, so a snap lands on the line
 * you see. Then `nearestSnapPoint` finds the closest target to the cursor.
 *
 * Kept pure (no three/DOM) so the candidate extraction and nearest-search can be
 * unit-tested with plain Node.
 */

import type { DxfModel } from './dxf';
import { dxfPointToFootprint, type DxfPlacement, type Pt } from './dxf-walls';

export interface DxfSnapOptions {
  /** Include segment midpoints as snap targets (default true). */
  midpoints?: boolean;
  /** Merge targets closer than this (footprint units) — de-dups shared corners (default 1). */
  tol?: number;
  /** Hard cap on the number of targets — a guardrail for huge plans (default 6000). */
  maxPoints?: number;
}

export interface SnapHit extends Pt {
  /** Distance from the query point to this target (footprint units). */
  dist: number;
}

/** Quantise to a grid of `tol` so near-coincident points collapse to one key. */
function key(x: number, y: number, tol: number): string {
  const q = tol > 0 ? tol : 1;
  return `${Math.round(x / q)}:${Math.round(y / q)}`;
}

/**
 * Extract de-duplicated snap targets (vertices + optional midpoints) from a DXF
 * backdrop, in footprint coordinates. Degenerate input → empty array.
 */
export function dxfSnapPoints(
  model: DxfModel | null | undefined,
  placement: DxfPlacement | null | undefined,
  options: DxfSnapOptions = {},
): Pt[] {
  if (!model || !placement || !Array.isArray(model.polylines) || model.polylines.length === 0) return [];
  const midpoints = options.midpoints !== false;
  const tol = Number.isFinite(options.tol as number) && (options.tol as number) > 0 ? (options.tol as number) : 1;
  const maxPoints = Number(options.maxPoints) > 0 ? Math.floor(Number(options.maxPoints)) : 6000;

  const out: Pt[] = [];
  const seen = new Set<string>();
  const push = (p: Pt): boolean => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return true;
    const k = key(p.x, p.y, tol);
    if (seen.has(k)) return true;
    seen.add(k);
    out.push(p);
    return out.length < maxPoints;
  };

  for (const flat of model.polylines) {
    if (!Array.isArray(flat) || flat.length < 2) continue;
    const verts: Pt[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const nx = Number(flat[i]);
      const ny = Number(flat[i + 1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      verts.push(dxfPointToFootprint(nx, ny, model, placement));
    }
    for (let i = 0; i < verts.length; i++) {
      if (!push(verts[i])) return out;
      if (midpoints && i + 1 < verts.length) {
        const a = verts[i];
        const b = verts[i + 1];
        if (!push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) return out;
      }
    }
  }
  return out;
}

/**
 * Nearest snap target to (x,y) within `tol` (footprint units), or null when
 * none is close enough. O(n) scan — fine for the capped target count.
 */
export function nearestSnapPoint(points: Pt[], x: number, y: number, tol: number): SnapHit | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const limit = Number(tol) > 0 ? Number(tol) : 0;
  let best: SnapHit | null = null;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= limit && (best === null || d < best.dist)) best = { x: p.x, y: p.y, dist: d };
  }
  return best;
}
