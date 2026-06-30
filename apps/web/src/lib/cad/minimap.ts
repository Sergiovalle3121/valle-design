/**
 * Pure coordinate maths for the plant minimap overview (EPIC 0).
 *
 * The 3D editor normalises the footprint (W×H world units, e.g. mm) to scene
 * units via a scale `s`, and the OrbitControls `target` lives in scene space.
 * These helpers translate between footprint world coords, scene-space target
 * coords, and minimap pixels — kept pure so the overlay component stays a thin
 * SVG renderer and the maths is unit-testable.
 */

export const MINI_MAX_W = 184;
export const MINI_MAX_H = 132;

/** Fit a W×H footprint into the mini box, preserving aspect ratio. */
export function minimapScale(W: number, H: number, maxW = MINI_MAX_W, maxH = MINI_MAX_H): number {
  return Math.min(maxW / Math.max(1, W), maxH / Math.max(1, H));
}

/** OrbitControls target (scene coords) → footprint world coords. */
export function targetToWorld(targetX: number, targetZ: number, s: number, W: number, H: number): { x: number; y: number } {
  if (s === 0) return { x: W / 2, y: H / 2 };
  return { x: targetX / s + W / 2, y: targetZ / s + H / 2 };
}

/** Footprint world coords → OrbitControls target (scene coords). */
export function worldToTarget(wx: number, wy: number, s: number, W: number, H: number): { x: number; z: number } {
  return { x: (wx - W / 2) * s, z: (wy - H / 2) * s };
}

/** Clamp a world point into the footprint rectangle. */
export function clampToFootprint(wx: number, wy: number, W: number, H: number): { x: number; y: number } {
  return {
    x: Math.min(W, Math.max(0, wx)),
    y: Math.min(H, Math.max(0, wy)),
  };
}

export interface MiniBox { x: number; y: number; w: number; h: number }

/** A footprint-space box → minimap pixels (with a 1px floor so it stays visible). */
export function boxToMini(b: MiniBox, scale: number): MiniBox {
  return {
    x: b.x * scale,
    y: b.y * scale,
    w: Math.max(1, b.w * scale),
    h: Math.max(1, b.h * scale),
  };
}
