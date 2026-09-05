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

/**
 * DA DE ALTA UNA CUENTA DE PRUEBA, y espera si el producto le dice que espere.
 *
 * `POST /v1/auth/register` lleva un tope de OCHO altas por IP y minuto
 * (`identity.controller.ts:356`, ventana de 60 s). En CI las suites de
 * `e2e/real` comparten proceso, API e IP, así que cuando varias registran
 * dentro del mismo minuto la novena recibe un 429. El `beforeAll` que
 * disparaba el alta SIN MIRAR la respuesta seguía adelante, pedía el correo de
 * verificación y moría tres líneas más abajo con un 404 del arnés de correo
 * que no acusaba a nadie: el correo no existía porque el alta nunca había
 * ocurrido.
 *
 * Medido el 2026-09-05 en el fragmento 4/4 de `E2E Playwright`: el barrido de
 * cables cayó en 450 ms —antes de pulsar un solo control— y su reintento cayó
 * igual 900 ms después; la prueba de en medio, con el MISMO `beforeAll`, pasó,
 * porque su reloj cayó en otro hueco de la ventana deslizante. De ahí que la
 * misma rama pudiera estar verde en `main` y roja en la rama siguiente sin que
 * mediara una línea de código: lo que cambiaba era el segundero.
 *
 * El tope NO se toca: es una defensa real del producto contra el alta masiva,
 * y relajarla para que pase una prueba sería cambiar un defecto por una
 * mentira. Lo que se arregla es la prueba, que ahora ESPERA lo que el propio
 * 429 le dice que espere y AFIRMA el 202 en vez de suponerlo.
 */
export async function registrarCuenta(
  request: APIRequestContext,
  email: string,
  displayName: string,
): Promise<void> {
  let ultimo = "";
  for (let intento = 0; intento < 5; intento += 1) {
    const response = await request.post(`${API_ORIGIN}/v1/auth/register`, {
      data: { email, password: E2E_PASSWORD, displayName },
    });
    if (response.status() !== 429) {
      expect(response.status(), await response.text()).toBe(202);
      return;
    }
    ultimo = await response.text();
    const cuerpo = (await response.json().catch(() => ({}))) as {
      retryAfterSeconds?: number;
    };
    // El servidor dice cuántos segundos faltan para que su ventana deje sitio.
    // Se le hace caso, con suelo de 1 s y techo de 20 s para que un valor raro
    // no cuelgue el gancho: cinco intentos así caben en el minuto de la
    // ventana con margen.
    const espera = Math.min(Math.max(cuerpo.retryAfterSeconds ?? 5, 1), 20);
    await new Promise((listo) => setTimeout(listo, espera * 1_000));
  }
  throw new Error(
    `El alta de ${email} siguió limitada por IP tras cinco intentos: ${ultimo}`,
  );
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
