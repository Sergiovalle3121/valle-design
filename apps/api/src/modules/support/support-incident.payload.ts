/**
 * Qué se manda cuando alguien pulsa «algo salió mal», dicho en un módulo puro.
 *
 * ── Por qué esto vive aparte del controlador ───────────────────────────────
 *
 * Porque la decisión que importa aquí no es de transporte, es de PRIVACIDAD, y
 * merece poder probarse sola: qué campos salen del navegador de una persona
 * hacia el buzón de soporte. Escrita dentro del controlador, esa decisión sólo
 * se podría comprobar levantando Nest y PostgreSQL.
 *
 * ── La regla ───────────────────────────────────────────────────────────────
 *
 * El identificador del documento viaja **si y sólo si** la persona lo autorizó
 * explícitamente. No basta con que el cliente lo mande: un id que llegue sin
 * `documentAuthorized` se DESCARTA aquí, en el servidor. La autorización no se
 * deduce de que el dato esté presente — eso convertiría un fallo del cliente en
 * una fuga.
 *
 * Y nunca, en ningún caso, viaja el contenido del plano. Adjuntar el dibujo a
 * un correo sería peor para la privacidad que no hacerlo, no mejor: el
 * documento ya vive en el servidor, con su control de acceso; una copia en un
 * buzón no lo tiene.
 */

export interface SupportIncidentInput {
  summary: string;
  appVersion: string;
  userAgent: string;
  activeCommand?: string | null;
  documentId?: string | null;
  documentAuthorized: boolean;
}

export interface SupportIncidentPayload {
  /** Lo que la persona escribió, recortado y sin espacios de sobra. */
  summary: string;
  appVersion: string;
  userAgent: string;
  activeCommand: string | null;
  /** `null` salvo autorización explícita. Nunca el contenido. */
  documentId: string | null;
  documentAuthorized: boolean;
  reportedBy: string;
  organizationId: string | null;
  reportedAt: string;
  /** Se dice en el propio mensaje, para quien lo lea sin conocer esta regla. */
  alcance: string;
}

const ALCANCE_SIN_DOCUMENTO =
  'Reporte sin acceso al plano: la persona no autorizó mirarlo. Solo viajan version, navegador y comando en curso.';
const ALCANCE_CON_DOCUMENTO =
  'La persona autorizo EXPRESAMENTE revisar su documento. Viaja su identificador, nunca su contenido.';

/** Recorta a `max` sin partir a mitad de palabra cuando se puede. */
function trim(value: string, max: number): string {
  const clean = value.replace(/\s+/gu, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function buildSupportIncidentPayload(
  input: SupportIncidentInput,
  context: {
    reportedBy: string;
    organizationId: string | null;
    reportedAt: Date;
  },
): SupportIncidentPayload {
  const authorized = input.documentAuthorized === true;
  const documentId = authorized ? (input.documentId ?? null) : null;
  return {
    summary: trim(input.summary, 2000),
    appVersion: trim(input.appVersion, 120),
    userAgent: trim(input.userAgent, 400),
    activeCommand: input.activeCommand ? trim(input.activeCommand, 64) : null,
    documentId,
    documentAuthorized: authorized,
    reportedBy: context.reportedBy,
    organizationId: context.organizationId,
    // AL MINUTO, no al milisegundo, y a propósito. La clave de idempotencia
    // agrupa por minuto; si la marca de tiempo fuese más fina, dos clics
    // separados por medio segundo producirían la MISMA clave con cargas
    // DISTINTAS, que es justo lo que el outbox rechaza —y con razón: una clave
    // que promete «esto ya se guardó» no puede tapar un contenido diferente.
    // El segundo exacto no le hace falta a nadie para reproducir un problema.
    reportedAt: `${context.reportedAt.toISOString().slice(0, 16)}:00.000Z`,
    alcance: documentId ? ALCANCE_CON_DOCUMENTO : ALCANCE_SIN_DOCUMENTO,
  };
}

/**
 * La clave de idempotencia. Un doble clic —o un reintento del navegador al
 * volver la red— no puede convertirse en dos correos: el outbox descarta el
 * segundo por clave, igual que hace con el resto del correo del producto.
 *
 * Lleva el minuto y un hash del texto: la MISMA persona reportando lo MISMO
 * dentro del mismo minuto es un doble envío; a los dos minutos, o cambiando el
 * texto, es un reporte nuevo y tiene que llegar.
 */
export function supportIncidentIdempotencyKey(
  payload: SupportIncidentPayload,
  hash: (value: string) => string,
): string {
  const minute = payload.reportedAt.slice(0, 16);
  return `support.incident:${payload.reportedBy}:${minute}:${hash(payload.summary)}`;
}
