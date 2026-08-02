import type { DxfBackgroundUpload } from "@valle/design-sdk";
import { designClient } from "./client";
export const interoperabilityRepository = {
  getDxf: (documentId: string) => designClient.documents.dxf.get(documentId),
  putDxf: (documentId: string, input: DxfBackgroundUpload) =>
    designClient.documents.dxf.put(documentId, input),
  removeDxf: (documentId: string) =>
    designClient.documents.dxf.remove(documentId),
  exportDxf: (documentId: string) =>
    designClient.documents.dxf.export(documentId),
};
