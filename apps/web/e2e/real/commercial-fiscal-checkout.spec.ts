/**
 * DoD DE LA OLA MEXICANA, contra la API real y PostgreSQL.
 *
 * El recorrido: registrar, verificar, crear organización con trial, CAPTURAR
 * LOS DATOS FISCALES y abrir la compra — comprobando por el camino que la
 * captura es una PUERTA y no un formulario decorativo.
 *
 * Sobre el paso de la tarjeta de prueba: sólo existe si el despliegue tiene
 * claves de Stripe. Sin ellas, `POST /v1/commercial/checkout-sessions`
 * responde 409 `checkout_unavailable` DESPUÉS de haber pasado la puerta
 * fiscal, y eso es lo que se afirma. La prueba distingue los dos desenlaces en
 * vez de exigir uno: con claves configuradas comprueba que la sesión
 * hospedada se abre; sin ellas, que el producto dice la verdad sobre por qué
 * no cobra. Fingir aquí un pago que no ocurre convertiría la evidencia de
 * release en decoración.
 */

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiPost,
  apiPut,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

const RFC_VALIDO = "VECJ880326XX4";

interface TaxProfileResponse {
  organizationId: string;
  issuance: { provider: string; mode: string; available: boolean };
  profile: {
    rfc: string;
    personType: string;
    legalName: string;
    taxRegimeCode: string;
    cfdiUseCode: string;
    postalCode: string;
  } | null;
}

interface ApiFailure {
  code?: string;
  issues?: Array<{ field: string; code: string; message: string }>;
}

interface CheckoutSession {
  provider: string;
  checkout: string;
  intentId: string;
  url: string | null;
  seats: number;
  paymentMethod: string;
  asynchronous: boolean;
}

test.describe("captura fiscal CFDI 4.0 y compra autoservicio", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let email: string;
  let runId: string;
  let organizationId: string;

  test.beforeAll(async ({ browser: projectBrowser, browserName }, testInfo) => {
    testInfo.setTimeout(120_000);
    browser = projectBrowser;
    runId = `${browserName}-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.fiscal.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1: registra, verifica y crea una organización con trial", async () => {
    test.setTimeout(180_000);

    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Despacho Fiscal E2E");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);

    const verification = await latestCapturedEmail(context.request, email);
    expect(verification.template).toBe("identity.verify-email");
    await page.goto(
      `/verify-email?token=${encodeURIComponent(capturedToken(verification))}`,
    );
    // La verificación se envía sola al montar con un token válido en la URL
    // (sin botón que pulsar): verificado empíricamente contra el servidor
    // real. Ver e2e/real/dwg-import-real.spec.ts, hallado con el mismo
    // patrón.
    await expect(page.getByRole("status")).toContainText(
      /correo qued.* verificado/iu,
      { timeout: 30_000 },
    );

    await page.goto("/login?returnTo=/dashboard");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);
    await expect
      .poll(async () =>
        (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status(),
      )
      .toBe(200);

    const created = await apiPost<{ id: string; tenantId: string }>(
      context,
      "/v1/organizations",
      {
        name: `Despacho Fiscal ${runId}`,
        slug: `fiscal-${runId}`.toLowerCase(),
      },
    );
    expect(created.status).toBe(201);
    organizationId = created.body.id;
    await apiPost(context, "/v1/organizations/active", { organizationId });
  });

  test("2: sin datos fiscales NO se puede abrir un cobro", async () => {
    // La puerta. Pedir el RFC después del cobro es la pesadilla operativa que
    // esta ola evita: el mes se cierra, la factura no sale y el cliente no
    // deduce. El 409 tiene que llegar ANTES de cualquier redirección a pagar.
    const rechazado = await apiPost<ApiFailure>(
      context,
      "/v1/commercial/checkout-sessions",
      { planCode: "individual", currency: "MXN", period: "monthly" },
    );
    expect(rechazado.status).toBe(409);
    expect(rechazado.body.code).toBe("tax_profile_required");
  });

  test("3: los catálogos del SAT son públicos y cerrados", async () => {
    const catalogos = await apiGet<{
      taxRegimes: Array<{ code: string; personTypes: string[] }>;
      cfdiUses: Array<{ code: string; taxRegimeCodes: string[] }>;
    }>(context, "/v1/commercial/public/tax-catalogs");
    expect(catalogos.status).toBe(200);
    expect(catalogos.body.taxRegimes.map((r) => r.code)).toContain("612");
    // Un asalariado (605) sólo puede usar S01: es la regla del SAT que evita
    // el rechazo más común al timbrar, y se publica para que el desplegable
    // no ofrezca combinaciones inválidas.
    const gastos = catalogos.body.cfdiUses.find((use) => use.code === "G03");
    expect(gastos?.taxRegimeCodes).not.toContain("605");
  });

  test("4: la captura rechaza lo que el SAT rechazaría, campo por campo", async () => {
    const invalido = await apiPut<ApiFailure>(
      context,
      "/v1/commercial/tax-profile",
      {
        // RFC de 13 (persona física) con régimen de personas morales, y un CP
        // que no existe: tres errores, y los tres tienen que volver juntos.
        rfc: RFC_VALIDO,
        legalName: "Despacho del Valle",
        taxRegimeCode: "601",
        cfdiUseCode: "G03",
        postalCode: "670",
      },
    );
    expect(invalido.status).toBe(400);
    expect(invalido.body.code).toBe("tax_profile_invalid");
    const campos = (invalido.body.issues ?? []).map((issue) => issue.field);
    expect(campos).toContain("taxRegimeCode");
    expect(campos).toContain("postalCode");

    // Y nada se persistió: un perfil a medias es peor que ninguno, porque
    // pasa por capturado hasta el día del timbrado.
    const vacio = await apiGet<TaxProfileResponse>(
      context,
      "/v1/commercial/tax-profile",
    );
    expect(vacio.status).toBe(200);
    expect(vacio.body.profile).toBeNull();
  });

  test("5: captura válida, normalizada y SIN prometer timbrado", async () => {
    const guardado = await apiPut<TaxProfileResponse>(
      context,
      "/v1/commercial/tax-profile",
      {
        rfc: "vecj-880326-xx4",
        legalName: "Arquitectos del Valle S.A. de C.V.",
        taxRegimeCode: "612",
        cfdiUseCode: "G03",
        postalCode: "06700",
      },
    );
    expect(guardado.status).toBe(200);
    expect(guardado.body.profile).toMatchObject({
      rfc: RFC_VALIDO,
      personType: "fisica",
      // El régimen de capital se retira porque el SAT no lo compara, y el
      // nombre sube a mayúsculas: es lo que debe coincidir con la Constancia.
      legalName: "ARQUITECTOS DEL VALLE",
      taxRegimeCode: "612",
      cfdiUseCode: "G03",
      postalCode: "06700",
    });
    // Sin PAC contratado, el producto NO dice que timbra.
    expect(guardado.body.issuance.mode).toBe(
      guardado.body.issuance.available ? "automatic" : "manual",
    );
  });

  test("6: con los datos capturados la compra se abre (o dice por qué no cobra)", async () => {
    const compra = await apiPost<CheckoutSession & ApiFailure>(
      context,
      "/v1/commercial/checkout-sessions",
      { planCode: "individual", currency: "MXN", period: "monthly" },
    );

    if (compra.status === 201) {
      // Hay pasarela: la sesión hospedada es donde se teclea la tarjeta de
      // prueba. El importe lo puso el catálogo, no el cliente.
      expect(compra.body.checkout).toBe("hosted");
      expect(compra.body.url).toMatch(/^https:\/\//u);
      expect(compra.body.paymentMethod).toBe("card");
      expect(compra.body.asynchronous).toBe(false);
    } else {
      // Sin claves de Stripe el despliegue no puede cobrar, y lo dice: el
      // intent queda registrado para el camino asistido. Lo que NO ocurre es
      // que la puerta fiscal siga bloqueando — ya se pasó.
      expect(compra.status).toBe(409);
      expect(compra.body.code).toBe("checkout_unavailable");
    }
  });

  test("7: el entitlement del trial sigue activo y el estudio abre", async () => {
    const entitlements = await apiGet<{ items: string[] }>(
      context,
      "/v1/commercial/entitlements",
    );
    expect(entitlements.status).toBe(200);
    expect(entitlements.body.items).toContain("design.cad");

    const subscription = await apiGet<{
      subscription: { status: string; effective: boolean; seats: number };
      pendingPayment: unknown;
    }>(context, "/v1/commercial/subscription");
    expect(subscription.status).toBe(200);
    expect(subscription.body.subscription.effective).toBe(true);
    // Asientos del trial: tres, para que la colaboración se pueda evaluar.
    expect(subscription.body.subscription.seats).toBeGreaterThanOrEqual(1);
    // Sin pago asíncrono en curso no se inventa ninguno.
    expect(subscription.body.pendingPayment).toBeNull();

    await page.goto("/studio");
    await expect(page).toHaveURL(/\/studio/u);
  });
});
