/**
 * La sesión: quien CONDUCE el generador del evaluador.
 *
 * El evaluador cede el control cada vez que necesita algo del mundo (un punto,
 * un comando, una línea de texto en la pantalla). Alguien tiene que estar al
 * otro lado decidiendo qué contestar. Ese alguien es distinto en cada montaje:
 *
 *  - En una spec, un guion de respuestas preparadas.
 *  - En la golden headless, un anfitrión que aplica de verdad los comandos
 *    contra un `CadDocument`.
 *  - En el editor, la línea de comandos con su suscripción.
 *
 * Por eso la sesión no sabe responder: recibe un `LispResponder`.
 *
 * ## Por qué el conductor es SÍNCRONO
 *
 * Porque el evaluador ya es reanudable. Un anfitrión asíncrono no necesita que
 * este bucle sea `async`: necesita quedarse con el generador y llamar a `next`
 * cuando tenga la respuesta. `runLispSession` es el conductor para quien PUEDE
 * contestar en el acto —que es todo lo que se puede probar de forma
 * determinista— y `LispSession.start` entrega el generador crudo a quien no.
 *
 * ## El manejador `*error*`
 *
 * AutoLISP llama a `*error*` con el mensaje cuando algo falla. La sesión lo
 * hace DESPUÉS de haber decidido que el fallo es del programa: un corte por
 * presupuesto no pasa por `*error*`, porque entonces una rutina hostil tendría
 * un último trozo de código ejecutándose justo después de que se le acabara el
 * tiempo.
 */
import { LispAbort, LispQuit, failureText, isCatchable } from "./errors";
import { LispInterpreter, type LispInterpreterOptions } from "./evaluator";
import { printLisp } from "./printer";
import { readLispForms } from "./reader";
import {
  NIL,
  type LispEval,
  type LispRequest,
  type LispResponse,
  type LispValue,
} from "./values";

export interface LispResponder {
  /**
   * Contesta una petición. Devolver `{kind:"cancel"}` es el Esc del usuario: la
   * función que preguntaba devuelve `nil`, que es lo que AutoLISP hace y lo
   * que las rutinas comprueban con `(if (setq p (getpoint)) ... )`.
   */
  respond(request: LispRequest): LispResponse;
}

/** Responde a todo con nil. Sirve para evaluar código puro sin interacción. */
export const SILENT_RESPONDER: LispResponder = {
  respond: () => ({ kind: "value", value: NIL }),
};

export type LispFailureKind = "error" | "abort" | "quit";

export interface LispFailure {
  kind: LispFailureKind;
  message: string;
  /** Presente sólo cuando `kind` es `abort`: qué límite se agotó. */
  reason?: LispAbort["reason"];
}

export type LispRunResult =
  | { ok: true; value: LispValue; output: string }
  | { ok: false; failure: LispFailure; output: string };

export class LispSession {
  readonly interpreter: LispInterpreter;
  /** Todo lo que la rutina escribió, en orden de escritura. */
  private readonly written: string[] = [];

  constructor(options: LispInterpreterOptions) {
    this.interpreter = new LispInterpreter(options);
  }

  get output(): string {
    return this.written.join("");
  }

  /** Generador crudo para un anfitrión que no puede contestar en el acto. */
  start(source: string): LispEval {
    const forms = readLispForms(source);
    return this.interpreter.evaluateBody(forms);
  }

  startForms(forms: readonly LispValue[]): LispEval {
    return this.interpreter.evaluateBody(forms);
  }

  /**
   * Conduce un generador hasta el final, contestando con `responder`. Las
   * peticiones de ESCRITURA las atiende la propia sesión —son salida, no
   * pregunta— y además se pasan al responder por si el anfitrión quiere
   * pintarlas; así una spec puede afirmar sobre `session.output` sin montar
   * nada.
   */
  drive(generator: LispEval, responder: LispResponder): LispRunResult {
    try {
      let next = generator.next({ kind: "cancel" });
      while (!next.done) {
        const request = next.value;
        if (request.kind === "write") {
          this.written.push(request.text);
          responder.respond(request);
          next = generator.next({ kind: "value", value: NIL });
          continue;
        }
        next = generator.next(responder.respond(request));
      }
      return { ok: true, value: next.value, output: this.output };
    } catch (cause) {
      return { ok: false, failure: this.handleFailure(cause, responder), output: this.output };
    }
  }

  /** Lee, evalúa y conduce. El camino corriente. */
  run(source: string, responder: LispResponder = SILENT_RESPONDER): LispRunResult {
    let generator: LispEval;
    try {
      generator = this.start(source);
    } catch (cause) {
      // Un error de SINTAXIS no llega a evaluarse, así que no pasa por
      // `*error*`: no hay rutina en curso a la que avisar.
      return {
        ok: false,
        failure: { kind: "error", message: failureText(cause) },
        output: this.output,
      };
    }
    return this.drive(generator, responder);
  }

  /** Evalúa una sola expresión y devuelve su representación legible. */
  evaluateToText(source: string, responder: LispResponder = SILENT_RESPONDER): string {
    const result = this.run(source, responder);
    return result.ok ? printLisp(result.value) : result.failure.message;
  }

  /**
   * Traduce la excepción a un fallo, ejecutando `*error*` sólo cuando toca.
   * El manejador del usuario se conduce con el MISMO responder para que un
   * `*error*` que imprima siga imprimiendo — pero ya no puede pedir un punto,
   * porque para entonces el comando ha terminado.
   */
  private handleFailure(cause: unknown, responder: LispResponder): LispFailure {
    if (cause instanceof LispAbort)
      return { kind: "abort", message: cause.message, reason: cause.reason };
    if (cause instanceof LispQuit) return { kind: "quit", message: failureText(cause) };
    if (!isCatchable(cause)) {
      // Un fallo del anfitrión (no del programa LISP) se reporta como error sin
      // pasar por `*error*`: la rutina no lo causó y no puede repararlo.
      return { kind: "error", message: failureText(cause) };
    }

    const message = cause.message;
    if (this.interpreter.hasErrorHandler) {
      try {
        this.drive(this.interpreter.runErrorHandler(message), responder);
      } catch {
        // `handleFailure` no puede fallar: si el manejador del usuario se rompe,
        // el error que se reporta sigue siendo el ORIGINAL. Perderlo por un
        // `*error*` mal escrito convierte un fallo diagnosticable en un misterio.
      }
    }
    return { kind: "error", message };
  }
}

/**
 * Atajo: crea una sesión, evalúa y devuelve el resultado. Existe porque casi
 * todas las specs quieren exactamente esto y no la sesión en sí.
 */
export function runLispSource(
  source: string,
  options: LispInterpreterOptions,
  responder: LispResponder = SILENT_RESPONDER,
): LispRunResult {
  return new LispSession(options).run(source, responder);
}

/** Responder de guion: contesta en orden lo que se le dio, luego cancela. */
export class ScriptedResponder implements LispResponder {
  private index = 0;
  readonly seen: LispRequest[] = [];

  constructor(private readonly answers: readonly LispResponse[]) {}

  respond(request: LispRequest): LispResponse {
    this.seen.push(request);
    if (request.kind === "write" || request.kind === "alert")
      return { kind: "value", value: NIL };
    const answer = this.answers[this.index];
    this.index += 1;
    // Agotado el guion se CANCELA, que es lo que hace un usuario que se harta.
    // Repetir la última respuesta convertiría un guion corto en un bucle
    // infinito de una rutina que pide puntos hasta que le dicen que no.
    return answer ?? { kind: "cancel" };
  }

  get consumed(): number {
    return this.index;
  }
}
