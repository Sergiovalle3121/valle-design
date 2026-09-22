/**
 * Si el REGISTRO de la línea de comandos empieza plegado o desplegado.
 *
 * ## Por qué es un módulo aparte
 *
 * `CadCommandLine.tsx` es JSX y necesita un DOM para probarse de verdad
 * (`renderToStaticMarkup`, sin navegador). La REGLA — «F2 lo pliega y lo
 * despliega, y lo elegido sobrevive a la recarga» — no necesita ni React ni
 * DOM: es leer una cadena, decidir un booleano y, si se puede, guardarlo.
 * Separarla dos veces: la prueba corre con `tsx` puro (sin
 * `renderToStaticMarkup`) y el propio componente queda más corto.
 *
 * ## El defecto es PLEGADO
 *
 * Antes de esta ola el registro se pintaba siempre, a 96 px de alto, encima
 * del lienzo. Ese alto es exactamente lo que la franja acoplada de esta ola no
 * puede permitirse (`CAD_SHELL_METRICS.commandRow`, 26 px en reposo): un
 * registro que empezara desplegado se comería el lienzo otra vez, sólo que
 * ahora empujándolo en vez de flotar encima. Por eso el defecto —cuando no hay
 * nada guardado— es plegado, como la ventana de comandos de AutoCAD la
 * primera vez que se abre.
 *
 * Una preferencia corrupta o un almacenamiento bloqueado (modo privado, cuota
 * llena) no puede impedir escribir un comando: se cae al defecto en silencio.
 */

export const CAD_COMMAND_LOG_STORAGE_KEY = "valle_cad_command_log_expanded";

/** Lo mínimo que hace falta de `localStorage`; así la prueba no monta un DOM. */
export interface CadCommandLogStorage {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

/** Sin nada guardado, o con algo que no se puede leer: el registro nace plegado. */
export function readCommandLogExpanded(
  storage: CadCommandLogStorage | null | undefined,
): boolean {
  try {
    return storage?.getItem(CAD_COMMAND_LOG_STORAGE_KEY) === "1";
  } catch {
    // Un almacenamiento bloqueado no es un error del dibujo.
    return false;
  }
}

/** Persiste la elección. Falla en silencio si no hay almacenamiento que escribir. */
export function writeCommandLogExpanded(
  storage: CadCommandLogStorage | null | undefined,
  expanded: boolean,
): void {
  try {
    storage?.setItem?.(CAD_COMMAND_LOG_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* preferencia no persistida: el registro sigue funcionando en memoria */
  }
}

/** La reducción entera de F2: invierte lo que había. Sin estado oculto. */
export function toggleCommandLogExpanded(current: boolean): boolean {
  return !current;
}
