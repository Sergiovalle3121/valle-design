/**
 * EL TEXTO DE UN TIPO DE LÍNEA COMPLEJO EN PANTALLA (Ola F, 2026-09-02).
 *
 * El lote de líneas dibuja los trazos y los huecos de cada ranura en el
 * shader; el texto no cabe en un shader de segmentos. Aquí, por cada LINE o
 * POLYLINE cuyo tipo de línea efectivo —el suyo, el de su capa o el del
 * bloque, resuelto por `resolveCadEntityStyle`— es uno de la familia con
 * texto, se piden al atlas los mismos quads que pediría un TEXT: uno por
 * rótulo, a lo largo de la línea, con la escala del tipo de línea en unidades
 * de dibujo (LTSCALE × la propia), que es la que usa el shader para los trazos.
 *
 * Vive aparte de `text-requests.ts` porque aquel módulo rotula ENTIDADES y
 * éste rotula un ESTILO; y aparte de `pipeline.ts` porque ese archivo está a
 * cuatro líneas de su presupuesto.
 */
import type { CadDocument, CadPoint2 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { resolveCadEntityStyle } from "../cad-effective-style";
import { cadComplexLinetypeFor, cadLinetypeTextPlacements } from "../linetype-complex";
import type { CadTextQuadRequest } from "./text-atlas";
import type { CadTextColorResolver } from "./text-requests";

const DEFAULT_FONT_KEY = "Arial";

/** Los vértices de una LINE o de una POLYLINE de tramos rectos; `null` si lleva arcos. */
function straightPath(entity: CadNativeEntity): { points: CadPoint2[]; closed: boolean } | null {
  if (entity.type === "line") return { points: [entity.start, entity.end], closed: false };
  if (entity.type !== "polyline") return null;
  // Un bulge es un arco: los trazos siguen el arco en el shader, pero el
  // rótulo recto de un tramo curvo cortaría la curva. Declarado en ESCALERA.
  if (entity.vertices.some((vertex) => vertex.bulge)) return null;
  return { points: entity.vertices, closed: entity.closed };
}

/** Las peticiones de texto que un tipo de línea con texto añade a una entidad. Vacío si no lleva. */
export function cadLinetypeTextRequestsFor(
  entity: CadNativeEntity,
  document: CadDocument | undefined,
  colorOf: CadTextColorResolver,
  depth: number,
): CadTextQuadRequest[] {
  if (!document) return [];
  const path = straightPath(entity);
  if (!path) return [];
  const resolved = resolveCadEntityStyle(entity, document);
  const definition = cadComplexLinetypeFor(resolved.linetype);
  if (!definition) return [];
  const fontKey = document.styles?.text?.Standard?.fontFamily ?? DEFAULT_FONT_KEY;
  const color = colorOf(entity);
  return cadLinetypeTextPlacements(path.points, path.closed, definition, resolved.linetypeScale).map((placement) => ({
    text: placement.text,
    fontKey,
    fontSize: placement.height,
    x: placement.x,
    y: placement.y,
    rotationDeg: placement.rotationDeg,
    align: placement.align,
    color,
    depth,
  }));
}
