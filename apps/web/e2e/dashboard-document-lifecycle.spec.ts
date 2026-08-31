import { expect, test } from "@playwright/test";
import { API_ORIGIN } from "./fixtures/constants";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "./fixtures/standalone-identity";

test("crea proyecto y documentos con IDs propios, guarda CAS y reabre tras una nueva sesión", async ({
  context,
  page,
}) => {
  await loginAsStandaloneOwner(context);
  const projects: Array<{ id: string; name: string; status: string }> = [];
  const documents: Array<{
    id: string;
    projectId: string;
    name: string;
    model: null;
    revision: null;
    cadDocumentVersion: number;
    cadDocument: unknown;
  }> = [];
  let sequence = 0;

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
      return json({ items: projects });
    if (url.pathname === "/v1/cad/projects" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const project = {
        id: "10000000-0000-4000-8000-000000000001",
        name: body.name,
        status: "active",
      };
      projects.push(project);
      return json(project, 201);
    }
    if (url.pathname === "/v1/cad/documents" && method === "GET")
      return json({ items: documents });
    if (url.pathname === "/v1/cad/documents" && method === "POST") {
      const body = request.postDataJSON() as {
        name: string;
        projectId: string;
        model?: string;
        revision?: string;
      };
      expect(body.model).toBeUndefined();
      expect(body.revision).toBeUndefined();
      const document = {
        id: `20000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
        projectId: body.projectId,
        name: body.name,
        model: null,
        revision: null,
        cadDocumentVersion: 0,
        cadDocument: null,
      };
      documents.push(document);
      return json(document, 201);
    }
    if (url.pathname === "/v1/cad/blocks" && method === "GET")
      return json({ items: [] });
    const match = url.pathname.match(
      /^\/v1\/cad\/documents\/([^/]+)(\/content)?$/,
    );
    if (match && !match[2] && method === "GET") {
      const document = documents.find((item) => item.id === match[1]);
      return document ? json(document) : json({ message: "not found" }, 404);
    }
    if (match?.[2] && method === "PUT") {
      const document = documents.find((item) => item.id === match[1])!;
      const body = request.postDataJSON() as {
        expectedCadDocumentVersion: number;
        cadDocument: unknown;
      };
      expect(body.expectedCadDocumentVersion).toBe(document.cadDocumentVersion);
      document.cadDocument = body.cadDocument;
      document.cadDocumentVersion += 1;
      return json({ cadDocumentVersion: document.cadDocumentVersion });
    }
    return json({ message: "not found" }, 404);
  });

  await page.goto("/dashboard");
  await expect(page.getByText("Valle Design E2E")).toBeVisible();
  await page
    .getByLabel("Nombre del proyecto")
    .fill("Organización / Proyecto Alfa");
  await page.getByLabel("Crear proyecto").click();
  await page.getByLabel("Nombre del documento").fill("Plano A");
  await page.getByLabel("Crear documento").click();
  await expect(page).toHaveURL(
    /\/studio\/20000000-0000-4000-8000-000000000001$/,
  );
  await page.getByRole("button", { name: "Círculo", exact: true }).click();
  const dynamic = page.getByTestId("cad-dynamic-input");
  await page.getByTestId("cad-dynamic-field-x").fill("4000");
  await page.getByTestId("cad-dynamic-field-y").fill("3000");
  await dynamic.getByRole("button", { name: "Aplicar" }).click();
  await page.getByTestId("cad-dynamic-field-radius").fill("250");
  await dynamic.getByRole("button", { name: "Aplicar" }).click();
  await expect(
    page.getByRole("button", { name: "Guardar", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => documents[0]?.cadDocumentVersion).toBe(1);

  await page.goto("/dashboard");
  await page.getByLabel("Nombre del documento").fill("Plano B");
  await page.getByLabel("Crear documento").click();
  // Crear un documento navega al estudio del nuevo id. Hay que dejar que esa
  // navegación termine antes de pedir la siguiente: Firefox aborta la que está
  // en vuelo y `page.goto` falla con NS_BINDING_ABORTED.
  await page.waitForURL(/\/studio\/[0-9a-f-]{36}$/iu);
  expect(documents[0].id).not.toBe(documents[1].id);
  expect(
    documents.map(({ model, revision }) => [model, revision]),
  ).not.toContainEqual(["AXOS-CAD-STUDIO", "UNIVERSAL"]);

  await page.goto("/dashboard");
  // Hay que esperar a que el logout TERMINE antes de volver a autenticar: su
  // respuesta trae el `Set-Cookie` que borra la sesión, así que si llegaba
  // después de que el fixture hubiese puesto las cookies nuevas, las barría y
  // el estudio abría con "Tu sesión ha expirado". Era una carrera real del
  // harness (2 de cada 3 ejecuciones pasaban), no del producto.
  const loggedOut = page.waitForResponse(
    (response) =>
      response.url() === `${API_ORIGIN}/v1/auth/logout` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Cerrar sesión/ }).click();
  await loggedOut;
  await loginAsStandaloneOwner(context);
  await page.goto(`/studio/${documents[0].id}`);
  await expect(page).toHaveURL(new RegExp(`${documents[0].id}$`));
  await expect(
    page.getByRole("button", { name: "Guardar", exact: true }),
  ).toBeVisible();
});
