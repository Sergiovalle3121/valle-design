/**
 * Forges a logged-in "Master" (owner/admin) session for the E2E tests.
 *
 * The app has two notions of identity:
 *   1. A server-side, HMAC-signed cookie (`axos_session`) read by the Next.js
 *      middleware and server routes (e.g. /api/auth/me). This is what gates the
 *      hub and decides "admin vs read-only".
 *   2. A client-side JWT in localStorage (`axos_access_token`) read by the React
 *      AuthContext. Normally minted by the backend bridge; here we pre-seed a
 *      decode-only token so the client also believes it is the admin owner
 *      without any backend round-trip.
 *
 * We replicate the cookie signing from apps/web/src/lib/session.ts (base64url
 * body + HMAC-SHA256 signature) using Node's crypto, with the same secret the
 * dev server runs with (see constants.SESSION_SECRET).
 */

import crypto from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import {
  SESSION_SECRET,
  OWNER_EMAIL,
  OWNER_NAME,
  SESSION_COOKIE,
  TOKEN_STORAGE_KEY,
} from './constants';

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

export interface SessionPayload {
  kind: 'user' | 'demo';
  userId?: string;
  name: string;
  email?: string;
  role: string;
  position?: string | null;
  exp: number;
}

/** Mirror of encodeSession() in apps/web/src/lib/session.ts. */
export function encodeSession(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** A valid signed cookie value for the owner, valid for `maxAgeSeconds`. */
export function masterSessionCookieValue(maxAgeSeconds = 60 * 60): string {
  return encodeSession({
    kind: 'user',
    userId: 'e2e-master',
    name: OWNER_NAME,
    email: OWNER_EMAIL,
    role: 'admin',
    position: null,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  });
}

/**
 * A decode-only JWT for the client AuthContext. The client never verifies the
 * signature (see decodeJwt in AuthContext.tsx) — it only reads the payload — so
 * any base64url signature segment is fine. Carries role + future exp so
 * applyToken() accepts it without bridging to a backend.
 */
export function masterJwt(maxAgeSeconds = 60 * 60 * 24): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: 'e2e-master',
      email: OWNER_EMAIL,
      role: 'admin',
      tenant_id: 'e2e-tenant',
      plant_id: 'e2e-plant',
      permissions: ['*'],
      iat: now,
      exp: now + maxAgeSeconds,
    }),
  );
  const sig = Buffer.from('e2e-signature', 'utf8').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

/**
 * Seeds the browser context so it is already logged in as the Master owner:
 *  - the signed `axos_session` cookie (server-side gate),
 *  - the `axos_access_token` JWT in localStorage (client AuthContext).
 *
 * Call this BEFORE navigating. Not used by the dedicated login spec, which
 * drives the real login form instead.
 */
export async function loginAsMaster(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: masterSessionCookieValue(),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  const jwt = masterJwt();
  await context.addInitScript(
    ([key, token]) => {
      try {
        window.localStorage.setItem(key, token);
      } catch {
        /* ignore storage errors */
      }
    },
    [TOKEN_STORAGE_KEY, jwt] as const,
  );
}
