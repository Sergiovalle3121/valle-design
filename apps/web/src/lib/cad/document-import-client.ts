import type { DocumentImportReport } from "./document-import";
import { validateImportFile } from "./document-import";

type WorkerEvent =
  | { type: "progress"; progress: number; stage: string }
  | { type: "complete"; report: DocumentImportReport }
  | { type: "error"; message: string };

export function importDocumentFile(
  file: File,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onProgress?: (progress: number, stage: string) => void;
  } = {},
): Promise<DocumentImportReport> {
  validateImportFile(file.name, file.size);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./document-import.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      action();
    };
    const abort = () =>
      finish(() =>
        reject(new DOMException("Importación cancelada.", "AbortError")),
      );
    const timeout = setTimeout(
      () =>
        finish(() => reject(new Error("La importación excedió 45 segundos."))),
      options.timeoutMs ?? 45_000,
    );
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      if (message.type === "progress") {
        options.onProgress?.(message.progress, message.stage);
      } else if (message.type === "complete") {
        finish(() => resolve(message.report));
      } else {
        finish(() => reject(new Error(message.message)));
      }
    };
    worker.onerror = () =>
      finish(() => reject(new Error("El worker de importación falló.")));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    else worker.postMessage({ file });
  });
}
