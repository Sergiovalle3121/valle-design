import {
  REVIEW_LINK_TTL_DEFAULT_MINUTES,
  REVIEW_LINK_TTL_MAX_MINUTES,
  REVIEW_LINK_TTL_MIN_MINUTES,
  REVIEW_TOKEN_MAX_LENGTH,
  REVIEW_TOKEN_MIN_LENGTH,
  REVIEW_TOKEN_PREFIX,
  generateReviewLinkToken,
  hashReviewLinkToken,
  isPlausibleReviewToken,
  resolveReviewLinkTtlMinutes,
} from './review-link-token';

describe('review-link-token (tokens server-owned)', () => {
  const savedTtl = process.env.REVIEW_LINK_TTL_MINUTES;
  afterEach(() => {
    if (savedTtl === undefined) delete process.env.REVIEW_LINK_TTL_MINUTES;
    else process.env.REVIEW_LINK_TTL_MINUTES = savedTtl;
  });

  it('genera tokens con 256 bits de aleatoriedad, prefijo y rango del contrato', () => {
    const { token, tokenHash } = generateReviewLinkToken();
    expect(token.startsWith(REVIEW_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(REVIEW_TOKEN_MIN_LENGTH);
    expect(token.length).toBeLessThanOrEqual(REVIEW_TOKEN_MAX_LENGTH);
    // base64url: sin '+', '/', '=' (URL-safe, viaja en header sin escapes).
    expect(token).toMatch(/^vdrl_[A-Za-z0-9_-]{43}$/);
    // Lo persistible es el sha256 hex del token — 64 chars, verificable.
    expect(tokenHash).toBe(hashReviewLinkToken(token));
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // El hash NO contiene el token (nunca se persiste el claro).
    expect(tokenHash.includes(token)).toBe(false);
  });

  it('dos generaciones jamás coinciden (ni token ni hash)', () => {
    const a = generateReviewLinkToken();
    const b = generateReviewLinkToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('el filtro de plausibilidad rechaza formas fuera del contrato sin tocar la base', () => {
    expect(isPlausibleReviewToken(generateReviewLinkToken().token)).toBe(true);
    expect(isPlausibleReviewToken('corto')).toBe(false);
    expect(isPlausibleReviewToken('x'.repeat(257))).toBe(false);
    expect(isPlausibleReviewToken('token con espacios aqui!')).toBe(false);
    expect(isPlausibleReviewToken(42)).toBe(false);
    expect(isPlausibleReviewToken(undefined)).toBe(false);
  });

  it('el TTL respeta default (7 días), env y cotas 5 min – 90 días', () => {
    delete process.env.REVIEW_LINK_TTL_MINUTES;
    expect(resolveReviewLinkTtlMinutes()).toBe(REVIEW_LINK_TTL_DEFAULT_MINUTES);
    expect(resolveReviewLinkTtlMinutes(60)).toBe(60);
    expect(resolveReviewLinkTtlMinutes(1)).toBe(REVIEW_LINK_TTL_MIN_MINUTES);
    expect(resolveReviewLinkTtlMinutes(10_000_000)).toBe(
      REVIEW_LINK_TTL_MAX_MINUTES,
    );
    process.env.REVIEW_LINK_TTL_MINUTES = '120';
    expect(resolveReviewLinkTtlMinutes()).toBe(120);
    // El pedido explícito del creador gana sobre el default del despliegue.
    expect(resolveReviewLinkTtlMinutes(30)).toBe(30);
  });
});
