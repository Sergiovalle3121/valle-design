/**
 * Precision input for AXOS CAD drafting.
 *
 * Pure geometry helpers used by the command registry and by the line-engineering
 * editor. Coordinates are expressed in the active layout footprint unit.
 */
export interface Point {
  x: number;
  y: number;
}

export type CoordMode =
  "absolute" | "relative" | "polar-absolute" | "polar-relative" | "direct";

export interface ParseContext {
  last?: Point | null;
  lockedAngleDeg?: number | null;
}

export type ParseResult =
  { ok: true; point: Point; mode: CoordMode } | { ok: false; error: string };

const DEG = Math.PI / 180;

export function normalizeDeg(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleDeg(a: Point, b: Point): number {
  return normalizeDeg(Math.atan2(b.y - a.y, b.x - a.x) / DEG);
}

export function polarPoint(origin: Point, dist: number, deg: number): Point {
  return {
    x: origin.x + dist * Math.cos(deg * DEG),
    y: origin.y + dist * Math.sin(deg * DEG),
  };
}

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

export function parseCoordinate(
  raw: string,
  ctx: ParseContext = {},
): ParseResult {
  const input = raw.trim().replace(/\s+/g, "");
  if (input === "") return { ok: false, error: "Vacío" };

  const relative = input.startsWith("@");
  const body = relative ? input.slice(1) : input;

  if (body.includes("<")) {
    const [dStr, aStr] = body.split("<");
    const d = num(dStr);
    const a = num(aStr);
    if (d === null || a === null)
      return { ok: false, error: "Polar inválido (usa dist<áng, ej. 30<45)" };
    if (relative) {
      if (!ctx.last)
        return {
          ok: false,
          error: "Sin punto previo para coordenada relativa (@)",
        };
      return {
        ok: true,
        point: polarPoint(ctx.last, d, a),
        mode: "polar-relative",
      };
    }
    return {
      ok: true,
      point: polarPoint({ x: 0, y: 0 }, d, a),
      mode: "polar-absolute",
    };
  }

  if (body.includes(",")) {
    const [xStr, yStr] = body.split(",");
    const x = num(xStr);
    const y = num(yStr);
    if (x === null || y === null)
      return { ok: false, error: "Coordenada inválida (usa x,y)" };
    if (relative) {
      if (!ctx.last)
        return {
          ok: false,
          error: "Sin punto previo para coordenada relativa (@)",
        };
      return {
        ok: true,
        point: { x: ctx.last.x + x, y: ctx.last.y + y },
        mode: "relative",
      };
    }
    return { ok: true, point: { x, y }, mode: "absolute" };
  }

  const d = num(body);
  if (d !== null) {
    if (
      ctx.last &&
      ctx.lockedAngleDeg !== null &&
      ctx.lockedAngleDeg !== undefined
    ) {
      return {
        ok: true,
        point: polarPoint(ctx.last, d, ctx.lockedAngleDeg),
        mode: "direct",
      };
    }
    return {
      ok: false,
      error:
        "Entrada directa requiere ángulo bloqueado (ortho/polar) y punto previo",
    };
  }

  return { ok: false, error: "No se pudo interpretar la entrada" };
}

export interface ConstraintOptions {
  ortho?: boolean;
  polarIncrementDeg?: number;
}

export interface ConstrainedPoint {
  point: Point;
  angleDeg: number;
  snapped: boolean;
}

export function constrainPoint(
  last: Point,
  cursor: Point,
  opts: ConstraintOptions = {},
): ConstrainedPoint {
  const dist = distance(last, cursor);
  const raw = angleDeg(last, cursor);

  let increment = 0;
  if (opts.ortho) increment = 90;
  else if (opts.polarIncrementDeg && opts.polarIncrementDeg > 0)
    increment = opts.polarIncrementDeg;

  if (increment <= 0 || dist === 0) {
    return { point: cursor, angleDeg: raw, snapped: false };
  }

  const locked = normalizeDeg(Math.round(raw / increment) * increment);
  return {
    point: polarPoint(last, dist, locked),
    angleDeg: locked,
    snapped: true,
  };
}
