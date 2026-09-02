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
import type { CadDocument, CadEntity, CadPoint3 } from "./cad-document";
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import { cadEntityToSchema4Primitive } from "./dxf-schema4-primitives";
import { wallFootprint } from "./wall-geometry";

/**
 * `document` sólo hace falta para IMAGE, que referencia una definición del
 * catálogo del documento igual que un INSERT referencia un bloque. El resto de
 * las entidades se traducen con lo que llevan dentro.
 */
export function cadEntityToDxfPrimitive(
  entity: CadEntity,
  document?: Pick<CadDocument, "imageDefinitions">,
): CadDxfPrimitive | null {
  const primitive = entityGeometryPrimitive(entity, document);
  if (!primitive) return null;
  // Cómo se dibuja se adjunta UNA vez y para todos los tipos. Repetirlo en cada
  // rama era la forma segura de que el decimoquinto tipo saliera del fichero
  // sin su tipo de línea y nadie lo notase hasta imprimir.
  const presentation = entity.context?.presentation;
  return presentation?.linetype || presentation?.lineweight
    ? { ...primitive, presentation }
    : primitive;
}

/**
 * Punto del documento → punto DXF CON su cota. El cero se omite: es el suelo,
 * y así una primitiva plana sigue siendo `{x, y}` para todo el que la compare.
 * Hasta la Ola C aquí se escribía `{x, y}` siempre, y la cota de una LINE
 * declarada `spatial` moría en este archivo sin que el escritor la viera.
 */
function dxfPoint(point: CadPoint3): CadDxfPoint {
  return point.z ? { x: point.x, y: point.y, z: point.z } : { x: point.x, y: point.y };
}

function entityGeometryPrimitive(
  entity: CadEntity,
  document?: Pick<CadDocument, "imageDefinitions">,
): CadDxfPrimitive | null {
  if (entity.type === "arc") {
    return {
      kind: "arc",
      layer: entity.layer,
      points: [dxfPoint(entity.center)],
      radius: entity.radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle,
    };
  }
  if (entity.type === "ellipse") {
    return {
      kind: "ellipse",
      layer: entity.layer,
      points: [dxfPoint(entity.center)],
      majorAxis: dxfPoint(entity.majorAxis),
      axisRatio: entity.ratio,
      startAngle: entity.startParameter,
      endAngle: entity.endParameter,
    };
  }
  if (entity.type === "spline") {
    return {
      kind: "spline",
      layer: entity.layer,
      points: entity.controlPoints.map(dxfPoint),
      degree: entity.degree,
      knots: [...entity.knots],
    };
  }
  if (entity.type === "line") {
    return {
      kind: "line",
      layer: entity.layer,
      points: [dxfPoint(entity.start), dxfPoint(entity.end)],
    };
  }
  if (entity.type === "polyline") {
    // Se conserva el bulge: sin él la exportación aplanaba cada arco a cuerda.
    const points = entity.vertices.map((point) => ({
      ...dxfPoint(point),
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
  if (entity.type === "wall") {
    // El DXF plano no tiene entidad de muro: viaja el CONTORNO en planta como
    // polilínea cerrada — la misma que deriva `wallFootprint` para el dibujo,
    // así que lo exportado coincide con lo que el usuario ve. La receta
    // paramétrica se pierde y el manifiesto lo declara; una receta degenerada
    // no produce contorno y cae al descarte genérico.
    const footprint = wallFootprint(entity);
    if (!footprint) return null;
    return {
      kind: "polyline",
      layer: entity.layer,
      points: footprint.map((corner) => ({ x: corner.x, y: corner.y })),
      closed: true,
    };
  }
  if (entity.type === "circle" && !entity.legacy) {
    return {
      kind: "circle",
      layer: entity.layer,
      points: [dxfPoint(entity.center)],
      radius: entity.radius,
    };
  }
  return cadEntityToSchema4Primitive(entity, document);
}
