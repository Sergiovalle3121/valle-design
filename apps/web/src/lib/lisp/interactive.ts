/**
 * La ejecución REANUDABLE: la pieza que faltaba para enchufar el intérprete.
 *
 * `session.ts` ya lo dijo con todas las letras: el conductor síncrono
 * (`LispSession.drive`) sirve para quien PUEDE contestar en el acto —una spec,
 * la golden headless—, y quien no puede recibe el generador crudo con
 * `LispSession.start`. El editor es exactamente ese «quien no puede»: cuando la
 * rutina llama a `getpoint`, la respuesta llega tres eventos de teclado después.
 *
 * Este módulo es ese anfitrión, escrito UNA vez y en el subsistema en vez de en
 * la interfaz. Que viva aquí y no en `components/` tiene dos consecuencias que
 * se notan:
 *
 *  - Se prueba en Node, sin navegador. Una máquina de estados que sólo se puede
 *    ejercitar montando React no se ejercita.
 *  - La interfaz no toca el generador. La línea de comandos ve `ask` / `done` /
 *    `failed` y nada más; no puede olvidarse de un `next`, ni conducir dos veces
 *    el mismo turno, ni reanudar una rutina abortada.
 *
 * ## Por qué la salida de escritura y la pregunta son cosas distintas
 *
 * El evaluador cede el control tanto para PREGUNTAR («precise un punto») como
 * para ESCRIBIR (`princ`). Escribir no necesita al usuario: se acumula y se
 * sigue. Sólo las peticiones que de verdad esperan una respuesta humana
 * suspenden el turno. Sin esa distinción, cada `(princ "…")` de una rutina
 * pararía el comando y pediría un Enter.
 *
 * ## Por qué el manejador `*error*` se ejecuta AQUÍ y no en `LispSession`
 *
 * `LispSession.handleFailure` es privado y llama a `drive`, que es el conductor
 * que no puede suspenderse. Un `*error*` que preguntase colgaría ese conductor.
 * Aquí se ejecuta con el mismo criterio que la sesión —sólo para errores del
 * PROGRAMA, nunca para un corte de presupuesto— y sus peticiones se contestan
 * con `nil`: para cuando `*error*` corre, el comando ya terminó y no hay
 * usuario a quien preguntar.
 */
import type { CadDocument } from "../cad/cad-document";
import type { CadEntityCommand } from "../cad/entity-commands";
import type { CadVariableAccess } from "../cad/system-variables";
import type { LispBudgetLimits } from "./budget";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { LispAbort, LispQuit, failureText, isCatchable } from "./errors";
import { LispSession, type LispFailure } from "./session";
import { NIL, type LispEval, type LispRequest, type LispResponse, type LispValue } from "./values";

/** Las peticiones que de verdad esperan a una persona. */
export type LispAsk = Extract<
  LispRequest,
  | { kind: "prompt-point" }
  | { kind: "prompt-number" }
  | { kind: "prompt-string" }
  | { kind: "prompt-keyword" }
  | { kind: "prompt-angle" }
  | { kind: "prompt-distance" }
  | { kind: "prompt-corner" }
  | { kind: "prompt-selection" }
  | { kind: "dialog" }
>;

export function isLispAsk(request: LispRequest): request is LispAsk {
  return request.kind !== "write" && request.kind !== "alert" && request.kind !== "command";
}

/** El resultado de un turno. Sólo hay tres, y la interfaz los trata a los tres. */
export type LispTurn =
  | { kind: "ask"; ask: LispAsk }
  | { kind: "done"; value: LispValue }
  | { kind: "failed"; failure: LispFailure };

export interface InteractiveLispOptions {
  /** Documento sobre el que corre. No se muta: se trabaja sobre una copia. */
  document: CadDocument;
  /** Ficheros a cargar ANTES de invocar, en orden de carga. */
  sources?: readonly string[];
  activeLayer?: string;
  newEntityId?: () => string;
  limits?: LispBudgetLimits;
  now?: () => number;
  /**
   * La tabla de variables de sistema DE LA SESIÓN del editor. Quien no la
   * presta recibe una propia, sembrada con el documento y que vive lo que vive
   * la ejecución: `(getvar "OSMODE")` no vería entonces lo que el dibujante
   * configuró con OSNAP. Ver `CadLispHostOptions.variables`.
   */
  variables?: CadVariableAccess;
  /**
   * Pizarra de la sesión: por aquí entran el registro de comandos compuesto y
   * el lector de la biblioteca que usa `load`. Va como `unknown` porque el
   * evaluador no debe conocer ninguno de los dos.
   */
  state?: Iterable<readonly [string, unknown]>;
  /**
   * Globales que sobreviven de la evaluación anterior. Se siembran ANTES de
   * cargar los ficheros para que un `.lsp` recién cargado siempre gane: si se
   * sembrasen después, una variable tecleada en el prompt taparía la función
   * que el fichero acaba de definir con ese nombre.
   */
  seedGlobals?: Iterable<readonly [string, LispValue]>;
}

/**
 * Una ejecución en curso. Se crea, se arranca y se le contesta hasta que
 * termina; no se reutiliza. El estado vivo es el generador, y un objeto que
 * envuelve un generador no se puede rebobinar — así que tampoco se finge que
 * pueda.
 */
export class InteractiveLispRun {
  readonly host: CadDocumentLispHost;
  /** Última pregunta emitida. La interfaz la necesita para traducir la respuesta. */
  pending: LispAsk | null = null;
  private readonly session: LispSession;
  private generator: LispEval | null = null;
  private finished = false;
  private readonly writes: string[] = [];

  constructor(private readonly options: InteractiveLispOptions) {
    this.host = new CadDocumentLispHost(options.document, {
      activeLayer: options.activeLayer,
      newEntityId: options.newEntityId,
      ...(options.variables ? { variables: options.variables } : {}),
    });
    this.session = new LispSession({
      builtins: CAD_LISP_BUILTINS,
      host: this.host,
      limits: options.limits,
      now: options.now,
      state: options.state,
    });
    for (const [name, value] of options.seedGlobals ?? [])
      this.session.interpreter.scope.set(name.toUpperCase(), value);
  }

  /** Todo lo que la rutina escribió, en orden. */
  get output(): string {
    return this.writes.join("");
  }

  /** El lote COMPLETO, para `commitNativeCommands`: un solo paso de deshacer. */
  get commands(): readonly CadEntityCommand[] {
    return this.host.pendingCommands;
  }

  /** Documento de trabajo. El bueno lo produce el anfitrión al aplicar el lote. */
  get document(): CadDocument {
    return this.host.document();
  }

  /** Nombres que la sesión definió, para inspeccionarlos y para arrastrarlos. */
  globals(): Map<string, LispValue> {
    const scope = this.session.interpreter.scope;
    return new Map(scope.ownNames().map((name) => [name, scope.get(name)]));
  }

  /**
   * Carga los ficheros y arranca la invocación.
   *
   * Un fichero que falla al cargarse ABORTA el turno entero, como en
   * `runLispRoutine`: invocar después daría «no function definition», que es un
   * error cierto y completamente inútil para quien tiene que arreglarlo.
   *
   * Los ficheros se cargan SIN interacción. Un `.lsp` que pregunta en su cuerpo
   * de nivel superior —no dentro de un `defun`— es patológico: preguntaría cada
   * vez que se teclea cualquier comando LISP, porque la biblioteca se recarga en
   * cada invocación. Se le contesta que no y queda dicho aquí.
   */
  start(invoke: string): LispTurn {
    for (const source of this.options.sources ?? []) {
      const loaded = this.session.run(source);
      if (!loaded.ok) {
        this.pushSessionOutput();
        this.finished = true;
        return { kind: "failed", failure: loaded.failure };
      }
    }
    // Lo que escribieron las cargas se traspasa AQUÍ, de una vez y antes de que
    // la invocación escriba nada: así `output` es una sola cadena en orden y no
    // hay dos contadores que puedan descuadrarse.
    this.pushSessionOutput();

    let generator: LispEval;
    try {
      generator = this.session.start(invoke);
    } catch (cause) {
      // Un error de SINTAXIS no llega a evaluarse: no hay rutina en curso a la
      // que avisar, así que no pasa por `*error*`.
      this.finished = true;
      return { kind: "failed", failure: { kind: "error", message: failureText(cause) } };
    }
    this.generator = generator;
    return this.pump(() => generator.next({ kind: "cancel" }));
  }

  /** Contesta la última pregunta y sigue hasta la siguiente, o hasta el final. */
  answer(response: LispResponse): LispTurn {
    const generator = this.generator;
    if (!generator || this.finished)
      return {
        kind: "failed",
        failure: { kind: "error", message: "No hay ninguna rutina LISP esperando respuesta." },
      };
    return this.pump(() => generator.next(response));
  }

  /**
   * Corte externo: el usuario pulsó Esc o el anfitrión se desmonta.
   *
   * Envenena el medidor en vez de limitarse a soltar el generador. Soltarlo
   * dejaría una rutina reanudable por cualquiera que conservase la referencia;
   * envenenado, el siguiente cargo lanza y no hay forma de seguir.
   */
  cancel(message = "La rutina LISP se canceló."): LispTurn {
    this.session.interpreter.meter.cancel(message);
    this.finished = true;
    return { kind: "failed", failure: { kind: "abort", message, reason: "cancelled" } };
  }

  get done(): boolean {
    return this.finished;
  }

  /**
   * Avanza el generador atendiendo lo que no necesita usuario y parando en lo
   * que sí. Es el corazón del módulo y cabe en veinte líneas justamente porque
   * el evaluador ya es reanudable.
   */
  private pump(first: () => IteratorResult<LispRequest, LispValue>): LispTurn {
    const generator = this.generator;
    if (!generator) return { kind: "failed", failure: { kind: "error", message: "Sin rutina." } };
    try {
      let next = first();
      while (!next.done) {
        const request = next.value;
        if (request.kind === "write") {
          this.writes.push(request.text);
          next = generator.next({ kind: "value", value: NIL });
          continue;
        }
        if (request.kind === "alert") {
          // Un `alert` es salida, no pregunta: en AutoCAD abre un cuadro con un
          // único botón. Se registra con su marca para que la consola lo
          // distinga de un `princ`, y la rutina sigue.
          this.writes.push(`\n[alerta] ${request.text}\n`);
          next = generator.next({ kind: "value", value: NIL });
          continue;
        }
        if (request.kind === "command") {
          // Reservada para la API de plugins. Este anfitrión no la despacha:
          // `(command …)` de LISP ya sale por `host.apply`, y atender aquí una
          // segunda ruta de mutación sería exactamente lo que el subsistema
          // prohíbe. Se contesta que no en vez de ignorarla en silencio.
          throw new Error(
            `El anfitrión no despacha peticiones "command" sueltas (${request.name}); ` +
              `las mutaciones salen por la única puerta del anfitrión.`,
          );
        }
        this.pending = request;
        return { kind: "ask", ask: request };
      }
      this.finished = true;
      return { kind: "done", value: next.value };
    } catch (cause) {
      this.finished = true;
      return { kind: "failed", failure: this.handleFailure(cause) };
    }
  }

  /**
   * Traduce la excepción a un fallo, ejecutando `*error*` sólo cuando toca.
   *
   * Un corte por presupuesto NO pasa por `*error*`: si pasara, una rutina hostil
   * tendría un último trozo de código ejecutándose justo después de que se le
   * acabara el tiempo. Es la misma regla que aplica `LispSession`, escrita aquí
   * porque allí es privada y llama al conductor que no puede suspenderse.
   */
  private handleFailure(cause: unknown): LispFailure {
    if (cause instanceof LispAbort)
      return { kind: "abort", message: cause.message, reason: cause.reason };
    if (cause instanceof LispQuit) return { kind: "quit", message: failureText(cause) };
    if (!isCatchable(cause)) return { kind: "error", message: failureText(cause) };

    const message = cause.message;
    if (this.session.interpreter.hasErrorHandler) {
      try {
        const handler = this.session.interpreter.runErrorHandler(message);
        let next = handler.next({ kind: "cancel" });
        while (!next.done) {
          const request = next.value;
          if (request.kind === "write") this.writes.push(request.text);
          // A `*error*` no se le pregunta nada: el comando ya terminó y no hay
          // usuario a quien preguntar. Se le deja imprimir, que es lo que hacen
          // los manejadores reales, y a todo lo demás se le contesta que no.
          next = handler.next({ kind: "cancel" });
        }
      } catch {
        // El fallo que se reporta sigue siendo el ORIGINAL. Perderlo por un
        // `*error*` mal escrito convierte un error diagnosticable en un misterio.
      }
    }
    return { kind: "error", message };
  }

  /** Traspasa lo que escribieron las cargas. Se llama UNA vez, antes del pump. */
  private pushSessionOutput(): void {
    const text = this.session.output;
    if (text) this.writes.push(text);
  }
}
