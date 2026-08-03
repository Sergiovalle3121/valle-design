import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "./fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneViewer,
} from "./fixtures/standalone-identity";

const PROJECT_ID = "10000000-0000-4000-8000-000000000091";
const DOCUMENT_ID = "20000000-0000-4000-8000-000000000091";

test("viewer navega dashboard y estudio sin controles ni escrituras CAD", async ({
  context,
  page,
}) => {
  await loginAsStandaloneViewer(context);
  let mutationRequests = 0;

  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      mutationRequests += 1;
      return json({ code: "permission_denied" }, 403);
    }
    if (url.pathname === "/v1/cad/projects")
      return json({
        items: [{ id: PROJECT_ID, name: "Proyecto visible", status: "active" }],
      });
    if (url.pathname === "/v1/cad/documents")
      return json({
        items: [
          {
            id: DOCUMENT_ID,
            projectId: PROJECT_ID,
            name: "Plano de consulta",
            model: null,
            revision: null,
            cadDocumentVersion: 0,
          },
        ],
      });
    if (url.pathname === `/v1/cad/documents/${DOCUMENT_ID}`)
      return json({
        id: DOCUMENT_ID,
        projectId: PROJECT_ID,
        name: "Plano de consulta",
        model: null,
        revision: null,
        cadDocumentVersion: 0,
        cadDocument: null,
      });
    if (url.pathname === "/v1/cad/blocks") return json({ items: [] });
    return json({ message: "not found" }, 404);
  });

  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-read-only")).toBeVisible();
  await expect(page.getByLabel("Crear proyecto")).toHaveCount(0);
  await expect(page.getByLabel("Crear documento")).toHaveCount(0);
  await expect(
    page.getByText("Importar como documento", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Plano de consulta" }).click();

  await expect(page).toHaveURL(new RegExp(`${DOCUMENT_ID}$`));
  await expect(page.getByTestId("cad-readonly-banner")).toContainText(
    "VIEWER · SOLO LECTURA",
  );
  await expect(
    page.getByRole("button", { name: "Guardar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Circle", exact: true }),
  ).toBeDisabled();

  await page.keyboard.press("Control+s");
  await page.waitForTimeout(2_200);
  expect(mutationRequests).toBe(0);
});
