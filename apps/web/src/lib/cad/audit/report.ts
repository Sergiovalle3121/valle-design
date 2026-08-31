/**
 * AUDIT: el informe completo, y la reparación que declara exactamente qué tocó.
 *
 * Cuatro fuentes, ninguna reimplementada aquí:
 *
 *   - geometría degenerada       → `./geometry.ts`
 *   - referencias colgantes      → `./references.ts`
 *   - capas/bloques/estilos sin usar → `./orphans.ts` (que a su vez delega en
 *     `../blocks/cad-purge.ts`, el mismo análisis que usa PURGE)
 *   - duplicados exactos         → `../overkill.ts`
 *
 * Este módulo sólo JUNTA los cuatro informes en uno y construye el lote de
 * reparación combinado, sin inventar un quinto análisis. La regla del corpus de
 * geometría degenerada aplica igual aquí: un AUDIT que repara sin decir qué
 * tocó es peor que uno que no repara nada, así que cada hallazgo lleva su
 * `detail` tal cual lo produjo su detector, no un resumen genérico.
 */
import type { CadDocument, CadLayerDef } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { planCadOverkill } from "../overkill";
import {
  cadAuditGeometryRepairCommands,
  detectCadAuditGeometryDefects,
  type CadAuditGeometryDefect,
  type CadAuditGeometryDefectKind,
} from "./geometry";
import {
  cadAuditReferenceRepairCommands,
  detectCadAuditReferenceDefects,
  type CadAuditReferenceDefect,
  type CadAuditReferenceDefectKind,
} from "./references";
import {
  cadAuditOrphanRepairCommands,
  detectCadAuditOrphanDefects,
  type CadAuditOrphanDefect,
} from "./orphans";

export type CadAuditFindingCategory = "geometry" | "reference" | "orphan" | "duplicate";

export interface CadAuditFinding {
  id: string;
  category: CadAuditFindingCategory;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  affectedObjectIds: readonly string[];
  /** `true` si al confirmar, AUDIT sabe repararlo por sí mismo. */
  repairable: boolean;
}

export interface CadAuditReport {
  findings: readonly CadAuditFinding[];
  geometryDefects: readonly CadAuditGeometryDefect[];
  referenceDefects: readonly CadAuditReferenceDefect[];
  orphanDefects: readonly CadAuditOrphanDefect[];
  /** Duplicados exactos detectados (no fusión de colineales: eso es OVERKILL). */
  duplicatesRemoved: number;
}

const GEOMETRY_TITLE: Record<CadAuditGeometryDefectKind, string> = {
  "zero-length-line": "Línea de longitud cero",
  "degenerate-polyline": "Polilínea sin tramos",
  "zero-radius-circle": "Círculo de radio cero",
  "zero-radius-arc": "Arco de radio cero",
  "degenerate-ellipse": "Elipse colapsada",
  "degenerate-spline": "Spline sin curva",
};

const REFERENCE_TITLE: Record<CadAuditReferenceDefectKind, string> = {
  "broken-dimension": "Cota con referencia rota",
  "orphan-opening": "Vano sin muro anfitrión",
  "missing-block-insert": "Inserción a un bloque inexistente",
};

const ORPHAN_TITLE: Record<CadAuditOrphanDefect["kind"], string> = {
  "orphan-layer": "Capa sin ninguna entidad",
  "unused-block": "Bloque sin ninguna inserción",
  "unused-style": "Estilo al que no apunta nada",
};

function allEntitiesOf(document: Pick<CadDocument, "entities" | "blocks">) {
  return [...document.entities, ...document.blocks.flatMap((block) => block.entities)];
}

export interface CadAuditOptions {
  activeLayer?: string;
}

export function buildCadAuditReport(
  document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences">,
  options: CadAuditOptions = {},
): CadAuditReport {
  const geometryDefects = detectCadAuditGeometryDefects(allEntitiesOf(document));
  const referenceDefects = detectCadAuditReferenceDefects(document);
  const orphanDefects = detectCadAuditOrphanDefects(document, options);
  // Sólo duplicados EXACTOS: fundir tramos colineales es una decisión de
  // dibujo (OVERKILL con `combineCollinear`), no la limpieza de un defecto.
  const duplicatesRemoved = planCadOverkill(document.entities).duplicatesRemoved;

  const findings: CadAuditFinding[] = [
    ...geometryDefects.map((defect): CadAuditFinding => ({
      id: defect.id,
      category: "geometry",
      severity: "warning",
      title: GEOMETRY_TITLE[defect.kind],
      detail: defect.detail,
      affectedObjectIds: [defect.entityId],
      repairable: true,
    })),
    ...referenceDefects.map((defect): CadAuditFinding => ({
      id: defect.id,
      category: "reference",
      severity: "critical",
      title: REFERENCE_TITLE[defect.kind],
      detail: defect.detail,
      affectedObjectIds: [defect.entityId],
      repairable: true,
    })),
    ...orphanDefects.map((defect): CadAuditFinding => ({
      id: defect.id,
      category: "orphan",
      severity: "warning",
      title: ORPHAN_TITLE[defect.kind],
      detail: defect.detail,
      affectedObjectIds: [defect.entityId],
      repairable: true,
    })),
  ];
  if (duplicatesRemoved > 0) {
    findings.push({
      id: "duplicate:overkill",
      category: "duplicate",
      severity: "warning",
      title: `${duplicatesRemoved} objeto(s) duplicado(s) exacto(s)`,
      detail:
        "Misma geometría y presentación, repetida. AUDIT los retira igual que OVERKILL; " +
        "para fundir tramos colineales solapados use OVERKILL directamente.",
      affectedObjectIds: [],
      repairable: true,
    });
  }
  return { findings, geometryDefects, referenceDefects, orphanDefects, duplicatesRemoved };
}

/**
 * El lote completo de reparación. Se deduplica por `entityId` en los
 * `delete`: un objeto que sea a la vez, por ejemplo, geometría degenerada Y
 * duplicado exacto no debe borrarse dos veces en el mismo lote.
 */
export function cadAuditRepairCommands(
  document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences">,
  report: CadAuditReport,
  layers: readonly CadLayerDef[],
  options: CadAuditOptions = {},
): CadEntityCommand[] {
  const combined = [
    ...cadAuditGeometryRepairCommands(report.geometryDefects),
    ...cadAuditReferenceRepairCommands(report.referenceDefects),
    ...cadAuditOrphanRepairCommands(document, layers, options),
    ...planCadOverkill(document.entities).commands,
  ];
  const seenDeletes = new Set<string>();
  const deduped: CadEntityCommand[] = [];
  for (const command of combined) {
    if (command.type === "delete") {
      if (seenDeletes.has(command.entityId)) continue;
      seenDeletes.add(command.entityId);
    }
    deduped.push(command);
  }
  return deduped;
}
