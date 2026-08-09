/**
 * La proyección que lleva un dibujo DXF a coordenadas de mundo del editor, y
 * las cuatro preguntas que la geometría le hace.
 *
 * Sale de `dxf-cad-document.ts` porque ese archivo está EN su asignación de
 * tamaño y la corrección del espejo necesitaba sitio; pero además es una pieza
 * coherente por su cuenta: el contrato de la proyección y lo que se le pregunta
 * no dependen de ninguna entidad concreta.
 *
 * Las tres funciones derivadas existen porque una proyección puede **invertir
 * el plano**, y entonces hay campos que no se transforman: se invierten. Un
 * arco DXF —siempre antihorario— intercambia sus extremos, el `bulge` de una
 * polilínea cambia de signo, y la escala de un INSERT niega uno de sus ejes.
 * `projectionOrientation` es la única señal fiable de que eso está pasando.
 *
 * Módulo puro: sin THREE, sin DOM, sin estado.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import type { CadDxfPoint } from "./dxf-import";

export interface CadDxfProjection {
  point(point: CadDxfPoint): CadPoint2;
}

export const identityProjection: CadDxfProjection = {
  point: (point) => ({ ...point }),
};

export function point3(point: CadPoint2): CadPoint3 {
  return { x: point.x, y: point.y, z: 0 };
}

/**
 * Imagen de un VECTOR bajo la proyección: se proyectan sus dos extremos y se
 * resta. Proyectar la punta a secas le sumaría la traslación y lo mandaría a
 * otro sitio del plano.
 */
export function mappedVector(
  projection: CadDxfProjection,
  origin: CadDxfPoint,
  vector: CadDxfPoint,
): CadPoint2 {
  const start = projection.point(origin);
  const end = projection.point({ x: origin.x + vector.x, y: origin.y + vector.y });
  return { x: end.x - start.x, y: end.y - start.y };
}

/**
 * Determinante local de la proyección. Negativo ⟺ **invierte la orientación**.
 * Se evalúa alrededor de `origin` porque el contrato sólo promete un `point`:
 * una proyección no tiene por qué ser afín, y lo que importa es cómo se
 * comporta donde está la entidad.
 */
export function projectionOrientation(
  projection: CadDxfProjection,
  origin: CadDxfPoint,
): number {
  const x = mappedVector(projection, origin, { x: 1, y: 0 });
  const y = mappedVector(projection, origin, { x: 0, y: 1 });
  return x.x * y.y - x.y * y.x;
}

/** Ángulo, en grados `(−180, 180]`, en que la proyección deja una dirección. */
export function projectedAngle(
  projection: CadDxfProjection,
  center: CadDxfPoint,
  radius: number,
  angleDeg: number,
): number {
  const angle = (angleDeg * Math.PI) / 180;
  const projectedCenter = projection.point(center);
  const projectedPoint = projection.point({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  });
  return (
    (Math.atan2(
      projectedPoint.y - projectedCenter.y,
      projectedPoint.x - projectedCenter.x,
    ) *
      180) /
    Math.PI
  );
}
