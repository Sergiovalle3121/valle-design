/**
 * Traducción de una entidad canónica a la PRIMITIVA DXF que la representa.
 *
 * Sale de `dxf-cad-document.ts` por dos razones y la segunda es la que manda:
 *
 *  1. Ese archivo está en su asignación exacta del trinquete de tamaño y los
 *     tipos del esquema 4 necesitan sitio.
 *  2. El manifiesto de pérdidas tiene que preguntar exactamente lo mismo que
 *     pregunta la exportación —«¿esto se escribe?»— sin importar el módulo que
 *     ENSAMBLA el modelo de exportación. Con la traducción aquí, el manifiesto
 *     depende de una HOJA del grafo y no se cierra un ciclo. Los ciclos aquí no
 *     son teóricos: `tsc --noEmit` no los ve y el producto revienta al cargar.
 *
 * Módulo puro: sin THREE, sin DOM, sin estado.
 */
import type { CadEntity } from "./cad-document";
import type { CadDxfPrimitive } from "./dxf-import";

export function cadEntityToDxfPrimitive(
  entity: CadEntity,
): CadDxfPrimitive | null {
  if (entity.type === "arc") {
    return {
      kind: "arc",
      layer: entity.layer,
      points: [{ x: entity.center.x, y: entity.center.y }],
      radius: entity.radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle,
    };
  }
  if (entity.type === "ellipse") {
    return {
      kind: "ellipse",
      layer: entity.layer,
      points: [{ x: entity.center.x, y: entity.center.y }],
      majorAxis: { x: entity.majorAxis.x, y: entity.majorAxis.y },
      axisRatio: entity.ratio,
      startAngle: entity.startParameter,
      endAngle: entity.endParameter,
    };
  }
  if (entity.type === "spline") {
    return {
      kind: "spline",
      layer: entity.layer,
      points: entity.controlPoints.map((point) => ({ x: point.x, y: point.y })),
      degree: entity.degree,
      knots: [...entity.knots],
    };
  }
  if (entity.type === "line") {
    return {
      kind: "line",
      layer: entity.layer,
      points: [
        { x: entity.start.x, y: entity.start.y },
        { x: entity.end.x, y: entity.end.y },
      ],
    };
  }
  if (entity.type === "polyline") {
    // Se conserva el bulge: sin él la exportación aplanaba cada arco a cuerda.
    const points = entity.vertices.map((point) => ({
      x: point.x,
      y: point.y,
      ...(typeof point.bulge === "number" && point.bulge !== 0
        ? { bulge: point.bulge }
        : {}),
    }));
    // El cierre se DECLARA. Repetir el primer vértice al final añadía un
    // segmento nulo al DXF y dejaba el grupo 70 en 0, así que el contorno
    // llegaba abierto al destino; además el bulge del tramo de cierre —que
    // vive en el ÚLTIMO vértice— quedaba tapado por la copia del primero.
    return {
      kind: "polyline",
      layer: entity.layer,
      points,
      closed: entity.closed === true,
    };
  }
  if (entity.type === "circle" && !entity.legacy) {
    return {
      kind: "circle",
      layer: entity.layer,
      points: [{ x: entity.center.x, y: entity.center.y }],
      radius: entity.radius,
    };
  }
  return null;
}
