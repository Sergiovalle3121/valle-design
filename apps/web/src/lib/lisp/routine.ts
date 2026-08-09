/**
 * Ejecutar una rutina de principio a fin. Es la función que el editor llamará.
 *
 * Junta las cinco piezas en el orden correcto —biblioteca, sesión, anfitrión,
 * conductor, lote— y devuelve lo único que el anfitrión necesita para cerrar:
 * los `CadEntityCommand` que la rutina produjo, para pasarlos por
 * `commitNativeCommands` en UNA transacción.
 *
 * Existe como módulo propio para que enganchar el subsistema a la línea de
 * comandos sea una llamada, y no un procedimiento de cinco pasos que cada
 * anfitrión reinvente a su manera. La parte que falta —montarlo en el editor—
 * está fuera del alcance de esta sesión (toca `Layout3DEditor.tsx`), y por eso
 * esta función se prueba de extremo a extremo sin navegador: carga ficheros,
 * ejecuta, aplica, serializa el documento y lo vuelve a leer.
 *
 * ## Qué NO decide esta función
 *
 * No decide el presupuesto (lo pasa quien llama), no decide cómo se contestan
 * las preguntas (eso es el `LispResponder`) y no guarda nada. Aplicar el lote y
 * hablar con el servidor es del anfitrión: aquí acabaría duplicada la
 * disciplina CAS, que es exactamente lo que no puede haber dos veces.
 */
import type { CadDocument } from "../cad/cad-document";
import type { CadEntityCommand } from "../cad/entity-commands";
import type { LispBudgetLimits } from "./budget";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { autoloadOrder, type LispLibraryStore } from "./library";
import { LispSession, SILENT_RESPONDER, type LispFailure, type LispResponder } from "./session";
import type { LispValue } from "./values";

export interface LispRoutineRequest {
  /** Documento sobre el que corre la rutina. No se muta. */
  document: CadDocument;
  /** Ficheros a cargar ANTES de invocar, en orden. */
  sources?: readonly string[];
  /** Lo que se teclea: `(c:cajetin)`, o cualquier expresión. */
  invoke: string;
  responder?: LispResponder;
  activeLayer?: string;
  newEntityId?: () => string;
  limits?: LispBudgetLimits;
  now?: () => number;
}

export interface LispRoutineResult {
  ok: boolean;
  /** Valor devuelto por la invocación, si terminó bien. */
  value?: LispValue;
  failure?: LispFailure;
  /** Lo que la rutina escribió por pantalla. */
  output: string;
  /**
   * El lote COMPLETO, para `commitNativeCommands`. Vacío si la rutina no tocó
   * el dibujo — y entonces el anfitrión no debe abrir un paso de deshacer.
   */
  commands: readonly CadEntityCommand[];
  /**
   * Documento de trabajo resultante. Sirve para previsualizar y para las
   * pruebas; el documento BUENO lo produce el anfitrión al aplicar el lote,
   * porque es él quien lleva la versión y el CAS.
   */
  document: CadDocument;
  /** Etiqueta sugerida para el paso de deshacer. */
  label: string;
}

/**
 * Carga los ficheros indicados y evalúa la invocación.
 *
 * Un fichero que falla al cargarse ABORTA: si `cajetin.lsp` no se pudo leer,
 * invocar `(c:cajetin)` daría «no function definition», que es un error cierto
 * y completamente inútil para quien tiene que arreglarlo.
 */
export function runLispRoutine(request: LispRoutineRequest): LispRoutineResult {
  const host = new CadDocumentLispHost(request.document, {
    activeLayer: request.activeLayer,
    newEntityId: request.newEntityId,
  });
  const session = new LispSession({
    builtins: CAD_LISP_BUILTINS,
    host,
    limits: request.limits,
    now: request.now,
  });
  const responder = request.responder ?? SILENT_RESPONDER;
  const label = `LISP ${request.invoke.slice(0, 60)}`;

  for (const source of request.sources ?? []) {
    const loaded = session.run(source, responder);
    if (!loaded.ok)
      return {
        ok: false,
        failure: loaded.failure,
        output: session.output,
        commands: [],
        document: host.document(),
        label,
      };
  }

  const result = session.run(request.invoke, responder);
  return {
    ok: result.ok,
    ...(result.ok ? { value: result.value } : { failure: result.failure }),
    output: session.output,
    // Una rutina que FALLÓ puede haber escrito antes de fallar. El lote se
    // devuelve igualmente y es el anfitrión quien decide: aplicarlo deja el
    // trabajo hecho hasta el fallo (que es lo que hace AutoCAD), descartarlo
    // deja el dibujo intacto. Decidirlo aquí le quitaría la elección.
    commands: host.pendingCommands,
    document: host.document(),
    label,
  };
}

/**
 * Ficheros que una organización carga sola al abrir. Se expone aquí para que el
 * anfitrión no tenga que conocer el módulo de biblioteca: pide los fuentes y
 * los pasa como `sources`.
 */
export function autoloadSources(store: LispLibraryStore, tenantId: string): string[] {
  return autoloadOrder(store, tenantId).map((file) => file.source);
}
