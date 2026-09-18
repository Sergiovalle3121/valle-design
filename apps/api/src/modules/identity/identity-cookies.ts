import { ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  csrfCookieDomain,
  CSRF_COOKIE,
  SESSION_COOKIE,
  sessionCookiePolicy,
} from './identity-security';
import type { SessionCookiePolicy } from './identity-security';

export function getCookiePolicy(req: Request): SessionCookiePolicy {
  const policy = sessionCookiePolicy(process.env.NODE_ENV, req.secure === true);
  if (!policy.transportAllowed) {
    throw new ServiceUnavailableException(
      'Las cookies de sesión de producción requieren HTTPS.',
    );
  }
  if (policy.name !== SESSION_COOKIE) {
    throw new ServiceUnavailableException(
      'La configuración de cookies cambió después del arranque.',
    );
  }
  return policy;
}

export function setCookies(
  req: Request,
  res: Response,
  value: string,
  csrf: string,
): void {
  const policy = getCookiePolicy(req);
  res.cookie(policy.name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: policy.secure,
    path: '/',
    maxAge: 30 * 86_400_000,
  });
  const domain = csrfCookieDomain(process.env.CSRF_COOKIE_DOMAIN);
  const csrfOptions: Record<string, unknown> = {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: policy.secure,
    path: '/',
    maxAge: 30 * 86_400_000,
  };
  if (domain) {
    csrfOptions.domain = domain;
  }
  res.cookie(CSRF_COOKIE, csrf, csrfOptions);
  if (domain) {
    res.clearCookie(CSRF_COOKIE, {
      path: '/',
      sameSite: 'lax',
      secure: policy.secure,
    });
  }
}

export function clearCookies(req: Request, res: Response): void {
  const policy = getCookiePolicy(req);
  const options = {
    path: '/',
    sameSite: 'lax' as const,
    secure: policy.secure,
  };
  res.clearCookie(policy.name, options);
  res.clearCookie(CSRF_COOKIE, options);
  const domain = csrfCookieDomain(process.env.CSRF_COOKIE_DOMAIN);
  if (domain) {
    res.clearCookie(CSRF_COOKIE, { ...options, domain });
  }
}
