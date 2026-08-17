/**
 * Planificador de trabajo de render con presupuesto por cuadro.
 *
 * ## El problema que resuelve
 *
 * Construir la escena de golpe bloquea el hilo principal: a 100.000 entidades
 * eran 25 segundos hasta el primer detalle, y durante esos 25 segundos el ratón
 * no responde. Trocear el trabajo no basta por sí solo — hace falta decidir QUÉ
 * trozo va primero y CUÁNDO parar:
 *
 * - **Cuándo parar**: un presupuesto de 4 ms por cuadro deja los otros ~12,7 ms
 *   de un cuadro a 60 Hz para eventos, composición y el propio dibujado. Es lo
 *   que convierte «responde en 25 s» en «responde siempre y termina en 2 s».
 * - **Qué va primero**: por distancia al centro de la vista. El usuario mira al
 *   centro; que el detalle aparezca de dentro hacia fuera es la diferencia entre
 *   una carga progresiva y un parpadeo aleatorio.
 * - **Abortar**: si la vista cambia mientras queda cola, el trabajo pendiente
 *   describe una vista que ya no existe. Se descarta y se vuelve a encolar con
 *   la prioridad nueva; seguir gastando cuadros en tiles que el usuario dejó
 *   atrás es la forma más cara de no llegar nunca.
 *
 * ## Por qué un montículo y no ordenar
 *
 * Ordenar la cola cada cuadro es O(n log n) sobre decenas de miles de tareas: el
 * planificador se comería su propio presupuesto. Un montículo binario saca el
 * mínimo en O(log n) y se reconstruye en O(n) cuando cambia el centro de la
 * vista, que ocurre una vez por gesto y no una vez por cuadro.
 *
 * Puro: reloj inyectable, sin THREE, sin DOM, sin `requestAnimationFrame`. El
 * bucle de cuadros lo pone quien lo usa; aquí se puede probar entero en Node de
 * forma determinista.
 */

export interface CadRenderTask {
  /** Identidad estable. Reencolar la misma clave sustituye, no duplica. */
  key: string;
  /** Punto de referencia en unidades de DIBUJO para ordenar por cercanía. */
  x: number;
  y: number;
  run: () => void;
}

export interface CadRenderFrameResult {
  /** Tareas ejecutadas en este cuadro. */
  ran: number;
  /** Tareas que siguen en cola. 0 significa escena en reposo. */
  remaining: number;
  elapsedMs: number;
  budgetMs: number;
  /** true si se paró por presupuesto y no por falta de trabajo. */
  budgetExhausted: boolean;
  /** Errores capturados: una tarea rota no puede tumbar el bucle de cuadros. */
  failures: Array<{ key: string; message: string }>;
}

export interface CadRenderSchedulerOptions {
  /** Presupuesto por cuadro en milisegundos. Es el SUELO del adaptativo. */
  frameBudgetMs?: number;
  /** Reloj inyectable para poder probar el presupuesto sin esperar. */
  now?: () => number;
  /**
   * Deja el presupuesto CLAVADO en `frameBudgetMs`, sin adaptarlo al cuadro
   * real. Sólo para specs que quieran fijar el reparto; ver el bloque de abajo
   * para por qué el camino normal adapta.
   */
  fixedBudget?: boolean;
}

/** 4 ms de 16,7: el resto del cuadro es para el usuario. */
export const CAD_RENDER_FRAME_BUDGET_MS = 4;

/**
 * Fracción del CUADRO REAL que el planificador puede gastar.
 *
 * ## Por qué el presupuesto no puede ser una constante
 *
 * 4 ms de 16,7 son el 24 % del cuadro: la constante de arriba nunca fue «4 ms»,
 * fue «un cuarto del cuadro», con el cuadro dado por supuesto a 60 Hz. Cuando el
 * cuadro dura de verdad 16,7 ms el supuesto se cumple y no hay nada que discutir.
 *
 * Cuando NO se cumple, la constante se vuelve destructiva, y está medido. En el
 * runner de CI —Chromium sobre ANGLE/SwiftShader, sin GPU— un cuadro a 100.000
 * entidades cuesta ~1.160 ms de rasterizado por software:
 * `docs/cad/evidence/browser-slo-100k.json` registra 45.219 ms de reloj en 39
 * cuadros con sólo 444 ms de CPU del pipeline dentro. Con 4 ms de presupuesto,
 * asentar 1,5 s de trabajo pide ~200 cuadros, y 200 × 1,16 s son los 208–221 s
 * que `viewport-baseline.json` lleva registrados como `detailReadyMs`. Es decir:
 * el usuario espera casi cuatro minutos para que se hagan segundo y medio de
 * cuentas, porque cada cuadro se paga entero para avanzar 4 ms.
 *
 * Dejar el 99,7 % del cuadro libre no compra ninguna respuesta: el cuadro ya
 * dura más de un segundo, y el gesto siguiente va a esperarlo igual. Lo único
 * que compra es multiplicar por 290 el número de cuadros.
 *
 * Así que el presupuesto se calcula sobre el cuadro OBSERVADO y se queda en la
 * misma fracción de siempre. A 60 Hz da 4,2 ms —la conducta de antes, intacta—
 * y en el rasterizador por software da cientos, que es lo que convierte 200
 * cuadros en unos pocos.
 */
export const CAD_RENDER_FRAME_BUDGET_SHARE = 0.25;

/**
 * Techo del presupuesto adaptativo.
 *
 * Un cuarto de segundo es lo máximo que un cuadro puede robar sin que el gesto
 * siguiente parezca colgado, y además acota el daño de un intervalo absurdo: una
 * pestaña en segundo plano, un portátil que despierta o un punto de interrupción
 * dan intervalos de decenas de segundos, y sin techo el cuadro siguiente
 * intentaría hacer todo el trabajo del mundo de una vez.
 */
export const CAD_RENDER_FRAME_BUDGET_MAX_MS = 250;

/**
 * Peso de la muestra nueva en la media móvil del intervalo.
 *
 * Se suaviza porque un cuadro raro —una pausa del recolector, una pestaña que
 * vuelve— no puede mover el presupuesto de golpe: con 0,25 hacen falta varios
 * cuadros seguidos caros para que el planificador se crea que el cuadro es caro.
 */
export const CAD_RENDER_FRAME_INTERVAL_SMOOTHING = 0.25;

interface HeapNode {
  key: string;
  priority: number;
  task: CadRenderTask;
}

export class CadRenderScheduler {
  private readonly heap: HeapNode[] = [];
  private readonly tasks = new Map<string, CadRenderTask>();
  private readonly now: () => number;
  private centerX = 0;
  private centerY = 0;
  private generationValue = 0;
  private ranTotal = 0;
  private abortedTotal = 0;
  /** Instante en que empezó el cuadro anterior; `null` mientras no hubo ninguno. */
  private previousFrameStarted: number | null = null;
  /** Media móvil del intervalo entre cuadros. 0 significa «todavía no se sabe». */
  private frameIntervalMs = 0;
  private readonly fixedBudget: boolean;

  readonly frameBudgetMs: number;

  constructor(options: CadRenderSchedulerOptions = {}) {
    this.frameBudgetMs = Math.max(0.1, options.frameBudgetMs ?? CAD_RENDER_FRAME_BUDGET_MS);
    this.fixedBudget = options.fixedBudget === true;
    this.now =
      options.now ??
      (typeof performance !== "undefined" ? () => performance.now() : () => Date.now());
  }

  /**
   * Generación de la vista. Sube en cada `abort`, de modo que un trabajo
   * asíncrono lanzado antes (por ejemplo el teselado en el worker) puede
   * comprobar si su resultado sigue interesando antes de aplicarlo.
   */
  get generation(): number {
    return this.generationValue;
  }

  get pending(): number {
    return this.tasks.size;
  }

  get stats(): { ran: number; aborted: number; pending: number; generation: number } {
    return {
      ran: this.ranTotal,
      aborted: this.abortedTotal,
      pending: this.tasks.size,
      generation: this.generationValue,
    };
  }

  private priority(x: number, y: number): number {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    return dx * dx + dy * dy;
  }

  enqueue(task: CadRenderTask): void {
    this.tasks.set(task.key, task);
    this.push({ key: task.key, priority: this.priority(task.x, task.y), task });
  }

  enqueueAll(tasks: Iterable<CadRenderTask>): void {
    for (const task of tasks) this.enqueue(task);
  }

  /**
   * Reordena la cola alrededor de un centro nuevo SIN descartarla. Es lo que se
   * hace en un paneo pequeño: el trabajo pendiente sigue siendo válido, sólo
   * cambia cuál urge.
   */
  reprioritize(centerX: number, centerY: number): void {
    this.centerX = centerX;
    this.centerY = centerY;
    this.heap.length = 0;
    for (const task of this.tasks.values())
      this.heap.push({ key: task.key, priority: this.priority(task.x, task.y), task });
    // Construcción en O(n): más barato que n inserciones en O(n log n).
    for (let index = (this.heap.length >> 1) - 1; index >= 0; index -= 1) this.siftDown(index);
  }

  /**
   * Descarta el trabajo pendiente y sube la generación. Es lo que se hace
   * cuando la vista cambia tanto que lo encolado describe otro encuadre.
   */
  abort(): number {
    const dropped = this.tasks.size;
    this.abortedTotal += dropped;
    this.tasks.clear();
    this.heap.length = 0;
    this.generationValue += 1;
    return dropped;
  }

  /**
   * Ejecuta tareas hasta agotar el presupuesto. SIEMPRE ejecuta al menos una
   * cuando hay cola: si no, una tarea más cara que el presupuesto entero
   * bloquearía la cola para siempre y la escena nunca se asentaría.
   */
  /**
   * Intervalo observado entre cuadros, suavizado. Es lo que gobierna el
   * presupuesto; se expone para que un spec pueda afirmar la adaptación sin
   * deducirla del presupuesto resultante.
   */
  get observedFrameIntervalMs(): number {
    return Math.round(this.frameIntervalMs * 1_000) / 1_000;
  }

  /**
   * Presupuesto para el cuadro que empieza en `started`.
   *
   * SIEMPRE devuelve al menos `frameBudgetMs`: el adaptativo puede SUBIR el
   * presupuesto cuando el cuadro es caro, nunca bajarlo. Bajarlo convertiría una
   * máquina rápida en una lenta por su propia velocidad, que es justo al revés.
   */
  private budgetFor(started: number): number {
    const previous = this.previousFrameStarted;
    this.previousFrameStarted = started;
    if (previous !== null && !this.fixedBudget) {
      const interval = Math.max(0, started - previous);
      this.frameIntervalMs =
        this.frameIntervalMs === 0
          ? interval
          : this.frameIntervalMs +
            (interval - this.frameIntervalMs) * CAD_RENDER_FRAME_INTERVAL_SMOOTHING;
    }
    if (this.fixedBudget) return this.frameBudgetMs;
    return Math.min(
      CAD_RENDER_FRAME_BUDGET_MAX_MS,
      Math.max(this.frameBudgetMs, this.frameIntervalMs * CAD_RENDER_FRAME_BUDGET_SHARE),
    );
  }

  /**
   * Un presupuesto EXPLÍCITO manda sobre el adaptativo —quien lo pasa sabe algo
   * que el planificador no—, pero el intervalo se observa igual: si no, alternar
   * cuadros con y sin argumento dejaría la media móvil leyendo intervalos
   * dobles.
   */
  runFrame(budgetMs?: number): CadRenderFrameResult {
    const started = this.now();
    const adaptive = this.budgetFor(started);
    const budget = budgetMs ?? adaptive;
    const failures: Array<{ key: string; message: string }> = [];
    let ran = 0;
    let budgetExhausted = false;
    while (this.tasks.size > 0) {
      if (ran > 0 && this.now() - started >= budget) {
        budgetExhausted = true;
        break;
      }
      const node = this.pop();
      if (!node) break;
      this.tasks.delete(node.key);
      try {
        node.task.run();
      } catch (error) {
        failures.push({
          key: node.key,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      ran += 1;
      this.ranTotal += 1;
    }
    return {
      ran,
      remaining: this.tasks.size,
      elapsedMs: this.now() - started,
      budgetMs: budget,
      budgetExhausted,
      failures,
    };
  }

  /** Vacía la cola sin tocar la generación: para desmontar, no para abortar. */
  clear(): void {
    this.tasks.clear();
    this.heap.length = 0;
  }

  // --- Montículo binario mínimo -------------------------------------------

  private push(node: HeapNode): void {
    this.heap.push(node);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.heap[parent].priority <= this.heap[index].priority) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private pop(): HeapNode | null {
    while (this.heap.length > 0) {
      const top = this.heap[0];
      const last = this.heap.pop()!;
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this.siftDown(0);
      }
      // Entrada obsoleta: la clave se reencoló con otra prioridad, o se abortó.
      // Se descarta por comparación de referencia en vez de borrar del montículo,
      // que costaría una búsqueda lineal.
      if (this.tasks.get(top.key) === top.task) return top;
    }
    return null;
  }

  private siftDown(start: number): void {
    const size = this.heap.length;
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < size && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
      if (right < size && this.heap[right].priority < this.heap[smallest].priority) smallest = right;
      if (smallest === index) return;
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}
