/**
 * Alta de un integrador REAL contra la API en marcha.
 *
 * POR QUÉ NO SE INYECTA EL ESTADO A MANO EN LA BASE. Una prueba de carga que
 * fabrica la sesión escribiendo filas de `sessions` y `subscriptions` mide un
 * mundo que no existe: se salta el argon2 del login, el guard que resuelve la
 * membresía en cada petición y la comprobación del entitlement `design.cad`.
 * El integrador que evalúa el producto va a pagar ese coste en CADA llamada,
 * así que la medición tiene que pagarlo también. Aquí se hace el mismo camino
 * que hará él: registrar, verificar el correo, iniciar sesión y crear la
 * organización, todo por HTTP contra los mismos controladores.
 *
 * LA ÚNICA EXCEPCIÓN, DECLARADA. El token de verificación de correo se lee de
 * la tabla `email_outbox`. En producción ese token viaja en un correo y lo
 * pulsa una persona; no hay forma de que un script lo reciba sin un buzón. Se
 * lee del outbox —que es exactamente lo que el proveedor de correo leería— en
 * vez de saltarse la verificación marcando `email_verified_at` a mano, para
 * que el camino de `verifyEmail` se ejecute de verdad.
 */
import type { DataSource } from 'typeorm';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
} from '../modules/identity/identity-security';

/** Cabeceras de cookie y CSRF ya listas para firmar cualquier mutación. */
export interface IntegratorSession {
  baseUrl: string;
  email: string;
  cookieHeader: string;
  csrfToken: string;
  organizationId: string;
}

export interface ApiCallOptions {
  method?: string;
  body?: unknown;
  /** Cuerpo ya serializado; evita re-serializar documentos grandes por petición. */
  rawBody?: string;
  headers?: Record<string, string>;
}

export class LoadProbeSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadProbeSetupError';
  }
}

/**
 * Cookies del `Set-Cookie` de la respuesta, en formato de cabecera `Cookie`.
 *
 * `getSetCookie()` (Node 20+) devuelve las cookies SIN colapsar en una sola
 * cadena; hacerlo con `get('set-cookie')` las une por comas y rompe cualquier
 * atributo que contenga una fecha (`Expires=Wed, 01 …`).
 */
function readCookies(response: Response): Map<string, string> {
  const jar = new Map<string, string>();
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return jar;
}

export async function apiCall(
  session: Pick<IntegratorSession, 'baseUrl' | 'cookieHeader' | 'csrfToken'>,
  path: string,
  options: ApiCallOptions = {},
): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    cookie: session.cookieHeader,
    ...options.headers,
  };
  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    headers['x-csrf-token'] = session.csrfToken;
  }
  return fetch(`${session.baseUrl}${path}`, { method, headers, body });
}

async function expectStatus(
  response: Response,
  expected: readonly number[],
  what: string,
): Promise<unknown> {
  const text = await response.text();
  if (!expected.includes(response.status)) {
    throw new LoadProbeSetupError(
      `${what}: HTTP ${response.status} — ${text.slice(0, 400)}`,
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Token de verificación recién encolado para ese destinatario.
 *
 * Se ordena por `created_at` descendente y se acota al destinatario porque la
 * base de carga se reutiliza entre corridas: coger «el último token» a secas
 * verificaría la cuenta de la corrida anterior y el login fallaría con un
 * mensaje que no señala la causa.
 */
async function readVerificationToken(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const rows: unknown = await dataSource.query(
    `SELECT payload FROM email_outbox
      WHERE recipient = $1 AND template = 'identity.verify-email'
      ORDER BY created_at DESC
      LIMIT 1`,
    [email],
  );
  const first = Array.isArray(rows) ? (rows[0] as unknown) : null;
  const payload =
    first && typeof first === 'object'
      ? (first as { payload?: unknown }).payload
      : null;
  const parsed =
    typeof payload === 'string' ? (JSON.parse(payload) as unknown) : payload;
  const token =
    parsed && typeof parsed === 'object'
      ? (parsed as { token?: unknown }).token
      : null;
  if (typeof token !== 'string' || token.length < 32) {
    throw new LoadProbeSetupError(
      `No se encontró el token de verificación de ${email} en email_outbox.`,
    );
  }
  return token;
}

export async function createIntegratorSession(options: {
  baseUrl: string;
  dataSource: DataSource;
  email: string;
  password: string;
  organizationSlug: string;
}): Promise<IntegratorSession> {
  const { baseUrl, dataSource, email, password, organizationSlug } = options;
  const anonymous = { baseUrl, cookieHeader: '', csrfToken: '' };

  await expectStatus(
    await apiCall(anonymous, '/v1/auth/register', {
      method: 'POST',
      body: { email, password, displayName: 'Integrador de carga' },
    }),
    [202],
    'register',
  );

  const token = await readVerificationToken(dataSource, email);
  await expectStatus(
    await apiCall(anonymous, '/v1/auth/verify-email', {
      method: 'POST',
      body: { token },
    }),
    [200, 201, 204],
    'verify-email',
  );

  const login = await apiCall(anonymous, '/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  await expectStatus(login, [200], 'login');
  const jar = readCookies(login);
  const sessionCookie = jar.get(SESSION_COOKIE);
  const csrfCookie = jar.get(CSRF_COOKIE);
  if (!sessionCookie || !csrfCookie) {
    throw new LoadProbeSetupError(
      `El login no devolvió cookies de sesión/CSRF (${[...jar.keys()].join(', ')}).`,
    );
  }
  const session: IntegratorSession = {
    baseUrl,
    email,
    cookieHeader: `${SESSION_COOKIE}=${sessionCookie}; ${CSRF_COOKIE}=${csrfCookie}`,
    csrfToken: csrfCookie,
    organizationId: '',
  };

  const organization = await expectStatus(
    await apiCall(session, '/v1/organizations', {
      method: 'POST',
      body: { name: 'Despacho de carga', slug: organizationSlug },
    }),
    [200, 201],
    'crear organización',
  );
  const organizationId =
    organization && typeof organization === 'object'
      ? (organization as { id?: unknown }).id
      : null;
  if (typeof organizationId !== 'string') {
    throw new LoadProbeSetupError('La organización creada no devolvió id.');
  }
  session.organizationId = organizationId;

  // Crear la organización ya la deja activa en la sesión del servidor; se
  // vuelve a declarar activa de forma explícita porque el integrador con
  // varias organizaciones SIEMPRE tendrá que hacerlo, y así el camino medido
  // es el suyo y no un atajo del alta.
  await expectStatus(
    await apiCall(session, '/v1/organizations/active', {
      method: 'POST',
      body: { organizationId },
    }),
    [200, 201],
    'activar organización',
  );

  return session;
}
