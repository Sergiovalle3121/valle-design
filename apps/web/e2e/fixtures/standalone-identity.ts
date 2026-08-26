/**
 * Hermetic first-party identity boundary for mock-backed Playwright suites.
 *
 * The browser receives the same two-cookie shape as the standalone API: an
 * opaque HttpOnly session cookie and a readable CSRF cookie. The intercepted
 * endpoints mirror the public `/v1` contract and reject missing sessions or
 * mismatched double-submit tokens. No browser storage credential is involved.
 */

import type {
  BrowserContext,
  Request as PlaywrightRequest,
  Route,
} from "@playwright/test";
import {
  API_ORIGIN,
  CSRF_COOKIE,
  CSRF_COOKIE_VALUE,
  ORGANIZATION_ID,
  ORGANIZATION_NAME,
  ORGANIZATION_SLUG,
  OWNER_EMAIL,
  OWNER_SESSION_ID,
  OWNER_USER_ID,
  SESSION_COOKIE,
  SESSION_COOKIE_VALUE,
} from "./constants";
import { LEGAL_PAGE_VERSIONS } from "../../src/lib/legal/legal-versions";

const EXPIRES_AT = "2099-12-31T23:59:59.000Z";
const TRIAL_ENDS_AT = "2099-01-31T23:59:59.000Z";
/**
 * Espejo de `LEGAL_DOCUMENTS` (`apps/api/src/modules/legal/legal-documents.ts`)
 * con la versión LEÍDA del espejo de presentación del web en vez de clavada:
 * publicar una versión nueva (regla del candado legal) dejaba este mock
 * sirviendo la retirada y los specs que la aceptaban morían contra el API
 * real, que ya no la reconoce.
 */
const MOCK_LEGAL_DOCUMENTS = [
  {
    documento: "terms",
    ...LEGAL_PAGE_VERSIONS.terms,
    url: "/terms",
    requiereAceptacion: true,
  },
  {
    documento: "privacy",
    ...LEGAL_PAGE_VERSIONS.privacy,
    url: "/privacy",
    requiereAceptacion: false,
  },
] as const;
const CAD_PERMISSIONS = [
  "cad:view",
  "cad:edit",
  "cad:review",
  "cad:publish",
  "cad:admin",
] as const;
const VIEWER_PERMISSIONS = ["cad:view", "cad:review"] as const;
type MockOrganizationRole = "owner" | "viewer";

const installed = new WeakMap<BrowserContext, StandaloneIdentityBackend>();

export class StandaloneIdentityBackend {
  private authenticated = false;
  private role: MockOrganizationRole = "owner";
  private permissions: readonly string[] = CAD_PERMISSIONS;
  private legalAcceptances: Array<{
    document: string;
    version: string;
    acceptedAt: string;
  }> = [];

  constructor(private readonly context: BrowserContext) {}

  async install(): Promise<void> {
    await this.context.route(`${API_ORIGIN}/**`, (route) => this.handle(route));
  }

  async login(): Promise<void> {
    this.authenticated = true;
    await this.context.addCookies([
      {
        name: SESSION_COOKIE,
        value: SESSION_COOKIE_VALUE,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: CSRF_COOKIE,
        value: CSRF_COOKIE_VALUE,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        sameSite: "Lax",
      },
    ]);
  }

  setAccess(role: MockOrganizationRole, permissions: readonly string[]): void {
    this.role = role;
    this.permissions = permissions;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method().toUpperCase();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    const isIdentityRoute = path.startsWith("/v1/auth/");
    const isOrganizationRoute =
      path === "/v1/organizations" || path.startsWith("/v1/organizations/");
    const isCommercialRoute = path.startsWith("/v1/commercial/");
    const isLegalRoute = path.startsWith("/v1/legal/");
    if (
      !isIdentityRoute &&
      !isOrganizationRoute &&
      !isCommercialRoute &&
      !isLegalRoute
    ) {
      return route.fallback();
    }

    // Publico, como en la API real: el web necesita saber que version
    // mostrar antes de que exista sesion.
    if (path === "/v1/legal/documents" && method === "GET") {
      return json({ documents: MOCK_LEGAL_DOCUMENTS });
    }

    if (path === "/v1/auth/session" && method === "GET") {
      if (!this.hasSession(request)) return this.unauthorized(json);
      return json(this.sessionResource());
    }

    if (path === "/v1/auth/logout" && method === "POST") {
      if (!this.hasSession(request)) return this.unauthorized(json);
      if (!hasValidCsrf(request)) return this.csrfRejected(json);
      this.authenticated = false;
      await this.context.clearCookies({ name: SESSION_COOKIE });
      await this.context.clearCookies({ name: CSRF_COOKIE });
      return route.fulfill({ status: 204, body: "" });
    }

    if (!this.hasSession(request)) return this.unauthorized(json);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !hasValidCsrf(request)
    ) {
      return this.csrfRejected(json);
    }

    if (path === "/v1/organizations" && method === "GET") {
      return json({
        items: [
          {
            id: ORGANIZATION_ID,
            name: ORGANIZATION_NAME,
            slug: ORGANIZATION_SLUG,
            role: this.role,
            active: true,
          },
        ],
      });
    }

    if (path === "/v1/organizations" && method === "POST") {
      const body = readJson(request);
      return json(
        {
          id: ORGANIZATION_ID,
          name: String(body.name ?? ORGANIZATION_NAME),
          slug: String(body.slug ?? ORGANIZATION_SLUG),
          ownerUserId: OWNER_USER_ID,
          createdAt: "2026-08-02T00:00:00.000Z",
          tenantId: ORGANIZATION_ID,
          subscription: {
            planCode: "design-trial",
            status: "trialing",
            trialEndsAt: TRIAL_ENDS_AT,
          },
        },
        201,
      );
    }

    if (path === "/v1/organizations/active" && method === "POST") {
      const body = readJson(request);
      if (body.organizationId !== ORGANIZATION_ID) {
        return json(
          {
            code: "organization_not_found",
            message: "Organización no encontrada.",
          },
          404,
        );
      }
      return json({
        organization: {
          id: ORGANIZATION_ID,
          name: ORGANIZATION_NAME,
          slug: ORGANIZATION_SLUG,
        },
        tenantId: ORGANIZATION_ID,
        role: this.role,
        permissions: this.permissions,
      });
    }

    if (path === "/v1/commercial/subscription" && method === "GET") {
      return json({
        organizationId: ORGANIZATION_ID,
        subscription: {
          planCode: "design-trial",
          status: "trialing",
          trialEndsAt: TRIAL_ENDS_AT,
          effective: true,
        },
      });
    }

    if (path === "/v1/commercial/entitlements" && method === "GET") {
      return json({ organizationId: ORGANIZATION_ID, items: ["design.cad"] });
    }

    if (path === "/v1/commercial/checkout-sessions" && method === "POST") {
      return json(
        {
          provider: "stripe",
          checkout: "hosted",
          intentId: "00000000-0000-4000-8000-0000000000c1",
          reference: "cs_mock_session",
          url: "https://checkout.example.test/session/mock",
          seats: 1,
          paymentMethod: "card",
          asynchronous: false,
        },
        201,
      );
    }

    if (path === "/v1/legal/acceptances" && method === "GET") {
      return json({ acceptances: this.legalAcceptances });
    }

    if (path === "/v1/legal/acceptances" && method === "POST") {
      const body = readJson(request);
      const known = MOCK_LEGAL_DOCUMENTS.some(
        (doc) =>
          doc.documento === body.document && doc.version === body.version,
      );
      if (!known) {
        return json(
          {
            statusCode: 400,
            message: "Version de documento legal desconocida.",
          },
          400,
        );
      }
      const document = String(body.document);
      const version = String(body.version);
      if (
        !this.legalAcceptances.some(
          (row) => row.document === document && row.version === version,
        )
      ) {
        this.legalAcceptances.push({
          document,
          version,
          acceptedAt: "2026-08-23T00:00:00.000Z",
        });
      }
      return json({ document, version, registered: true }, 201);
    }

    return json(
      {
        code: "mock_route_not_found",
        message: `Ruta standalone no contemplada: ${method} ${path}`,
      },
      404,
    );
  }

  private hasSession(request: PlaywrightRequest): boolean {
    return (
      this.authenticated &&
      cookieValue(request, SESSION_COOKIE) === SESSION_COOKIE_VALUE
    );
  }

  private sessionResource() {
    return {
      user: {
        id: OWNER_USER_ID,
        email: OWNER_EMAIL,
        emailVerified: true,
      },
      session: { id: OWNER_SESSION_ID, expiresAt: EXPIRES_AT },
      organization: {
        id: ORGANIZATION_ID,
        name: ORGANIZATION_NAME,
        slug: ORGANIZATION_SLUG,
        tenantId: ORGANIZATION_ID,
        role: this.role,
        permissions: this.permissions,
      },
    };
  }

  private unauthorized(
    json: (body: unknown, status?: number) => Promise<void>,
  ): Promise<void> {
    return json(
      {
        code: "identity_session_invalid",
        message: "Sesión inválida o expirada.",
      },
      401,
    );
  }

  private csrfRejected(
    json: (body: unknown, status?: number) => Promise<void>,
  ): Promise<void> {
    return json({ code: "csrf_invalid", message: "Token CSRF inválido." }, 403);
  }
}

/** Installs (once per context) and authenticates the standalone owner. */
export async function loginAsStandaloneOwner(
  context: BrowserContext,
): Promise<StandaloneIdentityBackend> {
  let backend = installed.get(context);
  if (!backend) {
    backend = new StandaloneIdentityBackend(context);
    installed.set(context, backend);
    await backend.install();
  }
  backend.setAccess("owner", CAD_PERMISSIONS);
  await backend.login();
  return backend;
}

/**
 * Instala la frontera de identidad SIN autenticar a nadie.
 *
 * Es el contexto del invitado de un review link: no tiene cuenta, así que
 * todo lo de primera parte tiene que responderle 401. Sin esto, un contexto
 * limpio dejaría escapar esas llamadas a la red de verdad y el spec no podría
 * afirmar que la página del enlace no depende de ninguna sesión.
 */
export async function installStandaloneIdentity(
  context: BrowserContext,
): Promise<StandaloneIdentityBackend> {
  let backend = installed.get(context);
  if (!backend) {
    backend = new StandaloneIdentityBackend(context);
    installed.set(context, backend);
    await backend.install();
  }
  return backend;
}

/** Installs (once per context) and authenticates a read-only organization member. */
export async function loginAsStandaloneViewer(
  context: BrowserContext,
): Promise<StandaloneIdentityBackend> {
  let backend = installed.get(context);
  if (!backend) {
    backend = new StandaloneIdentityBackend(context);
    installed.set(context, backend);
    await backend.install();
  }
  backend.setAccess("viewer", VIEWER_PERMISSIONS);
  await backend.login();
  return backend;
}

/** Shared assertion helper for authenticated CAD/data fixtures. */
export function firstPartyRequestFailure(
  request: PlaywrightRequest,
): { status: 401 | 403; body: Record<string, string> } | null {
  if (cookieValue(request, SESSION_COOKIE) !== SESSION_COOKIE_VALUE) {
    return {
      status: 401,
      body: {
        code: "identity_session_invalid",
        message: "Sesión inválida o expirada.",
      },
    };
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase()) &&
    !request.headers()["x-review-token"] &&
    !hasValidCsrf(request)
  ) {
    return {
      status: 403,
      body: { code: "csrf_invalid", message: "Token CSRF inválido." },
    };
  }
  return null;
}

function hasValidCsrf(request: PlaywrightRequest): boolean {
  return (
    request.headers()["x-csrf-token"] === CSRF_COOKIE_VALUE &&
    cookieValue(request, CSRF_COOKIE) === CSRF_COOKIE_VALUE
  );
}

function cookieValue(
  request: PlaywrightRequest,
  name: string,
): string | undefined {
  const prefix = `${name}=`;
  return request
    .headers()
    .cookie?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function readJson(request: PlaywrightRequest): Record<string, unknown> {
  try {
    const value = request.postDataJSON() as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
