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
 * ## Lo que falta, y está dicho donde toca
 *
 * - Montarlo en la línea de comandos del editor (`Layout3DEditor.tsx`,
 *   `components/cad/command-line/`). Fuera del alcance de la sesión que lo
 *   escribió; `routine.ts` deja el enganche en una llamada.
 * - Persistir la biblioteca por organización: necesita un endpoint
 *   `/v1/cad/*`. La lógica está entera detrás de un puerto (`library.ts`).
 * - `command` no deja un comando ACTIVO esperando al usuario, y el diálogo DCL
 *   funciona por un viaje en vez de reaccionar en vivo. Los dos límites tienen
 *   su explicación en el módulo correspondiente y su spec.
 */
export { DEFAULT_LISP_BUDGET, LispMeter, type LispBudgetLimits } from "./budget";
export { CAD_LISP_BUILTINS, createCadLispBuiltins } from "./cad-builtins";
export { CORE_LISP_BUILTINS, createCoreLispBuiltins } from "./core-builtins";
export { CadDocumentLispHost, type CadLispHostOptions } from "./document-host";
export { LispAbort, LispError, LispQuit, failureText } from "./errors";
export { LispInterpreter, type LispInterpreterOptions } from "./evaluator";
export type { LispHostServices } from "./host";
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
