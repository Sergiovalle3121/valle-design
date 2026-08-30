import { hash, verify } from '@node-rs/argon2';
import { createHash, createHmac, randomBytes } from 'crypto';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_DISPLAY_NAME_LENGTH = 160;
export const MAX_TOKEN_LENGTH = 256;

export const SECURE_SESSION_COOKIE = '__Host-valle_session';
export const DEVELOPMENT_SESSION_COOKIE = 'valle_session';
export const CSRF_COOKIE = 'valle_csrf';
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production'
    ? SECURE_SESSION_COOKIE
    : DEVELOPMENT_SESSION_COOKIE;

const ARGON2_VERSION = 19;
const ARGON2_MEMORY_KIB = 19_456;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_OUTPUT_LENGTH = 32;
const ARGON2_SALT_LENGTH = 16;

/**
 * HASH SEÑUELO, para que el tiempo de respuesta no delate si la cuenta existe.
 *
 * Vive aquí y no en un servicio porque lo usan DOS: el inicio de sesión (cuando
 * no hay credencial) y la confirmación de contraseña del segundo factor. Dos
 * copias de esta constante podrían divergir en parámetros, y una derivación con
 * parámetros distintos tarda un tiempo distinto — que es exactamente el canal
 * lateral que la constante existe para cerrar.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$3mLRJY9dq8R2kBmPQ2tM1IQaxaW0GFgm1AF2DeWNLMc';

const PHC_PATTERN =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/u;

export function assertIdentitySecurityConfiguration(
  environment: NodeJS.ProcessEnv,
): void {
  const secret = environment.IDENTITY_RATE_LIMIT_KEY_SECRET?.trim();
  if (
    environment.NODE_ENV === 'production' &&
    (!secret || secret.length < 32)
  ) {
    throw new Error(
      'Production requires IDENTITY_RATE_LIMIT_KEY_SECRET with at least 32 characters so every API replica derives the same opaque keys.',
    );
  }
}

assertIdentitySecurityConfiguration(process.env);

const configuredRateLimitKeySecret =
  process.env.IDENTITY_RATE_LIMIT_KEY_SECRET?.trim();
const rateLimitKeySecret = configuredRateLimitKeySecret
  ? createHash('sha256').update(configuredRateLimitKeySecret).digest()
  : randomBytes(32);

function decodePhcBase64(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+$/u.test(value) || value.length % 4 === 1) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64');
  const canonical = decoded.toString('base64').replace(/=+$/u, '');
  return canonical === value ? decoded : null;
}

// La implementación canónica vive en common/security: era la más fuerte de
// las seis copias que llegó a haber y ahora es la única. Se re-exporta para
// que los consumidores de identidad conserven su import.
export { constantTimeEqual } from '../../common/security/constant-time';

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueRateLimitKey(
  scope: string,
  identifiers: readonly string[],
): string {
  const hmac = createHmac('sha256', rateLimitKeySecret);
  hmac.update(`${Buffer.byteLength(scope, 'utf8')}:`);
  hmac.update(scope);

  for (const identifier of identifiers) {
    hmac.update(`:${Buffer.byteLength(identifier, 'utf8')}:`);
    hmac.update(identifier);
  }

  return `identity:${scope}:${hmac.digest('base64url')}`;
}

export async function hashArgon2idPassword(password: string): Promise<string> {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new RangeError(
      `Password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  return hash(password, {
    // Numeric literals avoid ambient const-enum access under isolatedModules:
    // @node-rs/argon2 declares Argon2id=2 and Version.V0x13=1.
    algorithm: 2,
    version: 1,
    memoryCost: ARGON2_MEMORY_KIB,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    outputLen: ARGON2_OUTPUT_LENGTH,
    salt: randomBytes(ARGON2_SALT_LENGTH),
  });
}

export async function verifyArgon2idPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }

  const match = PHC_PATTERN.exec(encodedHash);
  if (!match) {
    return false;
  }

  const version = Number(match[1]);
  const memory = Number(match[2]);
  const time = Number(match[3]);
  const parallelism = Number(match[4]);
  if (
    version !== ARGON2_VERSION ||
    memory !== ARGON2_MEMORY_KIB ||
    time !== ARGON2_TIME_COST ||
    parallelism !== ARGON2_PARALLELISM
  ) {
    return false;
  }

  const salt = decodePhcBase64(match[5]);
  const expected = decodePhcBase64(match[6]);
  if (
    salt?.length !== ARGON2_SALT_LENGTH ||
    expected?.length !== ARGON2_OUTPUT_LENGTH
  ) {
    return false;
  }

  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
}
