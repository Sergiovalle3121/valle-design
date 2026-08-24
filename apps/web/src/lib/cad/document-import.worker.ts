/// <reference lib="webworker" />

import {
  importDocumentBytes,
  importDocumentText,
  isBinaryImportFormat,
  validateImportFile,
} from "./document-import";
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
};

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  try {
    const { file, sidecars, dwgBetaEnabled } = event.data;
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
        dwg = { betaEnabled: dwgBetaEnabled ?? false, reader: readDwgNeutralDatabase };
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
