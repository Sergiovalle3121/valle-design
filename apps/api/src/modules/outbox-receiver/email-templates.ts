/**
 * Plantillas de correo en español, una por cada plantilla que el producto
 * ENCOLA hoy. La lista es cerrada a propósito: una plantilla que el productor
 * conoce y el receptor no es un correo crítico que se pierde en silencio, así
 * que aquí se renderiza lo conocido y lo desconocido se rechaza con un error
 * tipado que el receptor apunta en el recibo (reintentar un render imposible
 * no lo vuelve posible).
 *
 * Los payloads NO se inventan: calcan lo que encolan
 * `identity.service.ts` (enqueueIdentityEmail: `{token, path, expiresAt}`,
 * con el token ya incrustado en `path` como query) y
 * `organizations.controller.ts` (invite: `{invitationId, token,
 * organizationName}`). Si el productor cambia el shape, la spec de estas
 * plantillas es la alarma.
 *
 * Los enlaces son ABSOLUTOS sobre OUTBOX_EMAIL_LINK_BASE_URL: el correo se lee
 * fuera del producto y un enlace relativo no lleva a ninguna parte.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplateErrorCode = 'unknown_template' | 'invalid_payload';

export class EmailTemplateError extends Error {
  constructor(
    readonly code: EmailTemplateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EmailTemplateError';
  }
}

const PRODUCT_NAME = 'Valle Design';

export function renderEmailTemplate(
  template: string,
  payload: unknown,
  linkBaseUrl: string,
): RenderedEmail {
  switch (template) {
    case 'identity.verify-email':
      return renderIdentityEmail(payload, linkBaseUrl, {
        subject: `Confirma tu correo — ${PRODUCT_NAME}`,
        intro:
          `Alguien (esperamos que tú) registró esta dirección en ` +
          `${PRODUCT_NAME}. Confírmala abriendo este enlace:`,
        action: 'Confirmar mi correo',
        outro:
          'Si no fuiste tú, ignora este mensaje: sin confirmación la cuenta ' +
          'no puede usarse.',
      });
    case 'identity.reset-password':
      return renderIdentityEmail(payload, linkBaseUrl, {
        subject: `Restablece tu contraseña — ${PRODUCT_NAME}`,
        intro:
          `Recibimos una solicitud para restablecer la contraseña de tu ` +
          `cuenta en ${PRODUCT_NAME}. Continúa con este enlace:`,
        action: 'Restablecer mi contraseña',
        outro:
          'Si no pediste el cambio, ignora este correo: tu contraseña actual ' +
          'sigue siendo válida.',
      });
    case 'organization.invitation':
      return renderInvitationEmail(payload, linkBaseUrl);
    case 'commercial.renewal-reminder':
      return renderRenewalReminderEmail(payload, linkBaseUrl);
    case 'identity.new-sign-in':
      return renderNewSignInEmail(payload, linkBaseUrl);
    case 'commercial.trial-expiry':
      return renderTrialExpiryEmail(payload, linkBaseUrl);
    case 'product.feedback':
      return renderProductFeedbackEmail(payload);
    case 'support.incident':
      return renderSupportIncidentEmail(payload);
    default:
      throw new EmailTemplateError(
        'unknown_template',
        `No existe plantilla para "${template}".`,
      );
  }
}

interface IdentityEmailCopy {
  subject: string;
  intro: string;
  action: string;
  outro: string;
}

function renderIdentityEmail(
  payload: unknown,
  linkBaseUrl: string,
  copy: IdentityEmailCopy,
): RenderedEmail {
  const path = readString(payload, 'path');
  const expiresAt = readString(payload, 'expiresAt');
  // El token viaja DENTRO de `path` (ya URL-encoded por el productor); no se
  // reconstruye aquí para no tener dos fuentes de verdad sobre el enlace.
  if (!path.startsWith('/') || path.startsWith('//')) {
    // `//host` sería una URL relativa a protocolo: un payload que la trajera
    // podría sacar el enlace del dominio propio. El payload viene firmado por
    // nuestro propio worker, pero un enlace de correo no es sitio para
    // confiar por contexto.
    throw new EmailTemplateError(
      'invalid_payload',
      'El campo `path` debe ser una ruta absoluta dentro del producto.',
    );
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    throw new EmailTemplateError(
      'invalid_payload',
      'El campo `expiresAt` no es una fecha válida.',
    );
  }
  const link = `${linkBaseUrl}${path}`;
  const deadline = formatDeadline(new Date(expiresAtMs));
  const text = [
    'Hola:',
    '',
    copy.intro,
    '',
    link,
    '',
    `El enlace caduca el ${deadline}.`,
    copy.outro,
  ].join('\n');
  const html = htmlLayout(copy.subject, [
    paragraph(escapeHtml(copy.intro)),
    actionButton(link, copy.action),
    paragraph(
      `Si el botón no funciona, copia este enlace en tu navegador:<br>` +
        `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`,
    ),
    paragraph(`El enlace caduca el ${escapeHtml(deadline)}.`),
    paragraph(escapeHtml(copy.outro)),
  ]);
  return { subject: copy.subject, html, text };
}

function renderInvitationEmail(
  payload: unknown,
  linkBaseUrl: string,
): RenderedEmail {
  const token = readString(payload, 'token');
  const organizationName = readString(payload, 'organizationName');
  const subject = `Te invitaron a «${organizationName}» en ${PRODUCT_NAME}`;
  // Honestidad sobre el estado real del producto: NO existe todavía una
  // página web que acepte la invitación con un clic (el canje vive en la API,
  // POST /v1/organizations/invitations/accept). Enlazar a una página
  // inexistente sería peor que no enlazar, así que el correo entrega lo que
  // sí es durable — el código — y apunta al producto real. Cuando exista la
  // página, esta plantilla gana su enlace directo.
  const intro =
    `${organizationName} te invitó a colaborar en ${PRODUCT_NAME}. ` +
    `Entra con tu cuenta (o crea una con este mismo correo) y ten a mano ` +
    `este código de invitación:`;
  const outro =
    'La invitación caduca a los 7 días. Si no esperabas esta invitación, ' +
    'ignora este mensaje.';
  const text = ['Hola:', '', intro, '', token, '', linkBaseUrl, '', outro].join(
    '\n',
  );
  const html = htmlLayout(subject, [
    paragraph(escapeHtml(intro)),
    `<p style="margin:16px 0;padding:12px 16px;background:#f4f4f5;` +
      `border-radius:6px;font-family:monospace;font-size:16px;">` +
      `${escapeHtml(token)}</p>`,
    actionButton(linkBaseUrl, `Abrir ${PRODUCT_NAME}`),
    paragraph(escapeHtml(outro)),
  ]);
  return { subject, html, text };
}

/**
 * Recordatorio de renovación para pagos únicos (OXXO/SPEI). El shape calca lo
 * que encola `renewal-reminder.service.ts`: `{organizationName, planCode,
 * currentPeriodEnd}`. El plan no se interpola en la prosa: `planCode` es un
 * código interno (`individual`, `despacho`), no un nombre comercial, y
 * enseñárselo al cliente sería enseñar tripas.
 *
 * El enlace lleva a `/cuenta/facturacion`, que SÍ existe en el web (a
 * diferencia de la aceptación de invitaciones): ahí vive el flujo de pago con
 * el que se renueva.
 */
function renderRenewalReminderEmail(
  payload: unknown,
  linkBaseUrl: string,
): RenderedEmail {
  const organizationName = readString(payload, 'organizationName');
  const currentPeriodEnd = readString(payload, 'currentPeriodEnd');
  const endsAtMs = Date.parse(currentPeriodEnd);
  if (Number.isNaN(endsAtMs)) {
    throw new EmailTemplateError(
      'invalid_payload',
      'El campo `currentPeriodEnd` no es una fecha válida.',
    );
  }
  const subject = `Tu suscripción vence pronto — ${PRODUCT_NAME}`;
  const deadline = formatDeadline(new Date(endsAtMs));
  const intro =
    `La suscripción de «${organizationName}» en ${PRODUCT_NAME} se pagó ` +
    `con un pago único (OXXO o transferencia SPEI), así que no se renueva ` +
    `sola: vence el ${deadline}.`;
  const action =
    'Para no perder acceso, renueva antes de esa fecha desde la sección ' +
    'de facturación de tu cuenta. Si pagas con OXXO, considera el tiempo ' +
    'de acreditación: el pago en efectivo puede tardar uno o dos días en ' +
    'reflejarse.';
  const outro =
    'Si ya renovaste, no tienes que hacer nada más. Tus planos y tu ' +
    'información no se borran al vencer: sólo se pausa el acceso de edición ' +
    'hasta que el pago entre.';
  const link = `${linkBaseUrl}/cuenta/facturacion`;
  const text = ['Hola:', '', intro, '', action, '', link, '', outro].join('\n');
  const html = htmlLayout(subject, [
    paragraph(escapeHtml(intro)),
    paragraph(escapeHtml(action)),
    actionButton(link, 'Renovar mi suscripción'),
    paragraph(
      `Si el botón no funciona, copia este enlace en tu navegador:<br>` +
        `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`,
    ),
    paragraph(escapeHtml(outro)),
  ]);
  return { subject, html, text };
}

/**
 * Aviso de SEGURIDAD: «alguien entró en tu cuenta desde un dispositivo
 * nuevo». Shape de `identity.service.ts:543` (`recordSignIn`): sólo se
 * encola cuando YA hay un inicio de sesión previo en el historial, así que
 * este correo nunca sorprende al primer acceso de una cuenta nueva.
 *
 * No lleva token ni enlace de un solo uso — no hay nada que confirmar—, así
 * que el enlace apunta a la página de cuenta real (`/cuenta`) donde vive
 * `AccountSecurity`, para revisar el acceso y cambiar la contraseña si no
 * fue la persona dueña de la cuenta.
 */
const SIGN_IN_METHOD_LABELS: Record<string, string> = {
  password: 'tu contraseña',
  totp: 'un código de tu aplicación de autenticación',
  backup_code: 'un código de respaldo',
};

function renderNewSignInEmail(
  payload: unknown,
  linkBaseUrl: string,
): RenderedEmail {
  const method = readString(payload, 'method');
  const methodLabel = SIGN_IN_METHOD_LABELS[method];
  if (!methodLabel) {
    throw new EmailTemplateError(
      'invalid_payload',
      `El campo \`method\` no reconoce el valor "${method}".`,
    );
  }
  const at = readString(payload, 'at');
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) {
    throw new EmailTemplateError(
      'invalid_payload',
      'El campo `at` no es una fecha válida.',
    );
  }
  const userAgent = readOptionalString(payload, 'userAgent');
  const subject = `Alguien entró en tu cuenta desde un dispositivo nuevo — ${PRODUCT_NAME}`;
  const when = formatDeadline(new Date(atMs));
  const link = `${linkBaseUrl}/cuenta`;
  const intro =
    `Detectamos un inicio de sesión en tu cuenta de ${PRODUCT_NAME} el ` +
    `${when}, usando ${methodLabel}.`;
  const device = userAgent
    ? `Dispositivo o navegador: ${userAgent}.`
    : 'No pudimos identificar el dispositivo.';
  const warning =
    'Si fuiste tú, no tienes que hacer nada más. Si no reconoces este ' +
    'acceso, entra a tu cuenta ahora mismo y cambia tu contraseña.';
  const text = ['Hola:', '', intro, device, '', warning, '', link].join('\n');
  const html = htmlLayout(subject, [
    paragraph(escapeHtml(intro)),
    paragraph(escapeHtml(device)),
    paragraph(escapeHtml(warning)),
    actionButton(link, 'Revisar mi cuenta'),
  ]);
  return { subject, html, text };
}

/**
 * Aviso de fin de prueba, a 7 días y a 1 día. Shape de
 * `trial-expiry-reminder.service.ts:147`. `planCode` es un código interno,
 * igual que en `commercial.renewal-reminder`: no se interpola en la prosa.
 */
function renderTrialExpiryEmail(
  payload: unknown,
  linkBaseUrl: string,
): RenderedEmail {
  const organizationName = readString(payload, 'organizationName');
  const trialEndsAt = readString(payload, 'trialEndsAt');
  const endsAtMs = Date.parse(trialEndsAt);
  if (Number.isNaN(endsAtMs)) {
    throw new EmailTemplateError(
      'invalid_payload',
      'El campo `trialEndsAt` no es una fecha válida.',
    );
  }
  const daysLeft = readNumber(payload, 'daysLeft');
  if (daysLeft !== 7 && daysLeft !== 1) {
    throw new EmailTemplateError(
      'invalid_payload',
      'El campo `daysLeft` debe ser 7 o 1.',
    );
  }
  const readOnlyAfterExpiry = readBoolean(payload, 'readOnlyAfterExpiry');
  const deadline = formatDeadline(new Date(endsAtMs));
  const subject =
    daysLeft === 1
      ? `Tu prueba termina mañana — ${PRODUCT_NAME}`
      : `Tu prueba termina en una semana — ${PRODUCT_NAME}`;
  const urgency =
    daysLeft === 1
      ? 'Tu prueba gratuita termina MAÑANA.'
      : 'Tu prueba gratuita termina en 7 días.';
  const intro =
    `${urgency} La prueba de «${organizationName}» en ${PRODUCT_NAME} ` +
    `vence el ${deadline}.`;
  const action =
    'Activa un plan antes de esa fecha para seguir editando sin ' +
    'interrupciones.';
  // La promesa que hace este aviso distinto de una amenaza: no se pierde el
  // trabajo, sólo se pausa la edición.
  const consequence = readOnlyAfterExpiry
    ? 'Al vencer no pierdes tu trabajo: tus planos siguen siendo tuyos y ' +
      'podrás seguir exportándolos. Sólo se pausa la edición hasta que ' +
      'actives un plan.'
    : 'Revisa las condiciones de tu prueba antes de que venza.';
  const link = `${linkBaseUrl}/cuenta/facturacion`;
  const text = ['Hola:', '', intro, '', action, '', link, '', consequence].join(
    '\n',
  );
  const html = htmlLayout(subject, [
    paragraph(escapeHtml(intro)),
    paragraph(escapeHtml(action)),
    actionButton(link, 'Activar mi plan'),
    paragraph(escapeHtml(consequence)),
  ]);
  return { subject, html, text };
}

/**
 * Comentario de producto («falla», «sugerencia», «duda»). Correo INTERNO al
 * buzón de operación (`SUPPORT_EMAIL`), nunca al cliente: shape de
 * `feedback.service.ts:111`. El contexto técnico ya viene saneado a cinco
 * campos por `sanearContexto`; aquí sólo se enseña, no se vuelve a filtrar.
 */
function renderProductFeedbackEmail(payload: unknown): RenderedEmail {
  const id = readString(payload, 'id');
  const kind = readString(payload, 'kind');
  const message = readString(payload, 'message');
  const from = readString(payload, 'from');
  const organizationId = readOptionalString(payload, 'organizationId');
  const context = readOptionalRecord(payload, 'context');
  const subject = `Comentario nuevo (${kind}) — ${PRODUCT_NAME}`;
  const contextLines = context
    ? Object.entries(context).map(([key, value]) => `${key}: ${String(value)}`)
    : [];
  const text = [
    `Id: ${id}`,
    `Tipo: ${kind}`,
    `De: ${from}`,
    `Organización: ${organizationId ?? 'sin organización'}`,
    '',
    message,
    ...(contextLines.length > 0
      ? ['', 'Contexto técnico:', ...contextLines]
      : []),
  ].join('\n');
  const html = htmlLayout(subject, [
    paragraph(`<strong>Tipo:</strong> ${escapeHtml(kind)}`),
    paragraph(`<strong>De:</strong> ${escapeHtml(from)}`),
    paragraph(
      `<strong>Organización:</strong> ${escapeHtml(
        organizationId ?? 'sin organización',
      )}`,
    ),
    paragraph(escapeHtml(message).replace(/\n/g, '<br>')),
    ...(contextLines.length > 0
      ? [
          paragraph(
            `<strong>Contexto técnico:</strong><br>` +
              contextLines.map((line) => escapeHtml(line)).join('<br>'),
          ),
        ]
      : []),
  ]);
  return { subject, html, text };
}

/**
 * Reporte de «algo salió mal». Correo INTERNO al buzón de operación, nunca al
 * cliente: shape de `support-incident.payload.ts` (`SupportIncidentPayload`).
 * El documento sólo se enseña cuando `documentAuthorized` es verdadero —la
 * regla de privacidad ya la aplicó el servidor antes de encolar—, y nunca
 * viaja el contenido del plano, sólo su identificador.
 */
function renderSupportIncidentEmail(payload: unknown): RenderedEmail {
  const summary = readString(payload, 'summary');
  const appVersion = readString(payload, 'appVersion');
  const userAgent = readString(payload, 'userAgent');
  const activeCommand = readOptionalString(payload, 'activeCommand');
  const documentId = readOptionalString(payload, 'documentId');
  const documentAuthorized = readBoolean(payload, 'documentAuthorized');
  const reportedBy = readString(payload, 'reportedBy');
  const organizationId = readOptionalString(payload, 'organizationId');
  const reportedAt = readString(payload, 'reportedAt');
  const alcance = readString(payload, 'alcance');
  const reportedAtMs = Date.parse(reportedAt);
  const when = Number.isNaN(reportedAtMs)
    ? reportedAt
    : formatDeadline(new Date(reportedAtMs));
  const subject = `Reporte de incidente — ${PRODUCT_NAME}`;
  const lines = [
    `Reportado por: ${reportedBy}`,
    `Organización: ${organizationId ?? 'sin organización'}`,
    `Cuándo: ${when}`,
    `Versión: ${appVersion}`,
    `Navegador: ${userAgent}`,
    `Comando activo: ${activeCommand ?? 'ninguno'}`,
    `Documento: ${
      documentAuthorized && documentId
        ? documentId
        : 'no autorizado o no aplica'
    }`,
    `Alcance: ${alcance}`,
    '',
    summary,
  ];
  const text = lines.join('\n');
  const html = htmlLayout(
    subject,
    lines.map((line) => paragraph(escapeHtml(line))),
  );
  return { subject, html, text };
}

/**
 * Fecha límite legible en es-MX y hora del centro de México, con la zona
 * dicha con todas sus letras: «caduca a las 18:00» sin zona es una promesa
 * ambigua para un usuario en Tijuana o en Cancún.
 */
function formatDeadline(instant: Date): string {
  const formatted = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
    hour12: false,
  }).format(instant);
  return `${formatted} (hora del centro de México)`;
}

function readString(payload: unknown, field: string): string {
  if (payload !== null && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  throw new EmailTemplateError(
    'invalid_payload',
    `El payload no trae el campo \`${field}\`.`,
  );
}

/** Como `readString`, pero el campo puede faltar o ser explícitamente `null`. */
function readOptionalString(payload: unknown, field: string): string | null {
  if (payload !== null && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[field];
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
  }
  throw new EmailTemplateError(
    'invalid_payload',
    `El campo \`${field}\` debe ser una cadena o nulo.`,
  );
}

function readNumber(payload: unknown, field: string): number {
  if (payload !== null && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  throw new EmailTemplateError(
    'invalid_payload',
    `El campo \`${field}\` debe ser un número.`,
  );
}

function readBoolean(payload: unknown, field: string): boolean {
  if (payload !== null && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[field];
    if (typeof value === 'boolean') return value;
  }
  throw new EmailTemplateError(
    'invalid_payload',
    `El campo \`${field}\` debe ser verdadero o falso.`,
  );
}

/** El campo puede faltar o ser `null`; si está presente debe ser un objeto. */
function readOptionalRecord(
  payload: unknown,
  field: string,
): Record<string, unknown> | null {
  if (payload !== null && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[field];
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  throw new EmailTemplateError(
    'invalid_payload',
    `El campo \`${field}\` debe ser un objeto o nulo.`,
  );
}

/**
 * Todo valor interpolado pasa por aquí: el nombre de una organización lo
 * escribe un usuario y un `<script>` en ese nombre no debe ejecutarse en el
 * cliente de correo de la persona invitada.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraph(inner: string): string {
  return `<p style="margin:12px 0;">${inner}</p>`;
}

function actionButton(link: string, label: string): string {
  return (
    `<p style="margin:20px 0;"><a href="${escapeHtml(link)}" ` +
    `style="display:inline-block;padding:12px 20px;background:#111827;` +
    `color:#ffffff;text-decoration:none;border-radius:6px;">` +
    `${escapeHtml(label)}</a></p>`
  );
}

/**
 * HTML mínimo y autocontenido: sin imágenes remotas ni CSS externo, que los
 * clientes de correo bloquean o usan para rastrear. `lang="es"` porque el
 * producto habla español y los lectores de pantalla lo agradecen.
 */
function htmlLayout(title: string, blocks: string[]): string {
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#ffffff;color:#111827;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;">` +
    `<div style="max-width:560px;margin:0 auto;">` +
    `<p style="margin:12px 0;">Hola:</p>` +
    blocks.join('') +
    `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;">` +
    `${escapeHtml(PRODUCT_NAME)}</p>` +
    `</div></body></html>`
  );
}
