import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";

/**
 * ARRASTRAR-Y-SOLTAR UN DXF — T-63f.
 *
 * Hasta esta ficha, las CUATRO únicas apariciones de `onDrop` en todo
 * `apps/web/src` eran el reordenado de viewports del estudio: no existía
 * arrastrar-y-soltar en ninguna otra parte del producto, ni en el estado
 * vacío ni en el tablero con documentos. `importDocumentFile` ya aceptaba lo
 * que hacía falta — sólo faltaba el `onDrop`.
 *
 * Este golden prueba las DOS superficies que sí son mías en este frente (el
 * lienzo del estudio es del monolito y va a petición aparte):
 *
 *   1. El estado vacío (`FirstMinute.tsx`, tarjeta "Importa un DXF").
 *   2. El tablero con documentos ya creados (`dashboard/page.tsx`, sección
 *      "Documentos").
 *
 * Playwright no puede arrastrar un archivo real del sistema operativo: la
 * técnica estándar es construir un `DataTransfer` con un `File` DENTRO del
 * navegador y disparar los eventos `dragover`/`drop` a mano — es
 * exactamente lo que un navegador real produce al soltar un archivo, sólo
 * que sin la parte del sistema operativo que Playwright no controla.
 */

const MINIMAL_DXF = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
30
0
11
100
21
100
31
0
0
ENDSEC
0
EOF
`;

async function dropFileOn(
  page: Page,
  testId: string,
  file: { name: string; mimeType: string; content: string },
) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, mimeType, content }) => {
      const dt = new DataTransfer();
      const bytes = new TextEncoder().encode(content);
      dt.items.add(new File([bytes], name, { type: mimeType }));
      return dt;
    },
    file,
  );
  const target = page.getByTestId(testId);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}

async function installCadDashboardBackend(context: BrowserContext) {
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
  let nextDocumentId = 1;

  await context.route("**/v1/cad/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/v1/cad/projects" && method === "GET") {
      return json({ items: projects });
    }
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
    if (url.pathname === "/v1/cad/documents" && method === "GET") {
      return json({ items: documents });
    }
    if (url.pathname === "/v1/cad/documents" && method === "POST") {
      const body = request.postDataJSON() as { name: string; projectId: string };
      const document = {
        id: `20000000-0000-4000-8000-00000000000${nextDocumentId++}`,
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
    if (url.pathname === "/v1/cad/blocks" && method === "GET") {
      return json({ items: [] });
    }
    const match = url.pathname.match(/^\/v1\/cad\/documents\/([^/]+)(\/content)?$/);
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

  return { projects, documents };
}

test("arrastrar un DXF sobre el estado vacío lo importa", async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadDashboardBackend(context);

  await page.goto("/dashboard");
  await page.getByLabel("Nombre del proyecto").fill("Despacho Norte");
  await page.getByLabel("Crear proyecto").click();

  // El proyecto recién creado no tiene documentos: sigue en estado vacío.
  await expect(page.getByTestId("dashboard-empty")).toBeVisible();
  await expect(page.getByTestId("first-minute-import-dropzone")).toBeVisible();

  await dropFileOn(page, "first-minute-import-dropzone", {
    name: "planta.dxf",
    mimeType: "application/dxf",
    content: MINIMAL_DXF,
  });

  await expect(page.getByText(/Importado: \d+ entidades/)).toBeVisible({
    timeout: 30_000,
  });
});

test("arrastrar un DXF sobre el tablero con documentos lo importa", async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const { documents } = await installCadDashboardBackend(context);

  await page.goto("/dashboard");
  await page.getByLabel("Nombre del proyecto").fill("Despacho Sur");
  await page.getByLabel("Crear proyecto").click();

  // Un primer documento (por el input de siempre) saca al tablero del
  // estado vacío y expone la zona de suelta del tablero.
  await page.getByLabel(/Importar como documento/).setInputFiles({
    name: "primero.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(MINIMAL_DXF),
  });
  await expect(page.getByText(/Importado: \d+ entidades/)).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => documents.length).toBe(1);

  await expect(page.getByTestId("dashboard-board-dropzone")).toBeVisible();
  await dropFileOn(page, "dashboard-board-dropzone", {
    name: "segundo.dxf",
    mimeType: "application/dxf",
    content: MINIMAL_DXF,
  });

  await expect.poll(() => documents.length).toBe(2);
});
