export interface AutosaveScheduler {
  schedule(documentChanged: () => Promise<void>): void;
  flush(): Promise<void>;
  cancel(): void;
}

/** Debounce puro y reutilizable para recovery/autosave; nunca captura un modelo CAD. */
export function createDebouncedAutosave(delayMs: number): AutosaveScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => Promise<void>) | undefined;
  let running = Promise.resolve();
  const run = async () => {
    const task = pending; pending = undefined;
    if (task) running = running.then(task, task);
    await running;
  };
  return {
    schedule(task) { pending = task; if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = undefined; void run(); }, delayMs); },
    async flush() { if (timer) clearTimeout(timer); timer = undefined; await run(); },
    cancel() { if (timer) clearTimeout(timer); timer = undefined; pending = undefined; },
  };
}

