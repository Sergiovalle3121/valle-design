import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * SEGUNDO FACTOR — TOTP, códigos de respaldo y el cifrado del secreto.
 *
 * ── POR QUÉ ESTÁ ESCRITO A MANO Y NO IMPORTADO ──────────────────────────────
 * TOTP es RFC 6238: un HMAC, un truncamiento dinámico y un módulo. Son treinta
 * líneas cuya corrección se puede DEMOSTRAR contra los vectores publicados en
 * el propio RFC, que es un oráculo externo de verdad — no un golden generado
 * por esta misma implementación. Una dependencia nueva para eso añadiría
 * revisión de licencia, superficie de suministro y una versión que mantener, a
 * cambio de código que no podríamos verificar mejor. `identity-mfa.spec.ts`
 * comprueba los seis vectores del RFC 6238 y los siete del RFC 4648.
 *
 * ── LA DECISIÓN QUE MÁS IMPORTA: EL SECRETO VA CIFRADO ──────────────────────
 * Un secreto TOTP no se puede guardar como hash: hay que poder recalcular el
 * código, así que el servidor necesita el valor. Guardarlo en claro convierte
 * cualquier volcado de la base de datos en la derrota completa del segundo
 * factor — quien se lleva la tabla puede generar códigos válidos para siempre,
 * y el usuario no tiene forma de enterarse.
 *
 * Por eso se cifra con AES-256-GCM y una clave que vive FUERA de la base de
 * datos (`IDENTITY_MFA_ENCRYPTION_KEY`). Un volcado sin la clave no sirve de
 * nada. GCM y no CBC porque además autentica: un secreto manipulado en la
 * tabla falla al descifrar en vez de producir códigos silenciosamente
 * equivocados que el usuario viviría como «mi teléfono dejó de funcionar».
 *
 * En producción la clave es OBLIGATORIA y el arranque muere sin ella, igual
 * que con `IDENTITY_RATE_LIMIT_KEY_SECRET`. En desarrollo hay una clave fija y
 * declarada: derivarla al azar por proceso dejaría ilegibles los secretos tras
 * cada reinicio, que en desarrollo se vive como un bug intermitente.
 */

/** Paso de tiempo del estándar. 30 s es lo que asumen todas las aplicaciones. */
export const TOTP_STEP_SECONDS = 30;
/** Seis dígitos: lo que un usuario teclea sin equivocarse. */
export const TOTP_DIGITS = 6;
/**
 * Ventana de tolerancia, en pasos hacia atrás y hacia adelante.
 *
 * 1 paso = ±30 s. Es el valor que recomienda el RFC 6238 §5.2 y el mínimo que
 * hace usable el factor: entre que el usuario lee el código y lo teclea puede
 * cruzar una frontera de paso, y el reloj de su teléfono puede ir desviado
 * unos segundos. Subirlo a 2 duplicaría la superficie de un ataque por fuerza
 * bruta sin arreglar ningún caso real.
 */
export const TOTP_WINDOW_STEPS = 1;

/** Longitud del secreto: 20 bytes = 160 bits, lo que fija el RFC 4226 §4. */
const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 de RFC 4648 (con relleno). Es el alfabeto que esperan las aplicaciones
 * de autenticación en el parámetro `secret` de un `otpauth://`, y el que un
 * usuario puede teclear a mano sin confundir 0 con O ni 1 con l — por eso el
 * estándar excluye esas cuatro figuras.
 */
export function encodeBase32(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  while (output.length % 8 !== 0) {
    output += '=';
  }
  return output;
}

/** Inversa de `encodeBase32`. Devuelve `null` ante cualquier entrada inválida. */
export function decodeBase32(encoded: string): Buffer | null {
  const cleaned = encoded.replace(/=+$/u, '').toUpperCase();
  if (!/^[A-Z2-7]*$/u.test(cleaned)) {
    return null;
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of cleaned) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Un secreto nuevo, en su forma para el `otpauth://` y para teclear a mano. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(TOTP_SECRET_BYTES));
}

/**
 * HOTP del RFC 4226 §5.3: HMAC-SHA1 sobre el contador en 8 bytes big-endian,
 * truncamiento dinámico con el nibble bajo del último byte como desplazamiento,
 * y módulo 10^dígitos rellenado con ceros a la izquierda.
 *
 * SHA-1 no es una elección: es lo que implementan las aplicaciones de
 * autenticación. Y aquí su debilidad no aplica — no se firma nada ni se busca
 * resistencia a colisiones; se usa como PRF con clave, que es el uso para el
 * que HMAC-SHA1 sigue siendo sólido.
 */
export function hotp(
  secret: Buffer,
  counter: number,
  digits = TOTP_DIGITS,
): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** El contador de TOTP: los segundos desde la época divididos por el paso. */
export function totpCounter(atMs: number, step = TOTP_STEP_SECONDS): number {
  return Math.floor(atMs / 1000 / step);
}

/** El código vigente en un instante dado. */
export function totp(
  secretBase32: string,
  atMs: number,
  digits = TOTP_DIGITS,
  step = TOTP_STEP_SECONDS,
): string | null {
  const secret = decodeBase32(secretBase32);
  if (!secret || secret.length === 0) {
    return null;
  }
  return hotp(secret, totpCounter(atMs, step), digits);
}

/**
 * Verificación con ventana y comparación en tiempo constante.
 *
 * La comparación constante importa aquí menos que en una contraseña —el código
 * caduca en 30 s— pero cuesta una línea y evita tener que razonar sobre si un
 * canal lateral de temporización permite adivinar dígito a dígito. La regla del
 * repositorio es que las comparaciones de secretos son constantes; ésta no es
 * la excepción.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number,
  window = TOTP_WINDOW_STEPS,
): boolean {
  const normalized = code.replace(/\s+/gu, '');
  if (!new RegExp(`^[0-9]{${TOTP_DIGITS}}$`, 'u').test(normalized)) {
    return false;
  }
  const secret = decodeBase32(secretBase32);
  if (!secret || secret.length === 0) {
    return false;
  }
  const base = totpCounter(atMs);
  let matched = false;
  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = hotp(secret, base + drift);
    // Sin cortocircuito: se recorren todos los pasos de la ventana siempre, así
    // el tiempo de respuesta no delata CUÁL paso acertó.
    if (
      timingSafeEqual(
        Buffer.from(candidate, 'utf8'),
        Buffer.from(normalized, 'utf8'),
      )
    ) {
      matched = true;
    }
  }
  return matched;
}

/**
 * La URI que lee la aplicación de autenticación al escanear el QR.
 *
 * El emisor y la etiqueta salen del producto y del correo del usuario: es lo
 * que la aplicación muestra en su lista, y sin ello el usuario acaba con tres
 * entradas llamadas «Cuenta» sin saber cuál es cuál. Todo se codifica por
 * componente de URI porque un correo con `+` o un emisor con espacio rompen la
 * URI en silencio y el QR resultante escanea mal.
 */
export function totpUri(params: {
  issuer: string;
  account: string;
  secretBase32: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/* ═══ CÓDIGOS DE RESPALDO ══════════════════════════════════════════════════ */

/** Cuántos se entregan. Diez cubre varias pérdidas sin volverse una lista. */
export const BACKUP_CODE_COUNT = 10;
/** Alfabeto sin las figuras que se confunden al copiar a mano: 0/O, 1/I/L. */
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Un código de respaldo: diez símbolos del alfabeto sin ambigüedades, escritos
 * en dos grupos de cinco. ~49 bits de entropía, muy por encima de lo que hace
 * falta para algo que además se consume una sola vez y está tras un límite de
 * intentos.
 *
 * `randomBytes` con rechazo del residuo en vez de `% 31`: el módulo directo
 * sesga los primeros símbolos del alfabeto, y aunque el sesgo aquí sería
 * pequeño, un generador de secretos sesgado es la clase de detalle que nadie
 * revisa dos veces.
 */
export function generateBackupCode(): string {
  const limit = 256 - (256 % BACKUP_ALPHABET.length);
  let code = '';
  while (code.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte >= limit) continue;
      code += BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length];
      if (code.length === 10) break;
    }
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Normaliza lo que teclea el usuario: sin guiones, sin espacios, en mayúsculas. */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]+/gu, '').toUpperCase();
}

/**
 * Los códigos SÍ se guardan como hash: a diferencia del secreto TOTP, aquí el
 * servidor sólo necesita COMPARAR, nunca reproducir. SHA-256 y no Argon2 porque
 * un código de diez símbolos aleatorios de este alfabeto tiene la entropía que
 * a una contraseña le falta: no hay diccionario que atacar, y el coste de
 * Argon2 sólo serviría para hacer más caro el inicio de sesión legítimo.
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

/* ═══ CIFRADO DEL SECRETO EN REPOSO ════════════════════════════════════════ */

const DEVELOPMENT_MFA_KEY = 'valle-design-desarrollo-mfa-clave-no-produccion';

export function assertMfaConfiguration(environment: NodeJS.ProcessEnv): void {
  const key = environment.IDENTITY_MFA_ENCRYPTION_KEY?.trim();
  if (environment.NODE_ENV === 'production' && (!key || key.length < 32)) {
    throw new Error(
      'Producción exige IDENTITY_MFA_ENCRYPTION_KEY con al menos 32 caracteres: sin ella, el secreto del segundo factor quedaría legible en cualquier volcado de la base de datos.',
    );
  }
}

function mfaKey(): Buffer {
  const configured = process.env.IDENTITY_MFA_ENCRYPTION_KEY?.trim();
  return createHash('sha256')
    .update(
      configured && configured.length >= 32 ? configured : DEVELOPMENT_MFA_KEY,
    )
    .digest();
}

/**
 * `v1.<iv>.<tag>.<cifrado>`, todo en base64url.
 *
 * El prefijo de versión no es ceremonia: el día que haya que rotar la clave o
 * cambiar el algoritmo, hace falta poder distinguir lo viejo de lo nuevo en la
 * misma columna, y añadirlo después obliga a adivinar el formato de cada fila.
 */
export function encryptMfaSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

/** Devuelve `null` ante cualquier fallo: manipulado, clave distinta o formato roto. */
export function decryptMfaSecret(payload: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      mfaKey(),
      Buffer.from(parts[1], 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
