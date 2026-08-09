/**
 * El presupuesto: lo que impide que la rutina de un tercero se lleve por
 * delante el editor.
 *
 * ## Qué se mide, y por qué cada cosa
 *
 * **Pasos** (`maxSteps`). Una evaluación es un paso. Corta el bucle infinito
 * que no asigna nada: `(while T)`. Sin este contador, un `while` vacío gira
 * para siempre sin tocar la memoria y ningún otro límite lo ve.
 *
 * **Celdas** (`maxCells`). Toda asignación de memoria del intérprete —una celda
 * cons, un carácter de una cadena nueva, un elemento de un conjunto de
 * selección— consume presupuesto de celdas. Corta la lista de diez millones de
 * elementos ANTES de que exista, no después de que el navegador se quede sin
 * memoria: cuando ya no hay memoria, el aviso no llega a pintarse.
 *
 * Cargar las CADENAS por su longitud no es un detalle. `(repeat 30 (setq s
 * (strcat s s)))` son treinta pasos y treinta celdas contando concatenaciones,
 * y mil millones de caracteres. Cobrar por carácter es lo único que lo ve.
 *
 * **Profundidad** (`maxDepth`). La recursión infinita —`(defun f () (f))`—
 * agota la pila de JavaScript, y un `RangeError` de pila puede dejar al
 * anfitrión a medio camino de una transacción. Se corta ANTES, con un contador
 * propio, para que el fallo sea nuestro y diga qué pasó.
 *
 * **Tiempo** (`maxMillis`). El respaldo honesto: hay trabajo que consume pocos
 * pasos y mucho reloj (un `ssget` sobre 100k entidades dentro de un bucle). El
 * reloj se INYECTA para que las specs sean deterministas; el anfitrión pasa
 * `Date.now`.
 *
 * ## Lo que este módulo NO hace
 *
 * No sabe de red, ni de DOM, ni de `eval`. Eso no se limita con un contador: se
 * limita no dándole al intérprete ninguna forma de alcanzarlos. El subsistema
 * entero no importa nada del navegador, y `sandbox-surface.spec.ts` lo
 * comprueba leyendo el código fuente — porque un comentario que promete que
 * nadie llamará a `fetch` no es una garantía.
 */
import { LispAbort } from "./errors";

export interface LispBudgetLimits {
  /** Evaluaciones. Por defecto 2.000.000: una rutina seria cabe de sobra. */
  maxSteps: number;
  /** Celdas y caracteres asignados. Por defecto 4.000.000. */
  maxCells: number;
  /** Marcos de llamada anidados. Por defecto 400. */
  maxDepth: number;
  /** Milisegundos de reloj. Por defecto 5.000. */
  maxMillis: number;
}

export const DEFAULT_LISP_BUDGET: LispBudgetLimits = {
  maxSteps: 2_000_000,
  maxCells: 4_000_000,
  maxDepth: 400,
  maxMillis: 5_000,
};

/**
 * Cada cuántos pasos se mira el reloj. Llamar a `Date.now()` en cada paso
 * costaría más que evaluar el paso; 4096 mantiene la latencia del corte por
 * debajo de lo que un humano percibe sin que el contador domine el coste.
 */
const CLOCK_STRIDE = 4096;

export interface LispBudgetSnapshot {
  steps: number;
  cells: number;
  depth: number;
  peakDepth: number;
  elapsedMillis: number;
}

export class LispMeter {
  private steps = 0;
  private cells = 0;
  private depth = 0;
  private peak = 0;
  private started: number;
  private lastClockStep = 0;
  private elapsed = 0;
  /**
   * Una vez agotado, el medidor queda ENVENENADO: cualquier cargo posterior
   * vuelve a lanzar. Es lo que impide que un `finally` de la propia rutina
   * —o un `*error*` hostil— siga computando después del corte.
   */
  private poisoned: LispAbort | null = null;

  constructor(
    readonly limits: LispBudgetLimits = DEFAULT_LISP_BUDGET,
    private readonly now: () => number = Date.now,
  ) {
    this.started = now();
  }

  /** Un paso de evaluación. Mira el reloj cada `CLOCK_STRIDE` pasos. */
  step(): void {
    if (this.poisoned) throw this.poisoned;
    this.steps += 1;
    if (this.steps > this.limits.maxSteps)
      throw this.abort("steps", `El presupuesto de ${this.limits.maxSteps} pasos se agotó.`);
    if (this.steps - this.lastClockStep >= CLOCK_STRIDE) {
      this.lastClockStep = this.steps;
      this.checkClock();
    }
  }

  /** Reserva `count` unidades de memoria (celdas o caracteres). */
  charge(count: number): void {
    if (this.poisoned) throw this.poisoned;
    if (!Number.isFinite(count) || count < 0)
      throw this.abort("cells", "Se pidió una reserva de memoria no finita.");
    this.cells += count;
    if (this.cells > this.limits.maxCells)
      throw this.abort(
        "cells",
        `El presupuesto de ${this.limits.maxCells} celdas se agotó (se pidieron ${Math.round(this.cells)}).`,
      );
  }

  enter(): void {
    if (this.poisoned) throw this.poisoned;
    this.depth += 1;
    if (this.depth > this.peak) this.peak = this.depth;
    if (this.depth > this.limits.maxDepth)
      throw this.abort(
        "depth",
        `La recursión superó los ${this.limits.maxDepth} marcos de llamada.`,
      );
  }

  leave(): void {
    // NO se comprueba el envenenamiento: salir de un marco durante el desmontaje
    // de la pila tiene que funcionar aunque el presupuesto se haya agotado, o el
    // `finally` de cada llamada lanzaría un segundo error encima del primero.
    if (this.depth > 0) this.depth -= 1;
  }

  /** Comprobación explícita de reloj, para bucles que no evalúan nada. */
  checkClock(): void {
    if (this.poisoned) throw this.poisoned;
    this.elapsed = this.now() - this.started;
    if (this.elapsed > this.limits.maxMillis)
      throw this.abort(
        "time",
        `La rutina superó los ${this.limits.maxMillis} ms de ejecución.`,
      );
  }

  /** Corte externo: el usuario pulsó Esc, o el anfitrión se está desmontando. */
  cancel(message = "La rutina se canceló."): void {
    this.poisoned = new LispAbort("cancelled", message);
  }

  snapshot(): LispBudgetSnapshot {
    return {
      steps: this.steps,
      cells: this.cells,
      depth: this.depth,
      peakDepth: this.peak,
      elapsedMillis: this.elapsed,
    };
  }

  get exhausted(): LispAbort | null {
    return this.poisoned;
  }

  private abort(reason: LispAbort["reason"], message: string): LispAbort {
    this.poisoned = new LispAbort(reason, message);
    return this.poisoned;
  }
}
