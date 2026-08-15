/**
 * Apagado ordenado del proceso API.
 *
 * Un despliegue es, visto desde el usuario, una ráfaga de errores o nada. La
 * diferencia está en el ORDEN en que ocurren cuatro cosas, y ninguna es
 * opcional:
 *
 *   1. dejar de anunciarse sano (readiness 503) — el balanceador saca la
 *      réplica de rotación;
 *   2. ESPERAR a que se entere (un ciclo de health check);
 *   3. cerrar el listener y drenar lo que ya está en vuelo (Nest cierra el
 *      servidor y ejecuta los `onApplicationShutdown`: el worker de outbox
 *      termina su lote en curso en vez de dejar filas con lease colgado);
 *   4. cerrar el pool de PostgreSQL y salir.
 *
 * Saltarse (1) y (2) —lo que hace un `process.exit()` en el handler— convierte
 * cada release en 502 para las peticiones que el proxy ya había enrutado.
 *
 * Todo se inyecta (señales, temporizador, salida, reloj) porque un apagado que
 * sólo se puede probar apagando el proceso no se prueba nunca.
 */

export interface ShutdownLogger {
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
}

export interface GracefulShutdownOptions {
  /** Marca readiness=503 para que el balanceador deje de enrutar. */
  readiness: { startDraining(): void };
  /** Cierra la aplicación: listener, hooks de shutdown y pool de BD. */
  closeApp: () => Promise<void>;
  logger: ShutdownLogger;
  drainDelayMs: number;
  shutdownGraceMs: number;
  /** Espera inyectable (las specs no pueden dormir 5 segundos). */
  sleep?: (ms: number) => Promise<void>;
  /** Salida inyectable. */
  exit?: (code: number) => void;
  /** Registro de señales inyectable. */
  onSignal?: (signal: NodeJS.Signals, handler: () => void) => void;
  signals?: NodeJS.Signals[];
}

export interface GracefulShutdownHandle {
  /** Ejecuta la secuencia completa. Idempotente. */
  shutdown(reason: string): Promise<void>;
  /** ¿Ya se está apagando? */
  readonly inProgress: boolean;
}

const DEFAULT_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Un temporizador de drenaje no debe, él solo, mantener vivo el proceso.
    if (typeof timer.unref === 'function') timer.unref();
  });
}

export function installGracefulShutdown(
  options: GracefulShutdownOptions,
): GracefulShutdownHandle {
  const {
    readiness,
    closeApp,
    logger,
    drainDelayMs,
    shutdownGraceMs,
    sleep = defaultSleep,
    exit = (code: number) => process.exit(code),
    onSignal = (signal: NodeJS.Signals, handler: () => void) => {
      process.on(signal, handler);
    },
    signals = DEFAULT_SIGNALS,
  } = options;

  let running: Promise<void> | null = null;

  async function sequence(reason: string): Promise<void> {
    logger.log(
      `Apagado ordenado iniciado (${reason}). Fase 1: readiness=503, drenando ${drainDelayMs} ms.`,
    );
    // 1 · dejar de anunciarse sano ANTES de cerrar nada.
    readiness.startDraining();
    // 2 · darle al balanceador tiempo de verlo.
    await sleep(drainDelayMs);

    // 3 y 4 · cerrar con techo. Si `close()` se cuelga (una conexión que no
    // termina, un hook que nunca resuelve), el orquestador acabaría mandando
    // SIGKILL y el pool quedaría sin cerrar: preferimos salir nosotros, en
    // código 1 y con el motivo escrito.
    //
    // El resultado sale de QUIÉN gana la carrera, no de una bandera compartida
    // que otra rama pueda haber puesto entretanto: con una bandera, un cierre
    // correcto que termina en el mismo tick que el techo se reportaría como
    // agotado.
    logger.log('Fase 2: cerrando listener, hooks y pool de PostgreSQL.');
    const outcome = await Promise.race([
      closeApp()
        .catch(rethrowAsLog(logger))
        .then(() => 'closed' as const),
      sleep(shutdownGraceMs).then(() => 'timeout' as const),
    ]);

    if (outcome === 'timeout') {
      logger.error(
        `El apagado no terminó en ${shutdownGraceMs} ms; se sale igualmente para no morir por SIGKILL con el pool abierto.`,
      );
      exit(1);
      return;
    }
    logger.log('Apagado ordenado completado.');
    exit(0);
  }

  const handle: GracefulShutdownHandle = {
    shutdown(reason: string): Promise<void> {
      if (running) {
        // Una segunda señal durante el apagado NO acelera nada: forzar la
        // salida aquí abortaría el drenaje que la primera puso en marcha.
        logger.warn(
          `Señal adicional (${reason}) durante el apagado; se ignora, ya hay uno en curso.`,
        );
        return running;
      }
      running = sequence(reason);
      return running;
    },
    get inProgress(): boolean {
      return running !== null;
    },
  };

  for (const signal of signals) {
    onSignal(signal, () => {
      void handle.shutdown(signal);
    });
  }

  return handle;
}

function rethrowAsLog(logger: ShutdownLogger) {
  return (error: unknown) => {
    const kind = error instanceof Error ? error.name : 'ShutdownError';
    // El texto del error se omite: puede arrastrar la URL de conexión con
    // credenciales del driver.
    logger.error(`Fallo al cerrar la aplicación (${kind}).`);
  };
}
