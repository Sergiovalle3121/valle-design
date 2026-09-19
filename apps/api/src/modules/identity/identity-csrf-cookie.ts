import type { Response } from 'express';
import { CSRF_COOKIE } from './identity-security';

/**
 * El dominio de la cookie CSRF.
 *
 * POR QUÉ EXISTE. La API vive en api.vallecad.com y el producto en
 * vallecad.com. La protección CSRF es de doble envío: el JavaScript del
 * producto lee `valle_csrf` y la devuelve en la cabecera `x-csrf-token`. Una
 * cookie escrita por api.vallecad.com SIN `Domain` es host-only: el navegador
 * nunca se la enseña a vallecad.com, el producto manda la cabecera vacía y TODA
 * mutación autenticada responde `csrf_invalid` —empezando por crear la primera
 * organización tras el alta—. Con `CSRF_COOKIE_DOMAIN=.vallecad.com` la cookie
 * se comparte entre los dos subdominios y el doble envío vuelve a funcionar.
 *
 * Sin la variable, el comportamiento es el de siempre (host-only): sirve para
 * desarrollo y para despliegues donde web y API comparten origen.
 *
 * Falla cerrado ante un valor mal escrito: un dominio sin punto inicial, con un
 * solo rótulo o con caracteres raros lanza al arrancar en vez de degradar la
 * protección en silencio.
 */
export function csrfCookieDomain(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const domain = raw.trim().toLowerCase();
  if (!domain) return undefined;
  if (!domain.startsWith('.')) {
    throw new Error(
      `CSRF_COOKIE_DOMAIN must start with a dot (received "${domain}").`,
    );
  }
  const labels = domain.slice(1).split('.');
  if (labels.length < 2 || labels.some((label) => !label)) {
    throw new Error(
      `CSRF_COOKIE_DOMAIN must have at least two labels after the leading dot (received "${domain}").`,
    );
  }
  if (!/^[a-z0-9.-]+$/u.test(domain)) {
    throw new Error(
      `CSRF_COOKIE_DOMAIN contains invalid characters (received "${domain}").`,
    );
  }
  return domain;
}

/**
 * El dominio tiene que cubrir al menos uno de los orígenes permitidos: si no,
 * la cookie se escribiría para un sitio que nunca llama a esta API. Se comprueba
 * al arrancar, junto a `ALLOWED_ORIGIN`.
 */
export function assertCsrfCookieDomainAgainstOrigins(
  domain: string,
  allowedOrigins: readonly string[],
): void {
  const matches = allowedOrigins.some((origin) => {
    try {
      const host = new URL(origin).hostname;
      return host === domain.slice(1) || host.endsWith(domain);
    } catch {
      return false;
    }
  });
  if (!matches) {
    throw new Error(
      `CSRF_COOKIE_DOMAIN "${domain}" is not a suffix of any ALLOWED_ORIGIN host.`,
    );
  }
}

/**
 * Escribe la cookie CSRF con el dominio configurado. Si hay dominio, además
 * borra la host-only que dejaron las sesiones anteriores al arreglo: con las
 * dos vivas, la API podría leer la vieja y rechazar la cabecera nueva.
 */
export function setCsrfCookie(
  res: Response,
  csrf: string,
  secure: boolean,
): void {
  const domain = csrfCookieDomain(process.env.CSRF_COOKIE_DOMAIN);
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 30 * 86_400_000,
    ...(domain ? { domain } : {}),
  });
  if (domain) {
    res.clearCookie(CSRF_COOKIE, { path: '/', sameSite: 'lax', secure });
  }
}

/** Borra la cookie CSRF en sus dos formas: host-only y, si la hay, de dominio. */
export function clearCsrfCookie(
  res: Response,
  options: { path: string; sameSite: 'lax'; secure: boolean },
): void {
  res.clearCookie(CSRF_COOKIE, options);
  const domain = csrfCookieDomain(process.env.CSRF_COOKIE_DOMAIN);
  if (domain) {
    res.clearCookie(CSRF_COOKIE, { ...options, domain });
  }
}
