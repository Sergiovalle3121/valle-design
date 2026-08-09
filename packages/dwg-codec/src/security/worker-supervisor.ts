import {
  createDwgError,
  normalizeDwgError,
  type DwgError,
} from "./parse-error.js";

// Timers are host capabilities captured lexically at module initialization.
// The ambient declarations keep the runtime-neutral build free of DOM/Node
// type dependencies; both supported hosts provide these standard functions.
declare const setTimeout: (callback: () => void, delayMs: number) => unknown;
declare const clearTimeout: (handle: unknown) => void;

export type WorkerEventType = "message" | "error";
export type WorkerEventListener = (event: unknown) => void;

/**
 * Declaration required from the first-party adapter around a platform worker.
 *
 * Receiver-side code cannot apply a budget until the platform has delivered a
 * structured clone. The adapter and worker implementation therefore form one
 * first-party transport boundary: outbound responses must be budgeted before
 * posting and every response ArrayBuffer must be transferred, not cloned. This
 * marker is a fail-closed contract declaration, not proof against hostile host
 * code.
 */
export const DWG_FIRST_PARTY_WORKER_TRANSPORT =
  "valle-dwg-first-party-budgeted-transfer-v1" as const;

/**
 * Structural ceiling for one message transfer list. The portable protocol
 * charges every entry separately; this independent bound also protects direct
 * internal supervisor callers before a Set or captured list is allocated.
 */
export const MAX_DWG_WORKER_TRANSFER_BUFFERS = 16_384;

export type WorkerTransferList = readonly ArrayBuffer[];

export interface WorkerLike {
  readonly dwgTransportContract: typeof DWG_FIRST_PARTY_WORKER_TRANSPORT;
  postMessage(message: unknown, transferList: WorkerTransferList): void;
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
  /** Deterministic/test deadline injection; a captured host timer also guards it. */
  readonly scheduler: WorkerScheduler;
}

type WorkerMessageParser<Result> = (message: unknown) => Result;

export type WorkerSupervisionResult<Result> =
  | Readonly<{ ok: true; value: Result }>
  | Readonly<{ ok: false; error: DwgError }>;

/** Highest supported outer wall-time budget for one worker operation. */
export const MAX_DWG_WORKER_TIMEOUT_MS = 5 * 60_000;

/**
 * A void return is the WorkerLike contract's synchronous acknowledgement. If
 * terminate returns a native Promise, its resolution is required before an
 * operation result is returned. If that cannot be confirmed within this
 * bound, the selected result is replaced with a typed internal failure. No
 * acknowledgement proves that a non-conforming WorkerLike implementation
 * actually stopped; its owner must discard the containing realm or process.
 */
export const DWG_WORKER_TERMINATION_CONFIRMATION_TIMEOUT_MS = 250;

interface CapturedWorker {
  postMessage(message: unknown, transferList: WorkerTransferList): void;
  terminate(): unknown;
  addEventListener(type: WorkerEventType, listener: WorkerEventListener): void;
  removeEventListener(
    type: WorkerEventType,
    listener: WorkerEventListener,
  ): void;
}

interface CapturedSupervisorOptions {
  readonly timeoutMs: number;
  schedule(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

interface HostTimer {
  schedule(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const OWNED_PROMISE = Promise;
const INTRINSIC_PROMISE_THEN = Promise.prototype.then;
const INTRINSIC_SET_TIMEOUT = setTimeout;
const INTRINSIC_CLEAR_TIMEOUT = clearTimeout;
const EMPTY_WORKER_TRANSFER_LIST: WorkerTransferList = Object.freeze([]);
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;

function resolvedPromise<Value>(value: Value): Promise<Value> {
  return new OWNED_PROMISE<Value>((resolve) => resolve(value));
}

const HOST_TIMER: HostTimer | null = (() => {
  try {
    return Object.freeze({
      schedule(callback: () => void, delayMs: number): unknown {
        return INTRINSIC_SET_TIMEOUT(callback, delayMs);
      },
      clear(handle: unknown): void {
        INTRINSIC_CLEAR_TIMEOUT(handle);
      },
    });
  } catch {
    return null;
  }
})();

function inputFailure(message: string): WorkerSupervisionResult<never> {
  return Object.freeze({
    ok: false,
    error: createDwgError("DWG_INPUT_INVALID", "input", 0, message),
  });
}

function captureTransferList(value: unknown): WorkerTransferList | null {
  try {
    if (
      !Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Array.prototype ||
      ARRAY_BUFFER_BYTE_LENGTH === undefined
    ) {
      return null;
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > MAX_DWG_WORKER_TRANSFER_BUFFERS
    ) {
      return null;
    }
    const length = lengthDescriptor.value as number;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) return null;

    const seen = new Set<ArrayBuffer>();
    const captured = new Array<ArrayBuffer>(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
      const buffer = descriptor.value as unknown;
      if (
        (typeof buffer !== "object" && typeof buffer !== "function") ||
        buffer === null
      ) {
        return null;
      }
      Reflect.apply(ARRAY_BUFFER_BYTE_LENGTH, buffer, []);
      const ordinaryBuffer = buffer as ArrayBuffer;
      if (seen.has(ordinaryBuffer)) return null;
      seen.add(ordinaryBuffer);
      captured[index] = ordinaryBuffer;
    }
    return Object.freeze(captured);
  } catch {
    return null;
  }
}

function terminationFailure(): WorkerSupervisionResult<never> {
  return Object.freeze({
    ok: false,
    error: createDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "The worker termination could not be confirmed.",
    ),
  });
}

function captureWorker(value: unknown): CapturedWorker | null {
  try {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null
    ) {
      return null;
    }
    const transportDescriptor = Reflect.getOwnPropertyDescriptor(
      value,
      "dwgTransportContract",
    );
    if (
      transportDescriptor === undefined ||
      !("value" in transportDescriptor) ||
      transportDescriptor.value !== DWG_FIRST_PARTY_WORKER_TRANSPORT
    ) {
      return null;
    }
    const postMessage = Reflect.get(value, "postMessage") as unknown;
    const terminate = Reflect.get(value, "terminate") as unknown;
    const addEventListener = Reflect.get(value, "addEventListener") as unknown;
    const removeEventListener = Reflect.get(
      value,
      "removeEventListener",
    ) as unknown;
    if (
      typeof postMessage !== "function" ||
      typeof terminate !== "function" ||
      typeof addEventListener !== "function" ||
      typeof removeEventListener !== "function"
    ) {
      return null;
    }
    return Object.freeze({
      postMessage(message: unknown, transferList: WorkerTransferList): void {
        Reflect.apply(postMessage, value, [message, transferList]);
      },
      terminate(): unknown {
        return Reflect.apply(terminate, value, []);
      },
      addEventListener(
        type: WorkerEventType,
        listener: WorkerEventListener,
      ): void {
        Reflect.apply(addEventListener, value, [type, listener]);
      },
      removeEventListener(
        type: WorkerEventType,
        listener: WorkerEventListener,
      ): void {
        Reflect.apply(removeEventListener, value, [type, listener]);
      },
    });
  } catch {
    return null;
  }
}

function inspectOptions(value: unknown): CapturedSupervisorOptions | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 2 ||
      !keys.includes("timeoutMs") ||
      !keys.includes("scheduler")
    ) {
      return null;
    }
    const timeoutDescriptor = Reflect.getOwnPropertyDescriptor(
      value,
      "timeoutMs",
    );
    const schedulerDescriptor = Reflect.getOwnPropertyDescriptor(
      value,
      "scheduler",
    );
    if (
      timeoutDescriptor === undefined ||
      !("value" in timeoutDescriptor) ||
      schedulerDescriptor === undefined ||
      !("value" in schedulerDescriptor)
    ) {
      return null;
    }
    const timeoutMs = timeoutDescriptor.value as unknown;
    const scheduler = schedulerDescriptor.value as unknown;
    if (
      typeof timeoutMs !== "number" ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > MAX_DWG_WORKER_TIMEOUT_MS ||
      (typeof scheduler !== "object" && typeof scheduler !== "function") ||
      scheduler === null
    ) {
      return null;
    }
    const setTimeout = Reflect.get(scheduler, "setTimeout") as unknown;
    const clearTimeout = Reflect.get(scheduler, "clearTimeout") as unknown;
    if (
      typeof setTimeout !== "function" ||
      typeof clearTimeout !== "function"
    ) {
      return null;
    }
    return Object.freeze({
      timeoutMs,
      schedule(callback: () => void, delayMs: number): unknown {
        return Reflect.apply(setTimeout, scheduler, [callback, delayMs]);
      },
      clear(handle: unknown): void {
        Reflect.apply(clearTimeout, scheduler, [handle]);
      },
    });
  } catch {
    return null;
  }
}

function messageData(event: unknown): unknown {
  if (
    (typeof event === "object" || typeof event === "function") &&
    event !== null &&
    Reflect.has(event, "data")
  ) {
    return Reflect.get(event, "data");
  }
  return event;
}

function confirmTermination(worker: CapturedWorker): Promise<boolean> {
  let termination: unknown;
  try {
    termination = worker.terminate();
  } catch {
    return resolvedPromise(false);
  }
  if (termination === undefined) return resolvedPromise(true);
  if (
    (typeof termination !== "object" && typeof termination !== "function") ||
    termination === null
  ) {
    return resolvedPromise(false);
  }
  if (HOST_TIMER === null) return resolvedPromise(false);

  return new OWNED_PROMISE((resolve) => {
    let complete = false;
    let timerInstalled = false;
    let timeoutHandle: unknown;
    const finish = (confirmed: boolean): void => {
      if (complete) return;
      complete = true;
      if (timerInstalled) {
        timerInstalled = false;
        try {
          HOST_TIMER.clear(timeoutHandle);
        } catch {
          // Cleanup cannot turn an unconfirmed termination into confirmation.
        }
      }
      resolve(confirmed);
    };

    try {
      timeoutHandle = HOST_TIMER.schedule(
        () => finish(false),
        DWG_WORKER_TERMINATION_CONFIRMATION_TIMEOUT_MS,
      );
      timerInstalled = true;
      if (complete) {
        timerInstalled = false;
        try {
          HOST_TIMER.clear(timeoutHandle);
        } catch {
          // The termination result has already been selected.
        }
        return;
      }
      Reflect.apply(INTRINSIC_PROMISE_THEN, termination, [
        () => finish(true),
        () => finish(false),
      ]);
    } catch {
      finish(false);
    }
  });
}

export function superviseWorker<Result>(
  workerValue: WorkerLike,
  request: unknown,
  parseMessage: WorkerMessageParser<Result>,
  optionsValue: WorkerSupervisorOptions,
  transferList: WorkerTransferList = EMPTY_WORKER_TRANSFER_LIST,
): Promise<WorkerSupervisionResult<Result>> {
  const worker = captureWorker(workerValue);
  const options = inspectOptions(optionsValue);
  const capturedTransferList = captureTransferList(transferList);
  if (worker === null) {
    return resolvedPromise(inputFailure("The worker interface is invalid."));
  }
  if (options === null) {
    return resolvedPromise(
      inputFailure(
        "The worker timeout or scheduler is outside the supported boundary.",
      ),
    );
  }
  if (capturedTransferList === null) {
    return resolvedPromise(
      inputFailure("The worker transfer list is invalid or contains aliases."),
    );
  }
  if (typeof parseMessage !== "function") {
    return resolvedPromise(
      inputFailure("A worker message parser is required."),
    );
  }
  if (HOST_TIMER === null) {
    return resolvedPromise(
      inputFailure("A trusted host timer is required for worker supervision."),
    );
  }

  return new OWNED_PROMISE((resolve) => {
    let selected = false;
    let timeoutHandle: unknown;
    let timerInstalled = false;
    let hostTimeoutHandle: unknown;
    let hostTimerInstalled = false;

    const clearTimer = (): void => {
      if (timerInstalled) {
        timerInstalled = false;
        try {
          options.clear(timeoutHandle);
        } catch {
          // Cleanup cannot replace the selected typed result.
        }
      }
      if (hostTimerInstalled) {
        hostTimerInstalled = false;
        try {
          HOST_TIMER.clear(hostTimeoutHandle);
        } catch {
          // Cleanup cannot replace the selected typed result.
        }
      }
    };
    const cleanup = (): void => {
      clearTimer();
      try {
        worker.removeEventListener("message", onMessage);
      } catch {
        // Cleanup cannot replace the selected typed result.
      }
      try {
        worker.removeEventListener("error", onError);
      } catch {
        // Cleanup cannot replace the selected typed result.
      }
    };
    const settle = (result: WorkerSupervisionResult<Result>): void => {
      if (selected) return;
      selected = true;
      cleanup();
      try {
        const confirmation = confirmTermination(worker);
        Reflect.apply(INTRINSIC_PROMISE_THEN, confirmation, [
          (confirmed: boolean) => {
            resolve(Object.freeze(confirmed ? result : terminationFailure()));
          },
          () => resolve(terminationFailure()),
        ]);
      } catch {
        resolve(terminationFailure());
      }
    };
    let processingMessage = false;
    const onMessage: WorkerEventListener = (event) => {
      if (selected || processingMessage) return;
      processingMessage = true;
      try {
        const value = parseMessage(messageData(event));
        settle(Object.freeze({ ok: true, value }));
      } catch (error: unknown) {
        settle(Object.freeze({ ok: false, error: normalizeDwgError(error) }));
      } finally {
        processingMessage = false;
      }
    };
    const onError: WorkerEventListener = (event) => {
      settle(Object.freeze({ ok: false, error: normalizeDwgError(event) }));
    };
    const onTimeout = (): void => {
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
    };

    try {
      worker.addEventListener("message", onMessage);
      if (selected) return;
      worker.addEventListener("error", onError);
      if (selected) return;
      hostTimeoutHandle = HOST_TIMER.schedule(onTimeout, options.timeoutMs);
      hostTimerInstalled = true;
      if (selected) {
        clearTimer();
        return;
      }
      timeoutHandle = options.schedule(onTimeout, options.timeoutMs);
      timerInstalled = true;
      if (selected) {
        clearTimer();
        return;
      }
      worker.postMessage(request, capturedTransferList);
    } catch (error: unknown) {
      settle(Object.freeze({ ok: false, error: normalizeDwgError(error) }));
    }
  });
}
