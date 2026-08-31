/// <reference lib="webworker" />

import {
  importDocumentBytes,
  importDocumentText,
  isBinaryImportFormat,
  validateImportFile,
} from "./document-import";
import { dwg3dWireframeBetaImportIsEnabled, dwgAc1018BetaImportIsEnabled } from "./dwg-interop-flag";
import type { DwgNeutralDatabaseReader } from "./dwg-neutral-model";

/**
 * `sidecars` son los acompañantes del shapefile que el usuario haya elegido
 * junto al `.shp`. Viajan ya leídos porque el selector de archivos del
 * navegador entrega los `File` de una vez y volver a pedirlos desde el worker
 * abriría un segundo diálogo.
 */
type WorkerInput = {
  file: File;
  sidecars?: { shx?: File; dbf?: File; prj?: File; cpg?: File };
  /**
   * Beta `AC1015_MODELSPACE_2D_V3` (ADR-0009 §6-bis, ampliada §6-ter y
   * §6-quater). La decide el hilo principal a partir de una variable de
   * build no pública por defecto (`document-import-client.ts`); este
   * worker sólo la reenvía.
   */
  dwgBetaEnabled?: boolean;
  /** AC1018 (2004), ADR-0009 §7. Su propia variable, su propio flag. */
  dwgAc1018BetaEnabled?: boolean;
  /**
   * Perfil 3D heredado PROPUESTO (`AC1015_3D_WIREFRAME_V1`, ADR-0009 §9). Su
   * propia variable, su propio flag — y, a diferencia de los dos de arriba,
   * sin firma del titular todavía: `dwg3dWireframeBetaImportIsEnabled`
   * siempre resuelve `false` hoy, encendida esta variable o no.
   */
  dwg3dWireframeBetaEnabled?: boolean;
};

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  try {
    const { file, sidecars, dwgBetaEnabled, dwgAc1018BetaEnabled, dwg3dWireframeBetaEnabled } =
      event.data;
    validateImportFile(file.name, file.size, dwgBetaEnabled ?? false);
    self.postMessage({
      type: "progress",
      progress: 0.15,
      stage: "Leyendo archivo",
    });
    // Un shapefile es binario: `File.text()` lo decodificaría como UTF-8 y
    // sustituiría cada byte inválido, así que lo que llegaría al lector ya no
    // serían los bytes del archivo sino una traducción destructiva de ellos.
    if (isBinaryImportFormat(file.name)) {
      const bytes = await file.arrayBuffer();
      self.postMessage({
        type: "progress",
        progress: 0.45,
        stage: "Analizando geometría",
      });
      // El adaptador DWG se importa DINÁMICAMENTE, sólo cuando el archivo es
      // .dwg: SHP/DXF/JSON son la mayoría de las importaciones y no tienen
      // por qué pagar el peso del códec en su chunk. Static import aquí
      // también rompía el worker entero si el módulo fallaba al cargar — el
      // fallo de un formato tumbaba los demás sin decir por qué.
      let dwg: { betaEnabled: boolean; reader: DwgNeutralDatabaseReader } | undefined;
      if (file.name.trim().toLowerCase().endsWith(".dwg")) {
        const { readDwgNeutralDatabase } = await import("./dwg-native-reader");
        // La conjunción de los dos flags vive en `dwg-interop-flag.ts`, no
        // aquí: este worker no decide autorizaciones, sólo las reenvía ya
        // resueltas a la única opción que el lector entiende.
        const allowAc1018 = dwgAc1018BetaImportIsEnabled(
          dwgAc1018BetaEnabled ?? false,
          dwgBetaEnabled ?? false,
        );
        const allow3dWireframe = dwg3dWireframeBetaImportIsEnabled(
          dwg3dWireframeBetaEnabled ?? false,
          dwgBetaEnabled ?? false,
        );
        dwg = {
          betaEnabled: dwgBetaEnabled ?? false,
          reader: (dwgBytes) =>
            readDwgNeutralDatabase(dwgBytes, { allowAc1018, allow3dWireframe }),
        };
      }
      const binaryReport = importDocumentBytes(
        file.name,
        bytes,
        {
          ...(sidecars?.shx ? { shx: await sidecars.shx.arrayBuffer() } : {}),
          ...(sidecars?.dbf ? { dbf: await sidecars.dbf.arrayBuffer() } : {}),
          ...(sidecars?.prj ? { prj: await sidecars.prj.text() } : {}),
          ...(sidecars?.cpg ? { cpg: await sidecars.cpg.text() } : {}),
        },
        dwg,
      );
      self.postMessage({
        type: "progress",
        progress: 0.9,
        stage: "Convirtiendo documento",
      });
      self.postMessage({ type: "complete", report: binaryReport });
      return;
    }
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
