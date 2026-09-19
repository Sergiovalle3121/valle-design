/**
 * T1 — La casilla de Términos se puede pulsar haciendo clic en el cuadro visible.
 *
 * El cuadro visual de 20×20 debe estar dentro del <label> para que el clic
 * active el <input> real. Este spec hace clic en el cuadro, no en el texto.
 */
import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import { installMockBackend } from "../fixtures/mock-backend";

const DOCUMENTOS = {
  documents: [
    { documento: "terms", version: "2026-08-27", publicadoEn: "2026-08-27", url: "/terms", requiereAceptacion: true },
    { documento: "privacy", version: "2026-08-27.2", publicadoEn: "2026-08-27", url: "/privacy", requiereAceptacion: false },
  ],
};

test("hacer clic en el cuadro visible de la casilla de Términos habilita «Crear cuenta»", async ({ context, page }) => {
  test.setTimeout(60_000);
  await installMockBackend(context);
  await context.route(`${API_ORIGIN}/v1/legal/documents`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DOCUMENTOS) }),
  );
  await context.route(`${API_ORIGIN}/v1/auth/register`, (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.goto("/register");

  const casilla = page.getByTestId("register-accept-terms");
  const boton = page.getByRole("button", { name: "Crear cuenta" });
  await expect(boton).toBeVisible();

  await test.step("rellenar los campos obligatorios", async () => {
    await page.getByLabel("Nombre").fill("Arquitecta de prueba");
    await page.getByLabel("Correo electrónico").fill("arquitecta@despacho.mx");
    await page.locator('input[name="password"]').fill("una-contraseña-larga-2026");
    await expect(boton).toBeDisabled();
  });

  await test.step("hacer clic en el cuadro visible de la casilla", async () => {
    // El cuadro visible es el <span aria-hidden> hermano del <input> real.
    const cuadroVisible = casilla.locator("xpath=./following-sibling::span[@aria-hidden='true']");
    await cuadroVisible.click({ force: true });
    await expect(casilla).toBeChecked();
    await expect(boton).toBeEnabled();
  });
});
