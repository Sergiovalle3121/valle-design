/**
 * APPLOAD: lo que pasa entre el selector de fichero del navegador y la
 * biblioteca.
 *
 * ## Por qué esto no vive dentro del componente
 *
 * Porque es la pieza que convierte «tenemos AutoLISP» en «puedo traerme mis
 * rutinas», y eso hay que poder PROBARLO. Dentro de un manejador de React sólo
 * se prueba montando un DOM; aquí se prueba con un objeto de dos campos, que es
 * exactamente lo que la especificación de `File` promete que el navegador
 * entrega: un nombre y un `text()`.
 *
 * El componente se queda con lo que es suyo —abrir el diálogo, vaciar el input
 * para que volver a elegir el MISMO fichero dispare otro `change`— y esto se
 * queda con lo que decide si el despacho puede mudarse.
 *
 * ## Lee UNO A UNO, a propósito
 *
 * Cargar veinte `.lsp` en paralelo con `Promise.all` sería más rápido y dejaría
 * el orden de la biblioteca a merced de qué fichero terminó antes de leerse. El
 * orden importa: una rutina puede llamar a una función definida en otro fichero,
 * y la última versión de un comando `c:` repetido es la que gana. Se leen en el
 * orden en que el usuario los eligió, que es el único que él puede predecir.
 *
 * ## Un fichero que falla NO detiene a los demás
 *
 * Si el tercero de cinco tiene un paréntesis sin cerrar, los otros cuatro se
 * cargan y el tercero se reporta con su nombre. Abortar el lote entero por uno
 * obligaría a repetir la selección completa para averiguar cuál era.
 */
import type { CadLispRuntime } from "./lisp-runtime";

/**
 * Lo que se necesita de un `File` del navegador, y nada más.
 *
 * `File` real cumple esta forma; una spec puede fabricarla en dos líneas. Es la
 * misma razón por la que `library-storage.ts` recibe un puerto de cuatro
 * métodos en vez de `localStorage`.
 */
export interface PickedLispFile {
  name: string;
  text(): Promise<string>;
}

export interface AppLoadOutcome {
  /** Ficheros que quedaron en la biblioteca, con los comandos que aportan. */
  loaded: { name: string; commands: readonly string[] }[];
  /** Los que no, con el motivo. Siempre con el nombre del fichero delante. */
  failed: { name: string; problem: string }[];
}

export async function loadPickedLispFiles(
  runtime: CadLispRuntime,
  files: Iterable<PickedLispFile>,
): Promise<AppLoadOutcome> {
  const outcome: AppLoadOutcome = { loaded: [], failed: [] };
  for (const file of files) {
    let source: string;
    try {
      source = await file.text();
    } catch (cause) {
      // No poder LEER del disco es distinto de que el contenido esté mal, y se
      // dice distinto: el usuario tiene que saber si arreglar el fichero o
      // volver a elegirlo.
      const problem = `no se pudo leer del disco (${cause instanceof Error ? cause.message : String(cause)})`;
      runtime.log("error", `${file.name}: ${problem}.`, "APPLOAD");
      outcome.failed.push({ name: file.name, problem });
      continue;
    }
    const result = runtime.load(file.name, source);
    if (result.ok && result.file)
      outcome.loaded.push({ name: result.file.name, commands: result.file.commands });
    else outcome.failed.push({ name: file.name, problem: result.problem ?? "no se pudo cargar" });
  }
  return outcome;
}
