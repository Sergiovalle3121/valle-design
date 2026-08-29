/**
 * El puerto de documentos REAL: el cliente Design tal cual.
 *
 * Vivía inline dentro del monolito del editor; se extrajo al abrir la costura
 * `documentPort` del modo demostración (campaña de sitio, OLA 2) — el puerto
 * por defecto y el alternativo deben leerse uno al lado del otro, y el
 * monolito solo puede encoger. Es la ÚNICA superficie de red del editor:
 * open/saveContent/saveArchive y el mapeo del conflicto CAS.
 */
import type { CadDocumentInline } from "@valle/design-sdk";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import type { CadDocument } from "@/lib/cad/cad-document";
import type { DocumentLifecyclePort } from "./controller";

export function createDesignDocumentPort(): DocumentLifecyclePort {
  return {
    open: (id) => designClient.documents.open(id),
    saveContent: (id, document: CadDocument, expectedVersion) =>
      designClient.documents.saveContent(
        id,
        document as unknown as CadDocumentInline,
        expectedVersion,
      ),
    saveArchive: (id, archive, expectedVersion) =>
      designClient.documents.saveArchive(id, archive, expectedVersion),
    versionConflict: (error) =>
      error instanceof DesignApiError && error.isVersionConflict()
        ? { current: error.body.current }
        : null,
  };
}
