/**
 * Presupuesto de PROYECCIÓN de la selección nativa — la política de capacidad
 * que faltaba entre «designar 100.000» y «materializar 100.000».
 *
 * ## El defecto que este módulo corrige
 *
 * Con el pipeline por lotes, el documento entero se dibuja en lotes por tile:
 * nunca hay cien mil objetos de escena. La ÚNICA vía que volvía a crear un
 * objeto THREE por entidad era la proyección de la selección — grips y realce
 * por encima del lote—, y esa vía no tenía presupuesto: designar «Todo» sobre
 * un plano de 100.000 entidades construía 100.000 objetos individuales en el
 * hilo principal (medido: la fase `selectAll` del estrés
 * `cad-dense-editing-100k` no terminaba dentro de su techo de 600 s, y cada
 * gesto posterior pagaba la misma factura al re-sincronizar esos objetos).
 *
 * ## La política, y por qué es la misma que la de un CAD de escritorio
 *
 * AutoCAD no dibuja grips para una selección masiva: `GRIPOBJLIMIT` (100 por
 * defecto) los suprime cuando el conjunto designado supera el límite. Aquí se
 * adopta la misma semántica con un límite propio:
 *
 *   · selección ≤ límite → proyección por entidad completa (grips + realce).
 *   · selección > límite → CERO proyección por entidad. El realce visual lo da
 *     el propio lote (`setSelection` retesela con el color de selección) y el
 *     recuento del HUD sigue siendo exacto. No se proyecta «una muestra»:
 *     grips sobre un subconjunto arbitrario invitan a editar por un asidero
 *     que no representa al grupo.
 *
 * El límite NO trunca la selección — las 100.000 siguen designadas, se mueven,
 * se borran y se deshacen como grupo. Sólo gobierna cuántos objetos de escena
 * individuales se construyen para adornarla.
 */

/**
 * Límite de objetos de selección proyectados por entidad. Igual que
 * `GRIPOBJLIMIT` de AutoCAD en espíritu; el valor concreto (400) cubre con
 * holgura cualquier selección editable a mano y queda muy por debajo del
 * umbral donde la creación de objetos THREE se nota (~milisegundos por objeto
 * bajo rasterización por software).
 */
export const CAD_SELECTION_PROJECTION_LIMIT = 400;

export interface CadSelectionProjectionPlan {
  /** Ids a proyectar como objetos individuales (vacío si se suprime). */
  readonly projected: ReadonlySet<string>;
  /** true cuando la selección superó el límite y los grips se suprimen. */
  readonly suppressed: boolean;
  /**
   * Clave estable del plan, para memoizar la proyección sin reconstruir ni
   * ordenar cien mil ids: cuando se suprime, la clave es constante.
   */
  readonly key: string;
}

/** Decide qué parte de la selección se proyecta como objetos individuales. */
export function planCadSelectionProjection(
  selectedIds: ReadonlySet<string>,
  limit: number = CAD_SELECTION_PROJECTION_LIMIT,
): CadSelectionProjectionPlan {
  if (selectedIds.size > limit) {
    return {
      projected: new Set<string>(),
      suppressed: true,
      key: `suppressed:${selectedIds.size}`,
    };
  }
  return {
    projected: selectedIds,
    suppressed: false,
    key: [...selectedIds].sort().join("|"),
  };
}
