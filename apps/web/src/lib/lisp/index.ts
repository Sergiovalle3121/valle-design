/**
 * El subsistema AutoLISP de Valle Design: puerta de entrada.
 *
 * ## Por qué existe
 *
 * Un veterano de AutoCAD no cambia de herramienta si pierde las rutinas `.lsp`
 * que lleva años escribiendo —cajetines, numeración de ejes, exportadores a
 * Excel, comprobaciones de norma—. Ninguna funcionalidad de dibujo compra eso.
 *
 * ## Cómo se monta
 *
 * Todo pasa por `runLispRoutine`: se le da el documento, los fuentes a cargar y
 * lo que se teclea, y devuelve el lote de `CadEntityCommand` que el anfitrión
 * aplica con `commitNativeCommands`. Un paso de deshacer por rutina.
 *
 *     const run = runLispRoutine({
 *       document,                                   // el CadDocument cargado
 *       sources: autoloadSources(store, tenantId),  // la biblioteca del estudio
 *       invoke: "(c:cajetin)",                      // lo que tecleó el usuario
 *       responder,                                  // quien contesta a getpoint
 *     });
 *     if (run.ok && run.commands.length) commitNativeCommands([...run.commands]);
 *
 * ## Las cuatro reglas del subsistema
 *
 * 1. **Una sola ruta de mutación.** `entmake`, `entmod`, `entdel`, `command` y
 *    la API de plugins salen todos por `LispHostServices.apply`, que recibe
 *    comandos canónicos. No hay una segunda puerta y no se puede añadir sin que
 *    se vea en el diff de `host.ts`.
 * 2. **El sandbox no se puede capturar.** `vl-catch-all-apply` atrapa los
 *    errores del programa y NO el corte por presupuesto: un límite que el
 *    código medido puede ignorar no es un límite.
 * 3. **Se dice que no en vez de mentir.** Lo que el traductor DXF no sabe
 *    construir sin perder estado se rechaza nombrando el tipo; un filtro de
 *    `ssget` con operadores lógicos se rechaza en vez de aplicarse a medias; y
 *    `setvar` se rechaza entero en vez de aceptar y no aplicar.
 * 4. **El intérprete no alcanza nada del anfitrión.** Ni red, ni DOM, ni el
 *    `eval` de JavaScript, ni Node. `sandbox-surface.spec.ts` lo comprueba
 *    sobre el código fuente y publica la lista completa de dependencias
 *    externas en cada corrida.
 *
 * ## Cómo se ENCHUFA al editor (ola 4)
 *
 * `runLispRoutine` sirve para quien puede contestar en el acto. El editor no
 * puede: cuando la rutina llama a `getpoint`, la respuesta llega tres eventos de
 * teclado después. Para eso está `InteractiveLispRun` (`interactive.ts`), que
 * conduce el generador por turnos —`ask` / `done` / `failed`— y es lo que usa
 * `components/cad/lisp/`.
 *
 * Allí, cada `(defun c:MICOMANDO …)` se convierte en un descriptor del motor de
 * comandos y entra en el MISMO registro que los 63 nativos, así que su geometría
 * sale por el efecto `execute` del motor y acaba en `commitNativeCommands`: un
 * lote, un `commitChange`, UN paso de deshacer, la disciplina CAS heredada por
 * construcción.
 *
 * ## Lo que sigue faltando, y está dicho donde toca
 *
 * - Persistir la biblioteca EN EL SERVIDOR: necesita un endpoint
 *   `/v1/cad/lisp/*`. El puerto (`library.ts`) tiene hoy dos implementaciones:
 *   memoria, y el almacén del navegador que vive en el anfitrión
 *   (`components/cad/lisp/library-storage.ts`) porque el intérprete no puede
 *   tocar el navegador.
 * - `command` no deja un comando ACTIVO esperando al usuario, y el diálogo DCL
 *   todavía no se pinta: el anfitrión lo recibe y lo trata como cancelado, que es
 *   un camino que las rutinas ya manejan. Los tres límites tienen su explicación
 *   en el módulo correspondiente y su spec.
 * - Una rutina puede INSERTAR un bloque pero no DEFINIRLO: el vocabulario
 *   canónico de mutación no tiene esa orden y el subsistema no se lo salta.
 */
export { DEFAULT_LISP_BUDGET, LispMeter, type LispBudgetLimits } from "./budget";
export { CAD_LISP_BUILTINS, createCadLispBuiltins } from "./cad-builtins";
export { CORE_LISP_BUILTINS, createCoreLispBuiltins } from "./core-builtins";
export { CadDocumentLispHost, type CadLispHostOptions } from "./document-host";
export { LispAbort, LispError, LispQuit, failureText } from "./errors";
export { LispInterpreter, type LispInterpreterOptions } from "./evaluator";
export type { LispHostServices } from "./host";
export {
  InteractiveLispRun,
  isLispAsk,
  type InteractiveLispOptions,
  type LispAsk,
  type LispTurn,
} from "./interactive";
export {
  LIBRARY_READER,
  normalizeLispFileName,
  type LispLibraryReader,
} from "./builtins/loader";
export {
  InMemoryLispLibraryStore,
  autoloadOrder,
  commandInventory,
  fingerprintLispSource,
  removeLispFile,
  uploadLispFile,
  validateLispSource,
  type LispLibraryFile,
  type LispLibraryStore,
} from "./library";
export { printLisp } from "./printer";
export { LispSyntaxError, readLispForm, readLispForms } from "./reader";
export { autoloadSources, runLispRoutine, type LispRoutineRequest, type LispRoutineResult } from "./routine";
export {
  LispSession,
  SILENT_RESPONDER,
  ScriptedResponder,
  runLispSource,
  type LispFailure,
  type LispResponder,
  type LispRunResult,
} from "./session";
export { wcmatch } from "./wcmatch";
export { parseDcl, type DclDialog } from "./dcl/parser";
export {
  CadPluginRegistry,
  createPluginDocumentApi,
  type CadPlugin,
  type PluginDocumentApi,
  type PluginPanel,
} from "./plugins/api";
export { COMMAND_REGISTRY as LISP_COMMAND_REGISTRY_SLOT } from "./builtins/interaction";
export type {
  LispDialogTile,
  LispRequest,
  LispResponse,
  LispValue,
} from "./values";
