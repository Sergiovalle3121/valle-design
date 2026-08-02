import { designClient } from "./client";
export const versionsRepository = {
  list: (documentId: string) =>
    designClient.documents.versions.list(documentId),
  get: (documentId: string, version: number) =>
    designClient.documents.versions.get(documentId, version),
};
