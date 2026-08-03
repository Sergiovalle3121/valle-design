import type { DataSource } from 'typeorm';
import type {
  CommercialOutboxDispatcher,
  CommercialOutboxDispatchSummary,
} from './outbox-dispatcher.service';
import {
  CommercialOutboxWorker,
  pollIntervalMs,
} from './outbox-worker.service';
import type { WebhookCommercialOutboxTransport } from './webhook-outbox.transport';

const ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'OUTBOX_DISPATCHER_ENABLED',
  'OUTBOX_POLL_INTERVAL_MS',
] as const;

const EMPTY_SUMMARY: CommercialOutboxDispatchSummary = {
  claimed: 0,
  sent: 0,
  failed: 0,
  dead: 0,
  leaseLost: 0,
};

function workerHarness(driver: 'postgres' | 'better-sqlite3' = 'postgres') {
  const dispatchOnce = jest.fn<Promise<CommercialOutboxDispatchSummary>, []>();
  const assertConfigured = jest.fn();
  const worker = new CommercialOutboxWorker(
    { options: { type: driver } } as unknown as DataSource,
    { dispatchOnce } as unknown as CommercialOutboxDispatcher,
    { assertConfigured } as unknown as WebhookCommercialOutboxTransport,
  );
  return { worker, dispatchOnce, assertConfigured };
}

describe('CommercialOutboxWorker production configuration', () => {
  const original = new Map(
    ENVIRONMENT_KEYS.map((key) => [key, process.env[key]] as const),
  );

  afterEach(() => {
    for (const key of ENVIRONMENT_KEYS) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('fails startup when the dispatcher is disabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.OUTBOX_DISPATCHER_ENABLED = 'false';
    const { worker, dispatchOnce, assertConfigured } = workerHarness();

    expect(() => worker.onApplicationBootstrap()).toThrow(
      /Production requires OUTBOX_DISPATCHER_ENABLED=true/u,
    );
    expect(assertConfigured).not.toHaveBeenCalled();
    expect(dispatchOnce).not.toHaveBeenCalled();
  });

  it('refuses SQLite instead of pretending to provide a multi-worker lease', () => {
    process.env.NODE_ENV = 'test';
    process.env.OUTBOX_DISPATCHER_ENABLED = 'true';
    const { worker, assertConfigured } = workerHarness('better-sqlite3');

    expect(() => worker.onApplicationBootstrap()).toThrow(
      /requires PostgreSQL/u,
    );
    expect(assertConfigured).not.toHaveBeenCalled();
  });

  it('validates polling and signed transport configuration before scheduling', () => {
    process.env.NODE_ENV = 'production';
    process.env.OUTBOX_DISPATCHER_ENABLED = 'true';
    process.env.OUTBOX_POLL_INTERVAL_MS = '249';
    const { worker, assertConfigured } = workerHarness();

    expect(() => worker.onApplicationBootstrap()).toThrow(
      /OUTBOX_POLL_INTERVAL_MS/u,
    );
    expect(assertConfigured).not.toHaveBeenCalled();

    process.env.OUTBOX_POLL_INTERVAL_MS = '1000';
    assertConfigured.mockImplementation(() => {
      throw new Error('signed HTTPS webhook configuration missing');
    });
    expect(() => worker.onApplicationBootstrap()).toThrow(
      /configuration missing/u,
    );
  });

  it('polls serially and waits for an in-flight delivery during shutdown', async () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'test';
    process.env.OUTBOX_DISPATCHER_ENABLED = 'true';
    process.env.OUTBOX_POLL_INTERVAL_MS = '250';
    let finishFirst:
      ((summary: CommercialOutboxDispatchSummary) => void) | undefined;
    const first = new Promise<CommercialOutboxDispatchSummary>((resolve) => {
      finishFirst = resolve;
    });
    const { worker, dispatchOnce, assertConfigured } = workerHarness();
    dispatchOnce.mockReturnValueOnce(first).mockResolvedValue(EMPTY_SUMMARY);

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(assertConfigured).toHaveBeenCalledTimes(1);
    expect(dispatchOnce).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5_000);
    expect(dispatchOnce).toHaveBeenCalledTimes(1);

    finishFirst?.(EMPTY_SUMMARY);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(249);
    expect(dispatchOnce).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(dispatchOnce).toHaveBeenCalledTimes(2);

    await worker.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(dispatchOnce).toHaveBeenCalledTimes(2);
  });

  it('bounds polling intervals independently of the process environment', () => {
    expect(pollIntervalMs(undefined)).toBe(1_000);
    expect(pollIntervalMs('60000')).toBe(60_000);
    expect(() => pollIntervalMs('60001')).toThrow();
  });
});
