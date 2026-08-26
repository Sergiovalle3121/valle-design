import {
  callWithRateLimitRetry,
  createTimedRateLimitRetry,
} from './rate-limit-retry';

/**
 * `call`/`readJson` se pasan como parámetros exactamente para no depender de
 * un `Response` real: aquí son dobles de prueba (objetos `{ status }` y una
 * función que devuelve el cuerpo ya "parseado").
 */
function response(status: number): Response {
  return { status } as Response;
}

describe('callWithRateLimitRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no reintenta ni espera si la primera respuesta no es 429', async () => {
    const call = jest.fn().mockResolvedValue(response(201));
    const readJson = jest.fn();
    const onRetry = jest.fn();

    const result = await callWithRateLimitRetry(call, readJson, { onRetry });

    expect(result.status).toBe(201);
    expect(call).toHaveBeenCalledTimes(1);
    expect(readJson).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('reintenta tras retryAfterSeconds y devuelve el éxito', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(201));
    const readJson = jest.fn().mockResolvedValue({ retryAfterSeconds: 3 });
    const onRetry = jest.fn();

    const pending = callWithRateLimitRetry(call, readJson, { onRetry });
    await jest.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2_999);
    expect(call).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    const result = await pending;
    expect(result.status).toBe(201);
    expect(call).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('agota maxRetries y devuelve el último 429 en vez de colgarse', async () => {
    const call = jest.fn().mockResolvedValue(response(429));
    const readJson = jest.fn().mockResolvedValue({ retryAfterSeconds: 1 });
    const onRetry = jest.fn();

    const pending = callWithRateLimitRetry(call, readJson, {
      maxRetries: 2,
      onRetry,
    });
    await jest.advanceTimersByTimeAsync(10_000);

    const result = await pending;
    expect(result.status).toBe(429);
    expect(call).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('acota la espera a maxWaitMs aunque retryAfterSeconds sea enorme', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(201));
    const readJson = jest.fn().mockResolvedValue({ retryAfterSeconds: 999 });

    const pending = callWithRateLimitRetry(call, readJson, {
      maxWaitMs: 500,
    });
    await jest.advanceTimersByTimeAsync(500);

    const result = await pending;
    expect(result.status).toBe(201);
  });

  it('sin retryAfterSeconds en el cuerpo espera 1s por defecto, nunca 0', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(201));
    const readJson = jest.fn().mockResolvedValue(null);

    const pending = callWithRateLimitRetry(call, readJson, {});
    await jest.advanceTimersByTimeAsync(999);
    expect(call).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    const result = await pending;
    expect(result.status).toBe(201);
  });
});

describe('createTimedRateLimitRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registra el desenlace FINAL una sola vez y expone el contador de reintentos', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(201));
    const readJson = jest.fn().mockResolvedValue({ retryAfterSeconds: 1 });
    const record = jest.fn();

    const { timedWithRetry, retries } = createTimedRateLimitRetry<'link'>(
      record,
      readJson,
    );
    const pending = timedWithRetry('link', 'comment', call);
    await jest.advanceTimersByTimeAsync(2_000);
    await pending;

    expect(call).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'link',
      'comment',
      expect.any(Number),
      201,
    );
    expect(retries()).toBe(2);
  });
});
