/**
 * Auto-arrange the production line — pure, side-effect-free layout (Fase 61).
 *
 * Lays the placed stations out in SEQUENCE order as a tidy, evenly-spaced run
 * that wraps into rows inside the footprint (optionally serpentine, so the line
 * snakes and the flow stays continuous row to row). One click turns a scattered
 * set of blocks into a readable line — the everyday "ordená esto" a line
 * engineer wants, without dragging each station by hand.
 *
 * Returns only the new top-left positions per station id (footprint units);
 * widths/heights are untouched, equipment is left alone. Kept pure (no three/DOM)
 * so the packing maths can be unit-tested with plain Node.
 */

export interface ArrangeStation {
  id: string;
  sequence: number;
  w: number;
  h: number;
}

export interface ArrangeInput {
  stations: ArrangeStation[];
  footprintW: number;
  footprintH: number;
  gridSize?: number;
}

export interface ArrangeOptions {
  /** Horizontal gap between stations in a row (default: gridSize or 1000). */
  gap?: number;
  /** Vertical gap between rows (default: 1.5 × gap). */
  rowGap?: number;
  /** Margin from the footprint edges (default: gap). */
  margin?: number;
  /** Snake the rows (odd rows run right→left) so the line stays continuous (default true). */
  serpentine?: boolean;
}

export interface ArrangePos {
  x: number;
  y: number;
}

const fin = (n: number, d = 0): number => (Number.isFinite(n) ? n : d);

/** Round to the grid when one is given, else to the nearest unit. */
function snap(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : Math.round(v);
}

/**
 * Pack the stations into rows. Returns a map id → {x,y}. Degenerate input
 * (no stations / non-positive footprint) yields an empty map, never throws.
 */
export function arrangeLine(input: ArrangeInput, options: ArrangeOptions = {}): Record<string, ArrangePos> {
  const out: Record<string, ArrangePos> = {};
  if (!input || !Array.isArray(input.stations) || input.stations.length === 0) return out;
  const W = fin(input.footprintW);
  const H = fin(input.footprintH);
  if (W <= 0 || H <= 0) return out;

  const grid = Number(input.gridSize) > 0 ? Number(input.gridSize) : 0;
  const gap = Number(options.gap) > 0 ? Number(options.gap) : grid > 0 ? grid : 1000;
  const rowGap = Number(options.rowGap) > 0 ? Number(options.rowGap) : gap * 1.5;
  const margin = Number.isFinite(options.margin as number) && (options.margin as number) >= 0 ? (options.margin as number) : gap;
  const serpentine = options.serpentine !== false;

  // Sanitised + sorted by sequence (stable tie-break on id).
  const stations = input.stations
    .filter((s) => s && typeof s.id === 'string')
    .map((s) => ({ id: s.id, sequence: fin(s.sequence), w: Math.max(1, fin(s.w, 1)), h: Math.max(1, fin(s.h, 1)) }))
    .sort((a, b) => (a.sequence - b.sequence) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const right = W - margin; // right edge of the usable band
  let rowY = margin;
  let rowMaxH = 0;
  // Build rows first (so a serpentine row can be flipped after we know its members).
  type Row = { items: typeof stations; y: number };
  const rows: Row[] = [];
  let current: typeof stations = [];
  let cursorX = margin;
  for (const st of stations) {
    // wrap when this station would overflow the band (but always keep ≥1 per row)
    if (current.length > 0 && cursorX + st.w > right) {
      rows.push({ items: current, y: rowY });
      rowY += rowMaxH + rowGap;
      current = [];
      cursorX = margin;
      rowMaxH = 0;
    }
    current.push(st);
    cursorX += st.w + gap;
    if (st.h > rowMaxH) rowMaxH = st.h;
  }
  if (current.length > 0) rows.push({ items: current, y: rowY });

  rows.forEach((row, ri) => {
    const flip = serpentine && ri % 2 === 1;
    const ordered = flip ? [...row.items].reverse() : row.items;
    let x = margin;
    for (const st of ordered) {
      const px = snap(Math.min(x, Math.max(margin, W - margin - st.w)), grid);
      const py = snap(Math.min(row.y, Math.max(0, H - st.h)), grid);
      out[st.id] = { x: Math.max(0, px), y: Math.max(0, py) };
      x += st.w + gap;
    }
  });

  return out;
}
