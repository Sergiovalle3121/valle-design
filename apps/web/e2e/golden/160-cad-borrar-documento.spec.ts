/**
 * T-75(g): nadie podía borrar un plano desde la interfaz —
 * `documentsRepository.archive` (`DELETE /v1/cad/documents/:id`, borrado
 * suave) no tenía ningún llamador de producto. Este golden prueba el botón
 * nuevo del tablero: sólo aparece con `cad:admin`, pide confirmación
 * explícita, y al confirmar manda la petición real y quita la tarjeta.
 */
import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";

const DOCUMENT_ID = "30000000-0000-4000-8000-000000000001";

test("borrar un documento desde el tablero pide confirmación y lo quita de la lista", async ({
  context,
  page,
}) => {
  await loginAsStandaloneOwner(context);
  let archived = false;
  let archiveCalls = 0;

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

    if (url.pathname === "/v1/cad/projects" && method === "GET")
      return json({ items: [] });
    if (url.pathname === "/v1/cad/documents" && method === "GET")
      return json({
        items: archived
          ? []
          : [
              {
                id: DOCUMENT_ID,
                projectId: null,
                name: "Planta baja — casa Reforma",
                model: null,
                revision: null,
                cadDocumentVersion: 3,
              },
            ],
      });
    if (url.pathname === "/v1/cad/blocks" && method === "GET")
      return json({ items: [] });
    if (
      url.pathname === `/v1/cad/documents/${DOCUMENT_ID}` &&
      method === "DELETE"
    ) {
      archiveCalls += 1;
      archived = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return json({ message: "not found" }, 404);
  });

  await page.goto("/dashboard");
  await expect(page.getByText("Planta baja — casa Reforma")).toBeVisible();

  await page
    .getByRole("button", { name: "Borrar «Planta baja — casa Reforma»" })
    .click();

  // Fix-or-hide: el botón no borra al primer clic, pide confirmación.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("¿Borrar «Planta baja — casa Reforma»?"),
  ).toBeVisible();
  expect(archiveCalls).toBe(0);

  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(archiveCalls).toBe(0);
  await expect(page.getByText("Planta baja — casa Reforma")).toBeVisible();

  await page
    .getByRole("button", { name: "Borrar «Planta baja — casa Reforma»" })
    .click();
  await page.getByRole("button", { name: "Borrar", exact: true }).click();

  await expect.poll(() => archiveCalls).toBe(1);
  await expect(page.getByText("Planta baja — casa Reforma")).toBeHidden();
  await expect(
    page.getByText("Este espacio todavía no contiene documentos."),
  ).toBeVisible();
});
