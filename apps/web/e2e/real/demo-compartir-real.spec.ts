/**
 * «LAS DOS», DE PUNTA A PUNTA Y SIN UN SOLO INTERCEPT.
 *
 * La promesa de «Compartir» desde la demostración tiene dos mitades y esta
 * prueba las recorre juntas contra la API real y PostgreSQL:
 *
 *  1. Sin cuenta: quien dibuja en /demo pulsa «Compartir» y el enlace abre su
 *     plano en un celular, en sólo lectura.
 *  2. Con cuenta: se registra desde el panel, verifica el correo, entra SIN
 *     `?demo=1` (el camino real: el enlace del correo abre otra pestaña y el
 *     `returnTo` se pierde), crea su despacho y su primer documento… y el
 *     documento nace de su dibujo y el MISMO enlace que ya mandó sigue
 *     abriendo, ahora como revisión con comentarios.
 *
 * Si cualquiera de las dos mitades se rompe, el visitante pierde su dibujo o
 * su cliente pierde el plano; por eso vive en e2e/real y no en los goldens.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import { E2E_PASSWORD, capturedToken, latestCapturedEmail } from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

const SHARE_STORAGE_KEY = "valle.demoShare.v1";

test.describe("Compartir desde la demostración, con la API real", () => {
  let context: BrowserContext;
  let page: Page;
  let shareUrl = "";
  let shareToken = "";
  let studioPath = "";
  const runId = Date.now().toString(36);
  const email = `demo-comparte-${runId}@example.test`;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  async function openOnPhone(url: string): Promise<Page> {
    const phone = await page.context().browser()!.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: "es-MX",
    });
    const guest = await phone.newPage();
    await guest.goto(url);
    return guest;
  }

  test("sin cuenta: el enlace de la demostración abre el plano en un celular", async () => {
    test.setTimeout(240_000);
    await page.goto("/demo");
    const input = page.getByTestId("cad-command-input");
    await expect(input).toBeVisible({ timeout: 90_000 });
    const skip = page.getByTestId("cad-guided-tour-skip");
    if (await skip.count()) await skip.click();
    for (const token of ["LINE", "0,0", "3000,0"]) {
      await input.click();
      await input.fill(token);
      await input.press("Enter");
    }
    await input.press("Enter");

    const created = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/cad/demo-shares` && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Compartir", exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(page.getByRole("button", { name: "Copiar enlace", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    shareUrl = (await page.getByTestId("cad-share-url").innerText()).trim();
    shareToken = decodeURIComponent(new URL(shareUrl).hash.replace(/^#cadReview=/u, ""));
    expect(shareToken).toMatch(/^vdds_/u);

    const guest = await openOnPhone(shareUrl);
    await expect(guest.getByTestId("cad-review-banner")).toHaveText("COPIA COMPARTIDA · SOLO LECTURA", {
      timeout: 60_000,
    });
    await expect(guest.locator('svg[aria-label*="lano"]').first()).toBeVisible();
    await expect(guest.getByTestId("cad-review-room-area").first()).toContainText("m²");
    expect(
      await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "el celular no desborda",
    ).toBe(true);
    await guest.context().close();
  });

  test("con cuenta: el primer documento nace del dibujo y el mismo enlace sigue abriendo", async () => {
    test.setTimeout(300_000);
    // Desde el panel de «Compartir», como lo haría el visitante.
    await page.getByTestId("cad-share-register").click();
    await page.waitForURL((url) => url.pathname === "/register");
    await page.getByLabel("Nombre").fill("Visitante de la demo");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await page.getByText(/^Acepto los/).click();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);

    const message = await latestCapturedEmail(context.request, email);
    await page.goto(`/verify-email?token=${encodeURIComponent(capturedToken(message))}`);
    await expect(page.getByRole("status")).toContainText(/correo qued.* verificado/iu, {
      timeout: 30_000,
    });

    // SIN `?demo=1`: el tablero tiene que reconocer el dibujo por sí mismo.
    await page.goto("/login?returnTo=/dashboard");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);
    await page.getByLabel("Nombre del despacho").fill(`Despacho ${runId}`);
    await page.getByRole("button", { name: "Crear organización" }).click();
    // El estado de la suscripción con las palabras del cliente, no «trialing».
    await expect(page.getByTestId("subscription-status")).toContainText(/En periodo de prueba hasta/u, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("subscription-status")).not.toContainText("trialing");

    await page.getByLabel("Nombre del proyecto").fill("Mi casa");
    await page.getByLabel("Crear proyecto").click();
    await expect(page.getByTestId("demo-adoption-note")).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Nombre del documento").fill("Planta baja");
    const documentCreated = page.waitForResponse(
      (response) =>
        response.url().startsWith(`${API_ORIGIN}/v1/cad/documents`) && response.request().method() === "POST",
    );
    const claimed = page.waitForResponse(
      (response) => /\/v1\/cad\/documents\/[^/]+\/demo-share-claims$/u.test(response.url()),
    );
    await page.getByLabel("Crear documento").click();
    const document = (await (await documentCreated).json()) as { id: string };
    expect((await claimed).status(), "el enlace temporal se reclama al crear el documento").toBe(201);
    await page.waitForURL((url) => url.pathname === `/studio/${document.id}`);
    studioPath = `/studio/${document.id}`;
    expect(await page.evaluate((key) => localStorage.getItem(key), SHARE_STORAGE_KEY)).toBeNull();

    // La copia temporal ya no existe; el MISMO token es ahora el de una revisión
    // del documento nuevo, que lleva el trazo que se hizo en la demostración.
    const demoContext = await context.request.get(`${API_ORIGIN}/v1/cad/demo-shares/context`, {
      headers: { "X-Demo-Share-Token": shareToken },
    });
    expect(demoContext.status()).toBe(401);
    const review = await context.request.get(`${API_ORIGIN}/v1/cad/review/context`, {
      headers: { "X-Review-Token": shareToken },
    });
    expect(review.status(), await review.text()).toBe(200);
    const reviewed = (await review.json()) as {
      document: { id: string; cadDocument: { entities: Array<{ type: string; start?: { x: number } }> } };
    };
    expect(reviewed.document.id).toBe(document.id);
    expect(
      reviewed.document.cadDocument.entities.some((entity) => entity.type === "line"),
      "el documento nació del dibujo de la demostración, con su línea",
    ).toBe(true);

    const guest = await openOnPhone(shareUrl);
    await expect(guest.getByTestId("cad-review-banner")).toHaveText("REVISIÓN · SOLO LECTURA", {
      timeout: 60_000,
    });
    await expect(guest.getByTestId("cad-demo-share-aside")).toHaveCount(0);
    await guest.context().close();
  });

  test("al volver a entrar directo a su plano, el estudio abre", async () => {
    test.setTimeout(240_000);
    // Un marcador, o el `returnTo` de una sesión caducada: se entra por el
    // plano, no por el tablero. Antes la sesión nueva nacía sin despacho y el
    // estudio decía «No tienes permiso suficiente para abrir este documento».
    expect(studioPath).not.toBe("");
    await context.clearCookies();
    await page.goto(`/login?returnTo=${encodeURIComponent(studioPath)}`);
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === studioPath),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);
    await expect(page.getByTestId("cad-command-input")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/No tienes permiso/iu)).toHaveCount(0);
  });
});
