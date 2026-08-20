import type { CadEntity } from "./cad-document";
import type { CadDxfPrimitive } from "./dxf-import";
import { cadEntityToDxfPrimitive } from "./dxf-entity-primitives";

/**
 * Traduce una entidad que vive DENTRO de un bloque a su primitiva DXF.
 *
 * Se separa del ensamblado por la misma razón que ya separó a sus vecinas: el
 * archivo que ensambla el modelo de exportación estaba en su techo, y el
 * presupuesto de monolito sólo admite que esos archivos encojan. Mover código
 * aquí es la salida que el presupuesto pide; subirle el techo, la que prohíbe.
 *
 * La traducción nativa manda cuando existe; lo demás son los tipos que sólo
 * aparecen dentro de un bloque y que la conversión general no cubre.
 */
export function blockEntityToDxfPrimitive(
  entity: CadEntity,
): CadDxfPrimitive | null {
  const native = cadEntityToDxfPrimitive(entity);
  if (native) return native;
  if (entity.type === "text")
    return {
      kind: "text",
      layer: entity.layer,
      points: [{ x: entity.x, y: entity.y }],
      text: entity.text,
    };
  if (entity.type === "mtext")
    return {
      kind: "text",
      layer: entity.layer,
      points: [{ x: entity.insertion.x, y: entity.insertion.y }],
      text: entity.text,
    };
  if (entity.type === "box" || entity.type === "station") {
    const radians = (entity.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const cx = entity.x + entity.w / 2;
    const cy = entity.y + entity.h / 2;
    const points = [
      { x: -entity.w / 2, y: -entity.h / 2 },
      { x: entity.w / 2, y: -entity.h / 2 },
      { x: entity.w / 2, y: entity.h / 2 },
      { x: -entity.w / 2, y: entity.h / 2 },
    ].map((value) => ({
      x: cx + value.x * cos - value.y * sin,
      y: cy + value.x * sin + value.y * cos,
    }));
    // Una caja/estación es un contorno CERRADO de cuatro esquinas. Repetía la
    // primera —y con la MISMA referencia de objeto, no una copia—, así que el
    // bloque salía con un tramo nulo y sin el bit 70.
    return {
      kind: "polyline",
      layer: entity.layer,
      points,
      closed: true,
      text: entity.type === "box" ? entity.label : undefined,
    };
  }
  return null;
}
