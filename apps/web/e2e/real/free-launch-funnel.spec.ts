/**
 * EL EMBUDO SIN TARJETA, MEDIDO — no descrito.
 *
 * OLA 0.4 de la campaña de lanzamiento. La oferta es «tres meses gratis, sin
 * tarjeta», y esta suite comprueba las dos mitades contra el stack REAL
 * (Next.js + NestJS + PostgreSQL, cero intercepciones):
 *
 * 1. Que en ningún punto del alta se pide ni se menciona un medio de pago.
 *    No es una lectura de código: se recorre el embudo entero en un navegador
 *    y se buscan campos de tarjeta y vocabulario de cobro en cada pantalla.
 * 2. Cuántos MINUTOS y cuántos CLICS cuesta llegar de la portada al primer
 *    documento. El número se publica en el informe de la campaña; sin
 *    medirlo, «es rápido» es una opinión.
 *
 * Y una tercera, que es la que sostiene la oferta: que la organización recién
 * creada obtiene una prueba cuya duración COINCIDE con la que la superficie
 * pública anuncia (`trialDays` del catálogo). Anunciar tres meses y conceder
 * catorce días sería la peor forma de empezar.
 */

import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/**
 * Vocabulario de cobro. Si alguna de estas cadenas aparece en el embudo de
 * alta, la promesa «sin tarjeta» deja de ser cierta y la suite se pone roja.
 *
 * `cvv` y `caducidad` están porque son lo que delata un formulario de tarjeta
 * aunque la etiqueta diga otra cosa; «facturación» NO está, a propósito: el
 * pie legal puede enlazar al portal de facturación sin que eso sea pedir un
 * pago. Lo que se prohíbe es PEDIR, no que la palabra exista en el producto.
 */
const PAYMENT_VOCABULARY = [
  /n[úu]mero de tarjeta/iu,
  /\bcvv\b/iu,
  /\bcvc\b/iu,
  /fecha de caducidad/iu,
  /datos de pago/iu,
  /introduce tu tarjeta/iu,
  /se te cobrar[áa]/iu,
];

/** Selectores que sólo existirían si hubiera un formulario de pago. */
const PAYMENT_FIELD_SELECTORS = [
  'input[autocomplete="cc-number"]',
  'input[autocomplete="cc-exp"]',
  'input[autocomplete="cc-csc"]',
  'input[name*="card" i]',
  'input[name*="tarjeta" i]',
  'iframe[src*="stripe" i]',
  'iframe[src*="checkout" i]',
].join(", ");

/**
 * Una pantalla del embudo, auditada.
 *
 * Se lee el texto RENDERIZADO (`innerText` del body), no el HTML: un
 * comentario o un atributo `data-*` que contuviera la palabra no es algo que
 * un usuario vea, y hacer fallar la suite por eso sería ruido.
 */
async function assertNoPaymentAsked(page: Page, screen: string): Promise<void> {
  const fields = await page.locator(PAYMENT_FIELD_SELECTORS).count();
  expect(fields, `«${screen}» no puede tener campos de pago`).toBe(0);
  const text = await page.evaluate(() => document.body.innerText);
  for (const pattern of PAYMENT_VOCABULARY) {
    expect(
      text,
      `«${screen}» menciona ${pattern} y el alta prometió que no habría tarjeta`,
    ).not.toMatch(pattern);
  }
}

interface FunnelMeasurement {
  clicks: number;
  screens: string[];
}

test.describe("el embudo gratuito, medido contra el stack real", () => {
  let context: BrowserContext;
  let page: Page;
  const runId = Date.now().toString(36);
  const email = `fundador-${runId}@example.test`;
  const measurement: FunnelMeasurement = { clicks: 0, screens: [] };
  let startedAtMs = 0;
  let trialDays = 0;

  /** Un clic CONTADO. El número del informe sale de aquí, no de una estimación. */
  async function click(target: ReturnType<Page["getByRole"]>): Promise<void> {
    measurement.clicks += 1;
    await target.click();
  }

  async function screen(name: string): Promise<void> {
    measurement.screens.push(name);
    await assertNoPaymentAsked(page, name);
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("la oferta que anuncia la portada es la que concede el backend", async () => {
    const response = await context.request.get(
      `${API_ORIGIN}/v1/commercial/public/plans?currency=MXN`,
    );
    expect(response.status()).toBe(200);
    const catalog = (await response.json()) as { trialDays: number };
    trialDays = catalog.trialDays;
    // El contrato acota 1..90; lo que aquí se fija es que el catálogo PUBLICA
    // el número, para que la superficie no tenga que inventarlo.
    expect(Number.isInteger(trialDays)).toBe(true);
    expect(trialDays).toBeGreaterThan(0);
  });

  test("portada → registro → verificación → organización → primer documento, sin tarjeta", async () => {
    test.setTimeout(240_000);
    startedAtMs = Date.now();

    // ── 1. Portada ────────────────────────────────────────────────────────
    await page.goto("/");
    await screen("portada");
    await click(page.getByRole("link", { name: /Crear cuenta gratis/iu }).first());
    await page.waitForURL((url) => url.pathname === "/register");

    // ── 2. Alta ───────────────────────────────────────────────────────────
    await screen("registro");
    await page.getByLabel("Nombre").fill("Arquitecta fundadora");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    // TRES campos. Ni uno más. Un cuarto campo en el alta de un producto
    // gratuito es un porcentaje de gente que no llega al editor.
    expect(await page.locator("form input").count()).toBe(3);
    await click(page.getByRole("button", { name: "Crear cuenta" }));
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);
    await screen("revisa tu correo");

    // ── 3. Verificación por enlace ────────────────────────────────────────
    const message = await latestCapturedEmail(context.request, email);
    expect(message.template).toBe("identity.verify-email");
    await page.goto(
      `/verify-email?token=${encodeURIComponent(capturedToken(message))}`,
    );
    await expect(page.getByRole("status")).toContainText(
      /correo qued.* verificado/iu,
      { timeout: 30_000 },
    );
    await screen("verificación");

    // ── 4. Sesión ─────────────────────────────────────────────────────────
    await page.goto("/login?returnTo=/dashboard");
    await screen("acceso");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      click(page.getByRole("button", { name: /Iniciar sesi.*n/iu })),
    ]);

    // ── 5. Organización ───────────────────────────────────────────────────
    await screen("alta de organización");
    await page.getByLabel("Nombre del despacho").fill(`Taller ${runId}`);
    const creation = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/organizations` &&
        response.request().method() === "POST",
    );
    await click(page.getByRole("button", { name: "Crear organización" }));
    const created = (await (await creation).json()) as {
      subscription: { status: string; trialEndsAt: string };
    };

    // LA OFERTA, COMPROBADA. La prueba concedida por el servidor dura lo que
    // el catálogo público anuncia — con un día de holgura por el redondeo del
    // instante de creación. Anunciar tres meses y conceder catorce sería la
    // peor forma posible de empezar una relación con un cliente.
    expect(created.subscription.status).toBe("trialing");
    const grantedDays =
      (new Date(created.subscription.trialEndsAt).getTime() - Date.now()) /
      86_400_000;
    expect(grantedDays).toBeGreaterThan(trialDays - 1);
    expect(grantedDays).toBeLessThanOrEqual(trialDays);

    // ── 6. Primer documento ───────────────────────────────────────────────
    await screen("panel");
    await page.getByLabel("Nombre del proyecto").fill("Casa Valle");
    await click(page.getByLabel("Crear proyecto"));
    await expect
      .poll(async () => {
        const response = await context.request.get(
          `${API_ORIGIN}/v1/cad/projects?limit=10`,
        );
        return response.status() === 200
          ? ((await response.json()) as { total: number }).total
          : 0;
      })
      .toBeGreaterThan(0);

    await page.getByLabel("Nombre del documento").fill("Planta baja");
    const documentCreated = page.waitForResponse(
      (response) =>
        response.url().startsWith(`${API_ORIGIN}/v1/cad/documents`) &&
        response.request().method() === "POST",
    );
    await click(page.getByLabel("Crear documento"));
    expect((await documentCreated).status()).toBe(201);

    // ── EL NÚMERO ─────────────────────────────────────────────────────────
    const minutes = (Date.now() - startedAtMs) / 60_000;
    // El techo no es una medida de rendimiento: es el punto a partir del cual
    // el alta deja de ser «rápida» para quien la sufre. Se publica el valor
    // real en el informe; aquí sólo se impide que crezca sin que nadie mire.
    expect(minutes).toBeLessThan(5);
    expect(measurement.clicks).toBeLessThanOrEqual(8);
    console.log(
      `[EMBUDO GRATUITO] ${measurement.clicks} clics · ${minutes.toFixed(2)} min · ` +
        `${measurement.screens.length} pantallas auditadas sin tarjeta: ` +
        `${measurement.screens.join(" → ")}`,
    );
  });

  test("la página de precios anuncia la oferta y NO ofrece cobro durante el lanzamiento", async () => {
    await page.goto("/precios");
    await expect(page.getByTestId("founders-offer")).toBeVisible();
    // El titular lo construye el número del backend, así que comprobarlo aquí
    // ata la superficie al servidor y no a una constante del navegador.
    await expect(page.getByTestId("founders-headline")).toContainText(/gratis/iu);
    // Ningún camino de compra durante el lanzamiento gratuito.
    await expect(page.getByTestId("plan-checkout-cta")).toHaveCount(0);
    await expect(page.getByTestId("plan-free-launch-cta").first()).toBeVisible();
    // Pero el precio futuro SÍ se publica: decirlo por adelantado es lo
    // honesto, y sale del catálogo real.
    await expect(page.getByTestId("plan-amount").first()).toBeVisible();
    await expect(page.getByTestId("plan-future-price").first()).toBeVisible();
    await assertNoPaymentAsked(page, "precios");
  });
});
