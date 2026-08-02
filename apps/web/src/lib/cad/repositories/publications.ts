import type { CadPublicationCreate } from "@valle/design-sdk";
import { designClient } from "./client";
export const publicationsRepository = {
  list: (documentId: string) =>
    designClient.documents.publications.list(documentId),
  record: (documentId: string, input: CadPublicationCreate) =>
    designClient.documents.publications.record(documentId, input),
};
