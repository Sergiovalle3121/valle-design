import type { CadDocumentInline } from "@valle/design-sdk";
import { designClient } from "./client";

/**
 * El historial CAS del documento: una versión por cada guardado, inmutable.
 * `restoreAs` no borra ni reescribe nada: guarda el documento de una versión
 * antigua como versión NUEVA, con el CAS de siempre (409 si el servidor
 * avanzó mientras tanto).
 */
export const versionsRepository = {
  list: (documentId: string) =>
    designClient.documents.versions.list(documentId),
  get: (documentId: string, version: number) =>
    designClient.documents.versions.get(documentId, version),
  restoreAs: (
    documentId: string,
    cadDocument: CadDocumentInline,
    expectedCadDocumentVersion: number,
  ) =>
    designClient.documents.saveContent(
      documentId,
      cadDocument,
      expectedCadDocumentVersion,
    ),
};
