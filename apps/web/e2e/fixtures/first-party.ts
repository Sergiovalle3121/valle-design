import { expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { API_ORIGIN } from "./constants";

export const E2E_PASSWORD = "Valle-E2E-password-2026!";

const HARNESS_KEY =
  process.env.E2E_IDENTITY_HARNESS_KEY ??
  "valle-design-e2e-harness-key-32-characters-minimum";

export interface CapturedEmail {
  id: string;
  template: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function latestCapturedEmail(
  request: APIRequestContext,
  recipient: string,
  tenantId?: string,
): Promise<CapturedEmail> {
  const query = new URLSearchParams({ recipient });
  if (tenantId) query.set("tenantId", tenantId);
  const response = await request.get(
    `${API_ORIGIN}/_development/email-outbox?${query.toString()}`,
    { headers: { "x-valle-test-harness": HARNESS_KEY } },
  );
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as CapturedEmail;
}

export function capturedToken(email: CapturedEmail): string {
  const token = email.payload.token;
  expect(typeof token).toBe("string");
  expect((token as string).length).toBeGreaterThanOrEqual(32);
  return token as string;
}

export async function csrfHeaders(
  context: BrowserContext,
): Promise<Record<string, string>> {
  const cookies = await context.cookies(API_ORIGIN);
  const csrf = cookies.find((cookie) => cookie.name === "valle_csrf")?.value;
  expect(csrf, "La sesión first-party debe incluir la cookie CSRF legible").toBeTruthy();
  return { "x-csrf-token": csrf! };
}

export async function apiLogin(
  context: BrowserContext,
  email: string,
  password = E2E_PASSWORD,
): Promise<void> {
  const response = await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
  await csrfHeaders(context);
}

export async function apiLogout(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${API_ORIGIN}/v1/auth/logout`, {
    headers: await csrfHeaders(context),
  });
  expect(response.status(), await response.text()).toBe(204);
}

export async function apiPost<T>(
  context: BrowserContext,
  path: string,
  data: unknown,
): Promise<{ status: number; body: T }> {
  const response = await context.request.post(`${API_ORIGIN}${path}`, {
    data,
    headers: await csrfHeaders(context),
  });
  return {
    status: response.status(),
    body: (await response.json()) as T,
  };
}

export async function apiPut<T>(
  context: BrowserContext,
  path: string,
  data: unknown,
): Promise<{ status: number; body: T }> {
  const response = await context.request.put(`${API_ORIGIN}${path}`, {
    data,
    headers: await csrfHeaders(context),
  });
  return {
    status: response.status(),
    body: (await response.json()) as T,
  };
}

export async function apiGet<T>(
  context: BrowserContext,
  path: string,
): Promise<{ status: number; body: T }> {
  const response = await context.request.get(`${API_ORIGIN}${path}`);
  return {
    status: response.status(),
    body: (await response.json()) as T,
  };
}
