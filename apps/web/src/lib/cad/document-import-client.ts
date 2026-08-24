import type { DocumentImportReport } from "./document-import";
import { validateImportFile } from "./document-import";

/**
 * Beta `AC1015_MODELSPACE_2D_V3` (ADR-0009 §6-bis, ampliada §6-ter y
 * §6-quater). `NEXT_PUBLIC_*` se sustituye en tiempo de build, no en
 * runtime: un despliegue público que no la definió como `"true"` nunca la
 * activa, sin depender de configuración de servidor ni de que nadie
 * recuerde apagar nada.
 */
export function isDwgNativeImportBetaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA === "true";
}

type WorkerEvent =
  | { type: "progress"; progress: number; stage: string }
  | { type: "complete"; report: DocumentImportReport }
  | { type: "error"; message: string };

/**
 * Reparte una selección de varios archivos en principal y acompañantes.
 *
 * Un shapefile NO es un archivo: son entre dos y cinco que comparten nombre y
 * se tienen que elegir juntos. El `.shp` manda; el `.shx`, el `.dbf`, el `.prj`
 * y el `.cpg` lo acompañan. Si el usuario elige sólo el `.shp`, se importa
 * igual y el manifiesto declara lo que faltó — sobre todo el `.prj`, sin el
 * cual la geometría es correcta y no se sabe dónde está en el mundo.
 *
 * Cuando no hay ningún `.shp` en la selección se devuelve el primer archivo sin
 * acompañantes, que es el comportamiento de siempre para DXF y JSON.
 */
export function splitDocumentSelection(files: readonly File[]): {
  primary: File;
  sidecars: { shx?: File; dbf?: File; prj?: File; cpg?: File };
} | null {
  if (files.length === 0) return null;
  const ends = (file: File, extension: string) =>
    file.name.toLowerCase().endsWith(extension);
  const primary = files.find((file) => ends(file, ".shp")) ?? files[0];
  if (!ends(primary, ".shp")) return { primary, sidecars: {} };
  const pick = (extension: string) =>
    files.find((file) => ends(file, extension));
  return {
    primary,
    sidecars: {
      ...(pick(".shx") ? { shx: pick(".shx")! } : {}),
      ...(pick(".dbf") ? { dbf: pick(".dbf")! } : {}),
      ...(pick(".prj") ? { prj: pick(".prj")! } : {}),
      ...(pick(".cpg") ? { cpg: pick(".cpg")! } : {}),
    },
  };
}

export function importDocumentFile(
  file: File,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onProgress?: (progress: number, stage: string) => void;
    /** Acompañantes del `.shp`. Vacío para DXF y JSON. */
    sidecars?: { shx?: File; dbf?: File; prj?: File; cpg?: File };
  } = {},
): Promise<DocumentImportReport> {
  const dwgBetaEnabled = isDwgNativeImportBetaEnabled();
  validateImportFile(file.name, file.size, dwgBetaEnabled);
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
    else
      worker.postMessage({
        file,
        sidecars: options.sidecars ?? {},
        dwgBetaEnabled,
      });
  });
}
