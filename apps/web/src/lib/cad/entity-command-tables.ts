/**
 * Capas y orden de dibujo: las dos tablas del documento que NO pasan por el
 * solucionador.
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
import type { CadDocument, CadEntity, CadLayerDef } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";

export type CadDocumentTableCommand = Extract<
  CadEntityCommand,
  { type: "layer" | "draw-order" }
>;

export const isCadTableCommand = (
  command: CadEntityCommand,
): command is CadDocumentTableCommand =>
  command.type === "layer" || command.type === "draw-order";

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
} {
  if (commands.length === 0)
    return {
      layers: document.layers,
      entityOrder: [...entityOrder],
      entities: [...entities],
      touchedEntityIds: [],
    };

  let layers = [...document.layers];
  let order = [...entityOrder];
  let current = [...entities];
  const touchedEntityIds: string[] = [];

  for (const command of commands) {
    if (command.type === "draw-order") {
      order = reorderDrawOrder(order, command.entityIds, command.placement, command.referenceId);
      for (const entityId of command.entityIds) touchedEntityIds.push(entityId);
      continue;
    }
    if (command.op === "delete") {
      const key = command.name.trim().toUpperCase();
      if (key === "0") throw new Error("La capa 0 no se puede borrar.");
      if (!layers.some((layer) => layer.name.toUpperCase() === key))
        throw new Error(`No existe la capa "${command.name}".`);
      if (!layers.some((layer) => layer.name.toUpperCase() === command.reassignTo.toUpperCase()))
        throw new Error(`No existe la capa de destino "${command.reassignTo}".`);
      layers = layers.filter((layer) => layer.name.toUpperCase() !== key);
      current = current.map((entity) => {
        if (!("layer" in entity) || entity.layer.toUpperCase() !== key) return entity;
        touchedEntityIds.push(entity.id);
        return { ...entity, layer: command.reassignTo };
      });
      continue;
    }
    const key = command.layer.name.trim().toUpperCase();
    if (!key) throw new Error("Una capa necesita un nombre.");
    const at = layers.findIndex((layer) => layer.name.toUpperCase() === key);
    if (at >= 0) layers = layers.map((layer, index) => (index === at ? { ...command.layer } : layer));
    else layers = [...layers, { ...command.layer }];
  }

  return { layers, entityOrder: order, entities: current, touchedEntityIds };
}
