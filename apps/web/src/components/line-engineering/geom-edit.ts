/**
 * Edición geométrica del CAD (Fase 67 — herramientas de dibujo).
 *
 * Helpers PUROS para las operaciones clásicas de AutoCAD: offset, extend, trim,
 * chamfer y fillet sobre segmentos y polilíneas. El editor (Codex) cablea las
 * herramientas; aquí vive la matemática, testeada. Coordenadas en unidades del
 * footprint (mismas que precision-input / snap-engine).
 *
 * Correr tests:  npx tsx src/components/line-engineering/geom-edit.spec.ts
 */
import { Point } from './precision-input';
import { Segment } from './snap-engine';

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const len = (a: Point) => Math.hypot(a.x, a.y);
const norm = (a: Point): Point => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

/** Intersección de dos rectas INFINITAS (cada una dada por dos puntos). null si paralelas. */
export function lineLineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null;
  const qp = sub(b1, a1);
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  return add(a1, scale(r, t));
}

/** Desplaza un segmento `dist` perpendicularmente. dist>0 = a la izquierda de a→b. */
export function offsetSegment(s: Segment, dist: number): Segment {
  const d = norm(sub(s.b, s.a));
  const n = { x: -d.y, y: d.x }; // normal izquierda
  const off = scale(n, dist);
  return { a: add(s.a, off), b: add(s.b, off) };
}

/**
 * Offset de una polilínea: desplaza cada tramo y une los vértices interiores en
 * la intersección de los tramos desplazados (junta tipo miter). Los extremos
 * usan el extremo del tramo desplazado. Devuelve la nueva polilínea.
 */
export function offsetPolyline(points: Point[], dist: number): Point[] {
  if (points.length < 2) return [...points];
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) segs.push(offsetSegment({ a: points[i], b: points[i + 1] }, dist));
  const out: Point[] = [segs[0].a];
  for (let i = 0; i < segs.length - 1; i++) {
    const x = lineLineIntersection(segs[i].a, segs[i].b, segs[i + 1].a, segs[i + 1].b);
    out.push(x ?? segs[i].b); // colineales → usa el extremo
  }
  out.push(segs[segs.length - 1].b);
  return out;
}

/**
 * Extiende un segmento hasta tocar la recta infinita de `boundary`. `which`
 * indica qué extremo se mueve ('a' o 'b'). Devuelve el segmento extendido o null
 * si son paralelos.
 */
export function extendToLine(seg: Segment, which: 'a' | 'b', boundary: Segment): Segment | null {
  const x = lineLineIntersection(seg.a, seg.b, boundary.a, boundary.b);
  if (!x) return null;
  return which === 'a' ? { a: x, b: seg.b } : { a: seg.a, b: x };
}

/**
 * Recorta un segmento en su intersección con `cutter`, conservando el lado que
 * NO contiene `pick` (semántica TRIM de AutoCAD: se borra el pedazo señalado).
 * Devuelve el segmento restante, o null si no hay intersección dentro del tramo.
 */
export function trimAtCutter(seg: Segment, cutter: Segment, pick: Point): Segment | null {
  const x = segmentInterParam(seg, cutter);
  if (x === null) return null;
  const ip = add(seg.a, scale(sub(seg.b, seg.a), x));
  // ¿pick está en la mitad [a..ip] o [ip..b]? proyecta sobre la dirección del segmento.
  const d = sub(seg.b, seg.a);
  const tPick = dot(sub(pick, seg.a), d) / (dot(d, d) || 1);
  return tPick < x ? { a: ip, b: seg.b } : { a: seg.a, b: ip };
}

/** Param t∈[0,1] de la intersección de seg con cutter (ambos finitos), o null. */
function segmentInterParam(seg: Segment, cutter: Segment): number | null {
  const r = sub(seg.b, seg.a);
  const s = sub(cutter.b, cutter.a);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null;
  const qp = sub(cutter.a, seg.a);
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/**
 * Chaflán (chamfer) de una esquina en `corner` con piernas hacia `toA` y `toB`,
 * cortando a distancias dA/dB. Devuelve los puntos de corte sobre cada pierna
 * (el chaflán es el segmento trimA→trimB).
 */
export function chamferCorner(corner: Point, toA: Point, toB: Point, dA: number, dB: number): { trimA: Point; trimB: Point } {
  const uA = norm(sub(toA, corner));
  const uB = norm(sub(toB, corner));
  return { trimA: add(corner, scale(uA, dA)), trimB: add(corner, scale(uB, dB)) };
}

/**
 * Redondeo (fillet) de una esquina en `corner` con piernas hacia `toA`/`toB` y
 * radio `r`. Devuelve el centro del arco y los puntos de tangencia (start/end)
 * sobre cada pierna, o null si las piernas son colineales.
 */
export function filletCorner(corner: Point, toA: Point, toB: Point, r: number): { center: Point; start: Point; end: Point; radius: number } | null {
  const uA = norm(sub(toA, corner));
  const uB = norm(sub(toB, corner));
  const cosT = Math.max(-1, Math.min(1, dot(uA, uB)));
  const theta = Math.acos(cosT);
  if (theta < 1e-6 || Math.abs(theta - Math.PI) < 1e-6) return null; // colineales
  const half = theta / 2;
  const along = r / Math.tan(half); // distancia del vértice al punto de tangencia
  const start = add(corner, scale(uA, along));
  const end = add(corner, scale(uB, along));
  const bis = norm(add(uA, uB));
  const center = add(corner, scale(bis, r / Math.sin(half)));
  return { center, start, end, radius: r };
}
