/**
 * Migración de claves de `localStorage` tras el cambio de nombre de producto.
 *
 * Las preferencias locales (espacio de trabajo, historial de comandos, vistas
 * guardadas) se guardaban con un prefijo derivado del nombre anterior. Ese
 * prefijo no vive en el repositorio: vive en el navegador de cada persona que
 * ya usó el producto. Renombrar la clave sin más le devolvería los ajustes de
 * fábrica y perdería su historial, sin aviso y sin forma de recuperarlo.
 *
 * Regla única: se lee la clave nueva; si no existe, se lee la anterior, se
 * copia a la nueva y se borra la anterior. La lectura histórica ocurre una
 * sola vez por navegador y después desaparece por sí sola.
 */

/** Subconjunto de `Storage` que necesita la migración (testeable sin DOM). */
export interface RenamableStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Devuelve el valor de `currentKey`, migrando el de `legacyKey` si hace falta.
 * `null` si no hay ninguno. Cualquier fallo de almacenamiento (modo privado,
 * cuota) se traga: perder una preferencia nunca debe romper el editor.
 */
export function readRenamedStorageKey(
  storage: RenamableStorage,
  currentKey: string,
  legacyKey: string,
): string | null {
  try {
    const current = storage.getItem(currentKey);
    if (current !== null) return current;
    const legacy = storage.getItem(legacyKey);
    if (legacy === null) return null;
    storage.setItem(currentKey, legacy);
    storage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}
