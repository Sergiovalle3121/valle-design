/**
 * FASE 6 — Aceptación comercial: TRES proyectos canónicos de punta a punta
 * contra la API real y PostgreSQL, con métricas PUBLICADAS.
 *
 * Lo que un piloto haría la primera semana, hecho verificable: (1) una
 * vivienda dibujada con el modelo nativo de muros —esquinas en L, empalmes en
 * T, vanos alojados— viaja por la API, se abre en Studio, sus muros son
 * sólidos 3D y su DXF sale por los dos caminos (navegador y servidor); (2) un
 * nivel tipo de despacho (mezcla `plano-real`, 8.000 entidades, el modelo
 * declarado de archivo mexicano del banco de pruebas) se importa por la
 * interfaz, se abre entero y se relee íntegro; (3) una oficina chica (mezcla
 * `architecture`, 2.000) completa el mismo viaje más la exportación DXF.
 *
 * MÉTRICAS: los tiempos de importación/apertura/exportación se PUBLICAN en un
 * artefacto JSON con el hardware al lado — nunca se gatean aquí: sobre
 * SwiftShader un umbral de milisegundos mediría la contención del runner, no
 * el producto (el mismo criterio de toda la campaña). Lo que SÍ bloquea es lo
 * funcional: recuentos exactos, versiones CAS, relecturas íntegras, sólidos
 * presentes, DXF con secciones reales.
 *
 * Los proyectos 2 y 3 corren SOLO en Chromium — el mismo criterio de carril
 * que el job `e2e-perf` (los flujos de importación/apertura son idénticos
 * entre motores y Firefox paga raster por software doble); la vivienda, que
 * es la aceptación arquitectónica, corre en los dos navegadores.
 *
 * Requiere `E2E_REAL_API=1`, la API real y PostgreSQL 16 (mismo carril que
 * `studio-real-api.spec.ts`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiPut,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";
import {
  OFICINA_ENTITY_COUNT,
  PLANO_REAL_ENTITY_COUNT,
  VIVIENDA_WALL_IDS,
  oficinaProject,
  planoRealProject,
  viviendaProject,
} from "../fixtures/acceptance-projects";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

interface AcceptanceMetric {
  project: string;
  entities: number;
  [phase: string]: string | number;
}

const metrics: AcceptanceMetric[] = [];

async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login?returnTo=/dashboard");
  await page.getByLabel(/Correo electr.*nico/iu).fill(email);
  await page.getByLabel(/Contrase.*a/iu).fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/dashboard"),
    page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
  ]);
}

async function skipGuidedTour(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Saltar" });
  if (await skip.count()) await skip.click();
}

function importStatus(page: Page, pattern: RegExp) {
  return page.getByRole("status").filter({ hasText: pattern });
}

async function openDocument(context: BrowserContext, documentId: string) {
  return apiGet<{
    cadDocumentVersion: number;
    cadDocument: { entities: Array<{ id: string; type: string }> } | null;
  }>(context, `/v1/cad/documents/${encodeURIComponent(documentId)}`);
}

/** Importa un documento canónico por la interfaz y devuelve su id real. */
async function importProject(
  page: Page,
  context: BrowserContext,
  name: string,
  document: unknown,
  entityCount: number,
): Promise<string> {
  await page.goto("/dashboard");
  await expect(page.getByLabel("Nombre del documento")).toBeVisible();
  await page.locator('input[type="file"][accept*=".dxf"][accept*=".json"]').setInputFiles({
    name: `${name}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document), "utf8"),
  });
  await expect(
    importStatus(page, new RegExp(`Importado: ${entityCount} entidades`, "u")),
  ).toBeVisible({ timeout: 180_000 });
  const found = await apiGet<{ items: Array<{ id: string; name: string }> }>(
    context,
    `/v1/cad/documents?q=${encodeURIComponent(name)}&limit=20`,
  );
  const item = found.body.items.find((candidate) => candidate.name === name);
  expect(item, `el documento importado «${name}» aparece en la lista real`).toBeTruthy();
  return item!.id;
}

/**
 * Exporta DXF desde el estudio abierto respetando el CONTRATO del preflight
 * (`exportDxf` en el editor): la PRIMERA pulsación sobre un documento con
 * pérdidas enseña el manifiesto y no descarga nada; si alguna pérdida
 * ELIMINA geometría (muros paramétricos), descargar exige además la
 * aceptación explícita de la casilla — y la SEGUNDA pulsación descarga. Un
 * documento sin pérdidas descarga a la primera. El proyecto de aceptación
 * recorre ese contrato como lo haría el piloto: mira el informe, acepta con
 * conocimiento, descarga. Bloquea por contenido; publica el tiempo.
 */
async function exportDxfFromStudio(page: Page): Promise<{ bytes: Buffer; elapsedMs: number }> {
  const startedAt = Date.now();
  await page.getByTitle(/Exportar a DXF/iu).click();
  const downloadButton = page.getByTestId("cad-dxf-download");
  await expect(downloadButton).toBeEnabled({ timeout: 60_000 });
  const manifest = page.getByTestId("cad-dxf-loss-manifest");
  const firstDownload = page
    .waitForEvent("download", { timeout: 120_000 })
    .catch(() => null);
  await downloadButton.click();
  let download = await Promise.race([
    firstDownload,
    manifest.waitFor({ state: "visible", timeout: 120_000 }).then(() => null),
  ]);
  if (!download) {
    // El manifiesto quedó a la vista. Con pérdida bloqueante, la aceptación;
    // con degradación sola, basta haberlo visto — en ambos casos la segunda
    // pulsación es la que descarga.
    if ((await manifest.getAttribute("data-blocking")) === "true")
      await page.getByTestId("cad-dxf-loss-accept").check();
    [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      downloadButton.click(),
    ]);
  }
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  const text = bytes.toString("utf8");
  expect(text).toMatch(/\bSECTION\b/u);
  expect(text).toMatch(/\bENTITIES\b/u);
  return { bytes, elapsedMs: Date.now() - startedAt };
}

test.describe("FASE 6 · aceptación comercial: tres proyectos canónicos", () => {
  let context: BrowserContext;
  let page: Page;
  let email: string;
  let runId: string;
  let browserLabel: string;
  let artifactDir: string;

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(120_000);
    browserLabel = browserName;
    artifactDir = path.resolve(
      testInfo.project.testDir,
      ".artifacts/cad-acceptance-projects",
    );
    runId = `${browserName}-acc-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.e2e.acceptance.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    if (metrics.length > 0) {
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(
          artifactDir,
          `${browserLabel}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        ),
        `${JSON.stringify(
          {
            $schema: "urn:valle-design:schema:cad-acceptance-projects-run:v1",
            browser: browserLabel,
            hardware: `${os.cpus()[0]?.model?.trim() ?? "CPU desconocida"} · ${os.cpus().length} hilos · SwiftShader (sin GPU real)`,
            metrics,
          },
          null,
          2,
        )}\n`,
      );
      for (const metric of metrics)
        console.log(`ACEPTACIÓN ${metric.project}: ${JSON.stringify(metric)}`);
    }
    await context?.close();
  });

  test("0: registro, verificación, organización y proyecto por el harness real", async () => {
    test.setTimeout(180_000);
    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Valle E2E Aceptación");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);

    const verification = await latestCapturedEmail(context.request, email);
    expect(verification.template).toBe("identity.verify-email");
    await page.goto(
      `/verify-email?token=${encodeURIComponent(capturedToken(verification))}`,
    );
    await expect(page.getByRole("status")).toContainText(/correo qued.* verificado/iu, {
      timeout: 30_000,
    });

    await loginThroughUi(page, email, E2E_PASSWORD);
    await page.getByLabel("Nombre del despacho").fill(`Aceptación ${runId}`);
    const creation = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/organizations` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Crear organización" }).click();
    expect(((await (await creation).json()) as { id: string }).id).toBeTruthy();

    await page.getByLabel("Nombre del proyecto").fill(`Pilotos ${runId}`);
    await page.getByLabel("Crear proyecto").click();
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
  });

  test("1: VIVIENDA — muros L/T nativos por la API real, sólidos en 3D y DXF por los dos caminos", async () => {
    test.setTimeout(300_000);
    const blankName = `Vivienda ${runId}`;
    await page.getByLabel("Nombre del documento").fill(blankName);
    await Promise.all([
      page.waitForURL(/\/studio\/[0-9a-f-]{36}$/iu),
      page.getByLabel("Crear documento").click(),
    ]);
    const documentId = new URL(page.url()).pathname.split("/").pop()!;

    const blank = await openDocument(context, documentId);
    expect(blank.status).toBe(200);
    const project = viviendaProject();
    const put = await apiPut<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      {
        cadDocument: project,
        expectedCadDocumentVersion: blank.body.cadDocumentVersion,
      },
    );
    expect(put.status, JSON.stringify(put.body)).toBe(200);

    const openStart = Date.now();
    await page.goto(`/studio/${documentId}`);
    await skipGuidedTour(page);
    await expect(page.getByTestId("cad-native-document-count")).toHaveText(
      `Native ${project.entities.length}`,
      { timeout: 120_000 },
    );
    const openMs = Date.now() - openStart;

    // Los seis muros —perímetro en L y particiones en T— son sólidos
    // nativos en 3D: el mismo modelo de uniones de la planta, extruido.
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.getByTestId("cad-render-pipeline")).toHaveAttribute(
      "data-settled",
      "true",
      { timeout: 60_000 },
    );
    for (const id of VIVIENDA_WALL_IDS)
      await expect(
        page.getByTestId(`cad-native-entity-${id}`),
        `muro ${id} como sólido nativo`,
      ).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "2D", exact: true }).click();
    const dxf = await exportDxfFromStudio(page);
    expect(dxf.bytes.length).toBeGreaterThan(2_000);

    const serverExport = await apiGet<{ dxf: string }>(
      context,
      `/v1/cad/documents/${documentId}/export/dxf`,
    );
    expect(serverExport.status).toBe(200);
    expect(serverExport.body.dxf).toMatch(/\bENTITIES\b/u);

    const reread = await openDocument(context, documentId);
    expect(reread.body.cadDocument?.entities).toHaveLength(project.entities.length);
    metrics.push({
      project: "vivienda",
      entities: project.entities.length,
      openMs,
      exportDxfMs: dxf.elapsedMs,
    });
  });

  test("2: PLANO REAL 8k — importa por la interfaz, abre entero y relee íntegro", async ({ browserName }) => {
    test.skip(
      browserName !== "chromium",
      "Escala sólo en Chromium — mismo criterio de carril que e2e-perf.",
    );
    test.setTimeout(420_000);
    const name = `plano-real-${runId}`;
    const importStart = Date.now();
    const documentId = await importProject(
      page,
      context,
      name,
      planoRealProject(),
      PLANO_REAL_ENTITY_COUNT,
    );
    const importMs = Date.now() - importStart;

    const openStart = Date.now();
    await page.goto(`/studio/${documentId}`);
    await skipGuidedTour(page);
    await expect(page.getByTestId("cad-native-document-count")).toHaveText(
      `Native ${PLANO_REAL_ENTITY_COUNT}`,
      { timeout: 300_000 },
    );
    const openMs = Date.now() - openStart;

    const reread = await openDocument(context, documentId);
    expect(reread.status).toBe(200);
    expect(reread.body.cadDocument?.entities).toHaveLength(PLANO_REAL_ENTITY_COUNT);
    metrics.push({
      project: "plano-real",
      entities: PLANO_REAL_ENTITY_COUNT,
      importMs,
      openMs,
    });
  });

  test("3: OFICINA 2k — importa, abre y exporta DXF; la relectura es íntegra", async ({ browserName }) => {
    test.skip(
      browserName !== "chromium",
      "Escala sólo en Chromium — mismo criterio de carril que e2e-perf.",
    );
    test.setTimeout(300_000);
    const name = `oficina-${runId}`;
    const importStart = Date.now();
    const documentId = await importProject(
      page,
      context,
      name,
      oficinaProject(),
      OFICINA_ENTITY_COUNT,
    );
    const importMs = Date.now() - importStart;

    const openStart = Date.now();
    await page.goto(`/studio/${documentId}`);
    await skipGuidedTour(page);
    await expect(page.getByTestId("cad-native-document-count")).toHaveText(
      `Native ${OFICINA_ENTITY_COUNT}`,
      { timeout: 180_000 },
    );
    const openMs = Date.now() - openStart;

    const dxf = await exportDxfFromStudio(page);
    expect(dxf.bytes.length).toBeGreaterThan(50_000);

    const reread = await openDocument(context, documentId);
    expect(reread.status).toBe(200);
    expect(reread.body.cadDocument?.entities).toHaveLength(OFICINA_ENTITY_COUNT);
    metrics.push({
      project: "oficina",
      entities: OFICINA_ENTITY_COUNT,
      importMs,
      openMs,
      exportDxfMs: dxf.elapsedMs,
    });
  });
});
