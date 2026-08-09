import assert from "node:assert/strict";
import test from "node:test";
import { createDwgLimits, DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { createInputSnapshot } from "../../src/security/input-snapshot.js";
import {
  createDwgError,
  DwgParseError,
  normalizeDwgError,
} from "../../src/security/parse-error.js";
import { ResourceBudget } from "../../src/security/resource-budget.js";
import {
  superviseWorker,
  type WorkerEventListener,
  type WorkerEventType,
  type WorkerLike,
  type WorkerScheduler,
  type WorkerSupervisorOptions,
} from "../../src/security/worker-supervisor.js";
import { assertDwgError, ascii } from "../support/assert.js";
import { FixedClock, ManualClock } from "../support/fake-clock.js";

test("resource budget counts exact work and rejects the first excess unit", () => {
  const budget = new ResourceBudget(
    createDwgLimits({ maxWorkUnits: 3, workPollInterval: 3 }),
    {
      clock: new FixedClock(0),
    },
  );
  budget.consume(3, 0);
  assert.equal(budget.workUnits, 3);
  assertDwgError(() => budget.consume(1, 3), "DWG_WORK_LIMIT_EXCEEDED");
  assert.equal(budget.workUnits, 3);
});

test("resource budget polls every crossed work interval", () => {
  let signalReads = 0;
  const budget = new ResourceBudget(
    createDwgLimits({ maxWorkUnits: 10, workPollInterval: 2 }),
    {
      clock: new FixedClock(0),
      signal: {
        get aborted(): boolean {
          signalReads += 1;
          return signalReads >= 3;
        },
      },
    },
  );
  assertDwgError(() => budget.consume(5, 0), "DWG_CANCELLED");
  assert.equal(signalReads, 3);
  assert.equal(budget.workUnits, 4);
});

test("resource deadline uses an injected absolute clock without sleep", () => {
  const clock = new ManualClock(10);
  const budget = new ResourceBudget(createDwgLimits({ workPollInterval: 1 }), {
    clock,
    deadlineMs: 12,
  });
  clock.advance(2);
  assertDwgError(() => budget.consume(1, 0), "DWG_DEADLINE_EXCEEDED");
});

test("fractional clocks preserve the configured wall-time deadline", () => {
  let reads = 0;
  const clock = {
    now(): number {
      reads += 1;
      return reads === 1 ? 0.5 : 1.5;
    },
  };
  assertDwgError(
    () => new ResourceBudget(createDwgLimits({ maxWallTimeMs: 1 }), { clock }),
    "DWG_DEADLINE_EXCEEDED",
  );
});

test("work availability rejects an oversized operation before accounting", () => {
  const budget = new ResourceBudget(createDwgLimits({ maxWorkUnits: 1 }), {
    clock: new FixedClock(0),
  });
  assertDwgError(
    () => budget.assertWorkAvailable(2, 0),
    "DWG_WORK_LIMIT_EXCEEDED",
  );
  assert.equal(budget.workUnits, 0);
});

test("resource budget snapshots and freezes caller-owned limits", () => {
  const limits = {
    ...createDwgLimits({ maxWorkUnits: 1, workPollInterval: 1 }),
  };
  const budget = new ResourceBudget(limits, { clock: new FixedClock(0) });
  limits.maxWorkUnits = 10;
  assert.equal(Object.isFrozen(budget.limits), true);
  assert.equal(budget.limits.maxWorkUnits, 1);
  assertDwgError(() => budget.consume(2, 0), "DWG_WORK_LIMIT_EXCEEDED");
});

test("resource deadline uses the frozen limit after a reentrant clock", () => {
  const limits = {
    ...createDwgLimits({ maxWallTimeMs: 1 }),
  };
  let reads = 0;
  const budget = new ResourceBudget(limits, {
    clock: {
      now(): number {
        reads += 1;
        if (reads === 1) limits.maxWallTimeMs = 2_000;
        return 0;
      },
    },
  });
  assert.equal(budget.limits.maxWallTimeMs, 1);
  assert.equal(budget.deadlineMs, 1);
});

test("owned parse-error details cannot be replaced before normalization", () => {
  const detail = createDwgError("DWG_CANCELLED", "cancelled", 3, "cancelled");
  const error = new DwgParseError(detail);
  assert.throws(() =>
    Object.defineProperty(error, "detail", {
      get(): never {
        throw new Error("must not escape");
      },
    }),
  );
  assert.equal(normalizeDwgError(error), detail);
});

test("already-cancelled and malformed signals fail with typed errors", () => {
  assertDwgError(
    () => new ResourceBudget(DEFAULT_DWG_LIMITS, { signal: { aborted: true } }),
    "DWG_CANCELLED",
  );
  assertDwgError(
    () =>
      new ResourceBudget(DEFAULT_DWG_LIMITS, {
        signal: { aborted: "yes" } as never,
      }),
    "DWG_INPUT_INVALID",
  );
});

test("snapshot charges one unit per copied byte and owns its exact region", () => {
  const backing = Uint8Array.of(9, 65, 67, 49, 48, 49, 53, 9);
  const view = new Uint8Array(backing.buffer, 1, 6);
  const budget = new ResourceBudget(DEFAULT_DWG_LIMITS, {
    clock: new FixedClock(0),
  });
  const snapshot = createInputSnapshot(view, DEFAULT_DWG_LIMITS, budget);
  backing.fill(0);
  assert.deepEqual(snapshot, ascii("AC1015"));
  assert.equal(budget.workUnits, 6);
  assert.notEqual(snapshot.buffer, view.buffer);
});

class FakeWorker implements WorkerLike {
  readonly listeners = new Map<WorkerEventType, Set<WorkerEventListener>>([
    ["message", new Set()],
    ["error", new Set()],
  ]);
  posted: unknown[] = [];
  terminations = 0;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminations += 1;
  }

  addEventListener(type: WorkerEventType, listener: WorkerEventListener): void {
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(
    type: WorkerEventType,
    listener: WorkerEventListener,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: WorkerEventType, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener(event);
  }
}

class ManualScheduler implements WorkerScheduler {
  callback: (() => void) | undefined;
  cleared = 0;

  setTimeout(callback: () => void): unknown {
    this.callback = callback;
    return 1;
  }

  clearTimeout(): void {
    this.cleared += 1;
  }
}

test("worker supervisor resolves a message, cleans listeners and terminates", async () => {
  const worker = new FakeWorker();
  const scheduler = new ManualScheduler();
  const pending = superviseWorker<{ answer: number }>(
    worker,
    { request: 1 },
    { timeoutMs: 10, scheduler },
  );
  worker.emit("message", { data: { answer: 42 } });
  assert.deepEqual(await pending, { ok: true, value: { answer: 42 } });
  assert.deepEqual(worker.posted, [{ request: 1 }]);
  assert.equal(worker.terminations, 1);
  assert.equal(scheduler.cleared, 1);
  assert.equal(worker.listeners.get("message")?.size, 0);
});

test("worker supervisor returns typed error and terminates on error", async () => {
  const worker = new FakeWorker();
  const scheduler = new ManualScheduler();
  const pending = superviseWorker(worker, null, { timeoutMs: 10, scheduler });
  worker.emit("error", new Error("sensitive worker detail"));
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_INTERNAL_ERROR");
    assert.equal(result.error.message.includes("sensitive"), false);
  }
  assert.equal(worker.terminations, 1);
});

test("worker supervisor enforces an external timeout", async () => {
  const worker = new FakeWorker();
  const scheduler = new ManualScheduler();
  const pending = superviseWorker(worker, "probe", {
    timeoutMs: 10,
    scheduler,
  });
  scheduler.callback?.();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
  assert.equal(worker.terminations, 1);
});

test("a synchronous timeout scheduler never posts after timing out", async () => {
  const worker = new FakeWorker();
  let cleared = 0;
  const scheduler: WorkerScheduler = {
    setTimeout(callback): unknown {
      callback();
      return 7;
    },
    clearTimeout(): void {
      cleared += 1;
    },
  };
  const result = await superviseWorker(worker, "must-not-post", {
    timeoutMs: 10,
    scheduler,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(worker.posted, []);
  assert.equal(worker.terminations, 1);
  assert.equal(cleared, 1);
});

test("hostile worker supervisor option getters never throw synchronously", async () => {
  const throwing = (): never => {
    throw new Error("hostile option getter");
  };
  const hostileOptions: unknown[] = [
    Object.defineProperty({}, "timeoutMs", { get: throwing }),
    Object.defineProperty({ timeoutMs: 10 }, "scheduler", { get: throwing }),
    {
      timeoutMs: 10,
      scheduler: Object.defineProperty({}, "setTimeout", { get: throwing }),
    },
    {
      timeoutMs: 10,
      scheduler: Object.defineProperty({}, "clearTimeout", { get: throwing }),
    },
  ];

  for (const options of hostileOptions) {
    const worker = new FakeWorker();
    let pending: ReturnType<typeof superviseWorker> | undefined;
    assert.doesNotThrow(() => {
      pending = superviseWorker(
        worker,
        "must-not-post",
        options as WorkerSupervisorOptions,
      );
    });
    assert.notEqual(pending, undefined);
    const result = await pending!;
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "DWG_INPUT_INVALID");
    assert.deepEqual(worker.posted, []);
    assert.equal(worker.terminations, 0);
  }
});

test("captured scheduler methods clear an installed undefined handle", async () => {
  let setGetterReads = 0;
  let clearGetterReads = 0;
  const clearedHandles: unknown[] = [];
  const scheduler = {
    get setTimeout(): WorkerScheduler["setTimeout"] {
      setGetterReads += 1;
      if (setGetterReads > 1) throw new Error("setTimeout getter re-read");
      return (): undefined => undefined;
    },
    get clearTimeout(): WorkerScheduler["clearTimeout"] {
      clearGetterReads += 1;
      if (clearGetterReads > 1) throw new Error("clearTimeout getter re-read");
      return (handle): void => {
        clearedHandles.push(handle);
      };
    },
  };
  const worker = new FakeWorker();
  const pending = superviseWorker(worker, "request", {
    timeoutMs: 10,
    scheduler,
  });
  worker.emit("message", { data: "done" });

  assert.deepEqual(await pending, { ok: true, value: "done" });
  assert.equal(setGetterReads, 1);
  assert.equal(clearGetterReads, 1);
  assert.deepEqual(clearedHandles, [undefined]);
  assert.equal(worker.terminations, 1);
});
