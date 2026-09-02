/**
 * EL TEXTO DE UN TIPO DE LÍNEA COMPLEJO EN LA LÁMINA (Ola F, 2026-09-02).
 *
 * `paper-space-style.ts` ya pone en cada camino el guion del tipo de línea en
 * mm de papel (patrón × LTSCALE). Aquí, con la MISMA regla y la misma escala,
 * cada LINE o POLYLINE de tramos rectos cuyo tipo de línea lleva texto
 * (`linetype-complex.ts`) añade un comando de texto por rótulo, ya en
 * coordenadas de papel, con la forma que `plot-job.ts` convierte en rótulo y
 * el PDF lleva en sus bytes.
 *
 * Vive en su propio módulo porque `paper-space.ts` tiene presupuesto propio en
 * `scripts/cad/monolith-budget.json` y sólo puede encoger.
 */
import type { CadPoint2 } from "./cad-document";
import { cadComplexLinetypeFor, cadLinetypeTextPlacements } from "./linetype-complex";
import type { CadTableCellTextCommand } from "./paper-space-table";

export interface CadLinetypeTextTarget {
  entityId: string;
  viewportId: string;
  /** Nombre EFECTIVO del tipo de línea del camino (el de `styleFor`). */
  linetype: string | undefined;
  /** Modelo → papel, la misma matriz con la que se trazó el camino. */
  toPaper: (point: CadPoint2) => CadPoint2;
  /** LTSCALE del documento: el guion del papel es patrón × LTSCALE mm. */
  linetypeScale: number;
  color: string;
}

/** Los rótulos del tipo de línea a lo largo del camino, en papel. Vacío si no lleva texto o el camino tiene arcos. */
export function cadLinetypeTextCommands(
  points: readonly (CadPoint2 & { bulge?: number })[],
  closed: boolean,
  target: CadLinetypeTextTarget,
): CadTableCellTextCommand[] {
  const definition = cadComplexLinetypeFor(target.linetype);
  if (!definition || points.some((point) => point.bulge)) return [];
  const paper = points.map((point) => target.toPaper(point));
  return cadLinetypeTextPlacements(paper, closed, definition, target.linetypeScale).map((placement) => ({
    kind: "text",
    entityId: target.entityId,
    viewportId: target.viewportId,
    point: { x: placement.x, y: placement.y },
    text: placement.text,
    size: placement.height,
    rotation: placement.rotationDeg,
    color: target.color,
    align: placement.align,
  }));
}
