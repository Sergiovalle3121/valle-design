/**
 * El checkout NO puede abrir un cobro sin que la organización haya aceptado
 * la versión VIGENTE de los términos de servicio.
 *
 * `apps/api/src/modules/legal/` ya versiona `terms`/`privacy` y registra la
 * aceptación server-owned; `apps/web/src/lib/legal/acceptance-gate.ts` ya
 * tiene la regla pura. Lo que faltaba — documentado en
 * `docs/legal/CHECKLIST_PENDIENTES_LEGALES.md` — era que
 * `CheckoutStarter.tsx` los conectara. Este spec demuestra el efecto en la
 * UI real, con la frontera de red hermética de `standalone-identity.ts`:
 * sin aceptación, `POST /v1/commercial/checkout-sessions` JAMÁS se dispara.
 */

import { expect, test } from "@playwright/test";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";

const CHECKOUT_URL =
  "/precios/checkout?plan=individual&periodo=monthly&moneda=MXN";

test.describe("puerta legal del checkout", () => {
  test("sin aceptar los términos, el checkout no llama a crear la sesión de pago", async ({
    page,
    context,
  }) => {
    await loginAsStandaloneOwner(context);

    const checkoutRequests: string[] = [];
    context.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/v1/commercial/checkout-sessions")
      ) {
        checkoutRequests.push(request.url());
      }
    });

    await page.goto(CHECKOUT_URL);

    // La puerta legal se pinta ANTES que cualquier pantalla de pago.
    await expect(
      page.getByRole("heading", {
        name: "Antes de continuar, acepta los términos",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("payment-methods")).toHaveCount(0);
    await expect(page.getByTestId("continue-to-payment")).toHaveCount(0);

    // Ni siquiera queda una llamada en vuelo: no hay forma de llegar al botón
    // de pago sin pasar por esta pantalla.
    expect(checkoutRequests).toHaveLength(0);
  });

  test("tras aceptar la versión vigente, el checkout se abre normalmente", async ({
    page,
    context,
  }) => {
    await loginAsStandaloneOwner(context);

    const acceptanceRequests: unknown[] = [];
    const checkoutRequests: string[] = [];
    context.on("request", (request) => {
      const url = request.url();
      if (
        request.method() === "POST" &&
        url.includes("/v1/legal/acceptances")
      ) {
        acceptanceRequests.push(request.postDataJSON());
      }
      if (
        request.method() === "POST" &&
        url.includes("/v1/commercial/checkout-sessions")
      ) {
        checkoutRequests.push(url);
      }
    });

    await page.goto(CHECKOUT_URL);
    await page.getByTestId("accept-legal-terms").click();

    // Ahora sí: la pantalla de medios de pago aparece, con la aceptación ya
    // registrada contra la versión EXACTA que el registro versionado publica.
    await expect(page.getByTestId("payment-methods")).toBeVisible();
    expect(acceptanceRequests).toEqual([
      { document: "terms", version: "2026-08-15" },
    ]);
    expect(checkoutRequests).toHaveLength(0);

    await page.getByTestId("continue-to-payment").click();
    await expect
      .poll(() => checkoutRequests.length, {
        message: "el checkout debe abrir la sesión de pago tras aceptar",
      })
      .toBeGreaterThan(0);
  });

  test("una visita nueva con la aceptación ya registrada salta la puerta directo al pago", async ({
    page,
    context,
  }) => {
    await loginAsStandaloneOwner(context);
    await page.goto(CHECKOUT_URL);
    await page.getByTestId("accept-legal-terms").click();
    await expect(page.getByTestId("payment-methods")).toBeVisible();

    // Recarga completa (visita nueva a la misma sesión): la aceptación ya
    // registrada no debe volver a pedirse.
    await page.reload();
    await expect(page.getByTestId("payment-methods")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Antes de continuar, acepta los términos",
      }),
    ).toHaveCount(0);
  });
});
