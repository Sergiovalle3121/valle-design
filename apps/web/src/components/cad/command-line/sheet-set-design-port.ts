/**
 * El puerto de conjuntos de planos REAL: los repositorios tal cual.
 *
 * Vive aparte de `sheet-set-host.ts` por la misma razón que
 * `document-lifecycle/design-port.ts` vive aparte de su controlador: el puente
 * es lógica pura y se prueba en Node con un puerto de mentira; esto es la
 * ÚNICA superficie de red de los conjuntos, y aquí no hay nada que probar
 * salvo que llama a quien dice llamar.
 *
 * El documento se pide por el MISMO camino que usa abrir un dibujo
 * (`designClient.documents.open` + `migrateCadDocument`), para que una hoja de
 * un conjunto y una hoja abierta a mano sean el mismo dibujo. Traerlo por otra
 * ruta habría sido tener dos verdades sobre qué es un documento migrado.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import { migrateCadDocument } from "@/lib/cad/cad-document-migrate";
import { DesignApiError } from "@/lib/cad/repositories/client";
import { documentsRepository } from "@/lib/cad/repositories/documents";
import {
  sheetSetsRepository,
  toCadSheetSet,
  toCadSheetSetSave,
} from "@/lib/cad/repositories/sheet-sets";
import type { CadStudioSheetSetPort } from "./sheet-set-host";

export function createDesignSheetSetPort(): CadStudioSheetSetPort {
  return {
    sheetSet: async (sheetSetId) =>
      toCadSheetSet(await sheetSetsRepository.get(sheetSetId)),
    document: async (documentId): Promise<CadDocument> => {
      const envelope = await documentsRepository.open(documentId);
      const raw = (envelope as { cadDocument?: unknown }).cadDocument;
      if (!raw) throw new Error(`el documento ${documentId} llegó sin dibujo`);
      return migrateCadDocument(raw as CadDocument);
    },
    save: async (set) =>
      toCadSheetSet(await sheetSetsRepository.save(set.id, toCadSheetSetSave(set))),
    versionConflict: (error) =>
      error instanceof DesignApiError && error.isVersionConflict(),
  };
}
