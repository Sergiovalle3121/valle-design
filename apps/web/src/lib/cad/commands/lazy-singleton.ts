/**
 * Un valor cargado una vez de forma perezosa, con memoización que SOBREVIVE al
 * éxito y SE LIMPIA en el rechazo. Extraído de `lazy.ts` (T-72e): sin el
 * `catch` que limpia `pending`, un chunk caído deja la promesa RECHAZADA en
 * caché para siempre y ningún reintento vuelve a llamar al cargador — sólo
 * recargar la página lo arregla.
 */
export function createLazySingleton<T>(load: () => Promise<T>): {
  get: () => Promise<T>;
  loadedValue: () => T | null;
} {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      pending ??= load()
        .then((value) => {
          loaded = value;
          return value;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
      return pending;
    },
    loadedValue(): T | null {
      return loaded;
    },
  };
}
