/**
 * Shared constants for the E2E harness.
 *
 * These are imported by BOTH the Playwright config (to launch the dev server
 * with the right env) and the test fixtures (to route the mocked backend).
 * Keeping them in one module guarantees the API origin and deterministic
 * standalone identity stay in sync.
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
 * Deterministic first-party identity used by the hermetic browser suites.
 * UUIDs deliberately follow the public contract, and organization.id is the
 * tenant identifier just like it is in the standalone product.
 */
export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'sergiovallezarate@gmail.com';
export const OWNER_USER_ID = '10000000-0000-4000-8000-000000000001';
export const OWNER_SESSION_ID = '10000000-0000-4000-8000-000000000002';
export const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000003';
export const ORGANIZATION_NAME = 'Valle Design E2E';
export const ORGANIZATION_SLUG = 'valle-design-e2e';

export const SESSION_COOKIE = 'valle_session';
export const CSRF_COOKIE = 'valle_csrf';
export const SESSION_COOKIE_VALUE = `${OWNER_SESSION_ID}.${'s'.repeat(43)}`;
export const CSRF_COOKIE_VALUE = 'c'.repeat(43);
