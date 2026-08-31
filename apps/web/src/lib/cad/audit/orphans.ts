/**
 * AUDIT, tercera mitad: capas huérfanas y bloques sin usar.
 *
 * No hay análisis nuevo aquí. `../blocks/cad-purge.ts` YA resuelve exactamente
 * esta pregunta —mirando los siete sitios que un análisis ingenuo se salta,
 * ver su cabecera— porque es lo mismo que necesita PURGE. AUDIT no reimplementa
 * el análisis de uso: le pone la etiqueta de AUDIT a la misma lista, para que
 * aparezca en el informe sin haber tecleado PURGE.
 */
import type { CadDocument, CadLayerDef } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { cadPurgeCommands, cadPurgePreview, type CadPurgeCandidate } from "../blocks/cad-purge";

export interface CadAuditOrphanDefect {
  id: string;
  kind: "orphan-layer" | "unused-block" | "unused-style";
  entityId: string;
  layer?: string;
  detail: string;
}

const KIND_BY_CANDIDATE: Record<CadPurgeCandidate["kind"], CadAuditOrphanDefect["kind"]> = {
  layer: "orphan-layer",
  block: "unused-block",
  style: "unused-style",
};

export function detectCadAuditOrphanDefects(
  document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences">,
  options: { activeLayer?: string } = {},
): CadAuditOrphanDefect[] {
  return cadPurgePreview(document, options).map((candidate) => ({
    id: `${KIND_BY_CANDIDATE[candidate.kind]}:${candidate.id}`,
    kind: KIND_BY_CANDIDATE[candidate.kind],
    entityId: candidate.id,
    detail: `${candidate.label}: ${candidate.detail}`,
  }));
}

/**
 * Reconstruye los candidatos de PURGE a partir de los defectos ya detectados
 * y delega la escritura en `cadPurgeCommands`: una sola ruta de mutación para
 * capas/bloques/estilos huérfanos, la use PURGE o la use AUDIT.
 */
export function cadAuditOrphanRepairCommands(
  document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences">,
  layers: readonly CadLayerDef[],
  options: { activeLayer?: string } = {},
): CadEntityCommand[] {
  return cadPurgeCommands(cadPurgePreview(document, options), layers);
}
