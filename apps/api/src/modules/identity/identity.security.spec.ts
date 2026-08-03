import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import {
  Credential,
  IdentityAuditEvent,
  OneTimeToken,
  Session,
  User,
} from './entities/identity.entity';
import {
  EmailDto,
  parseCookieHeader,
  RegisterDto,
  ResetDto,
  sessionCookiePolicy,
  TokenDto,
} from './identity.controller';
import { BoundedMemoryIdentityRateLimitStore } from './identity-rate-limit.store';
import {
  assertIdentitySecurityConfiguration,
  constantTimeEqual,
  createOpaqueRateLimitKey,
  DEVELOPMENT_SESSION_COOKIE,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TOKEN_LENGTH,
  SECURE_SESSION_COOKIE,
} from './identity-security';
import { IdentityService } from './identity.service';

jest.setTimeout(30_000);

describe('first-party identity security primitives', () => {
  const service = Object.create(IdentityService.prototype) as IdentityService;

  it('hashes opaque tokens and never retains their plaintext', () => {
    const raw = service.newToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(service.hashToken(raw)).toMatch(/^[a-f0-9]{64}$/u);
    expect(service.hashToken(raw)).not.toContain(raw);
  });

  it('uses genuine salted Argon2id credentials', async () => {
    const password = 'correct horse battery staple';
    const first = await service.hashPassword(password);
    const second = await service.hashPassword(password);

    expect(first).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/u,
    );
    expect(first).not.toBe(second);
    await expect(service.verifyPassword(first, password)).resolves.toBe(true);
    await expect(
      service.verifyPassword(first, 'incorrect password'),
    ).resolves.toBe(false);
  });

  it('does not accept the former scrypt output mislabeled as Argon2id', async () => {
    const mislabeled =
      '$argon2id$v=19$m=65536,t=3,p=1$MDAwMDAwMDAwMDAwMDAwMA$yQZG__Hss7Kja1ASDVyV4wmJNb9YMND_w3jN6f4ZgyQ';

    await expect(
      service.verifyPassword(mislabeled, 'correct horse battery staple'),
    ).resolves.toBe(false);
  });

  it('rejects passwords above the resource-safety limit', async () => {
    await expect(
      service.hashPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1)),
    ).rejects.toThrow(RangeError);
  });

  it('compares secret values through fixed-size digests', () => {
    expect(constantTimeEqual('same-secret', 'same-secret')).toBe(true);
    expect(constantTimeEqual('same-secret', 'different-secret')).toBe(false);
    expect(constantTimeEqual('short', 'a much longer value')).toBe(false);
    expect(constantTimeEqual(undefined, '')).toBe(false);
    expect(service.tokenMatchesHash('token', service.hashToken('token'))).toBe(
      true,
    );
    expect(
      service.tokenMatchesHash('attacker-token', service.hashToken('token')),
    ).toBe(false);
  });

  it('derives opaque rate-limit keys without plaintext account identifiers', () => {
    const email = 'person@example.com';
    const first = createOpaqueRateLimitKey('login.account', [email]);
    const second = createOpaqueRateLimitKey('login.account', [email]);
    const other = createOpaqueRateLimitKey('login.account', [
      'other@example.com',
    ]);

    expect(first).toBe(second);
    expect(first).not.toContain(email);
    expect(first).toMatch(/^identity:login\.account:[A-Za-z0-9_-]{43}$/u);
    expect(other).not.toBe(first);
  });

  it('fails production startup without a shared opaque-key secret', () => {
    expect(() =>
      assertIdentitySecurityConfiguration({ NODE_ENV: 'production' }),
    ).toThrow(/IDENTITY_RATE_LIMIT_KEY_SECRET/u);
    expect(() =>
      assertIdentitySecurityConfiguration({
        NODE_ENV: 'production',
        IDENTITY_RATE_LIMIT_KEY_SECRET: 'short',
      }),
    ).toThrow(/at least 32/u);
    expect(() =>
      assertIdentitySecurityConfiguration({
        NODE_ENV: 'production',
        IDENTITY_RATE_LIMIT_KEY_SECRET: 's'.repeat(32),
      }),
    ).not.toThrow();
    expect(() =>
      assertIdentitySecurityConfiguration({ NODE_ENV: 'test' }),
    ).not.toThrow();
  });
});

describe('bounded identity rate-limit store', () => {
  it('expires counters and enforces attempt limits', () => {
    let now = 1_000;
    const store = new BoundedMemoryIdentityRateLimitStore(2, () => now);

    expect(store.consume('key-a', 2, 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(store.consume('key-a', 2, 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(store.consume('key-a', 2, 1_000)).toMatchObject({
      allowed: false,
      remaining: 0,
    });

    now = 2_000;
    expect(store.consume('key-a', 2, 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });

  it('fails closed instead of growing beyond its memory bound', () => {
    let now = 5_000;
    const store = new BoundedMemoryIdentityRateLimitStore(2, () => now);

    expect(store.consume('key-a', 1, 1_000).allowed).toBe(true);
    expect(store.consume('key-b', 1, 1_000).allowed).toBe(true);
    expect(store.size).toBe(2);
    expect(store.consume('key-c', 1, 1_000).allowed).toBe(false);
    expect(store.size).toBe(2);

    now = 6_000;
    expect(store.consume('key-c', 1, 1_000).allowed).toBe(true);
    expect(store.size).toBe(1);
  });
});

describe('identity input boundaries', () => {
  it('accepts a valid registration payload', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'person@example.com',
      password: 'a sufficiently long password',
      displayName: 'Valle User',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [
      'email',
      Object.assign(new EmailDto(), {
        email: `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`,
      }),
    ],
    [
      'password',
      Object.assign(new RegisterDto(), {
        email: 'person@example.com',
        password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1),
      }),
    ],
    [
      'display name',
      Object.assign(new RegisterDto(), {
        email: 'person@example.com',
        password: 'a sufficiently long password',
        displayName: 'x'.repeat(MAX_DISPLAY_NAME_LENGTH + 1),
      }),
    ],
    [
      'one-time token',
      Object.assign(new TokenDto(), {
        token: 'x'.repeat(MAX_TOKEN_LENGTH + 1),
      }),
    ],
    [
      'reset password',
      Object.assign(new ResetDto(), {
        token: 'x'.repeat(43),
        password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1),
      }),
    ],
  ])('rejects an oversized %s', async (_label, dto) => {
    expect(await validate(dto)).not.toHaveLength(0);
  });
});

describe('identity cookie handling', () => {
  it('selects a non-prefixed HTTP development cookie', () => {
    expect(sessionCookiePolicy('development', false)).toEqual({
      name: DEVELOPMENT_SESSION_COOKIE,
      secure: false,
      transportAllowed: true,
    });
  });

  it('allows the __Host cookie only with Secure over HTTPS', () => {
    expect(sessionCookiePolicy('production', true)).toEqual({
      name: SECURE_SESSION_COOKIE,
      secure: true,
      transportAllowed: true,
    });
    expect(sessionCookiePolicy('production', false)).toEqual({
      name: SECURE_SESSION_COOKIE,
      secure: true,
      transportAllowed: false,
    });
  });

  it('parses exact, encoded, and quoted cookie values', () => {
    expect(
      parseCookieHeader(
        'prefix=ignored; valle_session=abc%2Edef; suffix=ignored',
        'valle_session',
      ),
    ).toBe('abc.def');
    expect(parseCookieHeader('valle_session="abc.def"', 'valle_session')).toBe(
      'abc.def',
    );
    expect(
      parseCookieHeader('valle_session_extra=value', 'valle_session'),
    ).toBeUndefined();
  });

  it('fails closed for malformed, duplicate, or oversized cookie headers', () => {
    expect(
      parseCookieHeader('valle_session=%E0%A4%A', 'valle_session'),
    ).toBeUndefined();
    expect(
      parseCookieHeader(
        'valle_session=first; valle_session=second',
        'valle_session',
      ),
    ).toBeUndefined();
    expect(
      parseCookieHeader(`valle_session=${'x'.repeat(1_025)}`, 'valle_session'),
    ).toBeUndefined();
    expect(
      parseCookieHeader(`irrelevant=${'x'.repeat(8_192)}`, 'valle_session'),
    ).toBeUndefined();
  });
});

describe('identity entity metadata', () => {
  it('initializes with the bounded SQLite test fallback', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, Credential, Session, OneTimeToken, IdentityAuditEvent],
      synchronize: true,
    });

    try {
      await dataSource.initialize();
      expect(dataSource.getMetadata(Session).relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ propertyName: 'user' }),
        ]),
      );
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  });
});
