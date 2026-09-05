/**
 * El puente Visual LISP, mitad que MIDE: la curva como cadena de puntos.
 *
 * Sale de `vlax.ts` por la misma junta natural que `vlax-properties.ts`: aquí
 * está todo lo que convierte una entidad en la polilínea con la que se mide, y
 * nada más. Lo usan los dos lados —`vlax-curve-*` desde la instalación, y la
 * propiedad `Length` desde la tabla de propiedades—, y tenerlo en un módulo
 * propio es lo que impide que acaben midiendo de dos maneras.
 *
 * ## Los números son los del producto
 *
 * Los contornos salen de `cadEntityContours` —el registro de adaptadores, el
 * MISMO que alimenta AREA, MASSPROP y REGION, que ya sabe teselar el bulge de
 * una polilínea, una elipse recortada y una NURBS—. Se prefirió
 * `inquiry/contours` a `geom-measure` porque el `polygonArea` de aquél mide el
 * polígono teselado y sobre un círculo se queda un 0,014 % por debajo del
 * número que el comando AREA le enseña al usuario en la misma pantalla.
 *
 * ## Lo que eso cuesta, dicho aquí
 *
 * La curva llega como la cadena de puntos que DIBUJA el producto, así que un
 * punto exactamente sobre un arco cae hasta una diezmilésima del tamaño de la
 * curva fuera de la cuerda que lo aproxima. Por eso `getDistAtPoint` tolera en
 * proporción a la longitud de la curva y no en unidades absolutas: la regla
 * vale igual en un plano en milímetros y en uno de topografía.
 */
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../../cad/entity-runtime";
import {
  cadEntityArea,
  cadEntityContours,
  contourPerimeter,
  type CadContour,
} from "../../cad/inquiry/contours";
import { LispError } from "../errors";
import type { LispHostServices } from "../values";

// ---------------------------------------------------------------------------
// Las curvas
// ---------------------------------------------------------------------------

/**
 * El nombre con el que AutoCAD llama al tipo de una entidad, para los mensajes.
 *
 * Vive en el módulo más bajo del puente —no en el de las propiedades, que es
 * quien más lo usa— porque los tres lo necesitan y una función que los tres
 * importan no puede estar en el que importa a los otros: eso sería un ciclo. El
 * día que un tipo canónico y su nombre de AutoCAD dejen de coincidir
 * (`polyline` → LWPOLYLINE), se corrige aquí y los tres lo dicen igual.
 */
export function expectedTypeName(entity: CadNativeEntity): string {
  return entity.type.toUpperCase();
}

/** Tipos sobre los que `vlax-curve-*` tiene una respuesta que sostener. */
export const CURVE_TYPES: readonly CadNativeEntity["type"][] = [
  "line",
  "polyline",
  "circle",
  "arc",
  "ellipse",
  "spline",
];

/**
 * La curva como UNA cadena de puntos.
 *
 * Los contornos salen del registro de adaptadores —`cadEntityContours`—, que es
 * de donde los saca AREA. Se toma el primero: las entidades de `CURVE_TYPES`
 * producen uno solo, y quedarse con el primero en vez de concatenar evita que
 * una entidad con varios contornos conteste una longitud que suma trozos
 * inconexos.
 */
export function curveContour(
  entity: CadNativeEntity,
  host: LispHostServices,
  caller: string,
): CadContour {
  if (!CURVE_TYPES.includes(entity.type))
    throw new LispError(
      `${caller}: un ${expectedTypeName(entity)} no es una curva. Las funciones vlax-curve-* ` +
        `operan sobre LINE, LWPOLYLINE, CIRCLE, ARC, ELLIPSE y SPLINE.`,
    );
  const contours = cadEntityContours(entity, CAD_ENTITY_REGISTRY, host.document());
  const contour = contours.find((candidate) => candidate.points.length >= 2);
  if (!contour)
    throw new LispError(
      `${caller}: ${expectedTypeName(entity)} ${entity.id} no tiene geometría medible.`,
    );
  return contour;
}

/**
 * Los puntos por los que se mide, con el cierre EXPLÍCITO cuando la curva es
 * cerrada. `pointAtDistance` recorre una polilínea abierta: sin repetir el
 * primer punto al final, el último tramo de un círculo —el que vuelve al
 * arranque— no existiría y la longitud saldría corta.
 */
export function measuredPoints(contour: CadContour): { x: number; y: number }[] {
  const points = contour.points.map((point) => ({ x: point.x, y: point.y }));
  if (contour.closed && points.length >= 2) points.push({ x: points[0].x, y: points[0].y });
  return points;
}

export function polylineLength(points: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  return total;
}

/**
 * Longitud de una curva. Círculo y elipse completos toman la forma cerrada que
 * ya calcula `cadEntityArea` —2πr, Ramanujan— porque medir la teselación
 * contestaría un número distinto del que el producto le enseña al usuario en la
 * misma pantalla.
 */
export function curveLength(entity: CadNativeEntity, host: LispHostServices, caller: string): number {
  if (entity.type === "circle" || entity.type === "ellipse") {
    const measured = cadEntityArea(entity, CAD_ENTITY_REGISTRY, host.document());
    if (measured && measured.perimeter > 0) return measured.perimeter;
  }
  const contour = curveContour(entity, host, caller);
  return contourPerimeter(contour.points, contour.closed);
}

/** Proyección de un punto sobre un tramo, acotada a sus extremos. */
export function projectOnSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { point: { x: number; y: number }; t: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared < 1e-24 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  const projected = { x: a.x + dx * t, y: a.y + dy * t };
  return {
    point: projected,
    t,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

/** El punto de la curva más cercano a uno dado, y su distancia acumulada. */
export function closestOnCurve(
  points: readonly { x: number; y: number }[],
  target: { x: number; y: number },
): { point: { x: number; y: number }; distanceAlong: number } {
  let best = { point: { x: points[0].x, y: points[0].y }, distanceAlong: 0 };
  let bestDistance = Number.POSITIVE_INFINITY;
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    const projection = projectOnSegment(target, a, b);
    if (projection.distance < bestDistance - 1e-12) {
      bestDistance = projection.distance;
      best = { point: projection.point, distanceAlong: travelled + segment * projection.t };
    }
    travelled += segment;
  }
  return best;
}
