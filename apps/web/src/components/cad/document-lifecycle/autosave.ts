export interface AutosaveScheduler {
  schedule(documentChanged: () => Promise<void>): void;
  /** Runs an explicit save in the same queue and supersedes a pending debounce. */
  run(documentChanged: () => Promise<void>): Promise<void>;
  flush(): Promise<void>;
  cancel(): void;
  getState(): AutosaveState;
}

export type AutosaveStatus =
  "idle" | "scheduled" | "saving" | "saved" | "error";

export interface AutosaveState {
  status: AutosaveStatus;
  queued: number;
  error?: unknown;
}

export interface AutosaveSchedulerOptions {
  onStateChange?: (state: AutosaveState) => void;
}

/**
 * Debounce plus a single-writer queue. The scheduler never captures a CAD
 * model itself: callers provide an immutable save request at execution time.
 * Manual saves and autosaves therefore cannot race a CAS token.
 */
export function createDebouncedAutosave(
  delayMs: number,
  options: AutosaveSchedulerOptions = {},
): AutosaveScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => Promise<void>) | undefined;
  let tail = Promise.resolve();
  let queued = 0;
  let active = false;
  let state: AutosaveState = { status: "idle", queued: 0 };

  const publish = (status: AutosaveStatus, error?: unknown) => {
    state = { status, queued, ...(error === undefined ? {} : { error }) };
    options.onStateChange?.(state);
  };

  const enqueue = (task: () => Promise<void>) => {
    queued += 1;
    const execution = tail.then(async () => {
      queued -= 1;
      active = true;
      publish("saving");
      try {
        await task();
        publish("saved");
      } catch (error) {
        publish("error", error);
        throw error;
      } finally {
        active = false;
      }
    });
    // Keep the queue usable after an individual save failure. The promise
    // returned to that caller still rejects, while subsequent saves can retry.
    tail = execution.catch(() => undefined);
    return execution;
  };

  const runPending = async () => {
    const task = pending;
    pending = undefined;
    if (task) await enqueue(task);
    else await tail;
  };

  return {
    schedule(task) {
      pending = task;
      if (timer) clearTimeout(timer);
      publish("scheduled");
      timer = setTimeout(() => {
        timer = undefined;
        void runPending().catch(() => undefined);
      }, delayMs);
    },
    async run(task) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
      await enqueue(task);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await runPending();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
      if (!active && queued === 0) publish("idle");
    },
    getState() {
      return state;
    },
  };
}
