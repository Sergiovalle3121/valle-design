/**
 * La cota de un punto de entrada, cuando la trae.
 *
 * `CadCommandInput.point` se declara `CadPoint2` y en tiempo de ejecución
 * lleva `z` cuando el puntero cayó sobre un plano de trabajo elevado o
 * inclinado (`cadDrawingPoint(wx, wy, wz)`) o cuando se tecleó `x,y,z`. Cada
 * comando que quiera conservarla la leía con su propio `"z" in point`; desde
 * la Ola C (2026-09-02) lo hacen todos por aquí, para que el día en que el
 * tipo lleve la z declarada haya UN sitio que cambiar.
 */
import type { CadPoint2, CadPoint3 } from "../cad-document";

/** La cota del punto si la trae y es un número; `undefined` si no. */
export function cadPointZ(point: CadPoint2 | CadPoint3 | undefined): number | undefined {
  if (!point || !("z" in point)) return undefined;
  const z = (point as { z?: unknown }).z;
  return typeof z === "number" && Number.isFinite(z) ? z : undefined;
}

/**
 * Punto 3D a partir de uno de entrada: su cota, la de `fallback` (el primer
 * punto designado, que fija el plano de la entidad) o el suelo.
 */
export function cadLiftPoint(point: CadPoint2 | CadPoint3, fallback?: CadPoint2 | CadPoint3): CadPoint3 {
  return { x: point.x, y: point.y, z: cadPointZ(point) ?? cadPointZ(fallback) ?? 0 };
}
