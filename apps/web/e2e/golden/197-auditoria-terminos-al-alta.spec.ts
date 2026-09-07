/**
 * AUDITORÍA — ACEPTAR LOS TÉRMINOS AL CREAR LA CUENTA (T-63d, petición F8-1).
 *
 * El API versiona `terms` y `privacy` y registra aceptaciones server-owned,
 * y el checkout ya las pide; pero el formulario de ALTA no mostraba ni pedía
 * nada: la cuenta nacía sin que nadie viera un término. Aquí se afirma la
 * parte 1 de la petición: la casilla nombra la versión vigente que sirve
 * `GET /v1/legal/documents`, enlaza a los dos textos, el botón «Crear
 * cuenta» está deshabilitado hasta marcarla, y sólo entonces viaja el alta.
 * (La parte 2 —que el servidor exija y registre la aceptación al
 * registrarse— es del frente F8, en su rama.)
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

test("la cuenta no se crea sin aceptar la versión vigente de los términos", async ({ context, page }) => {
  test.setTimeout(90_000);
  await installMockBackend(context);
  const altas: Array<Record<string, unknown>> = [];
  await context.route(`${API_ORIGIN}/v1/legal/documents`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DOCUMENTOS) }),
  );
  await context.route(`${API_ORIGIN}/v1/auth/register`, (route) => {
    altas.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/register");
  const boton = page.getByRole("button", { name: "Crear cuenta" });
  await expect(boton).toBeVisible();

  await test.step("la casilla nombra la versión vigente y enlaza a los dos textos", async () => {
    const casilla = page.getByLabel(/^Acepto los Términos de Servicio/);
    await expect(casilla).not.toBeChecked();
    await expect(page.getByText("versión 2026-08-27)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Términos de Servicio" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Aviso de Privacidad" })).toHaveAttribute("href", "/privacy");
  });

  await test.step("sin marcarla, «Crear cuenta» está deshabilitado y nada viaja", async () => {
    await page.getByLabel("Nombre").fill("Arquitecta de prueba");
    await page.getByLabel("Correo electrónico").fill("arquitecta@despacho.mx");
    // `PasswordField` lleva el botón de mostrar/ocultar dentro de la etiqueta: se localiza por nombre.
    await page.locator('input[name="password"]').fill("una-contraseña-larga-2026");
    await expect(boton).toBeDisabled();
    expect(altas).toEqual([]);
  });

  await test.step("marcada, el alta viaja", async () => {
    await page.getByText(/^Acepto los/).click();
    await expect(page.getByLabel(/^Acepto los Términos de Servicio/)).toBeChecked();
    await expect(boton).toBeEnabled();
    await boton.click();
    await expect.poll(() => altas.length, { message: "el alta viaja con la casilla marcada" }).toBe(1);
    expect(altas[0]).toMatchObject({ email: "arquitecta@despacho.mx", displayName: "Arquitecta de prueba" });
  });
});
