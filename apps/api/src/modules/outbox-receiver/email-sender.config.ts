/**
 * Configuración del envío de correo, o null si el despliegue no la trae.
 *
 * Regla única, deliberadamente rígida — la misma que Stripe en
 * `commercial.module.ts`: o están TODAS las variables o no está ninguna. Un
 * despliegue con API key pero sin remitente enviaría correo que el proveedor
 * rechaza en silencio; uno con remitente pero sin base de enlaces mandaría
 * correos de verificación con enlaces rotos, que es peor que no mandarlos —
 * el usuario cree que el producto falla, no que falta configuración. Las dos
 * situaciones fallan al ARRANCAR, no en el primer registro.
 */

export const EMAIL_SENDER_CONFIGURATION = Symbol('EMAIL_SENDER_CONFIGURATION');

/** Único adaptador implementado hoy. Un nombre nuevo exige su adaptador. */
const SUPPORTED_PROVIDERS = ['resend'] as const;
export type EmailSenderProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface EmailSenderConfiguration {
  provider: EmailSenderProvider;
  apiKey: string;
  /** Remitente: `correo@dominio` o `Nombre <correo@dominio>`. */
  from: string;
  /** Origen absoluto (sin barra final) que ancla los enlaces del correo. */
  linkBaseUrl: string;
}

export class EmailSenderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSenderConfigurationError';
  }
}

const FROM_PATTERN =
  /^(?:[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+|[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>)$/;

export function resolveEmailSenderConfiguration(
  environment: NodeJS.ProcessEnv,
): EmailSenderConfiguration | null {
  const provider = environment.EMAIL_SENDER_PROVIDER?.trim() ?? '';
  const apiKey = environment.EMAIL_SENDER_API_KEY?.trim() ?? '';
  const from = environment.EMAIL_SENDER_FROM?.trim() ?? '';
  const linkBase = environment.OUTBOX_EMAIL_LINK_BASE_URL?.trim() ?? '';
  const declared = [provider, apiKey, from, linkBase].filter(
    (value) => value.length > 0,
  );
  if (declared.length === 0) return null;
  if (declared.length < 4) {
    throw new EmailSenderConfigurationError(
      'Configuración de correo incompleta: EMAIL_SENDER_PROVIDER, ' +
        'EMAIL_SENDER_API_KEY, EMAIL_SENDER_FROM y OUTBOX_EMAIL_LINK_BASE_URL ' +
        'son obligatorias juntas. Sin las cuatro, deja las cuatro vacías: el ' +
        'receptor responderá 503 y el worker conservará el correo en el ' +
        'outbox hasta que haya proveedor.',
    );
  }
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    throw new EmailSenderConfigurationError(
      `EMAIL_SENDER_PROVIDER "${provider}" no tiene adaptador implementado. ` +
        `Hoy sólo existe: ${SUPPORTED_PROVIDERS.join(', ')}.`,
    );
  }
  if (!FROM_PATTERN.test(from)) {
    throw new EmailSenderConfigurationError(
      'EMAIL_SENDER_FROM debe ser `correo@dominio` o `Nombre <correo@dominio>`.',
    );
  }
  return {
    provider: provider as EmailSenderProvider,
    apiKey,
    from,
    linkBaseUrl: secureLinkBaseUrl(linkBase, environment.NODE_ENV),
  };
}

/**
 * Los enlaces del correo son la parte del producto que más lejos viaja: un
 * esquema HTTP o una URL con credenciales acabaría en la bandeja de entrada de
 * cada usuario nuevo. HTTPS obligatorio (loopback HTTP sólo fuera de
 * producción, para probar en local) y sin query, fragmento ni credenciales.
 */
function secureLinkBaseUrl(raw: string, nodeEnv: string | undefined): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EmailSenderConfigurationError(
      'OUTBOX_EMAIL_LINK_BASE_URL debe ser una URL absoluta.',
    );
  }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(nodeEnv !== 'production' && loopback)) {
    throw new EmailSenderConfigurationError(
      'OUTBOX_EMAIL_LINK_BASE_URL debe usar HTTPS (HTTP plano sólo se admite ' +
        'en loopback fuera de producción).',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new EmailSenderConfigurationError(
      'OUTBOX_EMAIL_LINK_BASE_URL no admite credenciales, query ni fragmento.',
    );
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}
