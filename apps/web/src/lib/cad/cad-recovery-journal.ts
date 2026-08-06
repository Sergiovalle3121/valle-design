/**
 * Decisiones del journal de recuperación, separadas de IndexedDB.
 *
 * POR QUÉ EXISTE ESTE FICHERO. Las dos reglas que deciden qué borrador se le
 * devuelve a alguien —cuál se elige y cuáles se tiran— vivían dentro de
 * funciones que abren una base de datos. En Node no hay IndexedDB, así que no
 * había forma de probarlas: la única cobertura era un E2E en navegador. Aquí
 * son funciones puras sobre una lista de registros.
 *
 * EL CARRIL POR PESTAÑA. El journal se indexa por ámbito (tenant, usuario,
 * dibujo), no por pestaña. Dos pestañas abiertas sobre el mismo dibujo escriben
 * en el mismo sitio, y como sólo se conservan unos pocos checkpoints por
 * ámbito, la que guarda más a menudo DESALOJA los de la otra. Al recuperar se
 * devolvía además el más reciente por reloj, que puede ser el de la otra
 * pestaña: alguien que cerró con su trabajo a medias recibía el borrador de una
 * ventana que ni recordaba tener abierta.
 *
 * La corrección es de contabilidad, no de interfaz: cada pestaña tiene su
 * carril, se poda POR CARRIL —así ninguna puede desalojar a otra— y al
 * recuperar se prefiere el carril propio. Los registros escritos antes de que
 * existieran los carriles no tienen `lane`; se tratan como un carril anónimo y
 * siguen siendo recuperables.
 */

/** Cuántos checkpoints se conservan por carril dentro de un ámbito. */
export const MAX_CHECKPOINTS_PER_LANE = 3;
/** Tope global del journal, para no crecer sin límite entre dibujos. */
export const MAX_GLOBAL_CHECKPOINTS = 24;
/** Un borrador deja de ofrecerse pasada una semana. */
export const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Carril de los registros anteriores a esta versión del journal. */
export const LEGACY_LANE = '-';

/** Lo mínimo que necesitan las decisiones; el registro real lleva más campos. */
export interface CadRecoveryJournalEntry {
  key: string;
  scopeKey: string;
  savedAtMs: number;
  lane?: string;
}

const laneOf = (entry: CadRecoveryJournalEntry) => entry.lane || LEGACY_LANE;
const newestFirst = (
  left: CadRecoveryJournalEntry,
  right: CadRecoveryJournalEntry,
) => right.savedAtMs - left.savedAtMs;

/** Agrupa por ámbito + carril, cada grupo ordenado del más nuevo al más viejo. */
function byScopeAndLane<T extends CadRecoveryJournalEntry>(
  entries: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    // Separador que no puede aparecer ni en el ámbito (percent-encoded) ni en
    // el carril (UUID), para que dos claves distintas no colisionen al unirse.
    const groupKey = `${entry.scopeKey}::${laneOf(entry)}`;
    const group = groups.get(groupKey) ?? [];
    group.push(entry);
    groups.set(groupKey, group);
  }
  for (const group of groups.values()) group.sort(newestFirst);
  return groups;
}

export interface CadRecoveryPruneOptions {
  now: number;
  /** Modo de emergencia por cuota: deja un solo checkpoint por carril. */
  aggressive?: boolean;
}

/**
 * Decide qué claves se borran. Devuelve las claves, no ejecuta nada: quien
 * llama las aplica en una transacción.
 *
 * La poda por edad y por carril es local a cada pestaña. El tope GLOBAL sí
 * cruza carriles —el journal no puede crecer sin fin—, pero se aplica después
 * de haber conservado lo más reciente de cada uno, así que una pestaña muy
 * activa no puede vaciar el carril de otra mientras ésta tenga algo reciente.
 */
export function planCadRecoveryPrune(
  entries: readonly CadRecoveryJournalEntry[],
  { now, aggressive = false }: CadRecoveryPruneOptions,
): string[] {
  const remove = new Set<string>();
  const perLaneLimit = aggressive ? 1 : MAX_CHECKPOINTS_PER_LANE;
  for (const group of byScopeAndLane(entries).values()) {
    group.forEach((entry, index) => {
      if (!Number.isFinite(entry.savedAtMs) || now - entry.savedAtMs > MAX_RECOVERY_AGE_MS)
        remove.add(entry.key);
      else if (index >= perLaneLimit) remove.add(entry.key);
    });
  }
  // Reparto justo del tope global: se toma una ronda por carril (el más nuevo
  // de cada uno), luego la segunda, y así. Ordenar la lista entera por reloj
  // dejaría fuera carriles enteros cuando una pestaña guarda mucho más rápido.
  const lanes = [...byScopeAndLane(entries.filter((entry) => !remove.has(entry.key))).values()];
  const fairOrder: CadRecoveryJournalEntry[] = [];
  for (let round = 0; round < perLaneLimit; round += 1) {
    const roundEntries = lanes
      .map((lane) => lane[round])
      .filter((entry): entry is CadRecoveryJournalEntry => Boolean(entry))
      .sort(newestFirst);
    fairOrder.push(...roundEntries);
  }
  fairOrder.slice(MAX_GLOBAL_CHECKPOINTS).forEach((entry) => remove.add(entry.key));
  return [...remove];
}

/**
 * Orden en que se intentan los candidatos de un ámbito al recuperar.
 *
 * Primero el carril propio, del más nuevo al más viejo; después el resto. Quien
 * reabre una pestaña espera SU borrador, no el de otra ventana que casualmente
 * guardó un segundo más tarde. Se devuelve una lista y no un único registro
 * porque el que carga descarta los que no superan la verificación de hash y
 * sigue con el siguiente (PR #22).
 */
export function orderCadRecoveryCandidates<T extends CadRecoveryJournalEntry>(
  entries: readonly T[],
  lane: string,
): T[] {
  const own: T[] = [];
  const others: T[] = [];
  for (const entry of entries) (laneOf(entry) === lane ? own : others).push(entry);
  own.sort(newestFirst);
  others.sort(newestFirst);
  return [...own, ...others];
}
