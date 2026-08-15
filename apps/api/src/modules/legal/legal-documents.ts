/**
 * REGISTRO VERSIONADO DE DOCUMENTOS LEGALES.
 *
 * Los términos y el aviso de privacidad del web son prosa sin versión ni
 * fecha: se pueden reescribir en un commit y nadie —ni el cliente ni el
 * operador— puede afirmar después *qué texto aceptó cada usuario y cuándo*.
 * Para un piloto comercial eso no es un detalle formal: es la diferencia entre
 * tener un acuerdo demostrable y tener una página web.
 *
 * La fuente de verdad de la VERSIÓN vive aquí, en el API, y no en el web, por
 * dos razones:
 *  1. es el API quien registra la aceptación, y un registro contra una versión
 *     que sólo conoce el cliente no es evidencia de nada;
 *  2. el web se despliega como bundle estático: dos réplicas de web pueden
 *     estar en versiones distintas durante un rollout, y ambas escribirían
 *     aceptaciones con etiquetas distintas del mismo texto.
 *
 * Regla de cambio: **una versión publicada NUNCA se edita**. Cambiar el texto
 * exige una entrada nueva con versión y fecha nuevas; las aceptaciones
 * anteriores siguen apuntando a lo que la persona realmente leyó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PENDIENTE (fuera del alcance de este cambio): las páginas
 * `apps/web/src/app/terms/page.tsx` y `apps/web/src/app/privacy/page.tsx` NO
 * muestran todavía versión ni fecha, y el registro no está enganchado a ningún
 * flujo del web. Falta:
 *
 *   1. que cada página lea `GET /v1/legal/documents` (público) y publique
 *      versión + fecha de entrada en vigor junto al texto;
 *   2. que el registro o el primer acceso presente la aceptación de `terms` y
 *      llame a `POST /v1/legal/acceptances` con la versión EXACTA mostrada;
 *   3. que la reaparición de una versión nueva se detecte comparando
 *      `GET /v1/legal/acceptances` con `LEGAL_DOCUMENTS`.
 *
 * El API es la mitad que faltaba y la que no se puede improvisar (tabla,
 * migración, invariantes de esquema y especificación). La mitad del web es
 * presentación sobre un contrato ya publicado — y `apps/web` está siendo
 * modificado por otro agente en paralelo, así que tocarlo aquí produciría un
 * conflicto sin ganar nada que no se pueda añadir después.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type LegalDocumentId = 'terms' | 'privacy';

export interface LegalDocumentVersion {
  documento: LegalDocumentId;
  /** Semántica de fecha: `AAAA-MM-DD` de entrada en vigor. */
  version: string;
  /** Fecha de publicación (ISO-8601, sólo fecha). */
  publicadoEn: string;
  /** Ruta pública donde vive el texto. */
  url: string;
  /**
   * `true` cuando esta versión requiere ACEPTACIÓN explícita. El aviso de
   * privacidad es informativo: se acredita entrega, no consentimiento, y
   * marcarlo como aceptable induciría a tratarlo como base jurídica.
   */
  requiereAceptacion: boolean;
}

/**
 * Versión inicial. La fecha es la del commit que las publica, no una fecha
 * inventada: un registro legal con una fecha que no corresponde a ningún
 * texto no vale más que no tener registro.
 */
export const LEGAL_DOCUMENTS: readonly LegalDocumentVersion[] = [
  {
    documento: 'terms',
    version: '2026-08-15',
    publicadoEn: '2026-08-15',
    url: '/terms',
    requiereAceptacion: true,
  },
  {
    documento: 'privacy',
    version: '2026-08-15',
    publicadoEn: '2026-08-15',
    url: '/privacy',
    requiereAceptacion: false,
  },
] as const;

export function currentLegalDocument(
  documento: LegalDocumentId,
): LegalDocumentVersion | undefined {
  return LEGAL_DOCUMENTS.find((entry) => entry.documento === documento);
}

export function isKnownLegalVersion(
  documento: string,
  version: string,
): boolean {
  return LEGAL_DOCUMENTS.some(
    (entry) => entry.documento === documento && entry.version === version,
  );
}
