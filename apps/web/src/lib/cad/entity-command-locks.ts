/**
 * Capa bloqueada: la comprobación del LOTE entero, fuera del monolito.
 *
 * El lote se comprueba completo contra el estado de PARTIDA, antes de aplicar
 * nada: un lote es atómico respecto de su punto de partida, así que preguntar
 * por el documento intermedio no añadía información y obligaba a aplicar los
 * comandos de uno en uno.
 *
 * Y se comprueba con ÍNDICES, no con `find` por comando: la versión anterior
 * hacía un recorrido lineal del documento por CADA comando — mover las
 * 100.000 entidades designadas eran 10^10 comparaciones y la orden no volvía
 * en 10 minutos (medido en cad-dense-editing-100k, fase moveMassive).
 */
import type { CadDocument } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";

/** Lanza si algún comando del lote toca una entidad de una capa bloqueada. */
export function assertCadCommandsNotOnLockedLayers(
  checkpoint: CadDocument,
  commands: readonly CadEntityCommand[],
): void {
  const lockedLayerIds = new Set(
    checkpoint.layers.filter((layer) => layer.locked).map((layer) => layer.id),
  );
  if (lockedLayerIds.size === 0) return;
  const entityById = new Map(
    checkpoint.entities.map((entity) => [entity.id, entity] as const),
  );
  for (const command of commands) {
    // `insert` trae su entidad; `image-definition` no toca ninguna capa.
    const target =
      "entityId" in command
        ? entityById.get(command.entityId)
        : "entity" in command
          ? command.entity
          : undefined;
    if (target && lockedLayerIds.has(target.layer))
      throw new Error(
        `Layer ${target.layer} is locked. Unlock it before editing ${target.id}.`,
      );
  }
}
