import { ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { clearCsrfCookie, setCsrfCookie } from './identity-csrf-cookie';
import { SESSION_COOKIE, sessionCookiePolicy } from './identity-security';
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
  setCsrfCookie(res, csrf, policy.secure);
}

export function clearCookies(req: Request, res: Response): void {
  const policy = getCookiePolicy(req);
  const options = {
    path: '/',
    sameSite: 'lax' as const,
    secure: policy.secure,
  };
  res.clearCookie(policy.name, options);
  clearCsrfCookie(res, options);
}
