/**
 * AUDIT, segunda mitad: referencias colgantes.
 *
 * Tres formas de que una entidad apunte a algo que ya no está, y las tres
 * comparten la misma regla: DECLARAR la referencia rota, nunca fingir que
 * sigue en pie.
 *
 *   1. Una COTA asociativa cuyo(s) objeto(s) de referencia ya no existen. El
 *      motor de edición normal ya marca esto —`associationStatus: "broken"`,
 *      ver `associative-dimension.ts`— en cuanto pasa un lote por
 *      `executeCadEntityCommandBatch`. Lo que AUDIT añade es mirar el
 *      documento TAL COMO LLEGÓ, sin pasar ningún lote: un DXF ajeno o una
 *      fusión de colaboración pueden traer `associationStatus: "associated"`
 *      con una referencia que ya no resuelve, y eso este módulo lo detecta
 *      por sí mismo en vez de fiarse de una bandera que nadie recalculó.
 *   2. Un OPENING sin muro anfitrión. `wall-openings.ts` ya resuelve esto
 *      DENTRO de un lote de edición (`orphanedOpeningIds`); aquí se reutiliza
 *      la misma función contra el documento completo, no se reimplementa.
 *   3. Un INSERT que nombra un bloque que el documento no declara.
 */
import type { CadBlockDefinition, CadDocument, CadEntity } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { orphanedOpeningIds } from "../wall-openings";

export type CadAuditReferenceDefectKind = "broken-dimension" | "orphan-opening" | "missing-block-insert";

export interface CadAuditReferenceDefect {
  id: string;
  kind: CadAuditReferenceDefectKind;
  entityId: string;
  layer: string;
  detail: string;
}

const allEntities = (document: Pick<CadDocument, "entities" | "blocks">): CadEntity[] => [
  ...document.entities,
  ...document.blocks.flatMap((block) => block.entities),
];

function brokenDimensionDefects(entities: readonly CadEntity[]): CadAuditReferenceDefect[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const defects: CadAuditReferenceDefect[] = [];
  for (const entity of entities) {
    if (entity.type !== "dimension") continue;
    const alreadyMarked = entity.associationStatus === "broken";
    const references = entity.references ?? [];
    const missing = entity.associative && references.length > 0
      ? references.filter((reference) => !byId.has(reference.entityId))
      : [];
    if (!alreadyMarked && missing.length === 0) continue;
    const missingIds = missing.map((reference) => reference.entityId);
    defects.push({
      id: `broken-dimension:${entity.id}`,
      kind: "broken-dimension",
      entityId: entity.id,
      layer: entity.layer,
      detail: missingIds.length
        ? `DIMENSION asociativa: referencia a ${missingIds.join(", ")}, que ya no existe en el documento.`
        : `DIMENSION marcada rota (associationStatus: "broken"): el objeto del que dependía ya no está.`,
    });
  }
  return defects;
}

function orphanOpeningDefects(entities: readonly CadEntity[]): CadAuditReferenceDefect[] {
  const present = new Map(entities.map((entity) => [entity.id, entity]));
  return orphanedOpeningIds(present).map((entityId) => ({
    id: `orphan-opening:${entityId}`,
    kind: "orphan-opening",
    entityId,
    layer: present.get(entityId)?.layer ?? "0",
    detail: "OPENING sin muro anfitrión: el muro que lo alojaba ya no existe.",
  }));
}

function missingBlockInsertDefects(
  entities: readonly CadEntity[],
  blocks: readonly CadBlockDefinition[],
): CadAuditReferenceDefect[] {
  const known = new Set<string>();
  for (const block of blocks) {
    known.add(block.id);
    known.add(block.name);
  }
  const defects: CadAuditReferenceDefect[] = [];
  for (const entity of entities) {
    if (entity.type !== "insert" || known.has(entity.block)) continue;
    defects.push({
      id: `missing-block-insert:${entity.id}`,
      kind: "missing-block-insert",
      entityId: entity.id,
      layer: entity.layer,
      detail: `INSERT al bloque «${entity.block}», que el documento no declara.`,
    });
  }
  return defects;
}

export function detectCadAuditReferenceDefects(
  document: Pick<CadDocument, "entities" | "blocks">,
): CadAuditReferenceDefect[] {
  const entities = allEntities(document);
  return [
    ...brokenDimensionDefects(entities),
    ...orphanOpeningDefects(entities),
    ...missingBlockInsertDefects(entities, document.blocks),
  ];
}

/**
 * Repara borrando. Una cota rota o un hueco sin anfitrión no tienen edición
 * automática razonable —¿a qué se reengancharían?—; borrarlas es lo mismo que
 * ya hace el motor cuando el borrado del anfitrión sucede DENTRO de un lote.
 */
export function cadAuditReferenceRepairCommands(
  defects: readonly CadAuditReferenceDefect[],
): CadEntityCommand[] {
  return defects.map((defect) => ({ type: "delete", entityId: defect.entityId }));
}
