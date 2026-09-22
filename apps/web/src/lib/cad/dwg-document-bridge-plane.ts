import type { DwgNeutralGeometry, DwgNeutralPoint3 } from "./dwg-neutral-model";

/**
 * La proyección canónica de la beta es XY. Eliminar Z o ignorar una normal
 * OCS distinta de +Z puede cambiar longitudes, orientación y posición sin
 * que falle el importador. Se excluye esa geometría con un motivo visible;
 * este guardián no inventa una transformación 3D ni amplía el perfil.
 *
 * Cero y +Z son los valores exactos del contrato, sin tolerancias nuevas.
 * La elevación/espesor de LWPOLYLINE conserva su degradación ya declarada
 * por droppedLwPolylineProperties. El perfil wireframe tiene otra vía que
 * preserva su geometría opaca y nunca se aplana aquí.
 */
export function dwgNonplanarReason(entity: DwgNeutralGeometry): string | null {
  if (
    entity.kind === "face3d" || entity.kind === "polyline3d" ||
    entity.kind === "polymesh" || entity.kind === "polyfaceMesh"
  ) return null;

  if ("extrusion" in entity && entity.extrusion !== undefined) {
    const normal = entity.extrusion;
    if (normal.x !== 0 || normal.y !== 0 || normal.z !== 1) {
      return "su normal de extrusión no es +Z y necesita una transformación de plano";
    }
  }
  if (entity.kind !== "lwpolyline") {
    if ("thickness" in entity && entity.thickness !== undefined && entity.thickness !== 0) return "contiene espesor 3D";
    if ("elevation" in entity && entity.elevation !== undefined && entity.elevation !== 0) {
      return "contiene elevación fuera de XY";
    }
  }

  const spatial = (...points: (DwgNeutralPoint3 | undefined)[]) =>
    points.some((point) => point !== undefined && point.z !== 0);
  let outside = false;
  switch (entity.kind) {
    case "line": outside = spatial(entity.start, entity.end); break;
    case "point":
    case "insert": outside = spatial(entity.position); break;
    case "circle":
    case "arc": outside = spatial(entity.center); break;
    case "ellipse": outside = spatial(entity.center, entity.majorAxisEndpoint); break;
    case "spline":
      outside = (entity.controlPoints ?? []).some((point) => spatial(point)) ||
        (entity.fitPoints ?? []).some((point) => spatial(point)) ||
        spatial(entity.startTangent, entity.endTangent);
      break;
    case "mtext": outside = spatial(entity.insertion, entity.xAxisDirection); break;
    case "dimension":
      outside = spatial(entity.definitionPoint, entity.point13, entity.point14, entity.point15);
      break;
  }
  return outside ? "contiene coordenadas Z fuera de XY" : null;
}
