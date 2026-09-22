/**
 * Capas, orden de dibujo y estados de capa: las tablas del documento que NO
 * pasan por el solucionador.
 *
 * Viven aparte de `entity-commands.ts` por el trinquete de tamaño —aquel
 * archivo es el embudo de mutación y sólo puede encoger— y porque de todas
 * formas son un tema propio: ni la tabla de capas ni el orden de dibujo mueven
 * un punto, así que restaurar un estado de cuarenta capas no tiene por qué
 * pagar un `solve` del sistema de restricciones entero.
 *
 * Lo que NO cambia por estar aquí: siguen entrando por el mismo lote, con un
 * solo `commitChange` y un solo paso de deshacer. La puerta de mutación sigue
 * siendo una.
 */
import type {
  CadDocument,
  CadEntity,
  CadLayerDef,
  CadNamedLayerState,
} from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";

export type CadDocumentTableCommand = Extract<
  CadEntityCommand,
  { type: "layer" | "draw-order" | "layer-state" }
>;

type LayerReassignment = { sourceId: string; targetId: string };

/** Reasigna las otras secciones sobre el documento ya compuesto, sin commit. */
export function remapDeletedCadLayerReferences(
  document: CadDocument,
  reassignments: readonly LayerReassignment[],
): CadDocument {
  return reassignments.reduce((current, { sourceId, targetId }) => {
    // PURGE/XREF pueden retirar la última capa vacía. Se comprueba DESPUÉS
    // de componer el lote: éste puede haber borrado su INSERT y sus bloques.
    if (sourceId === targetId && [
      ...current.entities,
      ...current.blocks.flatMap((block) => block.entities),
      ...current.unsupportedEntities,
    ].some((entity) => entity.layer === sourceId))
      throw new Error("La capa de destino debe ser distinta de la que se borra mientras tenga entidades.");
    const remap = <T extends { layer?: string }>(entity: T): T =>
      entity.layer === sourceId ? { ...entity, layer: targetId } : entity;
    const remapKeys = <T>(values: Record<string, T> | undefined): Record<string, T> | undefined => {
      if (!values || !Object.hasOwn(values, sourceId)) return values;
      const next = { ...values };
      if (!Object.hasOwn(next, targetId)) next[targetId] = next[sourceId];
      delete next[sourceId];
      return next;
    };
    return {
      ...current,
      blocks: current.blocks.map((block) => ({ ...block, entities: block.entities.map(remap) })),
      unsupportedEntities: current.unsupportedEntities.map(remap),
      paperSpaces: current.paperSpaces.map((space) => ({
        ...space,
        ...(space.viewports ? { viewports: space.viewports.map((viewport) => ({
          ...viewport,
          ...(viewport.layerVisibility ? { layerVisibility: remapKeys(viewport.layerVisibility) } : {}),
          ...(viewport.layerOverrides ? { layerOverrides: remapKeys(viewport.layerOverrides) } : {}),
        })) } : {}),
      })),
    };
  }, document);
}

export const isCadTableCommand = (
  command: CadEntityCommand,
): command is CadDocumentTableCommand =>
  command.type === "layer" ||
  command.type === "draw-order" ||
  command.type === "layer-state";

/**
 * Reordena `entityIds` colocando `moving` donde diga `placement`.
 *
 * Los que se mueven conservan su orden RELATIVO entre sí. Sin eso, «traer al
 * frente» tres objetos apilados los devolvería en el orden en que se
 * designaron, que casi nunca es el orden en que estaban — y quien trae al
 * frente un grupo espera encontrarlo tal cual estaba, sólo que arriba.
 */
export function reorderDrawOrder(
  entityIds: readonly string[],
  moving: readonly string[],
  placement: "front" | "back" | "above" | "below",
  referenceId: string | undefined,
): string[] {
  const target = new Set(moving.filter((id) => entityIds.includes(id)));
  if (target.size === 0) return [...entityIds];
  // Una referencia que también se mueve no es una referencia: sería un objeto
  // colocándose respecto de sí mismo.
  if ((placement === "above" || placement === "below") && (!referenceId || target.has(referenceId)))
    throw new Error("DRAWORDER necesita un objeto de referencia que no esté entre los designados.");

  const kept = entityIds.filter((id) => !target.has(id));
  const picked = entityIds.filter((id) => target.has(id));
  if (placement === "front") return [...kept, ...picked];
  if (placement === "back") return [...picked, ...kept];
  const at = kept.indexOf(referenceId as string);
  if (at < 0) throw new Error(`DRAWORDER no encuentra el objeto de referencia ${referenceId}.`);
  const cut = placement === "above" ? at + 1 : at;
  return [...kept.slice(0, cut), ...picked, ...kept.slice(cut)];
}

/**
 * Aplica las tablas del documento: capas y orden de dibujo.
 *
 * Borrar una capa REASIGNA sus entidades en la misma transacción. Dejarlas
 * apuntando a una capa que ya no existe produciría un documento que se abre
 * pero no se puede dibujar, y el error aparecería tres sesiones después.
 */
export function applyDocumentTables(
  document: CadDocument,
  commands: readonly CadDocumentTableCommand[],
  entityOrder: readonly string[],
  entities: readonly CadEntity[],
): {
  layers: CadLayerDef[];
  entityOrder: string[];
  entities: CadEntity[];
  touchedEntityIds: string[];
  /** Sección de estados de capa DESPUÉS del lote; `undefined` = ausente. */
  layerStates: CadNamedLayerState[] | undefined;
  layerReassignments: LayerReassignment[];
} {
  if (commands.length === 0)
    return {
      layers: document.layers,
      entityOrder: [...entityOrder],
      entities: [...entities],
      touchedEntityIds: [],
      layerStates: document.layerStates,
      layerReassignments: [],
    };

  let layers = [...document.layers];
  let order = [...entityOrder];
  let current = [...entities];
  // Opcional-ausente: sólo se materializa si un `upsert` de este lote la crea.
  let layerStates = document.layerStates ? [...document.layerStates] : undefined;
  const touchedEntityIds: string[] = [];
  const layerReassignments: LayerReassignment[] = [];

  for (const command of commands) {
    if (command.type === "draw-order") {
      order = reorderDrawOrder(order, command.entityIds, command.placement, command.referenceId);
      for (const entityId of command.entityIds) touchedEntityIds.push(entityId);
      continue;
    }
    if (command.type === "layer-state") {
      if (command.op === "delete") {
        const key = command.name.trim().toUpperCase();
        const next = (layerStates ?? []).filter(
          (state) => state.name.toUpperCase() !== key,
        );
        if (next.length === (layerStates ?? []).length)
          throw new Error(`No hay ningún estado de capa llamado "${command.name}".`);
        // Borrar el último estado retira la sección entera: opcional-ausente.
        layerStates = next.length > 0 ? next : undefined;
        continue;
      }
      const name = command.state.name.trim();
      if (!name) throw new Error("Un estado de capa necesita un nombre.");
      const key = name.toUpperCase();
      layerStates = [
        ...(layerStates ?? []).filter((state) => state.name.toUpperCase() !== key),
        { ...command.state, entries: command.state.entries.map((entry) => ({ ...entry })) },
      ].sort((a, b) => a.name.localeCompare(b.name));
      continue;
    }
    if (command.op === "delete") {
      const key = command.name.trim().toUpperCase();
      const source = layers.find((layer) => layer.name.toUpperCase() === key);
      if (!source) throw new Error(`No existe la capa "${command.name}".`);
      if (source.id === "0" || key === "0") throw new Error("La capa 0 no se puede borrar.");
      const target = layers.find((layer) => layer.name.toUpperCase() === command.reassignTo.trim().toUpperCase());
      if (!target)
        throw new Error(`No existe la capa de destino "${command.reassignTo}".`);
      layers = layers.filter((layer) => layer.id !== source.id);
      layerReassignments.push({ sourceId: source.id, targetId: target.id });
      current = current.map((entity) => {
        if (entity.layer !== source.id) return entity;
        touchedEntityIds.push(entity.id);
        return { ...entity, layer: target.id };
      });
      continue;
    }
    const key = command.layer.name.trim().toUpperCase();
    if (!key) throw new Error("Una capa necesita un nombre.");
    const byId = layers.findIndex((layer) => layer.id === command.layer.id);
    const byName = layers.findIndex((layer) => layer.name.toUpperCase() === key);
    if (byId >= 0 && byName >= 0 && byId !== byName)
      throw new Error(`Ya existe otra capa llamada "${command.layer.name}".`);
    const at = byId >= 0 ? byId : byName;
    if (at >= 0) layers = layers.map((layer, index) => (index === at ? { ...command.layer, id: layer.id } : layer));
    else layers = [...layers, { ...command.layer }];
  }

  return { layers, entityOrder: order, entities: current, touchedEntityIds, layerStates, layerReassignments };
}
