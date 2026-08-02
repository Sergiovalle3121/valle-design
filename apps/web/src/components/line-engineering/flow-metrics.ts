/**
 * Material-flow metrics — pure, side-effect-free (Fase 64).
 *
 * Once the line is connected (Fase 62), the number a lean engineer chases is
 * TRAVEL: how far material moves across the floor. This sums the centre-to-centre
 * length of every flow connector (the total travel distance) and surfaces the
 * single longest hop — the first candidate to shorten when re-laying the line.
 * Connectors whose endpoints aren't placed are ignored. Footprint units in/out.
 *
 * Kept pure (no three/DOM) so the distance maths can be unit-tested with Node.
 */

export interface FlowConn {
  from: string;
  to: string;
}

export interface FlowCenter {
  x: number;
  y: number;
}

export interface FlowMetrics {
  /** Sum of every placed connector's centre-to-centre length. */
  totalLen: number;
  /** Length of the longest single hop. */
  maxHop: number;
  /** How many connectors were measurable (both ends placed). */
  count: number;
  /** The longest hop, or null when there is nothing to measure. */
  longest: { from: string; to: string; len: number } | null;
}

/** Compute travel metrics from connectors + a map of station id → centre. */
export function flowMetrics(connectors: FlowConn[], centers: Record<string, FlowCenter>): FlowMetrics {
  const empty: FlowMetrics = { totalLen: 0, maxHop: 0, count: 0, longest: null };
  if (!Array.isArray(connectors) || !centers) return empty;
  let totalLen = 0;
  let count = 0;
  let longest: { from: string; to: string; len: number } | null = null;
  for (const c of connectors) {
    if (!c || typeof c.from !== 'string' || typeof c.to !== 'string' || c.from === c.to) continue;
    const a = centers[c.from];
    const b = centers[c.to];
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!Number.isFinite(len)) continue;
    totalLen += len;
    count++;
    if (!longest || len > longest.len) longest = { from: c.from, to: c.to, len };
  }
  return { totalLen, maxHop: longest ? longest.len : 0, count, longest };
}
