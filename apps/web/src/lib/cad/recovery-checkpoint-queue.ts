/**
 * Cola de checkpoints de recuperación: UN escritor, con escritura final.
 *
 * El problema que resuelve. Guardar un checkpoint es asíncrono y caro
 * (serializar el documento, comprimirlo, hashearlo y escribirlo en IndexedDB).
 * Dos escrituras solapadas sobre el mismo journal se pisan, así que sólo puede
 * haber una en vuelo. La forma ingenua de garantizarlo es DESCARTAR la petición
 * que llega mientras hay otra en curso:
 *
 *     if (enVuelo) return;   // ← esto pierde trabajo
 *
 * Y eso pierde exactamente el checkpoint que más importa. El editor pide un
 * checkpoint al ocultarse la pestaña y al cerrarse la ventana: si en ese
 * instante hay una escritura periódica a medio camino, la petición se tira y el
 * journal se queda con el estado ANTERIOR. La recuperación que se le ofrece
 * después a la persona no es el dibujo que tenía al cerrar.
 *
 * La regla correcta: nunca dos escrituras a la vez, pero tampoco descartar. Si
 * llega una petición con otra en vuelo se marca una escritura FINAL y se ejecuta
 * al terminar la actual. Varias peticiones seguidas colapsan en UNA sola final
 * —los estados intermedios no interesan, sólo el último—, y esa final captura el
 * documento EN EL MOMENTO DE ESCRIBIR, no cuando se pidió: si no, se persistiría
 * un estado ya viejo y el problema seguiría ahí con otro disfraz.
 *
 * Lo que esta cola NO hace: no convierte una escritura asíncrona en síncrona. En
 * un `beforeunload` real el navegador puede terminar el documento antes de que
 * IndexedDB confirme. Esto arregla los descartes; la persistencia garantizada al
 * cierre es otro problema y necesita otro mecanismo.
 */

export interface CadCheckpointQueueOptions<T> {
  /**
   * Captura el estado a persistir. Se invoca JUSTO ANTES de cada escritura
   * —incluida la final— para que nunca se guarde una instantánea caducada.
   */
  snapshot: () => T;
  /** Persiste el estado capturado. Una sola de éstas corre a la vez. */
  write: (value: T) => Promise<void>;
  /** Se llama tras cada escritura correcta. */
  onWritten?: (value: T) => void;
  /** Se llama si una escritura falla. La cola sigue viva. */
  onError?: (cause: unknown) => void;
}

export interface CadCheckpointQueue {
  /** Pide un checkpoint. Nunca se descarta: escribe ya, o al terminar la actual. */
  request(): void;
  /** ¿Hay una escritura en curso? */
  readonly writing: boolean;
  /** ¿Hay una escritura final pendiente? */
  readonly trailing: boolean;
  /** Resuelve cuando la cola queda vacía. Para pruebas y para el desmontaje. */
  settled(): Promise<void>;
  /**
   * Deja de aceptar peticiones. La escritura en curso termina (abortarla a
   * media transacción no protege a nadie), pero no se programa ninguna final.
   */
  stop(): void;
}

export function createCadCheckpointQueue<T>(
  options: CadCheckpointQueueOptions<T>,
): CadCheckpointQueue {
  let writing = false;
  let trailing = false;
  let stopped = false;
  let idle: (() => void)[] = [];

  const resolveIdle = () => {
    const waiters = idle;
    idle = [];
    for (const waiter of waiters) waiter();
  };

  const run = () => {
    // El snapshot va AQUÍ, no en `request()`: la escritura final tiene que
    // persistir lo último que hay, no lo que había cuando se pidió.
    let value: T;
    try {
      value = options.snapshot();
    } catch (cause) {
      writing = false;
      trailing = false;
      options.onError?.(cause);
      resolveIdle();
      return;
    }
    void options
      .write(value)
      .then(() => options.onWritten?.(value))
      .catch((cause: unknown) => options.onError?.(cause))
      .finally(() => {
        // Una escritura fallida NO cancela la final: el fallo puede ser
        // transitorio (cuota que se libera al podar) y el estado más reciente
        // sigue mereciendo un intento.
        if (trailing && !stopped) {
          trailing = false;
          run();
          return;
        }
        writing = false;
        trailing = false;
        resolveIdle();
      });
  };

  return {
    request() {
      if (stopped) return;
      if (writing) {
        trailing = true;
        return;
      }
      writing = true;
      run();
    },
    get writing() {
      return writing;
    },
    get trailing() {
      return trailing;
    },
    settled() {
      if (!writing) return Promise.resolve();
      return new Promise<void>((resolve) => idle.push(resolve));
    },
    stop() {
      stopped = true;
      trailing = false;
    },
  };
}
