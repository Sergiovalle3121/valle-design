import type { DocumentImportReport } from "./document-import";
// La validación viene del módulo LIGERO a propósito: `document-import.ts`
// arrastra 539 KB de fuente (DXF, shapefile, puentes DWG, lectores
// geográficos) y este cliente sólo necesita saber si el archivo entra. El
// importador de verdad ya vive en su worker, que se descarga aparte.
import { validateImportFile } from "./document-import-validation";

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

/**
 * AC1018 (2004), ADR-0009 §7. Variable DISTINTA a propósito: encender la
 * beta base no enciende ésta, y viceversa no tendría efecto (sin la beta
 * base, `dwgAc1018BetaImportIsEnabled` sigue cerrado por la conjunción de
 * `dwg-interop-flag.ts`).
 */
export function isDwgAc1018ImportBetaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA === "true";
}

/**
 * Perfil 3D heredado propuesto (`AC1015_3D_WIREFRAME_V1`, ADR-0009 §9).
 * Variable DISTINTA, mismo patrón que AC1018: encender la beta base no
 * enciende ésta. Hoy no hay despliegue posible donde valga algo: incluso con
 * esta variable en `"true"` y la beta base encendida,
 * `dwg3dWireframeBetaImportIsEnabled` (`dwg-interop-flag.ts`) sigue devolviendo
 * `false` porque nadie ha firmado `DWG_3D_WIREFRAME_BETA_AUTHORIZATION`
 * todavía — el cableado existe para que ese día sea encender una variable,
 * no escribir código.
 */
export function isDwg3dWireframeImportBetaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DWG_3D_WIREFRAME_IMPORT_BETA === "true";
}

/**
 * La familia MODERNA (AC1024/AC1027/AC1032) tiene SU variable, distinta de la
 * de AC1018 aunque compartan contenedor R2004: colgar tres versiones nuevas de
 * la variable que ya existe es justo la comodidad que el mecanismo separado
 * de `dwg-interop-flag.ts` existe para impedir.
 *
 * Encenderla NO basta y no es un descuido: `dwgModernBetaImportIsEnabled`
 * exige además la firma del titular, que hoy es `false`. El cableado existe
 * para que ese día sea encender una variable, no escribir código.
 */
export function isDwgModernImportBetaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA === "true";
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

/**
 * T-75(f): el reloj de ATASCO, aislado de `importDocumentFile` para poder
 * probarlo sin un `Worker` real (Node no tiene la API de Worker del
 * navegador). A diferencia de un plazo total, `arm()` se llama en cada señal
 * de vida (cada `onProgress`) y REINICIA la cuenta: sólo dispara cuando pasan
 * `stallMs` sin que nadie vuelva a llamar `arm()`.
 */
export function createStallWatchdog(stallMs: number, onFire: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const arm = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) onFire();
    }, stallMs);
  };
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  return { arm, stop };
}

export function importDocumentFile(
  file: File,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onProgress?: (progress: number, stage: string) => void;
    /**
     * T-75(f): la importación moría a los 45 s aunque estuviera avanzando —
     * un reloj de PLAZO TOTAL, no de ATASCO. Un plano grande que sigue
     * mandando progreso legítimamente pasado ese plazo moría igual que uno
     * de verdad colgado, y el mensaje ("excedió 45 segundos") no distinguía
     * los dos casos.
     *
     * Con `onStalled`, el reloj deja de medir el total y pasa a medir
     * SILENCIO: se reinicia en cada `onProgress`, y sólo dispara cuando no
     * llega NINGÚN progreso durante `stallMs` (el mismo valor de
     * `timeoutMs`, renombrado en la intención). Al dispararse NO rechaza la
     * promesa — llama a `onStalled(resume)` y espera: quien lo escucha
     * decide "Seguir esperando" (llama a `resume()`, que reinicia el reloj)
     * o "Cancelar" (aborta por `signal`, el camino que ya existía). Sin
     * `onStalled` el comportamiento es EXACTAMENTE el de antes —un plazo
     * fijo que rechaza solo— para no romper a quien no pidió el cambio.
     */
    onStalled?: (resume: () => void) => void;
    /** Acompañantes del `.shp`. Vacío para DXF y JSON. */
    sidecars?: { shx?: File; dbf?: File; prj?: File; cpg?: File };
  } = {},
): Promise<DocumentImportReport> {
  const dwgBetaEnabled = isDwgNativeImportBetaEnabled();
  const dwgAc1018BetaEnabled = isDwgAc1018ImportBetaEnabled();
  const dwg3dWireframeBetaEnabled = isDwg3dWireframeImportBetaEnabled();
  const dwgModernBetaEnabled = isDwgModernImportBetaEnabled();
  validateImportFile(file.name, file.size, dwgBetaEnabled);
  const stallMs = options.timeoutMs ?? 45_000;
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
      watchdog.stop();
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      action();
    };
    const abort = () =>
      finish(() =>
        reject(new DOMException("Importación cancelada.", "AbortError")),
      );
    const watchdog = createStallWatchdog(stallMs, () => {
      if (options.onStalled) {
        // No se rechaza: la decisión es de quien escucha el atasco.
        options.onStalled(watchdog.arm);
      } else {
        finish(() =>
          reject(new Error(`La importación no avanzó en ${Math.round(stallMs / 1000)} segundos.`)),
        );
      }
    });
    watchdog.arm();
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      if (message.type === "progress") {
        watchdog.arm();
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
        dwgAc1018BetaEnabled,
        dwg3dWireframeBetaEnabled,
        dwgModernBetaEnabled,
      });
  });
}
