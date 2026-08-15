import { installGracefulShutdown } from './graceful-shutdown';
import { ReadinessState } from './readiness.state';

function harness(
  overrides: {
    closeApp?: () => Promise<void>;
    drainDelayMs?: number;
    shutdownGraceMs?: number;
    /** Con `true`, el techo de apagado vence (caso de cierre colgado). */
    graceExpires?: boolean;
  } = {},
) {
  const order: string[] = [];
  const readiness = new ReadinessState();
  const exits: number[] = [];
  const logs: string[] = [];
  const signals = new Map<string, () => void>();

  const handle = installGracefulShutdown({
    readiness: {
      startDraining: () => {
        order.push('readiness:503');
        readiness.startDraining();
      },
    },
    closeApp:
      overrides.closeApp ??
      (async () => {
        order.push('close');
      }),
    logger: {
      log: (m) => logs.push(m),
      warn: (m) => logs.push(`WARN ${m}`),
      error: (m) => logs.push(`ERROR ${m}`),
    },
    drainDelayMs: overrides.drainDelayMs ?? 5_000,
    shutdownGraceMs: overrides.shutdownGraceMs ?? 25_000,
    // El drenaje se resuelve al instante (la spec no dura 5 segundos) y el
    // TECHO de apagado, por defecto, NO vence nunca: así el camino feliz
    // comprueba que el cierre gana la carrera, y el caso de agotamiento se
    // pide explícitamente con `graceExpires`.
    sleep: (ms) => {
      order.push(`sleep:${ms}`);
      const isGrace = ms === (overrides.shutdownGraceMs ?? 25_000);
      if (isGrace && !overrides.graceExpires) {
        return new Promise<void>(() => undefined);
      }
      return Promise.resolve();
    },
    exit: (code) => {
      order.push(`exit:${code}`);
      exits.push(code);
    },
    onSignal: (signal, listener) => signals.set(signal, listener),
    signals: ['SIGTERM', 'SIGINT'],
  });

  return { handle, order, readiness, exits, logs, signals };
}

describe('apagado ordenado', () => {
  it('drena ANTES de cerrar: readiness 503, espera, y solo entonces cierra', async () => {
    const { handle, order } = harness();
    await handle.shutdown('SIGTERM');
    // El orden es la garantia entera. Cerrar antes de que el balanceador se
    // entere convierte cada release en una rafaga de 502.
    expect(order).toEqual([
      'readiness:503',
      'sleep:5000',
      'close',
      // El techo de apagado se ARMA junto al cierre y no vence: gana el cierre.
      'sleep:25000',
      'exit:0',
    ]);
  });

  it('readiness pasa a draining y registra el instante', async () => {
    const { handle, readiness } = harness();
    expect(readiness.isDraining).toBe(false);
    await handle.shutdown('SIGTERM');
    expect(readiness.isDraining).toBe(true);
    expect(readiness.since).toBeInstanceOf(Date);
  });

  it('registra un handler por cada senal y SIGTERM dispara la secuencia', async () => {
    const { handle, signals, order } = harness();
    expect([...signals.keys()]).toEqual(['SIGTERM', 'SIGINT']);
    signals.get('SIGTERM')!();
    await handle.shutdown('SIGTERM');
    expect(order.filter((step) => step === 'close')).toHaveLength(1);
  });

  it('una segunda senal NO reinicia ni acelera el apagado en curso', async () => {
    const { handle, order, logs } = harness();
    const first = handle.shutdown('SIGTERM');
    const second = handle.shutdown('SIGINT');
    await Promise.all([first, second]);
    expect(order.filter((step) => step === 'close')).toHaveLength(1);
    expect(order.filter((step) => step.startsWith('exit'))).toEqual(['exit:0']);
    expect(logs.some((line) => line.startsWith('WARN'))).toBe(true);
  });

  it('sale con codigo 1 si el cierre no termina dentro del techo', async () => {
    const { handle, exits, logs } = harness({
      // Un cierre que nunca resuelve: una conexion que no termina, un hook
      // colgado. El proceso debe salir por decision propia, no por SIGKILL.
      closeApp: () => new Promise<void>(() => undefined),
      graceExpires: true,
    });
    await handle.shutdown('SIGTERM');
    expect(exits).toEqual([1]);
    expect(logs.some((line) => line.startsWith('ERROR'))).toBe(true);
  });

  it('un fallo al cerrar no impide salir, y el texto del error NO se registra', async () => {
    const { handle, exits, logs } = harness({
      closeApp: () =>
        Promise.reject(
          new Error('connection to postgres://valle:secreto@db:5432 failed'),
        ),
    });
    await handle.shutdown('SIGTERM');
    expect(exits).toEqual([0]);
    expect(logs.join('\n')).not.toContain('secreto');
    expect(logs.join('\n')).toContain('Error');
  });

  it('inProgress refleja si hay un apagado en curso', async () => {
    const { handle } = harness();
    expect(handle.inProgress).toBe(false);
    const running = handle.shutdown('SIGTERM');
    expect(handle.inProgress).toBe(true);
    await running;
  });
});

describe('ReadinessState', () => {
  it('startDraining es idempotente y conserva el PRIMER instante', () => {
    const state = new ReadinessState();
    const first = new Date('2026-08-15T10:00:00.000Z');
    const second = new Date('2026-08-15T10:00:05.000Z');
    state.startDraining(first);
    state.startDraining(second);
    expect(state.since).toEqual(first);
  });
});
