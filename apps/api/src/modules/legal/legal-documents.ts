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
  /**
   * SHA-256 (hex) del ARCHIVO fuente que renderiza el texto de esta versión
   * (`apps/web/src/app/<url>/page.tsx`). Es el candado de inmutabilidad que
   * exige COMMERCIAL-RC1: el gate `scripts/legal/check-legal-content.mjs`
   * recalcula el hash en CI y falla si la prosa cambió sin publicar versión
   * nueva. Las entradas históricas anteriores al candado no lo llevan — su
   * texto ya no está en el árbol y fingirles un hash sería fabricar evidencia.
   */
  contentHash?: string;
}

/**
 * Versión inicial. La fecha es la del commit que las publica, no una fecha
 * inventada: un registro legal con una fecha que no corresponde a ningún
 * texto no vale más que no tener registro.
 */
export const LEGAL_DOCUMENTS: readonly LegalDocumentVersion[] = [
  // 2026-08-27 (campaña de lanzamiento gratuito): sustituye a la versión
  // 2026-08-26. Los TÉRMINOS pasan a describir el lanzamiento gratuito —no se
  // pide medio de pago, no hay cargo automático al terminar, y los documentos
  // NO quedan condicionados al pago: la cuenta vencida conserva abrir,
  // imprimir y exportar—, que es la regla de oro del guard puesta por escrito
  // donde el cliente la puede leer. El AVISO DE PRIVACIDAD declara las
  // métricas de activación que se publicaron en el mismo cambio
  // (`health/activation-metrics.controller.ts`): conteos agregados derivados
  // de datos que la aplicación ya guardaba, sin contenido de planos ni
  // rastreadores. Los dos añaden, además, que son BORRADOR pendiente de
  // revisión legal: decirlo es más honesto que aparentar solidez jurídica.

  // 2026-08-26 (COMMERCIAL-RC1): sustituye a la versión 2026-08-15 — las
  // páginas pasan a mostrar versión y fecha, los términos corrigen la sección
  // comercial (las tarifas SÍ se publican en /precios y el checkout de
  // autoservicio existe; el texto anterior lo negaba y contradecía a la
  // página de precios), y cada versión queda candada por contentHash
  // (`scripts/legal/check-legal-content.mjs`). El registro guarda UNA fila por
  // documento — la vigente (el validador de abajo lo exige): las versiones
  // anteriores viven en el historial de git y en las filas de aceptación que
  // las nombran.
  {
    documento: 'terms',
    version: '2026-08-27',
    publicadoEn: '2026-08-27',
    url: '/terms',
    requiereAceptacion: true,
    contentHash:
      'de5ffcbe352e93b7fe8f32198196fa1d082f2ff496f53f537ae78bd81e77f712',
  },
  // 2026-08-27.2 (campaña de lanzamiento, OLA 4.2): sustituye a 2026-08-27 —
  // el estudio estrena el botón «algo salió mal», y lo que ese botón envía
  // tiene que estar declarado ANTES de que exista una forma de pulsarlo. La
  // versión anterior no se editó: se publica una nueva, que es lo que exige el
  // candado y lo que merece quien aceptó la anterior.
  {
    documento: 'privacy',
    version: '2026-08-27.2',
    publicadoEn: '2026-08-27',
    url: '/privacy',
    requiereAceptacion: false,
    contentHash:
      'dfcaea169cab631e335c17bf728ca8da17d2b59214787a3b36e245517a8997ac',
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

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Candado de REGRESIÓN sobre el registro, no de configuración de entorno:
 * `LEGAL_DOCUMENTS` es código fuente, así que la única forma de romperlo es
 * editarlo mal (borrar una entrada, vaciar una versión, invertir
 * `requiereAceptacion`). Cada caso de esta función es un error real que ya se
 * ha visto en otros repos — no una lista de validaciones genéricas por
 * completar.
 *
 * Devuelve la lista de problemas en español, lista para loguear o para que un
 * arranque productivo la use como motivo de fallo; una lista vacía es la
 * única señal de éxito.
 */
export function validateLegalDocumentsRegistry(
  documents: readonly LegalDocumentVersion[],
): string[] {
  const issues: string[] = [];

  const terms = documents.find((doc) => doc.documento === 'terms');
  if (!terms) {
    issues.push(
      'falta el documento "terms" (obligatorio y debe exigir aceptación)',
    );
  } else if (!terms.requiereAceptacion) {
    issues.push(
      'el documento "terms" tiene requiereAceptacion=false: los términos de uso SIEMPRE exigen aceptación explícita',
    );
  }

  if (!documents.some((doc) => doc.documento === 'privacy')) {
    issues.push('falta el documento "privacy" (obligatorio)');
  }

  const seen = new Set<string>();
  for (const doc of documents) {
    if (seen.has(doc.documento)) {
      issues.push(
        `entrada duplicada para "${doc.documento}": una versión aceptada tiene que resolver a UNA sola fila`,
      );
    }
    seen.add(doc.documento);

    if (!doc.version || doc.version.trim().length === 0) {
      issues.push(
        `"${doc.documento}" no tiene versión: aceptar eso no acredita nada`,
      );
    }
    if (!ISO_DATE_PATTERN.test(doc.publicadoEn)) {
      issues.push(
        `"${doc.documento}" tiene publicadoEn con formato inválido (se espera AAAA-MM-DD): "${doc.publicadoEn}"`,
      );
    }
    if (!doc.url || doc.url.trim().length === 0) {
      issues.push(`"${doc.documento}" no tiene url pública`);
    }
  }

  return issues;
}

/**
 * Se ejecuta AL CARGAR EL MÓDULO — es decir, en cuanto algo importa
 * `legal-documents.ts`, que ocurre durante `NestFactory.create` en todo
 * arranque real (dev, test, producción). No es una comprobación de entorno
 * (`LEGAL_DOCUMENTS` es código fuente, nunca varía por `.env`), así que no
 * hace falta condicionarla a `NODE_ENV`: un registro roto está roto en
 * cualquier entorno, igual que `resolveTrialDays` revienta sin mirar el
 * entorno en `organization-commercial.configuration.ts`.
 */
const registryIssues = validateLegalDocumentsRegistry(LEGAL_DOCUMENTS);
if (registryIssues.length > 0) {
  throw new Error(
    'Registro de documentos legales (LEGAL_DOCUMENTS) inválido:\n' +
      registryIssues.map((issue) => `  · ${issue}`).join('\n'),
  );
}
