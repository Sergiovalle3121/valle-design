/**
 * Conflicto CAS enclavado: dejar de reintentar un token que ya se sabe caduco.
 *
 * EL PROBLEMA. El guardado lleva `expectedCadDocumentVersion`, la versión sobre
 * la que se editó. Si el servidor ha avanzado, responde 409 y devuelve su
 * versión actual. El editor lo mostraba en la barra de estado… y seguía como si
 * nada: cada edición reprograma un autosave, y ese autosave vuelve a llevar la
 * MISMA versión obsoleta, porque la local no cambia con un 409. La petición no
 * puede funcionar y se repite mientras la pestaña siga abierta.
 *
 * O sea: el cliente sabe que su token está caducado —tiene la versión del
 * servidor delante— y aun así gasta una petición cada pocos segundos para que
 * se la rechacen. Multiplicado por cada editor abierto con un conflicto.
 *
 * LO QUE SE ARREGLA Y LO QUE NO. Esto enclava el conflicto y detiene los
 * reintentos AUTOMÁTICOS. No decide qué hacer con el conflicto: recargar
 * perdiendo lo local, fusionar o sobrescribir el servidor son opciones con
 * consecuencias distintas para el dibujo de alguien, y elegir entre ellas es una
 * decisión de producto, no una que pueda tomar el guardado por su cuenta.
 *
 * Por eso el guardado MANUAL sigue permitido. Frenar a la máquina para que no
 * malgaste peticiones es una cosa; quitarle el botón a la persona es otra, y
 * además su intento refresca la versión del servidor que se le muestra.
 *
 * El enclavamiento se ata a la versión base que lo provocó. En cuanto la base
 * local cambia —una recarga, o un guardado que sí entra— el conflicto deja de
 * aplicar solo, sin que nadie tenga que acordarse de limpiarlo.
 */

export interface CadSaveConflict {
  /** Versión local con la que se intentó guardar y que el servidor rechazó. */
  baseVersion: number;
  /** Versión que el servidor dijo tener, si la informó. */
  serverVersion: number | null;
}

export function latchCadSaveConflict(
  baseVersion: number,
  serverVersion: number | null | undefined,
): CadSaveConflict {
  return {
    baseVersion,
    serverVersion: typeof serverVersion === 'number' && Number.isFinite(serverVersion)
      ? serverVersion
      : null,
  };
}

/**
 * ¿Sigue vigente el conflicto para la versión base actual? Devuelve el mismo
 * conflicto si lo está y `null` si la base ya se movió, para que quien llama
 * guarde el resultado sin ramificar.
 */
export function reconcileCadSaveConflict(
  conflict: CadSaveConflict | null,
  currentBaseVersion: number,
): CadSaveConflict | null {
  if (!conflict) return null;
  return conflict.baseVersion === currentBaseVersion ? conflict : null;
}

/**
 * ¿Debe el autosave abstenerse? Sólo cuando reintentaría EXACTAMENTE la versión
 * que ya fue rechazada. Cualquier otra base es un intento nuevo y legítimo.
 */
export function cadAutosaveBlockedByConflict(
  conflict: CadSaveConflict | null,
  baseVersion: number,
): boolean {
  return reconcileCadSaveConflict(conflict, baseVersion) !== null;
}

/**
 * Texto de la barra de estado. Tiene que decir que el autosave está DETENIDO:
 * dejarlo en «conflicto» a secas mientras ya no se reintenta insinúa que algo
 * sigue trabajando de fondo, y no es verdad.
 */
export function cadSaveConflictLabel(conflict: CadSaveConflict): string {
  const server = conflict.serverVersion === null ? '' : ` · servidor v${conflict.serverVersion}`;
  return `Conflicto CAS${server} · autosave detenido`;
}
