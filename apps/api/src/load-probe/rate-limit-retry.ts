/**
 * Reintento de 429 para probes de carga — extraído de
 * `review-concurrency.main.ts` por presupuesto de líneas del archivo
 * (`scripts/cad/monolith-budget.json`) y porque es lógica pura, fácil de
 * probar sin levantar Nest ni Postgres.
 *
 * Un 429 de `ApiRateLimitService` (VD-RL-001) es el techo funcionando, no un
 * fallo: los techos son generosos a propósito ("no miden uso legítimo"), así
 * que un cliente correcto respeta `retryAfterSeconds` del cuerpo en vez de
 * contarlo como error. Acotado a `maxRetries` porque esto sigue siendo un
 * probe de fondo, no una interfaz interactiva — un bucle real no debe
 * colgarse para siempre si algo se comporta de forma patológica.
 */

export interface RateLimitRetryOptions {
  /** Techo de reintentos antes de rendirse y devolver el último 429. */
  maxRetries?: number;
  /** Tope defensivo por si `retryAfterSeconds` llegara con un valor patológico. */
  maxWaitMs?: number;
  /** Se llama una vez por cada 429 absorbido, para que quien llama lleve su propio contador. */
  onRetry?: () => void;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MAX_WAIT_MS = 65_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reintenta `call()` mientras la respuesta sea 429, esperando
 * `retryAfterSeconds` del cuerpo entre intentos. Devuelve la respuesta FINAL
 * sin leer su cuerpo (éxito, o el último 429 si se agotan los reintentos) —
 * quien llama la lee una sola vez, igual que antes de este reintento.
 */
export async function callWithRateLimitRetry(
  call: () => Promise<Response>,
  readJson: (response: Response) => Promise<unknown>,
  options: RateLimitRetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  for (let attempt = 0; ; attempt += 1) {
    const response = await call();
    if (response.status !== 429 || attempt >= maxRetries) return response;
    options.onRetry?.();
    const body = (await readJson(response)) as {
      retryAfterSeconds?: number;
    } | null;
    const waitMs = Math.min(
      Math.max(1, Number(body?.retryAfterSeconds) || 1) * 1000,
      maxWaitMs,
    );
    await sleep(waitMs);
  }
}

/**
 * Fábrica de un `timed` con reintento: mide, llama con reintento de 429 vía
 * `callWithRateLimitRetry`, y registra el desenlace FINAL con `record` — el
 * mismo contrato que un `timed` normal, para que quien llama no distinga
 * ambos al usarlos. Genérica sobre `Role` para no depender de los tipos de
 * ningún probe en particular. Lleva su propio contador de reintentos (en vez
 * de recibir un `onRetry` externo) para que quien llama no necesite una
 * variable mutable propia sólo para leerlo al final de la corrida.
 */
export function createTimedRateLimitRetry<Role extends string>(
  record: (role: Role, op: string, ms: number, status: number) => void,
  readJson: (response: Response) => Promise<unknown>,
) {
  let retries = 0;
  const timedWithRetry = async (
    role: Role,
    op: string,
    call: () => Promise<Response>,
  ): Promise<unknown> => {
    const began = performance.now();
    const response = await callWithRateLimitRetry(call, readJson, {
      onRetry: () => {
        retries += 1;
      },
    });
    const body = await readJson(response);
    record(role, op, performance.now() - began, response.status);
    return body;
  };
  return { timedWithRetry, retries: () => retries };
}
