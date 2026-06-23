/**
 * Automatic dimensioning — pure, side-effect-free geometry (Fase 59).
 *
 * Turns a set of placed objects (stations + equipment) into a measured drawing
 * the way a drafter would: an OVERALL width run under the layout, an OVERALL
 * height run to its left, and CHAINED pitch dimensions between consecutive
 * object centres along each axis (the spacings a line engineer actually reads).
 * One click and the layout reads like a fabrication sheet — the dimensioned
 * drawing AutoCAD users expect, without placing every cote by hand.
 *
 * Each dimension is just a segment {x,y → x2,y2} in footprint units; the editor
 * already labels it with its own length (see buildDim), so no text is computed
 * here. The runs are offset OUTSIDE the bounding box so they never cross the
 * geometry. Kept pure (no three/DOM) so the layout maths can be unit-tested.
 */

export interface DimBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A dimension segment in footprint units — ready to become a `dim` annotation. */
export interface DimSpec {
  x: number;
  y: number;
  x2: number;
  y2: number;
}

export interface AutoDimInput {
  /** Objects to dimension (station/asset boxes). Empty → dimension the footprint. */
  boxes: DimBox[];
  footprintW: number;
  footprintH: number;
  /** Working grid (used to size the default offset). */
  gridSize?: number;
}

export interface AutoDimOptions {
  /** Distance the overall runs sit outside the bounding box (footprint units). */
  offset?: number;
  /** Emit chained centre-to-centre pitch dimensions (default true). */
  chain?: boolean;
  /** Skip a chain when it would exceed this many segments — anti-clutter (default 30). */
  maxChain?: number;
  /** Merge coordinates closer than this and drop zero-length dims (default 1). */
  tol?: number;
}

const fin = (n: number): number => (Number.isFinite(n) ? n : 0);

/** Sorted, de-duplicated (within `tol`) list of values. */
function uniqSorted(values: number[], tol: number): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1] > tol) out.push(v);
  }
  return out;
}

/**
 * Build the overall + chained dimension set for a layout.
 *
 * Pure: returns plain segments (no ids/type) so the caller turns them into
 * annotations. Degenerate inputs yield an empty, non-throwing result.
 */
export function autoDimensions(input: AutoDimInput, options: AutoDimOptions = {}): DimSpec[] {
  if (!input || !Array.isArray(input.boxes)) return [];
  const W = Math.max(0, fin(input.footprintW));
  const H = Math.max(0, fin(input.footprintH));
  const grid = Number(input.gridSize) > 0 ? Number(input.gridSize) : 500;

  const offset = Number(options.offset) > 0 ? Number(options.offset) : Math.max(800, 2 * grid);
  const chain = options.chain !== false;
  const maxChain = Number(options.maxChain) > 0 ? Math.floor(Number(options.maxChain)) : 30;
  const tol = Number.isFinite(options.tol as number) && (options.tol as number) >= 0 ? (options.tol as number) : 1;

  // Sanitised boxes (finite, non-negative size).
  const boxes = input.boxes
    .filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h))
    .map((b) => ({ x: fin(b.x), y: fin(b.y), w: Math.max(0, fin(b.w)), h: Math.max(0, fin(b.h)) }));

  // Bounding box: the objects, or the whole footprint when there are none.
  let minX: number, minY: number, maxX: number, maxY: number;
  if (boxes.length > 0) {
    minX = Math.min(...boxes.map((b) => b.x));
    minY = Math.min(...boxes.map((b) => b.y));
    maxX = Math.max(...boxes.map((b) => b.x + b.w));
    maxY = Math.max(...boxes.map((b) => b.y + b.h));
  } else {
    if (W <= 0 || H <= 0) return [];
    minX = 0; minY = 0; maxX = W; maxY = H;
  }

  const out: DimSpec[] = [];

  // Overall width — horizontal run below the bounding box.
  if (maxX - minX > tol) out.push({ x: minX, y: maxY + offset, x2: maxX, y2: maxY + offset });
  // Overall height — vertical run to the left of the bounding box.
  if (maxY - minY > tol) out.push({ x: minX - offset, y: minY, x2: minX - offset, y2: maxY });

  // Chained centre-to-centre pitches — only meaningful with ≥2 objects.
  if (chain && boxes.length >= 2) {
    const xBaseline = maxY + offset / 2;
    const yBaseline = minX - offset / 2;
    const xs = uniqSorted(boxes.map((b) => b.x + b.w / 2), tol);
    const ys = uniqSorted(boxes.map((b) => b.y + b.h / 2), tol);
    if (xs.length - 1 <= maxChain) {
      for (let i = 0; i + 1 < xs.length; i++) out.push({ x: xs[i], y: xBaseline, x2: xs[i + 1], y2: xBaseline });
    }
    if (ys.length - 1 <= maxChain) {
      for (let i = 0; i + 1 < ys.length; i++) out.push({ x: yBaseline, y: ys[i], x2: yBaseline, y2: ys[i + 1] });
    }
  }

  return out;
}
