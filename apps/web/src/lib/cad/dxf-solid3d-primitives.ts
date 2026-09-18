/**
 * Proyección de SOLID3D y REGION a primitivas DXF.
 *
 * El sólido 3D no tiene entidad nativa en DXF: viajan los CONTORNOS de cada
 * cara como polilíneas cerradas en 2D (proyección XY). Es la misma geometría
 * que dibuja la pantalla y el PDF —la del adaptador registrado en
 * `CAD_ENTITY_REGISTRY`— para que los tres no puedan discrepar.
 *
 * Limitaciones declaradas en el manifiesto de pérdidas:
 *  · viaja la proyección, no el sólido;
 *  · se pierde la cota Z y la topología;
 *  · no hay eliminación de aristas ocultas;
 *  · en REGION, los anillos interiores viajan como contornos independientes.
 */
import type { CadDocument, CadEntity } from "./cad-document";
import type { CadDxfPrimitive } from "./dxf-import";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";

/** Un SOLID3D → contornos de cara como polilíneas cerradas. */
export function cadSolid3dToDxfPrimitives(
  entity: Extract<CadEntity, { type: "solid3d" }>,
): CadDxfPrimitive[] {
  const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
  const paths = adapter.renderer.paths(entity);
  return paths
    .filter((p) => p.closed && p.points.length >= 3)
    .map((p) => ({
      kind: "polyline" as const,
      layer: entity.layer,
      points: p.points.map((c) => ({ x: c.x, y: c.y })),
      closed: true,
    }));
}

/** Una REGION → contornos exterior e interior como polilíneas cerradas. */
export function cadRegionToDxfPrimitives(
  entity: Extract<CadEntity, { type: "region" }>,
): CadDxfPrimitive[] {
  const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
  const paths = adapter.renderer.paths(entity);
  return paths
    .filter((p) => p.closed && p.points.length >= 3)
    .map((p) => ({
      kind: "polyline" as const,
      layer: entity.layer,
      points: p.points.map((c) => ({ x: c.x, y: c.y })),
      closed: true,
    }));
}
