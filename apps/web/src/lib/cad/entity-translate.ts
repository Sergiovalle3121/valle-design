/**
 * MOVER UNA ENTIDAD ENTERA, SEA DEL TIPO QUE SEA.
 *
 * Nació dentro de `blocks/user-dynamic-family.ts`, donde el estirado necesitaba
 * desplazar lo que no se estira por partes. La edición de referencias en sitio
 * necesita exactamente lo mismo —sacar la geometría de un bloque al dibujo y
 * devolverla— y dos copias de esta tabla se desincronizarían el día que el
 * documento gane un tipo de entidad. El síntoma sería que una cosa se mueve y
 * otra se queda, que es de los defectos más difíciles de ver.
 *
 * No hay rotación ni escala a propósito: quien las necesite las declara y las
 * mide. Trasladar es exacto para todos los tipos; girar un texto o escalar un
 * arco no lo es, y fingirlo aquí sería esconder el problema en una función que
 * parece trivial.
 */
import type { CadEntity } from "./cad-document";

const shift = <P extends { x: number; y: number }>(point: P, dx: number, dy: number): P => ({
  ...point,
  x: point.x + dx,
  y: point.y + dy,
});

/** La misma entidad, desplazada. Devuelve una copia; no muta. */
export function cadTranslateEntity(entity: CadEntity, dx: number, dy: number): CadEntity {
  if (dx === 0 && dy === 0) return entity;
  switch (entity.type) {
    case "line":
      return { ...entity, start: shift(entity.start, dx, dy), end: shift(entity.end, dx, dy) };
    case "polyline":
      return { ...entity, vertices: entity.vertices.map((vertex) => shift(vertex, dx, dy)) };
    case "spline":
      return {
        ...entity,
        controlPoints: entity.controlPoints.map((point) => shift(point, dx, dy)),
      };
    case "circle":
    case "arc":
    case "ellipse":
      return { ...entity, center: shift(entity.center, dx, dy) };
    case "mtext":
    case "insert":
      return { ...entity, insertion: shift(entity.insertion, dx, dy) };
    case "text":
    case "box":
    case "station":
      return { ...entity, x: entity.x + dx, y: entity.y + dy };
    case "hatch":
      return {
        ...entity,
        boundaries: entity.boundaries.map((loop) => loop.map((point) => shift(point, dx, dy))),
      };
    case "dimension":
      return { ...entity, a: shift(entity.a, dx, dy), b: shift(entity.b, dx, dy) };
    case "mleader":
      return {
        ...entity,
        textPosition: shift(entity.textPosition, dx, dy),
        vertices: entity.vertices.map((vertex) => shift(vertex, dx, dy)),
        // Las líneas de directriz adicionales se mueven con la suya: dejar
        // atrás una flecha de un mleader de tres es peor que no moverlo.
        ...(entity.leaderLines
          ? {
              leaderLines: entity.leaderLines.map((linea) =>
                linea.map((punto) => shift(punto, dx, dy)),
              ),
            }
          : {}),
      };
    default:
      // Un tipo que esta tabla no conoce se devuelve INTACTO en vez de a
      // medias: una entidad movida a medias es geometría rota, y una sin mover
      // es geometría en su sitio de siempre, que alguien puede ver y arreglar.
      return entity;
  }
}
