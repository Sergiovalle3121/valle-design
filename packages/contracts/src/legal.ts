/**
 * Versionado de los documentos legales que el cliente acepta al contratar.
 *
 * Se guarda la VERSIÓN, no un booleano: dentro de un año la pregunta relevante
 * no será "¿aceptó?", será "¿qué texto aceptó?". Un `true` suelto no responde
 * eso y convierte cualquier disputa en la palabra de una parte contra la otra.
 *
 * Al publicar un cambio material en términos o privacidad se sube la versión
 * aquí y se re-solicita la aceptación; las aceptaciones previas conservan su
 * versión histórica.
 */
export const LEGAL_DOCUMENT_VERSION = "2026-07-01";

export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_DOCUMENT_PATHS: Readonly<Record<LegalDocumentId, string>> = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
};

/** ¿La versión aceptada es la vigente? Base para re-pedir consentimiento. */
export function isCurrentLegalVersion(version: string | null | undefined): boolean {
  return (version ?? "").trim() === LEGAL_DOCUMENT_VERSION;
}
