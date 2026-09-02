/**
 * El intérprete de frases (parser y ejecutor del registro heredado), cargado
 * cuando se teclea la primera frase y no al abrir el estudio.
 *
 * Medido el 2026-09-02 con source maps sobre el build de producción: el
 * parser pesaba 29 KB del primer chunk del estudio y ningún golden lo toca
 * hasta que alguien escribe en la barra de frases. El REGISTRO se queda
 * estático a propósito: la asistencia de la línea de comandos y la paleta
 * Cmd-K lo leen al abrir para proponer frases.
 *
 * `cadNlCommandsIfLoaded` existe para el `apply` síncrono del editor: una
 * previsualización sólo puede existir después de que `loadCadNlCommands`
 * haya resuelto, así que cuando hay algo que aplicar el módulo ya está aquí;
 * si no lo estuviera, el editor lo dice en vez de fingir que aplicó.
 */
export type CadNlCommands = typeof import("./parser") & typeof import("./executor");

let loaded: CadNlCommands | null = null;
let pending: Promise<CadNlCommands> | null = null;

export function loadCadNlCommands(): Promise<CadNlCommands> {
  pending ??= Promise.all([import("./parser"), import("./executor")]).then(([parser, executor]) => {
    loaded = { ...parser, ...executor };
    return loaded;
  });
  return pending;
}

export function cadNlCommandsIfLoaded(): CadNlCommands | null {
  return loaded;
}
