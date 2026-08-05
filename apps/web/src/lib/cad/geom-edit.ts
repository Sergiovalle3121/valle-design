/**
 * Edición geométrica del CAD (Fase 67 — herramientas de dibujo).
 *
 * Helpers PUROS para las operaciones clásicas de AutoCAD: offset, extend, trim,
 * chamfer y fillet sobre segmentos y polilíneas. El editor (Codex) cablea las
 * herramientas; aquí vive la matemática, testeada. Coordenadas en unidades del
 * footprint (mismas que precision-input / snap-engine).
 *
 * Correr tests:  npx tsx src/lib/cad/geom-edit.spec.ts
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

export interface OffsetPathOptions {
  /**
   * Un recorrido CERRADO no es el abierto con el primer punto repetido: el
   * tramo de cierre existe y el primer vértice es una ESQUINA, no un extremo.
   * Tratarlo como abierto dejaba el vértice 0 sin ingletar — una costura
   * diagonal en el contorno resultante.
   */
  closed?: boolean;
  /**
   * Límite de inglete, en múltiplos de |dist|. En una esquina muy aguda la
   * intersección de los tramos desplazados se dispara hacia el infinito; sin
   * tope, un vértice casi degenerado produce coordenadas enormes o `Infinity`.
   * El punto se recorta sobre la bisectriz. Criterio de AutoCAD: el valor por
   * defecto corta a partir de ~29° de apertura.
   */
  miterLimit?: number;
  /** Longitud por debajo de la cual un tramo se considera inexistente. */
  epsilon?: number;
}

const DEFAULT_MITER_LIMIT = 4;
const DEFAULT_OFFSET_EPSILON = 1e-9;

/** Área con signo de un contorno cerrado (>0 = antihorario). */
export function signedArea(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/**
 * Offset de un recorrido, ABIERTO o CERRADO — el único motor de offset del
 * producto (`primitive-edit` delega aquí).
 *
 * Desplaza cada tramo `dist` perpendicularmente y resuelve cada esquina en la
 * intersección de los dos tramos desplazados que la forman (junta miter). El
 * signo sigue a `offsetSegment`: positivo = a la IZQUIERDA del sentido de
 * recorrido, así que sobre un contorno antihorario un valor positivo entra y
 * uno negativo sale. La orientación del contorno de entrada no se corrige: es
 * el dato que fija el lado, y por eso invertirla invierte el resultado.
 *
 * Devuelve `null` en lugar de geometría inventada cuando el desplazamiento no
 * tiene solución: recorrido sin ningún tramo real, coordenada no finita, o un
 * contorno cerrado que se colapsa o se da la vuelta porque la distancia supera
 * su radio interior. Un OFFSET imposible debe rechazarse, no producir un
 * polígono cruzado.
 */
export function offsetPath(
  points: Point[],
  dist: number,
  options: OffsetPathOptions = {},
): Point[] | null {
  const closed = options.closed ?? false;
  const epsilon = options.epsilon ?? DEFAULT_OFFSET_EPSILON;
  const miterLimit = options.miterLimit ?? DEFAULT_MITER_LIMIT;
  if (!Number.isFinite(dist)) return null;
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    return null;
  if (points.length < (closed ? 3 : 2)) return null;

  // Cada tramo conserva el índice del vértice donde EMPIEZA. Los tramos nulos
  // se descartan aquí para que no generen una normal arbitraria, pero su
  // vértice sigue existiendo: se resuelve con el tramo real anterior.
  const segments: { from: number; a: Point; b: Point }[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (len(sub(b, a)) <= epsilon) continue;
    segments.push({ from: i, ...offsetSegment({ a, b }, dist) });
  }
  if (!segments.length) return null;

  const corner = (incoming: { a: Point; b: Point }, going: { a: Point; b: Point }, vertex: Point): Point => {
    const hit = lineLineIntersection(incoming.a, incoming.b, going.a, going.b);
    // Colineales (o casi): la esquina no existe, el extremo desplazado ya es
    // el punto correcto y no hay inglete que disparar.
    if (!hit) return going.a;
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return going.a;
    const reach = len(sub(hit, vertex));
    const cap = miterLimit * Math.abs(dist);
    if (cap > 0 && reach > cap) {
      const direction = norm(sub(hit, vertex));
      return add(vertex, scale(direction, cap));
    }
    return hit;
  };

  const out: Point[] = [];
  if (closed) {
    for (let i = 0; i < segments.length; i++) {
      const previous = segments[(i - 1 + segments.length) % segments.length];
      const current = segments[i];
      out.push(corner(previous, current, points[current.from]));
    }
  } else {
    out.push(segments[0].a);
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      out.push(corner(current, next, points[next.from]));
    }
    out.push(segments[segments.length - 1].b);
  }

  if (!out.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    return null;

  // Un tramo que, recortado entre sus dos esquinas, apunta al REVÉS que su
  // original ya no es ese tramo desplazado: se consumió y el contorno se
  // dobló sobre sí mismo. Es lo que pasa al desplazar hacia dentro más que el
  // radio interior — un cuadrado de 1000 con offset 600 devolvía un cuadrado
  // de 200 dado la vuelta, no un error. El signo del área no lo detecta
  // (vuelve a salir positivo tras cruzar el cero); la dirección de cada tramo
  // sí, y además cubre el colapso exacto, donde el producto escalar es 0.
  for (let i = 0; i < segments.length; i++) {
    const from = out[i];
    const to = out[(i + 1) % out.length];
    if (!closed && i + 1 >= out.length) break;
    const current = segments[i];
    const source = sub(current.b, current.a);
    const result = sub(to, from);
    if (dot(result, source) <= 0) return null;
  }
  return out;
}

/**
 * Offset de una polilínea ABIERTA. Se conserva por compatibilidad con las
 * llamadas existentes; `offsetPath` es la entrada completa.
 */
export function offsetPolyline(points: Point[], dist: number): Point[] {
  return offsetPath(points, dist, { closed: false }) ?? [...points];
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
