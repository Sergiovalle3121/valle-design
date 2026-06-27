/**
 * Motor de OSNAP para el CAD (Fase 66 — Núcleo de precisión).
 *
 * Snap a la geometría de TODA la escena (no solo al DXF de fondo): endpoint,
 * midpoint, center, intersection, perpendicular, node, nearest y grid. Módulo
 * PURO. El editor (Codex) construye la `SnapScene` a partir de estaciones,
 * assets, muros y vértices del DXF, y dibuja el glifo según `type`.
 *
 * Coordenadas en unidades del footprint (mismas que precision-input).
 *
 * Correr tests:  npx tsx src/components/line-engineering/snap-engine.spec.ts
 */
import { Point } from './precision-input';

export type SnapType =
  | 'endpoint'
  | 'intersection'
  | 'center'
  | 'midpoint'
  | 'perpendicular'
  | 'node'
  | 'nearest'
  | 'grid';

/** Prioridad de desempate: índice menor gana cuando dos candidatos están
 *  ambos dentro de la tolerancia. Espeja el orden de AutoCAD. */
export const SNAP_PRIORITY: SnapType[] = [
  'endpoint', 'intersection', 'center', 'midpoint', 'perpendicular', 'node', 'nearest', 'grid',
];

export interface Segment { a: Point; b: Point }

/** Geometría que el editor alimenta al motor. */
export interface SnapScene {
  /** Aristas (bordes de objetos, muros, líneas del DXF) → midpoint/perp/intersection/nearest. */
  segments?: Segment[];
  /** Centros de objetos/círculos → center. */
  centers?: Point[];
  /** Vértices/esquinas → endpoint. */
  endpoints?: Point[];
  /** Puntos lógicos (origen de estación, marcadores) → node. */
  nodes?: Point[];
  /** Paso de grilla para snap 'grid'. */
  gridSize?: number;
}

export interface SnapOptions {
  /** Modos habilitados. Si falta, todos activos. */
  modes?: Partial<Record<SnapType, boolean>>;
  /** Radio de captura en unidades del footprint. */
  tolerance: number;
  /** Punto de referencia (origen del rubber-band) para 'perpendicular'. */
  from?: Point | null;
  /** Tope de intersecciones a evaluar (O(n²)); default 200 segmentos. */
  maxSegments?: number;
}

export interface SnapResult {
  point: Point;
  type: SnapType;
  distance: number;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (s: Segment): Point => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });

/** Pie de la perpendicular del punto p sobre el segmento s (clamp al segmento). */
export function perpendicularFoot(p: Point, s: Segment): Point {
  const vx = s.b.x - s.a.x;
  const vy = s.b.y - s.a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return { ...s.a };
  let t = ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: s.a.x + t * vx, y: s.a.y + t * vy };
}

/** Punto más cercano sobre un segmento (igual que perpendicularFoot, semántica 'nearest'). */
export const nearestOnSegment = perpendicularFoot;

/** Intersección de dos segmentos (o null si no se cruzan dentro de sus extensiones). */
export function segmentIntersection(s1: Segment, s2: Segment): Point | null {
  const r = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
  const s = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null; // paralelos
  const qp = { x: s2.a.x - s1.a.x, y: s2.a.y - s1.a.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: s1.a.x + t * r.x, y: s1.a.y + t * r.y };
}

/** Esquinas, aristas y centro de un rectángulo rotado (rotation en grados, CCW, sobre el centro). */
export function rectGeometry(o: { x: number; y: number; w: number; h: number; rotation?: number }): {
  corners: Point[];
  edges: Segment[];
  center: Point;
} {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const rad = ((o.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (dx: number, dy: number): Point => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
  const hw = o.w / 2;
  const hh = o.h / 2;
  const corners = [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)];
  const edges: Segment[] = [
    { a: corners[0], b: corners[1] },
    { a: corners[1], b: corners[2] },
    { a: corners[2], b: corners[3] },
    { a: corners[3], b: corners[0] },
  ];
  return { corners, edges, center: { x: cx, y: cy } };
}

const enabled = (modes: SnapOptions['modes'], t: SnapType) => !modes || modes[t] !== false;

/**
 * Devuelve el mejor punto de snap para `cursor`, o null si nada cae dentro de la
 * tolerancia. Recoge candidatos de todos los modos activos y elige por
 * (prioridad, luego distancia). 'grid' es el último recurso.
 */
export function snap(cursor: Point, scene: SnapScene, opts: SnapOptions): SnapResult | null {
  const tol = opts.tolerance;
  const modes = opts.modes;
  const maxSeg = opts.maxSegments ?? 200;
  const segs = (scene.segments ?? []).slice(0, maxSeg);
  const candidates: SnapResult[] = [];

  const consider = (p: Point, type: SnapType) => {
    const d = dist(cursor, p);
    if (d <= tol) candidates.push({ point: p, type, distance: d });
  };

  if (enabled(modes, 'endpoint')) (scene.endpoints ?? []).forEach((p) => consider(p, 'endpoint'));
  if (enabled(modes, 'center')) (scene.centers ?? []).forEach((p) => consider(p, 'center'));
  if (enabled(modes, 'node')) (scene.nodes ?? []).forEach((p) => consider(p, 'node'));
  if (enabled(modes, 'midpoint')) segs.forEach((s) => consider(mid(s), 'midpoint'));
  if (enabled(modes, 'nearest')) segs.forEach((s) => consider(nearestOnSegment(cursor, s), 'nearest'));
  if (enabled(modes, 'perpendicular') && opts.from) {
    segs.forEach((s) => consider(perpendicularFoot(opts.from as Point, s), 'perpendicular'));
  }
  if (enabled(modes, 'intersection')) {
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const x = segmentIntersection(segs[i], segs[j]);
        if (x) consider(x, 'intersection');
      }
    }
  }
  if (enabled(modes, 'grid') && scene.gridSize && scene.gridSize > 0) {
    const g = scene.gridSize;
    consider({ x: Math.round(cursor.x / g) * g, y: Math.round(cursor.y / g) * g }, 'grid');
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const pa = SNAP_PRIORITY.indexOf(a.type);
    const pb = SNAP_PRIORITY.indexOf(b.type);
    if (pa !== pb) return pa - pb;
    return a.distance - b.distance;
  });
  return candidates[0];
}
