/**
 * EL PUNTO DE ANCLAJE DE LO QUE NO SE ESTIRA POR PARTES.
 *
 * Vivía dentro de `engine/commands/modify-stretch.ts` porque sólo STRETCH lo
 * necesitaba. Desde que un bloque dinámico del USUARIO puede llevar una acción
 * de estirado, hay dos sitios que tienen que decidir lo mismo: qué entidades se
 * mueven enteras y cuáles vértice a vértice.
 *
 * Dos copias de esta tabla se desincronizarían el día que el documento gane un
 * tipo de entidad —y el síntoma sería que STRETCH mueve una cosa y el bloque
 * dinámico se la deja quieta, que es de los defectos más difíciles de ver—. Por
 * eso vive aquí, y los dos la importan.
 */
import type { CadEntity, CadPoint2 } from "./cad-document";

/**
 * El punto que define dónde está la entidad, o `null` si se estira por partes.
 *
 * `null` para línea, polilínea y spline: ésas tienen vértices y cada uno decide
 * por su cuenta. Para todo lo demás, la entidad entra o no entra entera.
 */
export function cadStretchAnchorPoint(entity: CadEntity): CadPoint2 | null {
  if (entity.type === "line" || entity.type === "polyline" || entity.type === "spline") return null;
  if (entity.type === "circle" || entity.type === "arc" || entity.type === "ellipse")
    return { x: entity.center.x, y: entity.center.y };
  if (entity.type === "mtext" || entity.type === "insert")
    return { x: entity.insertion.x, y: entity.insertion.y };
  if (entity.type === "dimension") return { x: entity.a.x, y: entity.a.y };
  if (entity.type === "mleader") return { x: entity.textPosition.x, y: entity.textPosition.y };
  if (entity.type === "hatch") return entity.boundaries[0]?.[0] ?? null;
  if (entity.type === "text" || entity.type === "box" || entity.type === "station")
    return { x: entity.x, y: entity.y };
  return null;
}
