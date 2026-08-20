/**
 * Primitivas de medición del probe de carga de la API.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO Y NO UNA HERRAMIENTA EXTERNA. Un integrador que
 * evalúa Valle Design no pregunta «¿cuánto aguanta un `hello world` de Nest?»,
 * pregunta «¿cuánto aguanta el endpoint que voy a llamar cada minuto desde mi
 * ERP, con sus guards, su entitlement y su base de datos detrás?». Medir eso
 * exige hablar HTTP contra la aplicación REAL, no contra un mock ni contra un
 * `supertest` que se salta el servidor. Meter una herramienta de carga como
 * dependencia nueva para emitir peticiones y contar percentiles sería añadir
 * superficie de suministro a cambio de cien líneas.
 *
 * POR QUÉ LAZO CERRADO (closed loop) Y NO TASA FIJA. Un generador de tasa fija
 * («500 req/s pase lo que pase») mide la cola del generador cuando el servidor
 * no da abasto, y produce percentiles fantásticos o catastróficos según cuánto
 * buffer tenga. El lazo cerrado —N clientes que esperan su respuesta antes de
 * pedir otra vez— es exactamente lo que hace un integrador con un pool de
 * conexiones, y su cifra de peticiones por segundo es la que él va a observar.
 * La contrapartida está declarada: no expone el punto de saturación absoluto.
 *
 * POR QUÉ SE CUENTA POR ESTADO HTTP Y NO POR «ok/error». Un 429 no es un
 * fallo del servidor, es el servidor haciendo su trabajo; un 500 sí lo es.
 * Colapsar ambos en «error» convertiría la prueba del limitador de tasa en un
 * informe de que la API se cae.
 */

/** Resumen de latencia en milisegundos, calculado sobre la muestra completa. */
export interface LatencyStats {
  samples: number;
  minMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/** Resultado de una fase: qué se pidió, qué respondió y cuánto tardó. */
export interface PhaseOutcome {
  phase: string;
  concurrency: number;
  windowMs: number;
  requests: number;
  requestsPerSecond: number;
  /** Reparto por código HTTP; la clave `network` cuenta fallos de transporte. */
  statusCounts: Record<string, number>;
  latency: LatencyStats;
}

export interface AttemptResult {
  /** Código HTTP, o `null` si la petición ni siquiera llegó a responder. */
  status: number | null;
}

export type Attempt = () => Promise<AttemptResult>;

/** Redondeo a microsegundo: publicar 14 decimales sugiere una precisión falsa. */
export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Percentil por rango más cercano sobre la muestra ORDENADA.
 *
 * Sin interpolación a propósito: el valor publicado es una latencia que
 * realmente ocurrió, no una media ponderada entre dos que ocurrieron. Con
 * muestras de miles de peticiones la diferencia es despreciable, y a cambio
 * cualquiera puede reencontrar el número en los datos crudos.
 */
export function percentile(sortedMs: readonly number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  const rank = Math.ceil(q * sortedMs.length);
  const index = Math.min(sortedMs.length - 1, Math.max(0, rank - 1));
  return sortedMs[index];
}

export function summarize(samplesMs: readonly number[]): LatencyStats {
  if (samplesMs.length === 0) {
    return {
      samples: 0,
      minMs: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const total = sorted.reduce((acc, value) => acc + value, 0);
  return {
    samples: sorted.length,
    minMs: round(sorted[0]),
    meanMs: round(total / sorted.length),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted[sorted.length - 1]),
  };
}

/**
 * Lanza `concurrency` clientes que piden en bucle hasta agotar la ventana.
 *
 * El calentamiento NO entra en las cifras: la primera consulta de TypeORM
 * compila su plan, el pool abre conexiones y el JIT todavía no ha visto el
 * camino caliente. Publicar eso mezclado con el régimen estacionario haría
 * parecer que la API es más lenta de lo que un integrador va a observar
 * después del primer segundo.
 */
export async function closedLoop(options: {
  phase: string;
  concurrency: number;
  windowMs: number;
  warmupMs: number;
  attempt: Attempt;
}): Promise<PhaseOutcome> {
  const { phase, concurrency, windowMs, warmupMs, attempt } = options;
  const statusCounts: Record<string, number> = {};
  const latencies: number[] = [];

  const countStatus = (status: number | null): void => {
    const key = status === null ? 'network' : String(status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  };

  const warmupDeadline = performance.now() + warmupMs;
  while (performance.now() < warmupDeadline) {
    await attempt();
  }

  const start = performance.now();
  const deadline = start + windowMs;
  const worker = async (): Promise<void> => {
    while (performance.now() < deadline) {
      const began = performance.now();
      const result = await attempt();
      const elapsed = performance.now() - began;
      latencies.push(elapsed);
      countStatus(result.status);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedMs = performance.now() - start;

  return {
    phase,
    concurrency,
    windowMs: round(elapsedMs),
    requests: latencies.length,
    requestsPerSecond: round((latencies.length / elapsedMs) * 1000),
    statusCounts,
    latency: summarize(latencies),
  };
}

/**
 * Mide una secuencia ESTRICTAMENTE serial.
 *
 * Existe porque hay caminos donde la concurrencia mide otra cosa: una escritura
 * con concurrencia optimista (CAS) genera conflictos 409 entre clientes que
 * compiten por el mismo documento, y ese número diría cuánto se pisan los
 * clientes, no cuánto tarda guardar. El integrador que automatiza un guardado
 * quiere la segunda cifra.
 */
export async function serialSequence(options: {
  phase: string;
  iterations: number;
  attempt: Attempt;
}): Promise<PhaseOutcome> {
  const { phase, iterations, attempt } = options;
  const statusCounts: Record<string, number> = {};
  const latencies: number[] = [];
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const began = performance.now();
    const result = await attempt();
    latencies.push(performance.now() - began);
    const key = result.status === null ? 'network' : String(result.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  const elapsedMs = performance.now() - start;
  return {
    phase,
    concurrency: 1,
    windowMs: round(elapsedMs),
    requests: latencies.length,
    requestsPerSecond: round((latencies.length / elapsedMs) * 1000),
    statusCounts,
    latency: summarize(latencies),
  };
}
