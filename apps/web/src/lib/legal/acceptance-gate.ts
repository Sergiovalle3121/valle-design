/**
 * COMPUERTA DE ACEPTACIÓN LEGAL — lógica PURA, sin red.
 *
 * El API (`apps/api/src/modules/legal/`) ya versiona `terms` y `privacy` y
 * registra la aceptación server-owned (`legal-documents.ts`,
 * `legal.controller.ts`). Lo que falta —documentado explícitamente en el
 * comentario de `legal-documents.ts`— es el lado del web: ninguna pantalla
 * llama todavía a `GET /v1/legal/documents` ni a `POST /v1/legal/acceptances`,
 * así que hoy NADA impide abrir la compra sin haber aceptado nada.
 *
 * Este módulo es la mitad que SÍ se puede construir sin tocar la superficie
 * comercial (`apps/web/src/lib/commercial/`, `apps/web/src/app/precios/`):
 * la regla de qué cuenta como "aceptado". Deliberadamente NO hace fetch, no
 * importa el cliente HTTP y no se engancha en `CheckoutStarter.tsx` — esa
 * integración exige además sumar `/v1/legal/*` al contrato OpenAPI y
 * regenerar el SDK (`packages/contracts/specs/design-api.v1.yaml`,
 * `packages/design-sdk`), que son archivos delicados y ownership de la
 * superficie comercial. Ver el hueco documentado en el informe de campaña.
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
