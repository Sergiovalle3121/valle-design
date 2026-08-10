import {
  createDwgError,
  normalizeDwgError,
  type DwgError,
} from "./parse-error.js";

export type WorkerEventType = "message" | "error";
export type WorkerEventListener = (event: unknown) => void;

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void | Promise<void>;
  addEventListener(type: WorkerEventType, listener: WorkerEventListener): void;
  removeEventListener(
    type: WorkerEventType,
    listener: WorkerEventListener,
  ): void;
}

export interface WorkerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WorkerSupervisorOptions {
  readonly timeoutMs: number;
  readonly scheduler: WorkerScheduler;
}

export type WorkerSupervisionResult<Result> =
  | Readonly<{ ok: true; value: Result }>
  | Readonly<{ ok: false; error: DwgError }>;

function messageData(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "data" in event) {
    return (event as Readonly<{ data: unknown }>).data;
  }
  return event;
}

export function superviseWorker<Result>(
  worker: WorkerLike,
  request: unknown,
  options: WorkerSupervisorOptions,
): Promise<WorkerSupervisionResult<Result>> {
  let timeoutMs: number;
  let scheduler: WorkerScheduler;
  let setScheduledTimeout: WorkerScheduler["setTimeout"];
  let clearScheduledTimeout: WorkerScheduler["clearTimeout"];
  try {
    if (typeof options !== "object" || options === null) {
      throw new TypeError("Invalid worker supervisor options.");
    }
    const candidate = options as WorkerSupervisorOptions;
    timeoutMs = candidate.timeoutMs;
    scheduler = candidate.scheduler;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      typeof scheduler !== "object" ||
      scheduler === null
    ) {
      throw new TypeError("Invalid worker supervisor options.");
    }
    setScheduledTimeout = scheduler.setTimeout;
    clearScheduledTimeout = scheduler.clearTimeout;
    if (
      typeof setScheduledTimeout !== "function" ||
      typeof clearScheduledTimeout !== "function"
    ) {
      throw new TypeError("Invalid worker supervisor scheduler.");
    }
  } catch {
    return Promise.resolve(
      Object.freeze({
        ok: false,
        error: createDwgError(
          "DWG_INPUT_INVALID",
          "input",
          0,
          "The worker timeout must be a positive safe integer.",
        ),
      }),
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutHandle: unknown;
    let timerInstalled = false;

    const terminate = (): void => {
      try {
        const termination = worker.terminate();
        void Promise.resolve(termination).catch(() => undefined);
      } catch {
        // Termination is best-effort after the typed result has been selected.
      }
    };
    const clearTimer = (): void => {
      if (!timerInstalled) return;
      timerInstalled = false;
      try {
        Reflect.apply(clearScheduledTimeout, scheduler, [timeoutHandle]);
      } catch {
        // Cleanup cannot replace the already selected typed result.
      }
    };
    const cleanup = (): void => {
      clearTimer();
      try {
        worker.removeEventListener("message", onMessage);
      } catch {
        // Cleanup cannot replace the already selected typed result.
      }
      try {
        worker.removeEventListener("error", onError);
      } catch {
        // Cleanup cannot replace the already selected typed result.
      }
    };
    const settle = (result: WorkerSupervisionResult<Result>): void => {
      if (settled) return;
      settled = true;
      cleanup();
      terminate();
      resolve(Object.freeze(result));
    };
    const onMessage: WorkerEventListener = (event) => {
      try {
        settle(
          Object.freeze({ ok: true, value: messageData(event) as Result }),
        );
      } catch (error: unknown) {
        settle(Object.freeze({ ok: false, error: normalizeDwgError(error) }));
      }
    };
    const onError: WorkerEventListener = (event) => {
      settle(Object.freeze({ ok: false, error: normalizeDwgError(event) }));
    };

    try {
      worker.addEventListener("message", onMessage);
      if (settled) return;
      worker.addEventListener("error", onError);
      if (settled) return;
      timeoutHandle = Reflect.apply(setScheduledTimeout, scheduler, [
        () => {
          settle(
            Object.freeze({
              ok: false,
              error: createDwgError(
                "DWG_DEADLINE_EXCEEDED",
                "resource",
                0,
                "The worker exceeded its external wall-time limit.",
              ),
            }),
          );
        },
        timeoutMs,
      ]);
      timerInstalled = true;
      if (settled) {
        clearTimer();
        return;
      }
      worker.postMessage(request);
    } catch (error: unknown) {
      settle(Object.freeze({ ok: false, error: normalizeDwgError(error) }));
    }
  });
}
