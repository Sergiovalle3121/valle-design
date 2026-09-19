import type { Response } from 'express';
import {
  assertCsrfCookieDomainAgainstOrigins,
  clearCsrfCookie,
  csrfCookieDomain,
  setCsrfCookie,
} from './identity-csrf-cookie';
import { CSRF_COOKIE } from './identity-security';

type Call = {
  op: 'cookie' | 'clear';
  name: string;
  options: Record<string, unknown>;
};

function fakeResponse(): { res: Response; calls: Call[] } {
  const calls: Call[] = [];
  const res = {
    cookie(name: string, _value: string, options: Record<string, unknown>) {
      calls.push({ op: 'cookie', name, options });
      return res;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      calls.push({ op: 'clear', name, options });
      return res;
    },
  } as unknown as Response;
  return { res, calls };
}

describe('cookie CSRF compartida entre vallecad.com y api.vallecad.com', () => {
  const original = process.env.CSRF_COOKIE_DOMAIN;
  afterEach(() => {
    if (original === undefined) delete process.env.CSRF_COOKIE_DOMAIN;
    else process.env.CSRF_COOKIE_DOMAIN = original;
  });

  it('sin variable no hay dominio: el comportamiento host-only de siempre', () => {
    expect(csrfCookieDomain(undefined)).toBeUndefined();
    expect(csrfCookieDomain('   ')).toBeUndefined();
  });

  it('acepta un dominio con punto inicial y lo normaliza', () => {
    expect(csrfCookieDomain(' .VALLECAD.com ')).toBe('.vallecad.com');
  });

  it('falla cerrado ante un valor mal escrito', () => {
    expect(() => csrfCookieDomain('vallecad.com')).toThrow(/start with a dot/);
    expect(() => csrfCookieDomain('.com')).toThrow(/two labels/);
    expect(() => csrfCookieDomain('.valle..com')).toThrow(/two labels/);
    expect(() => csrfCookieDomain('.valle_cad.com')).toThrow(
      /invalid characters/,
    );
  });

  it('el dominio tiene que cubrir un origen permitido', () => {
    expect(() =>
      assertCsrfCookieDomainAgainstOrigins('.vallecad.com', [
        'https://vallecad.com',
      ]),
    ).not.toThrow();
    expect(() =>
      assertCsrfCookieDomainAgainstOrigins('.vallecad.com', [
        'https://www.vallecad.com',
      ]),
    ).not.toThrow();
    expect(() =>
      assertCsrfCookieDomainAgainstOrigins('.vallecad.com', [
        'https://example.com',
      ]),
    ).toThrow(/not a suffix/);
  });

  it('con dominio, escribe la cookie compartida y borra la host-only vieja', () => {
    process.env.CSRF_COOKIE_DOMAIN = '.vallecad.com';
    const { res, calls } = fakeResponse();
    setCsrfCookie(res, 'token', true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      op: 'cookie',
      name: CSRF_COOKIE,
      options: {
        domain: '.vallecad.com',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
      },
    });
    expect(calls[1].op).toBe('clear');
    expect(calls[1].options.domain).toBeUndefined();
  });

  it('sin dominio, una sola cookie host-only y nada que borrar', () => {
    delete process.env.CSRF_COOKIE_DOMAIN;
    const { res, calls } = fakeResponse();
    setCsrfCookie(res, 'token', false);
    expect(calls).toHaveLength(1);
    expect(calls[0].options.domain).toBeUndefined();
  });

  it('cerrar sesión borra la cookie en sus dos formas', () => {
    process.env.CSRF_COOKIE_DOMAIN = '.vallecad.com';
    const { res, calls } = fakeResponse();
    clearCsrfCookie(res, { path: '/', sameSite: 'lax', secure: true });
    expect(calls.map((c) => c.options.domain)).toEqual([
      undefined,
      '.vallecad.com',
    ]);
    expect(calls.every((c) => c.op === 'clear' && c.name === CSRF_COOKIE)).toBe(
      true,
    );
  });
});
