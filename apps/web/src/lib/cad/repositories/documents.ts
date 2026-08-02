import type {
  CadDocumentCreate,
  CadDocumentInline,
  CadDocumentMetaUpdate,
} from "@valle/design-sdk";
import { designClient } from "./client";

export const documentsRepository = {
  list: designClient.documents.list,
  create: (input: CadDocumentCreate) => designClient.documents.create(input),
  open: (documentId: string) => designClient.documents.open(documentId),
  updateMeta: (documentId: string, patch: CadDocumentMetaUpdate) =>
    designClient.documents.updateMeta(documentId, patch),
  saveContent: (
    documentId: string,
    content: CadDocumentInline,
    expectedVersion: number,
  ) => designClient.documents.saveContent(documentId, content, expectedVersion),
  saveArchive: (documentId: string, archive: Blob, expectedVersion: number) =>
    designClient.documents.saveArchive(documentId, archive, expectedVersion),
  archive: (documentId: string) => designClient.documents.archive(documentId),
};
