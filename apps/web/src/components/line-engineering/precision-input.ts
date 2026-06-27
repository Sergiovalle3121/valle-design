/**
 * Precision input para el CAD (Fase 66 — Núcleo de precisión).
 *
 * Parseo de coordenadas tecleadas estilo AutoCAD y restricción de ángulo
 * (ortho / polar tracking). Módulo PURO (sin React, sin Three) para que la
 * integración en `Layout3DEditor.tsx` (Codex) solo cablee la UI contra estas
 * firmas. Todas las coordenadas están en **unidades del footprint** y los
 * ángulos en **grados, CCW desde +X** (espacio matemático); el editor ya mapea
 * footprint↔pantalla, así que aquí no se asume orientación de la Y de pantalla.
 *
 * Correr tests:  npx tsx src/components/line-engineering/precision-input.spec.ts
 */

export interface Point {
  x: number;
  y: number;
}

export type CoordMode = 'absolute' | 'relative' | 'polar-absolute' | 'polar-relative' | 'direct';

export interface ParseContext {
  /** Último punto fijado (origen del rubber-band) — requerido para @ y para direct. */
  last?: Point | null;
  /** Ángulo bloqueado en grados (ortho/polar/dirección del cursor) — habilita la
   *  "entrada directa de distancia": teclear solo un número avanza esa distancia
   *  por el ángulo bloqueado desde `last`. */
  lockedAngleDeg?: number | null;
}

export type ParseResult =
  | { ok: true; point: Point; mode: CoordMode }
  | { ok: false; error: string };

const DEG = Math.PI / 180;

/** Normaliza un ángulo en grados al rango [0, 360). */
export function normalizeDeg(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** Distancia euclidiana entre dos puntos. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Ángulo (grados, CCW desde +X) del vector a→b. */
export function angleDeg(a: Point, b: Point): number {
  return normalizeDeg(Math.atan2(b.y - a.y, b.x - a.x) / DEG);
}

/** Punto a `distance` y `angleDeg` desde `origin` (coordenadas polares). */
export function polarPoint(origin: Point, dist: number, deg: number): Point {
  return { x: origin.x + dist * Math.cos(deg * DEG), y: origin.y + dist * Math.sin(deg * DEG) };
}

function num(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parsea una cadena tecleada a un punto destino. Formatos soportados:
 *   `10,20`   → absoluto (x,y)
 *   `@10,20`  → relativo al último punto (dx,dy)
 *   `30<45`   → polar absoluto desde el origen (distancia<ángulo)
 *   `@30<45`  → polar relativo al último punto
 *   `30`      → entrada directa: distancia 30 por el ángulo bloqueado desde `last`
 */
export function parseCoordinate(raw: string, ctx: ParseContext = {}): ParseResult {
  const input = raw.trim().replace(/\s+/g, '');
  if (input === '') return { ok: false, error: 'Vacío' };

  const relative = input.startsWith('@');
  const body = relative ? input.slice(1) : input;

  // Polar: distancia<ángulo
  if (body.includes('<')) {
    const [dStr, aStr] = body.split('<');
    const d = num(dStr);
    const a = num(aStr);
    if (d === null || a === null) return { ok: false, error: 'Polar inválido (usa dist<áng, ej. 30<45)' };
    if (relative) {
      if (!ctx.last) return { ok: false, error: 'Sin punto previo para coordenada relativa (@)' };
      return { ok: true, point: polarPoint(ctx.last, d, a), mode: 'polar-relative' };
    }
    return { ok: true, point: polarPoint({ x: 0, y: 0 }, d, a), mode: 'polar-absolute' };
  }

  // Cartesiano: x,y
  if (body.includes(',')) {
    const [xStr, yStr] = body.split(',');
    const x = num(xStr);
    const y = num(yStr);
    if (x === null || y === null) return { ok: false, error: 'Coordenada inválida (usa x,y)' };
    if (relative) {
      if (!ctx.last) return { ok: false, error: 'Sin punto previo para coordenada relativa (@)' };
      return { ok: true, point: { x: ctx.last.x + x, y: ctx.last.y + y }, mode: 'relative' };
    }
    return { ok: true, point: { x, y }, mode: 'absolute' };
  }

  // Número solo → entrada directa de distancia (requiere ángulo bloqueado + last)
  const d = num(body);
  if (d !== null) {
    if (ctx.last && ctx.lockedAngleDeg !== null && ctx.lockedAngleDeg !== undefined) {
      return { ok: true, point: polarPoint(ctx.last, d, ctx.lockedAngleDeg), mode: 'direct' };
    }
    return { ok: false, error: 'Entrada directa requiere ángulo bloqueado (ortho/polar) y punto previo' };
  }

  return { ok: false, error: 'No se pudo interpretar la entrada' };
}

export interface ConstraintOptions {
  /** Ortho: restringe a 0/90/180/270 (los ejes). */
  ortho?: boolean;
  /** Polar tracking: incremento de ángulo en grados (ej. 45, 30, 15). 0/undefined = off. */
  polarIncrementDeg?: number;
}

export interface ConstrainedPoint {
  point: Point;
  angleDeg: number;
  /** true si la restricción modificó la posición del cursor. */
  snapped: boolean;
}

/**
 * Restringe el cursor respecto al último punto según ortho/polar. Mantiene la
 * distancia del cursor pero fuerza el ángulo al eje (ortho) o al múltiplo del
 * incremento (polar). Si no hay restricción activa devuelve el cursor tal cual.
 */
export function constrainPoint(last: Point, cursor: Point, opts: ConstraintOptions = {}): ConstrainedPoint {
  const dist = distance(last, cursor);
  const raw = angleDeg(last, cursor);

  let increment = 0;
  if (opts.ortho) increment = 90;
  else if (opts.polarIncrementDeg && opts.polarIncrementDeg > 0) increment = opts.polarIncrementDeg;

  if (increment <= 0 || dist === 0) {
    return { point: cursor, angleDeg: raw, snapped: false };
  }

  const locked = normalizeDeg(Math.round(raw / increment) * increment);
  return { point: polarPoint(last, dist, locked), angleDeg: locked, snapped: true };
}
