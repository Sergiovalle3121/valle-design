/**
 * Piezas compartidas por las órdenes de ARQUITECTURA (WALL, STAIR, ROOF, SLAB).
 *
 * ## La unidad del documento manda
 *
 * Un tabique de 200, una contrahuella de 180 o un alero de 600 sólo
 * significan algo en milímetros. El documento persiste NÚMEROS en su unidad,
 * así que cada default y cada límite de reglamento se convierte aquí antes de
 * compararse con lo tecleado: si la tabla viviera en cada orden, un día
 * WALL diría 200 mm y STAIR 180 m. La tabla es UNA y se importa.
 *
 * ## La dirección de una orden lineal
 *
 * STAIR y ROOF toman un punto de arranque y un segundo punto que sólo fija la
 * DIRECCIÓN (la longitud sale de la receta: huella × contrahuellas, o del
 * rectángulo). `cadDirection` devuelve el vector unitario y su perpendicular
 * izquierda, que es hacia donde crece el ancho mirando en el sentido de la
 * orden: la convención de quien dibuja una planta.
 */
import type { CadPoint2 } from "../../cad-document";
import { formatMagnitude } from "./solids-support";

/** Milímetros que vale UNA unidad del documento. */
export const CAD_MM_PER_UNIT: Readonly<Record<string, number>> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

/** Milímetros por unidad del documento; una unidad desconocida cuenta como mm. */
export function cadMillimetresPerUnit(unit: string | undefined): number {
  return CAD_MM_PER_UNIT[unit ?? "mm"] ?? 1;
}

/** Una magnitud dada en milímetros, expresada en la unidad del documento. */
export function cadFromMillimetres(millimetres: number, unit: string | undefined): number {
  return millimetres / cadMillimetresPerUnit(unit);
}

/** Una magnitud en la unidad del documento, expresada en milímetros. */
export function cadToMillimetres(value: number, unit: string | undefined): number {
  return value * cadMillimetresPerUnit(unit);
}

export interface CadDirection {
  /** Vector unitario de `from` a `to`. */
  along: CadPoint2;
  /** Perpendicular a la IZQUIERDA mirando en el sentido de `along`. */
  left: CadPoint2;
  /** Ángulo de `along` en grados, como lo persiste TEXT. */
  degrees: number;
}

/** Dirección entre dos puntos, o `null` si coinciden (no hay dirección que dar). */
export function cadDirection(from: CadPoint2, to: CadPoint2): CadDirection | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return null;
  const along = { x: dx / length, y: dy / length };
  return { along, left: { x: -along.y, y: along.x }, degrees: (Math.atan2(along.y, along.x) * 180) / Math.PI };
}

/** `origin + along·u + left·v`, en el plano. */
export function cadAlong(origin: CadPoint2, direction: CadDirection, u: number, v: number): CadPoint2 {
  return {
    x: origin.x + direction.along.x * u + direction.left.x * v,
    y: origin.y + direction.along.y * u + direction.left.y * v,
  };
}

/** Milímetros con UN decimal, que es lo que se lee en obra (171,4, no 171,4286). */
export function cadMillimetresLabel(value: number, unit: string | undefined): string {
  return formatMagnitude(Math.round(cadToMillimetres(value, unit) * 10) / 10);
}

/** Área en m² con dos decimales, sea cual sea la unidad del documento. */
export function cadSquareMetresLabel(area: number, unit: string | undefined): string {
  const mm = cadMillimetresPerUnit(unit);
  return formatMagnitude(Math.round((area * mm * mm) / 1e6 * 100) / 100);
}

/** Volumen en m³ con dos decimales. */
export function cadCubicMetresLabel(volume: number, unit: string | undefined): string {
  const mm = cadMillimetresPerUnit(unit);
  return formatMagnitude(Math.round((volume * mm * mm * mm) / 1e9 * 100) / 100);
}

/** Área con signo de un anillo (positiva si es antihorario). */
export function cadRingArea(points: readonly CadPoint2[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}
