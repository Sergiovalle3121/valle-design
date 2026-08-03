/// <reference lib="webworker" />

import { importDocumentText, validateImportFile } from "./document-import";

type WorkerInput = { file: File };

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  try {
    const { file } = event.data;
    validateImportFile(file.name, file.size);
    self.postMessage({
      type: "progress",
      progress: 0.15,
      stage: "Leyendo archivo",
    });
    const content = await file.text();
    self.postMessage({
      type: "progress",
      progress: 0.45,
      stage: "Analizando contenido",
    });
    const report = importDocumentText(file.name, content);
    self.postMessage({
      type: "progress",
      progress: 0.9,
      stage: "Convirtiendo documento",
    });
    self.postMessage({ type: "complete", report });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "No se pudo importar.",
    });
  }
};

export {};
