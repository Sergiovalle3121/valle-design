/**
 * Lanzamiento de rayo contra un cuerpo B-rep, devolviendo la cara impactada.
 *
 * Usa la estructura de media-aristas para recorrer cada cara, descomponerla en
 * triángulos por abanico desde el primer vértice del lazo exterior, y probar la
 * intersección rayo-triángulo con Möller–Trumbore. El resultado más cercano
 * gana, y su identificador estable es el índice de cara en `body.faces`.
 *
 * Este módulo trabaja directamente sobre la topología B-rep, no sobre la malla
 * teselada. La diferencia con `pick3d/face-ray.ts` es el método: aquél usa
 * intersección con el plano + punto-en-polígono; éste descompone en triángulos
 * y usa el algoritmo estándar de la industria. Ambos deben dar el mismo
 * resultado para caras planas.
 */
import {
  faceGeometricNormal,
  faceOuterLoop,
  faceInnerLoops,
  loopPoints,
  type BrepBody,
} from "../../brep/topology";
import { v3Sub, v3Dot, v3Cross, v3Add, v3Scale, v3Length, type Vec3 } from "../../brep/vec3";

/** Un rayo en el espacio. `direction` no necesita ser unitario. */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** Resultado del impacto más cercano contra un cuerpo B-rep. */
export interface RaycastHit {
  /** Índice de cara en `body.faces`. Identificador estable. */
  faceIndex: number;
  /** Punto de impacto en coordenadas del cuerpo. */
  point: Vec3;
  /** Distancia desde el origen del rayo hasta el punto de impacto. */
  distance: number;
}

const EPSILON = 1e-12;

/**
 * Intersección rayo-triángulo por Möller–Trumbore.
 *
 * Devuelve el parámetro `t` del rayo (`O + t·D`) si hay impacto dentro del
 * triángulo (bordes incluidos), o un valor negativo si no lo hay. La dirección
 * del rayo no necesita ser unitaria: `t` se devuelve en las unidades de la
 * dirección original.
 */
function rayTriangle(
  origin: Vec3,
  direction: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
): number {
  const e1 = v3Sub(v1, v0);
  const e2 = v3Sub(v2, v0);
  const p = v3Cross(direction, e2);
  const det = v3Dot(e1, p);
  if (det > -EPSILON && det < EPSILON) return -1;
  const invDet = 1 / det;
  const t = v3Sub(origin, v0);
  const u = v3Dot(t, p) * invDet;
  if (u < 0 || u > 1) return -1;
  const q = v3Cross(t, e1);
  const v = v3Dot(direction, q) * invDet;
  if (v < 0 || u + v > 1) return -1;
  const hitT = v3Dot(e2, q) * invDet;
  return hitT > EPSILON ? hitT : -1;
}

/** Componente dominante de una normal: el eje que se descarta para proyectar a 2D. */
function dominantAxis(normal: Vec3): 0 | 1 | 2 {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= az) return 1;
  return 2;
}

/** Proyecta un punto 3D a 2D descartando el eje indicado. */
function project2d(point: Vec3, axis: 0 | 1 | 2): { u: number; v: number } {
  if (axis === 0) return { u: point.y, v: point.z };
  if (axis === 1) return { u: point.z, v: point.x };
  return { u: point.x, v: point.y };
}

/**
 * ¿Está `target` dentro del polígono `points` en la proyección 2D dada?
 * Método de cruce de rayo. El borde cuenta como dentro.
 */
function containsPoint2d(
  points: readonly Vec3[],
  axis: 0 | 1 | 2,
  target: { u: number; v: number },
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = project2d(points[i], axis);
    const b = project2d(points[j], axis);
    const straddles = a.v > target.v !== b.v > target.v;
    if (!straddles) continue;
    const crossU = ((b.u - a.u) * (target.v - a.v)) / (b.v - a.v) + a.u;
    if (target.u < crossU) inside = !inside;
  }
  return inside;
}

/**
 * Lanza un rayo contra un cuerpo B-rep y devuelve la cara más cercana.
 *
 * Recorre todas las caras del cuerpo. Para cada cara, obtiene los puntos del
 * lazo exterior mediante la estructura de media-aristas, los descompone en
 * triángulos por abanico, y prueba intersección con Möller–Trumbore. Si la cara
 * tiene lazos interiores (agujeros), verifica que el punto de impacto no caiga
 * dentro de ninguno.
 *
 * @param body  El cuerpo B-rep contra el que se lanza el rayo.
 * @param ray   El rayo: origen y dirección (no necesita ser unitaria).
 * @returns     El impacto más cercano, o `null` si el rayo no toca el cuerpo.
 */
export function raycastFace(body: BrepBody, ray: Ray): RaycastHit | null {
  let bestT = Infinity;
  let bestFace = -1;

  for (let face = 0; face < body.faces.length; face += 1) {
    const outerPoints = loopPoints(body, faceOuterLoop(body, face));
    if (outerPoints.length < 3) continue;

    // Fan desde el primer vértice: triángulos (0, i, i+1).
    for (let i = 1; i < outerPoints.length - 1; i += 1) {
      const t = rayTriangle(
        ray.origin,
        ray.direction,
        outerPoints[0],
        outerPoints[i],
        outerPoints[i + 1],
      );
      if (t > EPSILON && t < bestT) {
        bestT = t;
        bestFace = face;
      }
    }
  }

  if (bestFace < 0) return null;

  // Verificar que el impacto no caiga en un agujero.
  const hitPoint = v3Add(ray.origin, v3Scale(ray.direction, bestT));
  const innerLoops = faceInnerLoops(body, bestFace);
  if (innerLoops.length > 0) {
    const normal = faceGeometricNormal(body, bestFace);
    const axis = dominantAxis(normal);
    const target = project2d(hitPoint, axis);
    for (const loop of innerLoops) {
      const innerPoints = loopPoints(body, loop);
      if (containsPoint2d(innerPoints, axis, target)) return null;
    }
  }

  return { faceIndex: bestFace, point: hitPoint, distance: bestT };
}
