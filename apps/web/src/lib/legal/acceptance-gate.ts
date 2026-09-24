/**
 * COMPUERTA DE ACEPTACIÓN LEGAL — lógica PURA, sin red.
 *
 * El API (`apps/api/src/modules/legal/`) ya versiona `terms` y `privacy` y
 * registra la aceptación server-owned (`legal-documents.ts`,
 * `legal.controller.ts`). El checkout consulta ambos endpoints y bloquea la
 * compra hasta aceptar la versión vigente. El alta registra su aceptación
 * inicial a nivel identidad, antes de que exista una organización.
 *
 * Este módulo sólo expresa la regla pura de qué cuenta como "aceptado".
 * `CheckoutStarter.tsx` se encarga de la red y del SDK; mantenerlos separados
 * permite probar la compuerta sin sustituir el backend.
 */

export type LegalDocumentId = "terms" | "privacy";

/** Espejo de `LegalDocumentVersion` (API), reducido a lo que esta compuerta necesita. */
export interface LegalDocumentVersion {
  documento: LegalDocumentId;
  version: string;
  requiereAceptacion: boolean;
}

/** Espejo de una fila de `GET /v1/legal/acceptances`. */
export interface LegalAcceptanceRecord {
  document: string;
  version: string;
}

/**
 * Documentos vigentes que EXIGEN aceptación y para los que no existe un
 * registro que coincida con la versión EXACTA publicada.
 *
 * Fallo cerrado en dos direcciones a la vez:
 *   · un documento no aceptado nunca cuenta como aceptado;
 *   · un documento aceptado en una versión VIEJA tampoco cuenta — el cambio de
 *     versión es justo la señal de que el texto cambió y hay que releerlo.
 */
export function missingRequiredAcceptances(
  documents: readonly LegalDocumentVersion[],
  acceptances: readonly LegalAcceptanceRecord[],
): LegalDocumentVersion[] {
  return documents.filter((doc) => {
    if (!doc.requiereAceptacion) return false;
    return !acceptances.some(
      (row) => row.document === doc.documento && row.version === doc.version,
    );
  });
}

/**
 * Atajo para la pregunta concreta que necesita un flujo de compra: ¿puede
 * abrirse sabiendo que los términos vigentes están aceptados? Un registro sin
 * la entrada `terms` (API caído a medias, respuesta vacía) se trata como NO
 * aceptado — nunca como "no aplica".
 */
export function hasAcceptedCurrentTerms(
  documents: readonly LegalDocumentVersion[],
  acceptances: readonly LegalAcceptanceRecord[],
): boolean {
  const terms = documents.find((doc) => doc.documento === "terms");
  if (!terms) return false;
  if (!terms.requiereAceptacion) return true;
  return acceptances.some(
    (row) => row.document === "terms" && row.version === terms.version,
  );
}
