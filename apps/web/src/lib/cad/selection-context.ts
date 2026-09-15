/**
 * Contexto de selección publicado fuera del monolito.
 *
 * `Layout3DEditor` posee 125 `useState` y no puede exponer nada sin que otro
 * componente le pregunte por cada pieza. Este módulo puro (cero React, cero
 * importaciones de componentes) calcula un resumen de la selección activa que
 * cualquiera puede consumir — la cinta, la barra de estado, el panel de
 * propiedades — sin acoplarse al monolito.
 *
 * El contrato es deliberadamente mínimo: la selección es un conjunto de IDs,
 * cada ID se resuelve a un tipo de entidad (`kind`) mediante un mapa que el
 * propietario mantiene, y el resultado es inmutable. No hay eventos, no hay
 * suscripciones, no hay `setState`.
 *
 * @see docs/execution/DEUDA-MONOLITO.md — T-1.1
 */

/* ── Tipos ───────────────────────────────────────────────────────────── */

/** Resumen de la selección activa. */
export interface CadSelectionContext {
  /** Número de entidades seleccionadas. */
  readonly count: number;
  /** Conjunto de tipos (`type` de CadEntity) presentes en la selección. */
  readonly kinds: ReadonlySet<string>;
  /**
   * Tipo dominante: el único tipo cuando todas las entidades comparten el
   * mismo. `null` si la selección está vacía o mezcla tipos distintos.
   */
  readonly dominantKind: string | null;
  /** Layout activo ("Model" o nombre de paper space). */
  readonly activeLayout: string;
  /** `true` si el documento es de sólo lectura. */
  readonly readOnly: boolean;
}

/* ── Constantes ──────────────────────────────────────────────────────── */

/** Selección vacía: cero entidades, sin layout ni tipo. */
export const EMPTY_SELECTION_CONTEXT: Readonly<CadSelectionContext> = {
  count: 0,
  kinds: new Set<string>(),
  dominantKind: null,
  activeLayout: "Model",
  readOnly: false,
};

/* ── Derivación ──────────────────────────────────────────────────────── */

/**
 * Calcula el contexto de selección a partir de datos planos.
 *
 * @param selectedIds - IDs de las entidades seleccionadas.
 * @param kindById    - Mapa de entityId → tipo de entidad (`entity.type`).
 * @param activeLayout - Nombre del layout activo.
 * @param readOnly    - Si el documento es de sólo lectura.
 * @returns Contexto derivado; nunca muta las entradas.
 */
export function deriveSelectionContext(
  selectedIds: readonly string[],
  kindById: ReadonlyMap<string, string>,
  activeLayout: string,
  readOnly: boolean,
): CadSelectionContext {
  const count = selectedIds.length;
  if (count === 0) {
    return {
      ...EMPTY_SELECTION_CONTEXT,
      activeLayout,
      readOnly,
    };
  }

  const kinds = new Set<string>();
  for (const id of selectedIds) {
    const kind = kindById.get(id);
    if (kind !== undefined) {
      kinds.add(kind);
    }
  }

  const dominantKind = kinds.size === 1 ? (kinds.values().next().value as string) : null;

  return { count, kinds, dominantKind, activeLayout, readOnly };
}
