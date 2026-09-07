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
import { wallJoinedFootprint, wallJoins } from "./wall-joins";
import { wallAxisFrame, wallFaces, wallOpeningJambs, wallOpeningSpan, wallOpeningSymbolPaths } from "./wall-openings";

/**
 * `document` hace falta para IMAGE (referencia una definición del catálogo,
 * igual que un INSERT referencia un bloque) y para WALL (sus vecinos deciden
 * el inglete de la esquina). El resto de las entidades se traducen con lo que
 * llevan dentro.
 */
export function cadEntityToDxfPrimitive(
  entity: CadEntity,
  document?: Pick<CadDocument, "imageDefinitions" | "entities">,
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
  document?: Pick<CadDocument, "imageDefinitions" | "entities">,
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
    // polilínea cerrada — pero el de INGLETE RESUELTO (T-34), no el aislado:
    // `wallFootprint` por sí solo ignora a los vecinos y deja una esquina de
    // ±125 en un muro de 250 donde el producto SÍ dibuja la esquina limpia
    // contra el muro contiguo. Es el mismo contorno que ve el usuario en
    // pantalla y el que usan las jambas de un hueco (`opening-entity-
    // adapter.ts`), así que lo exportado deja de ser el único disidente.
    const others = (document?.entities ?? []).filter(
      (candidate): candidate is typeof entity =>
        candidate.type === "wall" && candidate.id !== entity.id,
    );
    const joins = wallJoins(entity, others);
    const footprint =
      others.length > 0 ? (wallJoinedFootprint(entity, joins) ?? wallFootprint(entity)) : wallFootprint(entity);
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

/**
 * OPENING (T-34): puerta o ventana, sin coordenadas propias — se derivan del
 * EJE de su muro anfitrión, igual que en pantalla
 * (`opening-entity-adapter.ts`). Devuelve VARIAS polilíneas (jambas + símbolo
 * de fábrica), así que no encaja en `CadDxfPrimitive` (uno por entidad); por
 * eso vive aparte y quien ensambla el DXF la llama con `flatMap`.
 *
 * `symbolBlock` (un bloque propio del estudio) NO se resuelve aquí — exigiría
 * el catálogo de bloques completo, y esta ficha ya cierra el defecto central
 * (huecos ausentes): siempre sale el símbolo de fábrica, y el manifiesto de
 * pérdidas declara la degradación cuando el hueco pedía uno.
 *
 * Sin anfitrión, o con una receta de muro degenerada, no hay dónde poner las
 * jambas: cero primitivas, nunca un marcador inventado en el origen.
 */
export function cadOpeningToDxfPrimitives(
  entity: Extract<CadEntity, { type: "opening" }>,
  document?: Pick<CadDocument, "entities">,
): CadDxfPrimitive[] {
  const entities = document?.entities ?? [];
  const host = entities.find(
    (candidate): candidate is Extract<CadEntity, { type: "wall" }> =>
      candidate.type === "wall" && candidate.id === entity.hostId,
  );
  if (!host) return [];
  const frame = wallAxisFrame(host);
  if (!frame) return [];
  const others = entities.filter(
    (candidate): candidate is Extract<CadEntity, { type: "wall" }> =>
      candidate.type === "wall" && candidate.id !== host.id,
  );
  const footprint =
    others.length > 0
      ? (wallJoinedFootprint(host, wallJoins(host, others)) ?? wallFootprint(host))
      : wallFootprint(host);
  if (!footprint) return [];
  const faces = wallFaces(frame, footprint);
  const span = wallOpeningSpan(entity);
  const paths = [...wallOpeningJambs(faces, span), ...wallOpeningSymbolPaths(frame, entity)];
  return paths
    .filter((path) => path.points.length >= 2)
    .map((path) => ({
      kind: "polyline" as const,
      layer: entity.layer,
      points: path.points.map((point) => ({ x: point.x, y: point.y })),
      closed: path.closed,
    }));
}
