/**
 * DXF → editable walls — pure, side-effect-free geometry (Fase 58).
 *
 * The layout can carry a read-only DXF backdrop (a client/plant plan traced
 * behind the layout, Fase 2). This turns that static backdrop into REAL,
 * editable geometry: every drawn segment becomes a `wall` asset the CAD editor
 * can move, rotate, resize and quantify — the leap from "tracing over a plan"
 * to "owning the plan", the kind of round-trip AutoCAD users expect.
 *
 * The transform from a DXF point to footprint coordinates mirrors exactly how
 * the backdrop is drawn on the floor (see `rebuildDxf` in Layout3DEditor):
 *
 *   pivot  cx = width·scale/2 + offsetX,  cy = height·scale/2 + offsetY
 *   raw    wx0 = nx·scale + offsetX,      wy0 = ny·scale + offsetY
 *   rotate (dx,dy)=(wx0−cx, wy0−cy) by `rotation` around the pivot → (fx,fy)
 *
 * so the generated walls land precisely on top of the backdrop. A wall asset is
 * stored the same way the wall tool stores one: an axis-aligned box of
 * length×thickness centred on the segment midpoint, then turned by the segment
 * angle (degrees) — `{ x: mid−len/2, y: mid−thick/2, w: len, h: thick, rotation }`.
 *
 * Kept pure (no `three`, no DOM) so the maths can be unit-tested with plain Node.
 */

import type { DxfModel } from './dxf';

/** Placement of the DXF on the footprint — same shape as the layout's DxfMeta. */
export interface DxfPlacement {
  offsetX: number;
  offsetY: number;
  scale: number;
  /** Degrees, clockwise in screen orientation (matches DxfMeta.rotation). */
  rotation: number;
}

/** A wall ready to become an editable asset, in footprint units. */
export interface WallSpec {
  /** Top-left X of the un-rotated box. */
  x: number;
  /** Top-left Y of the un-rotated box. */
  y: number;
  /** Length of the wall (the box width). */
  w: number;
  /** Thickness of the wall (the box depth). */
  h: number;
  /** Rotation about the box centre, degrees. */
  rotation: number;
}

export interface DxfToWallsOptions {
  /** Wall thickness in footprint units (default 150). */
  thickness?: number;
  /** Drop segments shorter than this, in footprint units (default 60). */
  minLen?: number;
  /** Hard cap on the number of walls produced — a guardrail (default 1500). */
  maxWalls?: number;
  /** Collapse near-collinear runs into single walls (default true). */
  simplify?: boolean;
  /** Max corner deviation still treated as "straight", degrees (default 6). */
  collinearDeg?: number;
}

export interface DxfToWallsResult {
  /** The editable walls, in footprint coordinates. */
  walls: WallSpec[];
  /** True when the `maxWalls` cap clipped the output. */
  truncated: boolean;
  /** How many drawable segments the source contained (before length filtering). */
  segmentsConsidered: number;
}

interface Pt {
  x: number;
  y: number;
}

/** Map a normalised DXF point to footprint coordinates (mirrors rebuildDxf). */
function toFootprint(nx: number, ny: number, model: DxfModel, p: DxfPlacement): Pt {
  const scale = Number(p.scale) || 1;
  const ox = Number(p.offsetX) || 0;
  const oy = Number(p.offsetY) || 0;
  const cx = (model.width * scale) / 2 + ox;
  const cy = (model.height * scale) / 2 + oy;
  const rad = ((Number(p.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const wx0 = nx * scale + ox;
  const wy0 = ny * scale + oy;
  const dx = wx0 - cx;
  const dy = wy0 - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Drop interior vertices whose turn angle is below `tolDeg`, collapsing a
 * straight run that was drawn as many short segments into one long edge. The
 * reference point for each comparison is the LAST KEPT vertex, so a long
 * straight stretch reduces to its two endpoints.
 */
function simplifyChain(pts: Pt[], tolDeg: number): Pt[] {
  if (pts.length <= 2) return pts;
  const tol = (tolDeg * Math.PI) / 180;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(a1 - a2);
    if (d > Math.PI) d = Math.abs(d - 2 * Math.PI); // normalise to [0, π]
    if (d >= tol) out.push(b); // a real corner — keep it
    // else b is collinear with the run → drop it
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** One wall box from a segment, matching the wall-tool storage convention. */
function segmentToWall(a: Pt, b: Pt, thick: number): WallSpec {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const rotation = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { x: mx - len / 2, y: my - thick / 2, w: len, h: thick, rotation };
}

/**
 * Convert a DXF backdrop into editable wall assets placed exactly over it.
 *
 * Pure: returns plain specs (no ids/kind) so the caller assigns ids and pushes
 * them into the layout. Degenerate inputs yield an empty, non-throwing result.
 */
export function dxfToWalls(
  model: DxfModel | null | undefined,
  placement: DxfPlacement | null | undefined,
  options: DxfToWallsOptions = {},
): DxfToWallsResult {
  const empty: DxfToWallsResult = { walls: [], truncated: false, segmentsConsidered: 0 };
  if (!model || !placement || !Array.isArray(model.polylines) || model.polylines.length === 0) {
    return empty;
  }

  const thickness = Number(options.thickness) > 0 ? Number(options.thickness) : 150;
  const minLen = Number.isFinite(options.minLen as number) && (options.minLen as number) >= 0 ? (options.minLen as number) : 60;
  const maxWalls = Number(options.maxWalls) > 0 ? Math.floor(Number(options.maxWalls)) : 1500;
  const simplify = options.simplify !== false;
  const collinearDeg = Number.isFinite(options.collinearDeg as number) ? (options.collinearDeg as number) : 6;

  const walls: WallSpec[] = [];
  let segmentsConsidered = 0;
  let truncated = false;

  for (const flat of model.polylines) {
    if (!Array.isArray(flat) || flat.length < 4) continue;
    // Project every vertex of this polyline into footprint coordinates.
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const nx = Number(flat[i]);
      const ny = Number(flat[i + 1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      pts.push(toFootprint(nx, ny, model, placement));
    }
    const chain = simplify ? simplifyChain(pts, collinearDeg) : pts;
    for (let i = 0; i + 1 < chain.length; i++) {
      segmentsConsidered++;
      const wall = segmentToWall(chain[i], chain[i + 1], thickness);
      if (wall.w < minLen) continue; // skip slivers
      if (walls.length >= maxWalls) {
        truncated = true;
        break;
      }
      walls.push(wall);
    }
    if (truncated) break;
  }

  return { walls, truncated, segmentsConsidered };
}
