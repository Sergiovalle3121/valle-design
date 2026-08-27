/**
 * Versión VISIBLE de los documentos legales del web.
 *
 * La fuente de verdad de versiones vive en el API
 * (`apps/api/src/modules/legal/legal-documents.ts`): es quien registra la
 * aceptación. Este módulo es el espejo de PRESENTACIÓN — lo que las páginas
 * `/terms` y `/privacy` imprimen junto al texto — y el gate
 * `scripts/legal/check-legal-content.mjs` comprueba en CI que ambos lados
 * declaran la MISMA versión y que el texto de cada página coincide byte a
 * byte con el hash registrado: cambiar la prosa sin publicar versión nueva
 * pone el CI en rojo.
 */
export const LEGAL_PAGE_VERSIONS = {
  terms: { version: "2026-08-27", publicadoEn: "2026-08-27" },
  privacy: { version: "2026-08-27", publicadoEn: "2026-08-27" },
} as const;

export function legalVersionLine(document: keyof typeof LEGAL_PAGE_VERSIONS): string {
  const entry = LEGAL_PAGE_VERSIONS[document];
  return `Versión ${entry.version} · publicada el ${entry.publicadoEn}`;
}
