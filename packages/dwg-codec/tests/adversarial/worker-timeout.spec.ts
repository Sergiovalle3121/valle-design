import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import {
  superviseWorker,
  type WorkerLike,
  type WorkerScheduler,
} from "../../src/security/worker-supervisor.js";

type WorkerEventType = "message" | "error";
type WorkerListener = (event: unknown) => void;

class ManualScheduler implements WorkerScheduler {
  private readonly callbacks = new Map<object, () => void>();
  public setTimeout(callback: () => void, _delayMs: number): unknown {
    const handle = {};
    this.callbacks.set(handle, callback);
    return handle;
  }
  public clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as object);
  }
  public fireAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }
  public get pending(): number {
    return this.callbacks.size;
  }
}

class FakeWorker implements WorkerLike {
  private readonly listeners: Record<WorkerEventType, Set<WorkerListener>> = {
    error: new Set(),
    message: new Set(),
  };
  public readonly posted: unknown[] = [];
  public terminateCalls = 0;
  public postMessage(message: unknown): void {
    this.posted.push(message);
  }
  public terminate(): void {
    this.terminateCalls += 1;
  }
  public addEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    this.listeners[type].add(listener);
  }
  public removeEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    this.listeners[type].delete(listener);
  }
  public emitMessage(data: unknown): void {
    for (const listener of this.listeners.message) listener({ data });
  }
  public emitError(error: unknown): void {
    for (const listener of this.listeners.error) listener(error);
  }
  public listenerCount(): number {
    return this.listeners.message.size + this.listeners.error.size;
  }
}

class SynchronousDeadlineScheduler implements WorkerScheduler {
  public clearCalls = 0;
  public setTimeout(callback: () => void, _delayMs: number): unknown {
    callback();
    return { kind: "already-fired" };
  }
  public clearTimeout(_handle: unknown): void {
    this.clearCalls += 1;
  }
}

test("a scheduler that fires synchronously never posts after the selected timeout", async () => {
  const scheduler = new SynchronousDeadlineScheduler();
  const worker = new FakeWorker();
  const result = await superviseWorker(
    worker,
    { mustNotRun: true },
    { scheduler, timeoutMs: 1 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
  assert.deepEqual(worker.posted, []);
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.clearCalls, 1);
});

test("manual deadline terminates a worker and removes listeners deterministically", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker(
    worker,
    { operation: "probe" },
    { scheduler, timeoutMs: 25 },
  );
  assert.deepEqual(worker.posted, [{ operation: "probe" }]);
  assert.equal(worker.listenerCount(), 2);
  assert.equal(scheduler.pending, 1);

  scheduler.fireAll();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.pending, 0);
});

test("message success clears the hard deadline and terminates the worker", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker<{ value: number }>(worker, "request", {
    scheduler,
    timeoutMs: 25,
  });
  worker.emitMessage({ value: 42 });
  assert.deepEqual(await pending, { ok: true, value: { value: 42 } });
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.pending, 0);
  scheduler.fireAll();
  assert.equal(worker.terminateCalls, 1);
});

test("worker error fails typed, clears listeners and terminates once", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker(worker, "request", {
    scheduler,
    timeoutMs: 25,
  });
  worker.emitError(new Error("synthetic worker failure"));
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_INTERNAL_ERROR");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.pending, 0);
});

class NodeWorkerAdapter implements WorkerLike {
  private readonly wrappers: Record<
    WorkerEventType,
    Map<WorkerListener, (value: unknown) => void>
  > = {
    error: new Map(),
    message: new Map(),
  };

  public constructor(private readonly worker: Worker) {}

  public postMessage(message: unknown): void {
    this.worker.postMessage(message);
  }

  public async terminate(): Promise<void> {
    await this.worker.terminate();
  }

  public addEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    const wrapper =
      type === "message"
        ? (data: unknown): void => listener({ data })
        : listener;
    this.wrappers[type].set(listener, wrapper);
    this.worker.on(type, wrapper);
  }

  public removeEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    const wrapper = this.wrappers[type].get(listener);
    if (wrapper !== undefined) {
      this.worker.off(type, wrapper);
      this.wrappers[type].delete(listener);
    }
  }
}

const realScheduler: WorkerScheduler = {
  clearTimeout(handle: unknown): void {
    clearTimeout(handle as NodeJS.Timeout);
  },
  setTimeout(callback: () => void, delayMs: number): unknown {
    return setTimeout(callback, delayMs);
  },
};

function waitForReady(worker: Worker): Promise<void> {
  return new Promise((resolveReady, rejectReady) => {
    const readinessDeadline = setTimeout(
      () => rejectReady(new Error("worker did not become ready")),
      2_000,
    );
    worker.once("error", (error) => {
      clearTimeout(readinessDeadline);
      rejectReady(error);
    });
    worker.once("message", (message) => {
      clearTimeout(readinessDeadline);
      if (message !== "ready")
        rejectReady(
          new Error(`unexpected readiness message: ${String(message)}`),
        );
      else resolveReady();
    });
  });
}

test(
  "a real outer worker deadline terminates non-cooperative synchronous work",
  { timeout: 5_000 },
  async () => {
    const worker = new Worker(
      `
      const { parentPort } = require('node:worker_threads');
      parentPort.postMessage('ready');
      parentPort.once('message', () => {
        let state = 0;
        while (true) state = (state + 1) >>> 0;
      });
    `,
      { eval: true },
    );
    try {
      await waitForReady(worker);
      const result = await superviseWorker(
        new NodeWorkerAdapter(worker),
        "start",
        {
          scheduler: realScheduler,
          timeoutMs: 50,
        },
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
    } finally {
      await worker.terminate();
    }
  },
);
