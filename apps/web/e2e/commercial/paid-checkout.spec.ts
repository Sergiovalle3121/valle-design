/**
 * Golden del modo comercial. CI compila la web con
 * NEXT_PUBLIC_LAUNCH_MODE=commercial para que el navegador recorra la ruta
 * positiva de pago; catálogo, sesión y destino del proveedor son simulados.
 * Ningún cobro sale de este arnés.
 */
import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { LEGAL_PAGE_VERSIONS } from "../../src/lib/legal/legal-versions";

const CHECKOUT_URL =
  "/precios/checkout?plan=individual&periodo=monthly&moneda=MXN";
const PROVIDER_URL = "https://checkout.example.test/session/mock";

test("el propietario acepta términos, ve el precio del plan elegido y llega al proveedor simulado", async ({
  page,
  context,
}) => {
  await loginAsStandaloneOwner(context);

  const catalogRequests: string[] = [];
  await context.route(
    `${API_ORIGIN}/v1/commercial/public/plans?currency=MXN`,
    async (route) => {
      const request = route.request();
      catalogRequests.push(request.url());
      expect(request.method()).toBe("GET");
      expect(request.headers().cookie).toBeUndefined();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          checkout: "hosted",
          trialDays: 90,
          cfdi: "manual",
          items: [
            {
              code: "despacho",
              name: "Despacho",
              kind: "paid",
              perSeat: true,
              seatsMinimum: 3,
              taxIncluded: false,
              prices: [
                { currency: "MXN", period: "monthly", amountCents: 16900 },
              ],
            },
            {
              code: "individual",
              name: "Individual",
              kind: "paid",
              perSeat: false,
              seatsMinimum: 1,
              taxIncluded: true,
              prices: [
                { currency: "MXN", period: "monthly", amountCents: 19900 },
              ],
            },
          ],
        }),
      });
    },
  );

  let providerVisits = 0;
  await context.route(PROVIDER_URL, async (route) => {
    providerVisits += 1;
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html lang=es><title>Proveedor simulado</title><h1>Proveedor de pago simulado</h1></html>",
    });
  });

  const acceptanceRequests: unknown[] = [];
  const checkoutRequests: unknown[] = [];
  context.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url().includes("/v1/legal/acceptances")) {
      acceptanceRequests.push(request.postDataJSON());
    }
    if (request.url().includes("/v1/commercial/checkout-sessions")) {
      checkoutRequests.push(request.postDataJSON());
    }
  });

  await page.goto(CHECKOUT_URL);
  await expect(
    page.getByRole("heading", {
      name: "Antes de continuar, acepta los términos",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("payment-methods")).toHaveCount(0);
  expect(checkoutRequests).toHaveLength(0);

  await page.getByTestId("accept-legal-terms").click();
  await expect(page.getByTestId("payment-methods")).toBeVisible();
  await expect(page.getByTestId("checkout-quote")).toContainText("$199.00 MXN");
  await expect(page.getByTestId("checkout-quote")).toContainText(
    "IVA incluido",
  );
  await expect(page.getByTestId("checkout-quote")).not.toContainText("$507.00");
  expect(acceptanceRequests).toEqual([
    { document: "terms", version: LEGAL_PAGE_VERSIONS.terms.version },
  ]);
  expect(checkoutRequests).toHaveLength(0);

  // Una visita nueva conserva la aceptación y todavía no abre una compra.
  await page.reload();
  await expect(page.getByTestId("payment-methods")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Antes de continuar, acepta los términos",
    }),
  ).toHaveCount(0);
  expect(checkoutRequests).toHaveLength(0);

  await page.getByTestId("continue-to-payment").click();
  await expect(page).toHaveURL(PROVIDER_URL);
  await expect(
    page.getByRole("heading", {
      name: "Proveedor de pago simulado",
    }),
  ).toBeVisible();
  expect(checkoutRequests).toEqual([
    {
      planCode: "individual",
      currency: "MXN",
      period: "monthly",
      paymentMethod: "card",
    },
  ]);
  expect(providerVisits).toBe(1);
  expect(catalogRequests.length).toBeGreaterThanOrEqual(1);
});
