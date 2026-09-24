import { expect, test, type BrowserContext } from "@playwright/test";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { API_ORIGIN } from "../fixtures/constants";
import { firstPartyRequestFailure, loginAsStandaloneOwner } from "../fixtures/standalone-identity";

const choices = [
  { id: "house", name: "Casa habitación", title: "Casa habitación" },
  { id: "apartment", name: "Departamento", title: "Departamento" },
  { id: "shop", name: "Local comercial", title: "Local comercial" },
  { id: "blank", name: "En blanco", title: null },
] as const;

async function installEmptyAccount(context: BrowserContext) {
  await loginAsStandaloneOwner(context);
  const projects: Array<{ id: string; name: string; status: string }> = [];
  const documents: Array<{ id: string; projectId: string; name: string }> = [];
  const writes: Array<{ expectedCadDocumentVersion: number; cadDocument: CadDocument }> = [];
  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (path === "/v1/cad/projects" && method === "GET") return json({ items: projects });
    if (path === "/v1/cad/projects" && method === "POST") {
      const project = {
        id: "10000000-0000-4000-8000-000000000001",
        name: (request.postDataJSON() as { name: string }).name,
        status: "active",
      };
      projects.push(project);
      return json(project, 201);
    }
    if (path === "/v1/cad/documents" && method === "GET") return json({ items: documents });
    if (path === "/v1/cad/documents" && method === "POST") {
      const body = request.postDataJSON() as { projectId: string; name: string };
      const document = {
        id: "20000000-0000-4000-8000-000000000001",
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
    if (path === "/v1/cad/documents/20000000-0000-4000-8000-000000000001/content" && method === "PUT") {
      writes.push(request.postDataJSON() as { expectedCadDocumentVersion: number; cadDocument: CadDocument });
      return json({ cadDocumentVersion: 1 });
    }
    if (path === "/v1/cad/blocks" && method === "GET") return json({ items: [] });
    return route.fallback();
  });
  return { projects, documents, writes };
}

for (const choice of choices) {
  test(`una cuenta nueva elige ${choice.name} y abre un documento guardado`, async ({ context, page }) => {
    test.setTimeout(120_000);
    const { projects, documents, writes } = await installEmptyAccount(context);

    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-empty")).toBeVisible();
    for (const visibleChoice of choices) {
      await expect(page.getByTestId(`first-drawing-${visibleChoice.id}`)).toBeVisible();
    }
    await page.getByTestId(`first-drawing-${choice.id}`).click();
    await expect(page).toHaveURL(/\/studio\/20000000-0000-4000-8000-000000000001$/, { timeout: 90_000 });

    expect(projects).toHaveLength(1);
    expect(documents).toHaveLength(1);
    expect(documents[0].projectId).toBe(projects[0].id);
    expect(documents[0].name).toBe(choice.name === "En blanco" ? "Plano en blanco" : choice.name);
    if (choice.title === null) {
      expect(writes).toHaveLength(0);
    } else {
      expect(writes).toHaveLength(1);
      expect(writes[0].expectedCadDocumentVersion).toBe(0);
      expect(writes[0].cadDocument.entities.length).toBeGreaterThan(5);
      const text = writes[0].cadDocument.entities
        .filter((entity) => entity.type === "text")
        .map((entity) => entity.text)
        .join(" ");
      expect(text).toContain(choice.title);
    }
  });
}

test("una plantilla elegida desde la cuenta vacía crea el proyecto y guarda el cajetín", async ({ context, page }) => {
  test.setTimeout(120_000);
  const { projects, documents, writes } = await installEmptyAccount(context);
  await page.goto("/dashboard");
  await page.getByTestId("first-drawing-more").locator("summary").click();
  await page.getByTestId("first-minute-blank").click();
  await expect(page.getByLabel("Nombre del documento")).toBeFocused();
  await page.getByTestId("starter-template").selectOption("planta-arquitectonica");
  await page.getByLabel("Nombre del documento").fill("Planta baja");
  await page.getByLabel("Crear documento").click();
  await expect(page).toHaveURL(/\/studio\/20000000-0000-4000-8000-000000000001$/, { timeout: 90_000 });

  expect(projects.map((project) => project.name)).toEqual(["Mis planos"]);
  expect(documents.map((document) => document.name)).toEqual(["Planta baja"]);
  expect(documents[0].projectId).toBe(projects[0].id);
  expect(writes).toHaveLength(1);
  expect(writes[0].expectedCadDocumentVersion).toBe(0);
  expect(writes[0].cadDocument.layers.some((layer) => layer.id === "MURO")).toBe(true);
  expect(writes[0].cadDocument.styles.dimension["COTA 1:50"]).toBeTruthy();
  expect(writes[0].cadDocument.paperSpaces.length).toBeGreaterThan(0);
});

test("la llegada desde la galería conserva su plantilla y no ofrece otro arranque", async ({ context, page }) => {
  test.setTimeout(120_000);
  const { projects, documents, writes } = await installEmptyAccount(context);
  await page.goto("/dashboard?plantilla=departamento");
  await expect(page.getByTestId("dashboard-empty")).toBeVisible();
  await expect(page.getByTestId("first-drawing-house")).toHaveCount(0);
  await expect(page.getByTestId("gallery-start-note")).toContainText("Departamento");
  await page.getByLabel("Nombre del documento").fill("Mi departamento");
  await page.getByLabel("Crear documento").click();
  await expect(page).toHaveURL(/\/studio\/20000000-0000-4000-8000-000000000001$/, { timeout: 90_000 });

  expect(projects.map((project) => project.name)).toEqual(["Mis planos"]);
  expect(documents.map((document) => document.name)).toEqual(["Mi departamento"]);
  expect(writes).toHaveLength(1);
  expect(writes[0].expectedCadDocumentVersion).toBe(0);
  const text = writes[0].cadDocument.entities
    .filter((entity) => entity.type === "text")
    .map((entity) => entity.text)
    .join(" ");
  expect(text).toContain("Departamento");
  expect(text).not.toContain("Local comercial");
});
