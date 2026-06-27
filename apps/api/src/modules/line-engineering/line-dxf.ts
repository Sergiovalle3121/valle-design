/**
 * Pure, side-effect-free DXF (AutoCAD R12, ASCII) writer for the layout (Fase 53).
 *
 * The module can already IMPORT a DXF as a read-only backdrop, but the layout an
 * engineer builds here couldn't leave as DXF — the format every plant/contractor
 * CAD pipeline consumes. This is the symmetric half: it serialises the footprint,
 * stations, equipment, walls, flow links and annotations into a minimal R12 DXF
 * (the most universally-readable flavour), each on its own named CAD layer, with
 * the Y axis flipped to the conventional CAD orientation (origin bottom-left).
 *
 * Kept pure so the serialisation can be unit-tested without a database or files.
 */

export interface DxfBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number; // degrees
  label?: string;
  layer: string;
}

export interface DxfSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
}

export interface DxfText {
  x: number;
  y: number;
  text: string;
  layer: string;
  height?: number;
}

/** A full circle (Fase 68 — alta fidelidad). */
export interface DxfCircle {
  cx: number;
  cy: number;
  r: number;
  layer: string;
}

/** A circular arc (Fase 68). Angles in degrees, CCW, measured before the Y flip. */
export interface DxfArc {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  layer: string;
}

/** A custom CAD layer to register with an explicit AutoCAD color index (Fase 66/68). */
export interface DxfLayerDef {
  name: string;
  color: number; // AutoCAD Color Index (1-255)
}

export interface DxfInput {
  footprintW: number;
  footprintH: number;
  unit: string;
  boxes: DxfBox[];
  segments: DxfSegment[];
  texts: DxfText[];
  circles?: DxfCircle[];
  arcs?: DxfArc[];
  /** Extra named layers (e.g. the user's CAD layers) with their colors. */
  layerDefs?: DxfLayerDef[];
}

// AutoCAD Color Index per layer — keeps the export legible when opened.
const LAYER_COLOR: Record<string, number> = {
  PLANO: 8, // gray — footprint outline
  ESTACIONES: 5, // blue
  EQUIPO: 3, // green
  MUROS: 7, // white/black
  ZONAS: 4, // cyan
  FLUJO: 6, // magenta
  COTAS: 2, // yellow
  TEXTO: 7,
};

const UNIT_CODE: Record<string, number> = { mm: 4, cm: 5, m: 6, in: 1, ft: 2 };

function fmt(n: number): string {
  const r = Math.round((Number(n) || 0) * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
}

/** DXF TEXT is single-line; strip control chars that would corrupt the file. */
function sanitize(s: string): string {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, 250);
}

/** Serialise layout primitives into an AutoCAD R12 (AC1009) ASCII DXF string. */
export function buildDxf(input: DxfInput): string {
  const W = input.footprintW > 0 ? input.footprintW : 1;
  const H = input.footprintH > 0 ? input.footprintH : 1;
  const flipY = (y: number) => H - y;

  const out: string[] = [];
  const g = (code: number, value: string | number) => {
    out.push(String(code));
    out.push(String(value));
  };
  const seg = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    g(0, 'LINE');
    g(8, layer);
    g(10, fmt(x1)); g(20, fmt(y1)); g(30, 0);
    g(11, fmt(x2)); g(21, fmt(y2)); g(31, 0);
  };
  const text = (layer: string, x: number, y: number, str: string, height: number) => {
    g(0, 'TEXT');
    g(8, layer);
    g(10, fmt(x)); g(20, fmt(y)); g(30, 0);
    g(40, fmt(height));
    g(1, sanitize(str));
    g(72, 1); g(73, 2); // centre / middle alignment
    g(11, fmt(x)); g(21, fmt(y)); g(31, 0);
  };
  const circle = (layer: string, cx: number, cy: number, r: number) => {
    g(0, 'CIRCLE');
    g(8, layer);
    g(10, fmt(cx)); g(20, fmt(cy)); g(30, 0);
    g(40, fmt(Math.abs(r)));
  };
  // Flipping Y mirrors the arc about the horizontal axis: angle θ → -θ and the
  // sweep direction reverses, so start/end swap (start' = -end, end' = -start).
  const norm360 = (a: number) => ((a % 360) + 360) % 360;
  const arc = (layer: string, cx: number, cy: number, r: number, start: number, end: number) => {
    g(0, 'ARC');
    g(8, layer);
    g(10, fmt(cx)); g(20, fmt(cy)); g(30, 0);
    g(40, fmt(Math.abs(r)));
    g(50, fmt(norm360(-end))); g(51, fmt(norm360(-start)));
  };

  // Collect the layers actually used (footprint + box labels always present).
  const used = new Set<string>(['PLANO']);
  input.boxes.forEach((b) => { used.add(b.layer); if (b.label) used.add('TEXTO'); });
  input.segments.forEach((s) => used.add(s.layer));
  input.texts.forEach((t) => used.add(t.layer));
  (input.circles ?? []).forEach((c) => used.add(c.layer));
  (input.arcs ?? []).forEach((a) => used.add(a.layer));
  // Explicit user layer colors override the built-in palette for matching names.
  const customColor = new Map((input.layerDefs ?? []).map((d) => [d.name, d.color]));
  (input.layerDefs ?? []).forEach((d) => used.add(d.name));
  const layers = [...used];

  // ── HEADER ──
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, UNIT_CODE[input.unit] ?? 0);
  g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMAX'); g(10, fmt(W)); g(20, fmt(H)); g(30, 0);
  g(0, 'ENDSEC');

  // ── TABLES (layer definitions) ──
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const name of layers) {
    const color = customColor.get(name) ?? LAYER_COLOR[name] ?? 7;
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');

  // ── ENTITIES ──
  g(0, 'SECTION'); g(2, 'ENTITIES');

  // Footprint outline (origin bottom-left after the Y flip).
  seg('PLANO', 0, 0, W, 0);
  seg('PLANO', W, 0, W, H);
  seg('PLANO', W, H, 0, H);
  seg('PLANO', 0, H, 0, 0);

  for (const b of input.boxes) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rad = ((b.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const corners = ([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] as const).map(
      ([px, py]) => {
        const dx = px - cx, dy = py - cy;
        return [cx + dx * cos - dy * sin, flipY(cy + dx * sin + dy * cos)] as [number, number];
      },
    );
    for (let i = 0; i < 4; i++) {
      const a = corners[i], c = corners[(i + 1) % 4];
      seg(b.layer, a[0], a[1], c[0], c[1]);
    }
    if (b.label) {
      const height = Math.max(Math.min(b.w, b.h) * 0.22, Math.max(W, H) * 0.006);
      text('TEXTO', cx, flipY(cy), b.label, height);
    }
  }

  for (const s of input.segments) {
    seg(s.layer, s.x1, flipY(s.y1), s.x2, flipY(s.y2));
  }

  for (const t of input.texts) {
    const height = t.height && t.height > 0 ? t.height : Math.max(W, H) * 0.01;
    text(t.layer, t.x, flipY(t.y), t.text, height);
  }

  for (const c of input.circles ?? []) {
    circle(c.layer, c.cx, flipY(c.cy), c.r);
  }

  for (const a of input.arcs ?? []) {
    arc(a.layer, a.cx, flipY(a.cy), a.r, a.startAngle, a.endAngle);
  }

  g(0, 'ENDSEC');
  g(0, 'EOF');

  return out.join('\n') + '\n';
}
