/**
 * T-75(b): abrir un plano y que el servidor falle no ofrecía ni reintentar
 * ni el borrador local — sólo un enlace de vuelta al tablero, es decir,
 * abandonar. Este golden prueba las dos salidas nuevas de la pantalla de
 * error de `app/studio/[documentId]/page.tsx`: "Reintentar" vuelve a pedir
 * el documento sin recargar la página, y la acción de recuperación no
 * promete un borrador que no existe cuando no lo hay (fix-or-hide).
 */
import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";

const DOCUMENT_ID = "40000000-0000-4000-8000-000000000001";

test("un plano que no carga ofrece reintentar, y reintentar sí vuelve a pedirlo", async ({
  context,
  page,
}) => {
  await loginAsStandaloneOwner(context);
  let openAttempts = 0;

  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);

    if (url.pathname === "/v1/cad/blocks" && method === "GET")
      return json({ items: [] });
    if (url.pathname === `/v1/cad/documents/${DOCUMENT_ID}` && method === "GET") {
      openAttempts += 1;
      if (openAttempts === 1) return json({ message: "boom" }, 500);
      return json({
        id: DOCUMENT_ID,
        name: "Planta recuperada",
        projectId: null,
        model: null,
        revision: null,
        cadDocumentVersion: 0,
        cadDocument: null,
      });
    }
    return json({ message: "not found" }, 404);
  });

  await page.goto(`/studio/${DOCUMENT_ID}`);

  const alerta = page.locator('p[role="alert"]');
  await expect(alerta).toHaveText("No pudimos cargar el documento.");
  const reintentar = page.getByRole("button", { name: "Reintentar" });
  await expect(reintentar).toBeVisible();

  // Fix-or-hide: sin ningún borrador local guardado, la acción de
  // recuperación lo DICE en vez de ofrecer un botón que fallaría siempre.
  await page.getByRole("button", { name: /último punto de recuperación/i }).click();
  await expect(
    page.getByText("No hay ningún punto de recuperación guardado para este documento en este equipo."),
  ).toBeVisible();

  expect(openAttempts).toBe(1);
  await reintentar.click();
  await expect.poll(() => openAttempts).toBe(2);
  await expect(alerta).toBeHidden();
});
