/**
 * Invariante de capas bloqueadas para las puertas de mutación por documento.
 *
 * `commitNativeCommands` ya comprueba capa bloqueada COMANDO a comando contra
 * el checkpoint. Pero la segunda frontera (`commitBlockMutation`) recibe una
 * función `mutate(document) => document` opaca — bloques, xrefs, grupos,
 * purga, gestor de capas y estilos pasan por ahí — y no podía preguntar nada:
 * una rutina podía editar o borrar entidades de una capa bloqueada sin que
 * ninguna puerta lo viera.
 *
 * Este guardia compara ESTADOS: checkpoint contra resultado. Regla, con la
 * semántica de AutoCAD:
 *
 *  - Una entidad que en el CHECKPOINT está en capa bloqueada debe llegar al
 *    resultado IDÉNTICA: ni modificada, ni borrada, ni movida de capa.
 *  - CREAR entidades nuevas en una capa bloqueada se permite (AutoCAD dibuja
 *    sobre capas bloqueadas; lo que prohíbe es tocar lo que ya está).
 *  - Cambiar la DEFINICIÓN de la capa (lock/unlock, color, nombre, plot) se
 *    permite: el guardia protege entidades, no la tabla de capas. Desbloquear
 *    y editar son DOS transacciones: la que desbloquea no edita, y la
 *    siguiente ya no ve la capa bloqueada en su checkpoint.
 *
 * La comparación es por referencia primero (las mutaciones con estructura
 * compartida no clonan lo que no tocan) y por serializado estable después,
 * para no rechazar rutinas que reconstruyen entidades sin cambiarlas.
 *
 * Lanza `Error` con mensaje accionable; las puertas lo convierten en su
 * rechazo atómico existente (toast + checkpoint intacto).
 */
import type { CadDocument, CadEntity } from "./cad-document";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

const fingerprint = (entity: CadEntity): string => JSON.stringify(stable(entity));

export function assertCadLockedLayerInvariant(
  checkpoint: CadDocument,
  next: CadDocument,
): void {
  const lockedLayers = new Set(
    checkpoint.layers.filter((layer) => layer.locked).map((layer) => layer.id),
  );
  if (lockedLayers.size === 0) return;
  const nextById = new Map(next.entities.map((entity) => [entity.id, entity]));
  for (const entity of checkpoint.entities) {
    if (!lockedLayers.has(entity.layer)) continue;
    const after = nextById.get(entity.id);
    if (after === undefined) {
      throw new Error(
        `Layer ${entity.layer} is locked. Unlock it before deleting ${entity.id}.`,
      );
    }
    if (after !== entity && fingerprint(after) !== fingerprint(entity)) {
      throw new Error(
        `Layer ${entity.layer} is locked. Unlock it before editing ${entity.id}.`,
      );
    }
  }
}
