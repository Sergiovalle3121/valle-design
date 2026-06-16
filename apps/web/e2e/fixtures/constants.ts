/**
 * Shared constants for the E2E harness.
 *
 * These are imported by BOTH the Playwright config (to launch the dev server
 * with the right env) and the test fixtures (to forge sessions / route the
 * mocked backend). Keeping them in one module guarantees the signing secret and
 * the API origin stay in sync between the server process and the test process.
 */

/** Where the Next.js dev server is served (the app under test). */
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

/**
 * The origin the browser believes the backend lives at. We point
 * NEXT_PUBLIC_API_URL here (a port nothing actually listens on) so every data
 * call is unambiguous and gets intercepted by the in-memory fake backend. This
 * keeps the harness hermetic: no NestJS, no Postgres/SQLite, no flaky timing.
 */
export const API_ORIGIN = process.env.E2E_API_ORIGIN || 'http://localhost:4010';

/**
 * HMAC secret used to sign the `axos_session` cookie. Must match the value the
 * dev server runs with — the Playwright config passes this same constant into
 * the webServer env as AXOS_SESSION_SECRET.
 */
export const SESSION_SECRET = process.env.AXOS_SESSION_SECRET || 'axos-e2e-session-secret';

/**
 * The Master / owner identity. The app derives full-admin access from this
 * email (see apps/web/src/lib/owner.ts), so logging in as this user lands in the
 * hub with every area visible and write access — never read-only.
 */
export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'sergiovallezarate@gmail.com';
export const OWNER_NAME = 'Master';

export const SESSION_COOKIE = 'axos_session';
export const TOKEN_STORAGE_KEY = 'axos_access_token';
