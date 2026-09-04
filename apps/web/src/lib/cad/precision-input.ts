/**
 * Precision input for Valle Design CAD drafting.
 *
 * Pure geometry helpers used by the command registry and by the line-engineering
 * editor. Coordinates are expressed in the active layout footprint unit.
 */
import {
  cadTextLooksImperial,
  parseCadLengthInDrawingUnits,
  type CadDrawingUnit,
} from "./units-imperial";

export interface Point {
  x: number;
  y: number;
}

export type CoordMode =
  "absolute" | "relative" | "polar-absolute" | "polar-relative" | "direct";

export interface ParseContext {
  last?: Point | null;
  lockedAngleDeg?: number | null;
  /**
   * Unidad del documento. `10'-6"` son 3200.4 en un dibujo en milímetros y
   * 126 en uno en pulgadas. Sin declararla se supone la pulgada, que es lo
   * que AutoCAD hace cuando el dibujo no dice su unidad.
   */
  drawingUnit?: CadDrawingUnit;
  /** Si un número DESNUDO se lee en pulgadas (`LUNITS` 3 o 4). */
  assumeInches?: boolean;
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

/**
 * Borrar TODOS los espacios rompe las fracciones, y las rompe en silencio:
 * `1'-6 1/2"` queda `1'-61/2"`, que también se lee —`61/2` es una fracción
 * impropia legal— y da 42.5" en vez de 18.5". Un número equivocado que
 * nadie ve es peor que un rechazo. Se colapsan los espacios a uno y se
 * quitan sólo los que rodean a los separadores estructurales, que es lo
 * único que el borrado conseguía de útil (`1 , 2`, `30 < 45`, `@ 10,20`).
 */
function normalizeCoordinateInput(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ").replace(/\s*([,<@*])\s*/gu, "$1");
}

/** Una LONGITUD tecleada, en unidades de dibujo. Acepta pies y pulgadas. */
function num(s: string, ctx: ParseContext = {}): number | null {
  const parsed = parseCadLengthInDrawingUnits(s, {
    // Sin unidad declarada, una unidad de dibujo es una pulgada: es la
    // suposición de AutoCAD y deja `6"` valiendo 6, no 152.4.
    drawingUnit: ctx.drawingUnit ?? "in",
    ...(ctx.assumeInches === undefined ? {} : { assumeInches: ctx.assumeInches }),
  });
  return parsed.ok ? parsed.value : null;
}

/** Un ÁNGULO tecleado. En grados, y por tanto sin unidades de dibujo. */
function angleNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

export function parseCoordinate(
  raw: string,
  ctx: ParseContext = {},
): ParseResult {
  const input = normalizeCoordinateInput(raw);
  if (input === "") return { ok: false, error: "Vacío" };

  const relative = input.startsWith("@");
  const body = relative ? input.slice(1) : input;

  if (body.includes("<")) {
    const [dStr, aStr] = body.split("<");
    const d = num(dStr, ctx);
    // El ángulo NO pasa por el analizador de longitudes: `30<45` son treinta
    // unidades a cuarenta y cinco GRADOS, y convertir el 45 a unidades de
    // dibujo giraría la línea.
    const a = angleNum(aStr);
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
    const [xStr, yStr, zStr, ...rest] = body.split(",");
    const x = num(xStr, ctx);
    const y = num(yStr, ctx);
    // La tercera componente es la COTA (Ola C, 2026-09-02): `0,0,3000` es el
    // pilar de tres metros y `@0,0,3000` sube desde el último punto. Antes se
    // ignoraba en silencio y el punto caía al suelo.
    const z = zStr === undefined ? null : num(zStr, ctx);
    if (x === null || y === null || (zStr !== undefined && z === null) || rest.length > 0)
      return { ok: false, error: "Coordenada inválida (usa x,y o x,y,z)" };
    if (relative) {
      if (!ctx.last)
        return {
          ok: false,
          error: "Sin punto previo para coordenada relativa (@)",
        };
      const lastZ = "z" in ctx.last && typeof (ctx.last as { z?: unknown }).z === "number" ? (ctx.last as { z: number }).z : 0;
      return {
        ok: true,
        point: { x: ctx.last.x + x, y: ctx.last.y + y, ...(z !== null || lastZ !== 0 ? { z: lastZ + (z ?? 0) } : {}) },
        mode: "relative",
      };
    }
    return { ok: true, point: { x, y, ...(z !== null ? { z } : {}) }, mode: "absolute" };
  }

  const d = num(body, ctx);
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

  // Cuando el texto SÍ parecía una medida imperial, el rechazo dice por qué en
  // vez de quedarse mudo: `1'2'` no es «no se pudo interpretar», es una medida
  // con dos marcas de pie.
  if (cadTextLooksImperial(body)) {
    const measured = parseCadLengthInDrawingUnits(body, {
      drawingUnit: ctx.drawingUnit ?? "in",
      ...(ctx.assumeInches === undefined ? {} : { assumeInches: ctx.assumeInches }),
    });
    if (!measured.ok) return { ok: false, error: measured.error };
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
