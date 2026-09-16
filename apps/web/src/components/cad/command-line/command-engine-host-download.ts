/**
 * Helper para la rama `download` de peticiones del anfitrión.
 *
 * Extraído de `command-engine-host.ts` para respetar el presupuesto de800 líneas.
 */
import { downloadCadFile } from "./plot-host";

export function handleDownloadRequest(
  request: { kind: "download"; filename: string; mime: string; content: string },
  label: string,
  log: (message: string, level: "error" | "info") => void,
): void {
  try {
    downloadCadFile(request.filename, new TextEncoder().encode(request.content), request.mime);
    log(`${label}: ${request.filename} descargado.`, "info");
  } catch {
    log(`${label}: no se pudo descargar ${request.filename}.`, "error");
  }
}
