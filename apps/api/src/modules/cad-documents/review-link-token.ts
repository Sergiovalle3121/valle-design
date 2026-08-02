import { createHash, randomBytes } from 'node:crypto';

/**
 * Tokens de review link SERVER-OWNED (Fase 5).
 *
 * - El token lo GENERA siempre el servidor: 32 bytes de aleatoriedad
 *   criptográfica (256 bits) en base64url con el prefijo reconocible `vdrl_`
 *   (Valle Design Review Link) — 48 caracteres, dentro del rango 16–256 del
 *   contrato. El prefijo permite identificar/soportar el formato sin acercarse
 *   nunca al valor (los logs y la auditoría solo mencionan ids de sesión).
 * - Se persiste ÚNICAMENTE el sha256 hex del token (64 chars —
 *   `cad_review_sessions.token_hash`). sha256 sin sal es correcto aquí porque
 *   el token tiene 256 bits de entropía real: no existe diccionario que
 *   recorrer (a diferencia de contraseñas humanas, donde el repo usaría un
 *   KDF). Es el mismo patrón content-addressed del blob store.
 * - El canje re-hashea lo recibido y busca por igualdad indexada; la ventana
 *   de validez (expiración/revocación) se comprueba en CADA request.
 */

export const REVIEW_TOKEN_PREFIX = 'vdrl_';

/** Cotas del contrato (design-api.v1.yaml: shareToken 16–256 chars). */
export const REVIEW_TOKEN_MIN_LENGTH = 16;
export const REVIEW_TOKEN_MAX_LENGTH = 256;

/** TTL del link: default 7 días; configurable 5 min – 90 días. */
export const REVIEW_LINK_TTL_DEFAULT_MINUTES = 7 * 24 * 60;
export const REVIEW_LINK_TTL_MIN_MINUTES = 5;
export const REVIEW_LINK_TTL_MAX_MINUTES = 90 * 24 * 60;

export interface GeneratedReviewToken {
  /** Token en claro — SOLO para la respuesta de creación. No persistir. */
  token: string;
  /** sha256 hex del token — lo ÚNICO que se persiste. */
  tokenHash: string;
}

export function generateReviewLinkToken(): GeneratedReviewToken {
  const token = `${REVIEW_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashReviewLinkToken(token) };
}

export function hashReviewLinkToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * ¿Tiene pinta de token del contrato? Filtro barato ANTES de tocar la base:
 * fuera de rango no puede ser un token emitido y no merece una consulta.
 */
export function isPlausibleReviewToken(rawToken: unknown): rawToken is string {
  return (
    typeof rawToken === 'string' &&
    rawToken.length >= REVIEW_TOKEN_MIN_LENGTH &&
    rawToken.length <= REVIEW_TOKEN_MAX_LENGTH &&
    !/\s/.test(rawToken)
  );
}

/**
 * TTL efectivo del link en minutos: el pedido por el creador (acotado por el
 * contrato) o el default del despliegue (`REVIEW_LINK_TTL_MINUTES`, con el
 * mismo acotamiento), o el default del producto (7 días).
 */
export function resolveReviewLinkTtlMinutes(requested?: number): number {
  const clamp = (value: number) =>
    Math.min(
      Math.max(Math.trunc(value), REVIEW_LINK_TTL_MIN_MINUTES),
      REVIEW_LINK_TTL_MAX_MINUTES,
    );
  if (typeof requested === 'number' && Number.isFinite(requested)) {
    return clamp(requested);
  }
  const fromEnv = Number(process.env.REVIEW_LINK_TTL_MINUTES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return clamp(fromEnv);
  return REVIEW_LINK_TTL_DEFAULT_MINUTES;
}
