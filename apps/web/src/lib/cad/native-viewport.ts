import * as THREE from 'three';
import type { CadBounds } from './entity-runtime';

export interface CadViewportTransform {
  scale: number;
  width: number;
  height: number;
}

const VIEWPORT_PROBES = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

/**
 * Projects screen probes onto the CAD floor and returns canonical document
 * bounds. A small overscan keeps geometry stable while OrbitControls damps.
 */
export function cadViewportBoundsFromCamera(
  camera: THREE.Camera,
  viewport: CadViewportTransform,
  overscanRatio = 0.12,
): CadBounds | null {
  if (!(viewport.scale > 0)) return null;
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersection = new THREE.Vector3();
  const points: { x: number; y: number }[] = [];
  for (const [x, y] of VIEWPORT_PROBES) {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    if (!raycaster.ray.intersectPlane(floor, intersection)) continue;
    points.push({
      x: intersection.x / viewport.scale + viewport.width / 2,
      y: intersection.z / viewport.scale + viewport.height / 2,
    });
  }
  if (points.length < 3) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const overscan = Math.max(0, overscanRatio);
  const paddingX = overscan === 0 ? 0 : Math.max(1, (maxX - minX) * overscan);
  const paddingY = overscan === 0 ? 0 : Math.max(1, (maxY - minY) * overscan);
  return {
    minX: minX - paddingX,
    minY: minY - paddingY,
    maxX: maxX + paddingX,
    maxY: maxY + paddingY,
  };
}

/** Avoids rebuilding detail for sub-pixel camera damping changes. */
export function cadViewportBoundsChanged(
  previous: CadBounds | null,
  next: CadBounds,
  toleranceRatio = 0.04,
): boolean {
  if (!previous) return true;
  const toleranceX = Math.max(1, (previous.maxX - previous.minX) * toleranceRatio);
  const toleranceY = Math.max(1, (previous.maxY - previous.minY) * toleranceRatio);
  return Math.abs(previous.minX - next.minX) > toleranceX
    || Math.abs(previous.maxX - next.maxX) > toleranceX
    || Math.abs(previous.minY - next.minY) > toleranceY
    || Math.abs(previous.maxY - next.maxY) > toleranceY;
}
