/**
 * Release evidence for the standalone product.
 *
 * This journey deliberately keeps one browser context alive across the serial
 * tests. It talks to the real Nest API and PostgreSQL only: there are no route
 * interceptors, forged JWTs, bearer headers, or localStorage sessions.
 */

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiLogin,
  apiPost,
  apiPut,
  capturedToken,
  csrfHeaders,
  latestCapturedEmail,
} from "../fixtures/first-party";
import {
  canonicalDocument,
  largeCanonicalDocument,
} from "../fixtures/real-canonical-documents";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

const RESET_PASSWORD = "Valle-E2E-password-reset-2026!";
const LEGACY_MODEL = "AXOS-CAD-STUDIO";
const LEGACY_REVISION = "UNIVERSAL";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface OrganizationCreated {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
  subscription: {
    planCode: string;
    status: string;
    trialEndsAt: string;
  };
}

interface CadProject {
  id: string;
  name: string;
}

interface CadEntity {
  id: string;
  type: string;
  radius?: number;
}

interface CadDocumentSummary {
  id: string;
  projectId: string | null;
  name: string;
  model: string | null;
  revision: string | null;
  cadDocumentVersion: number;
}

interface OpenCadDocument extends CadDocumentSummary {
  cadDocument: {
    entities: CadEntity[];
    _storage?: unknown;
  } | null;
}

interface CadSaveReceipt {
  cadDocumentId: string;
  cadDocumentVersion: number;
  entityCount: number;
  storedAsBlobPointer: boolean;
}

interface PageResult<T> {
  items: T[];
  total: number;
}

async function loginThroughUi(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login?returnTo=/dashboard");
  await page.getByLabel(/Correo electr.*nico/iu).fill(email);
  await page.getByLabel(/^Contrase/iu).fill(password);
  await Promise.all([
    // NO usar /\/dashboard$/: la propia URL de partida es
    // `/login?returnTo=/dashboard`, que TERMINA en "/dashboard", así que la
    // espera se cumplía al instante y el helper regresaba antes de que el
    // login hubiese ocurrido. El destino se identifica por su pathname.
    page.waitForURL((url) => url.pathname === "/dashboard"),
    page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
  ]);
}

async function activateOrganization(
  context: BrowserContext,
  organizationId: string,
): Promise<void> {
  const activated = await apiPost<{
    organization: { id: string };
    tenantId: string;
    permissions: string[];
  }>(context, "/v1/organizations/active", { organizationId });
  expect([200, 201]).toContain(activated.status);
  expect(activated.body.organization.id).toBe(organizationId);
  expect(activated.body.tenantId).toBe(organizationId);
  expect(activated.body.permissions).toEqual(
    expect.arrayContaining(["cad:view", "cad:edit"]),
  );
}

/** La importación publica DOS «status»; el modo estricto exige acotar. */
function importStatus(target: Page, pattern: RegExp) {
  return target.getByRole("status").filter({ hasText: pattern });
}

async function openDocument(
  context: BrowserContext,
  documentId: string,
): Promise<{ status: number; body: OpenCadDocument }> {
  return apiGet<OpenCadDocument>(
    context,
    `/v1/cad/documents/${encodeURIComponent(documentId)}`,
  );
}

async function capturedMessage(
  context: BrowserContext,
  recipient: string,
  template: string,
) {
  const message = await latestCapturedEmail(context.request, recipient);
  expect(message.template).toBe(template);
  return message;
}

async function streamBuffer(
  stream: NodeJS.ReadableStream | null,
): Promise<Buffer> {
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

test.describe("recorrido comercial CAD first-party contra PostgreSQL", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let secondaryContext: BrowserContext | null = null;
  let isolatedContext: BrowserContext | null = null;
  let email: string;
  let runId: string;
  let organizationId: string;
  let organizationName: string;
  let projectId: string;
  let createdDocumentId: string;
  let importedDocumentId: string;
  let savedVersion = 0;
  const browserAuthorizationHeaders: string[] = [];

  test.beforeAll(async ({ browser: projectBrowser, browserName }, testInfo) => {
    testInfo.setTimeout(120_000);
    browser = projectBrowser;
    runId = `${browserName}-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.e2e.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });
    context.on("request", (request) => {
      if (
        new URL(request.url()).origin === new URL(API_ORIGIN).origin &&
        request.headers().authorization
      ) {
        browserAuthorizationHeaders.push(request.headers().authorization);
      }
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await isolatedContext?.close();
    await secondaryContext?.close();
    await context?.close();
  });

  test("1-4: registra y verifica por el harness seguro, inicia sesion y crea una organizacion con trial", async () => {
    test.setTimeout(180_000);

    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Valle E2E Owner");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);

    const verification = await capturedMessage(
      context,
      email,
      "identity.verify-email",
    );
    const verificationToken = capturedToken(verification);

    await page.goto(
      `/verify-email?token=${encodeURIComponent(verificationToken)}`,
    );
    // La verificación se envía sola al montar con un token válido en la URL:
    // ya no hay un campo "Token" visible ni un botón que pulsar — verificado
    // empíricamente contra el servidor real. Ver
    // e2e/real/dwg-import-real.spec.ts, hallado con el mismo patrón.
    await expect(page.getByRole("status")).toContainText(
      /correo qued.* verificado/iu,
      { timeout: 30_000 },
    );

    await loginThroughUi(page, email, E2E_PASSWORD);
    await expect
      .poll(async () =>
        (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status(),
      )
      .toBe(200);
    expect(
      await page.evaluate(() => localStorage.getItem("axos_access_token")),
    ).toBeNull();

    organizationName = `Valle E2E ${runId}`;
    // El slug se genera solo a partir del nombre en la UI actual (verificado
    // empíricamente: ya no hay campo de slug separado ni el selector de dos
    // tarjetas trae un encabezado "Elige tu organización"). Mismo patrón que
    // e2e/real/dwg-import-real.spec.ts.
    await page.getByLabel("Nombre del despacho").fill(organizationName);
    const creation = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/organizations` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Crear organización" }).click();
    const creationResponse = await creation;
    expect(creationResponse.status()).toBe(201);
    const created = (await creationResponse.json()) as OrganizationCreated;
    expect(created.tenantId).toBe(created.id);
    expect(created.subscription.status).toBe("trialing");
    expect(new Date(created.subscription.trialEndsAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    organizationId = created.id;

    const commercial = await apiGet<{
      organizationId: string;
      subscription: { status: string; effective: boolean };
    }>(context, "/v1/commercial/subscription");
    expect(commercial.status).toBe(200);
    expect(commercial.body).toMatchObject({
      organizationId,
      subscription: { status: "trialing", effective: true },
    });

    const entitlement = await apiGet<{
      organizationId: string;
      items: string[];
    }>(context, "/v1/commercial/entitlements");
    expect(entitlement.status).toBe(200);
    expect(entitlement.body.items).toContain("design.cad");

    await expect(
      page.getByRole("heading", { name: organizationName }),
    ).toBeVisible();
  });

  test("5-12: crea proyecto/documento, importa JSON real, abre por UUID, edita, guarda CAS, obtiene 409 y lee la version", async () => {
    test.setTimeout(300_000);
    const projectName = `Proyecto real ${runId}`;

    await page.getByLabel("Nombre del proyecto").fill(projectName);
    await page.getByLabel("Crear proyecto").click();
    await expect
      .poll(async () => {
        const response = await apiGet<PageResult<CadProject>>(
          context,
          `/v1/cad/projects?q=${encodeURIComponent(projectName)}&limit=20`,
        );
        return response.body.items.filter((item) => item.name === projectName);
      })
      .toHaveLength(1);
    const projectPage = await apiGet<PageResult<CadProject>>(
      context,
      `/v1/cad/projects?q=${encodeURIComponent(projectName)}&limit=20`,
    );
    projectId = projectPage.body.items.find((item) => item.name === projectName)!.id;
    // `exact` es obligatorio: el nombre del proyecto de esta ejecución empieza
    // por "Proyecto", así que la coincidencia por subcadena alcanzaba también a
    // las opciones del propio combobox (violación de strict mode).
    await expect(page.getByLabel("Proyecto", { exact: true })).toHaveValue(projectId);

    const blankName = `Documento nuevo ${runId}`;
    await page.getByLabel("Nombre del documento").fill(blankName);
    await Promise.all([
      page.waitForURL(/\/studio\/[0-9a-f-]{36}$/iu),
      page.getByLabel("Crear documento").click(),
    ]);
    createdDocumentId = new URL(page.url()).pathname.split("/").pop()!;
    expect(createdDocumentId).toMatch(UUID_PATTERN);
    const blank = await openDocument(context, createdDocumentId);
    expect(blank.status).toBe(200);
    expect(blank.body).toMatchObject({
      projectId,
      model: null,
      revision: null,
    });

    await page.goto("/dashboard");
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
    const importName = `canonical-${runId}`;
    // accept por CONTENencia: la lista crece con los formatos (shapefile 22-08).
    await page.locator('input[type="file"][accept*=".dxf"][accept*=".json"]').setInputFiles({
      name: `${importName}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(canonicalDocument()), "utf8"),
    });
    await expect(importStatus(page, /Importado: 1 entidades/iu)).toBeVisible({
      timeout: 90_000,
    });

    const importedPage = await apiGet<PageResult<CadDocumentSummary>>(
      context,
      `/v1/cad/documents?q=${encodeURIComponent(importName)}&limit=20`,
    );
    const imported = importedPage.body.items.find(
      (item) => item.name === importName,
    );
    expect(imported).toBeTruthy();
    importedDocumentId = imported!.id;
    expect(importedDocumentId).toMatch(UUID_PATTERN);
    expect(imported!.cadDocumentVersion).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Abrir documento importado" }).click();
    await expect(page).toHaveURL(new RegExp(`/studio/${importedDocumentId}$`, "u"));
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });

    const beforeEdit = await openDocument(context, importedDocumentId);
    expect(beforeEdit.status).toBe(200);
    const staleVersion = beforeEdit.body.cadDocumentVersion;

    const browserSave = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() ===
          `${API_ORIGIN}/v1/cad/documents/${importedDocumentId}/content` &&
        response.ok(),
      { timeout: 90_000 },
    );
    await page.getByTestId("cad-native-entity-real-arc").click();
    const radius = page.getByTestId("cad-native-property-radius");
    await expect(radius).toHaveValue("120");
    await radius.fill("140");
    await radius.blur();
    await page.getByTestId("cad-save").click();
    const browserSaveResponse = await browserSave;
    const casPayload = browserSaveResponse.request().postDataJSON() as {
      expectedCadDocumentVersion: number;
    };
    expect(casPayload.expectedCadDocumentVersion).toBe(staleVersion);

    await expect
      .poll(
        async () => (await openDocument(context, importedDocumentId)).body,
        { timeout: 60_000 },
      )
      .toMatchObject({
        cadDocument: {
          entities: expect.arrayContaining([
            expect.objectContaining({ id: "real-arc", radius: 140 }),
          ]),
        },
      });
    const savedDocument = await openDocument(context, importedDocumentId);
    savedVersion = savedDocument.body.cadDocumentVersion;
    expect(savedVersion).toBeGreaterThan(staleVersion);

    const stale = await apiPut<Record<string, unknown>>(
      context,
      `/v1/cad/documents/${importedDocumentId}/content`,
      {
        cadDocument: canonicalDocument(150),
        expectedCadDocumentVersion: staleVersion,
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: "cad_document_version_conflict",
      expected: staleVersion,
    });
    const conflictCurrent = Number(stale.body.current);
    expect(conflictCurrent).toBeGreaterThanOrEqual(savedVersion);
    savedVersion = conflictCurrent;

    const versions = await apiGet<
      PageResult<{ documentId: string; version: number; sha256: string }>
    >(
      context,
      `/v1/cad/documents/${importedDocumentId}/versions?limit=200`,
    );
    expect(versions.status).toBe(200);
    expect(versions.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: importedDocumentId,
          version: savedVersion,
        }),
      ]),
    );
    const version = await apiGet<{
      documentId: string;
      version: number;
      cadDocument: { entities: CadEntity[] };
    }>(
      context,
      `/v1/cad/documents/${importedDocumentId}/versions/${savedVersion}`,
    );
    expect(version.status).toBe(200);
    expect(version.body.cadDocument.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "real-arc", radius: 140 }),
      ]),
    );
  });

  test("13-15: cierra sesion, inicia una nueva, reactiva la organizacion y reabre lo persistido", async () => {
    test.setTimeout(180_000);
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /Cerrar sesi.*n/iu })).toBeVisible();
    const logoutResponse = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/auth/logout` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Cerrar sesi.*n/iu }).click();
    expect((await logoutResponse).status()).toBe(204);
    await expect
      .poll(async () =>
        (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status(),
      )
      .toBe(401);

    await loginThroughUi(page, email, E2E_PASSWORD);
    await activateOrganization(context, organizationId);
    await page.goto(`/studio/${importedDocumentId}`);
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });
    await page.getByTestId("cad-native-entity-real-arc").click();
    await expect(page.getByTestId("cad-native-property-radius")).toHaveValue(
      "140",
    );
    const reopened = await openDocument(context, importedDocumentId);
    expect(reopened.body.cadDocumentVersion).toBe(savedVersion);
    expect(reopened.body.cadDocument?._storage).toBeUndefined();
  });

  test("16: reset de contrasena por UI revoca todas las sesiones previas", async () => {
    test.setTimeout(180_000);
    secondaryContext = await browser.newContext({ baseURL: BASE_URL });
    await apiLogin(secondaryContext, email, E2E_PASSWORD);
    const sessions = await apiGet<{
      sessions: Array<{ id: string; revokedAt: string | null }>;
    }>(context, "/v1/auth/sessions");
    expect(sessions.status).toBe(200);
    expect(
      sessions.body.sessions.filter((session) => session.revokedAt === null).length,
    ).toBeGreaterThanOrEqual(2);

    await page.goto("/forgot-password");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByRole("button", { name: "Enviar instrucciones" }).click();
    await expect(page.getByRole("status")).toContainText(
      /Si existe una cuenta asociada/iu,
    );
    const resetMessage = await capturedMessage(
      context,
      email,
      "identity.reset-password",
    );
    const resetToken = capturedToken(resetMessage);

    await page.goto(`/reset-password?token=${encodeURIComponent(resetToken)}`);
    // «Código de verificación» desde el rediseño de identidad (main, 22-08).
    await expect(page.getByLabel(/C.digo de verificaci.n/iu)).toHaveValue(
      resetToken,
    );
    await expect(page).not.toHaveURL(/(?:\?|&)token=/u);
    await page.getByLabel(/Contrase.*a nueva/iu).fill(RESET_PASSWORD);
    await page.getByRole("button", { name: /Guardar contrase.*a/iu }).click();
    await expect(page.getByRole("status")).toContainText(
      /sesiones anteriores quedaron cerradas/iu,
    );

    expect(
      (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status(),
    ).toBe(401);
    expect(
      (await secondaryContext.request.get(`${API_ORIGIN}/v1/auth/session`)).status(),
    ).toBe(401);
    const obsoletePassword = await context.request.post(
      `${API_ORIGIN}/v1/auth/login`,
      { data: { email, password: E2E_PASSWORD } },
    );
    expect(obsoletePassword.status()).toBe(401);

    await loginThroughUi(page, email, RESET_PASSWORD);
    await activateOrganization(context, organizationId);
    await secondaryContext.close();
    secondaryContext = null;
  });

  test("17: un usuario B no enumera, abre ni infiere el documento de A", async () => {
    test.setTimeout(180_000);
    const isolatedEmail = `valle.e2e.isolated.${runId}@example.test`;
    isolatedContext = await browser.newContext({ baseURL: BASE_URL });

    const registered = await isolatedContext.request.post(
      `${API_ORIGIN}/v1/auth/register`,
      {
        data: {
          email: isolatedEmail,
          password: E2E_PASSWORD,
          displayName: "Valle E2E Isolated",
        },
      },
    );
    expect(registered.status()).toBe(202);
    const verification = await capturedMessage(
      isolatedContext,
      isolatedEmail,
      "identity.verify-email",
    );
    const verified = await isolatedContext.request.post(
      `${API_ORIGIN}/v1/auth/verify-email`,
      { data: { token: capturedToken(verification) } },
    );
    expect([200, 201]).toContain(verified.status());
    await apiLogin(isolatedContext, isolatedEmail, E2E_PASSWORD);
    const isolatedOrganization = await apiPost<OrganizationCreated>(
      isolatedContext,
      "/v1/organizations",
      {
        name: `Organizacion aislada ${runId}`,
        slug: `isolated-${runId}`.toLowerCase(),
      },
    );
    expect(isolatedOrganization.status).toBe(201);
    expect(isolatedOrganization.body.id).not.toBe(organizationId);

    const direct = await isolatedContext.request.get(
      `${API_ORIGIN}/v1/cad/documents/${importedDocumentId}`,
    );
    expect(direct.status()).toBe(404);
    const isolatedList = await apiGet<PageResult<CadDocumentSummary>>(
      isolatedContext,
      "/v1/cad/documents?limit=200",
    );
    expect(isolatedList.status).toBe(200);
    expect(isolatedList.body.items.map((item) => item.id)).not.toContain(
      importedDocumentId,
    );

    const isolatedPage = await isolatedContext.newPage();
    await isolatedPage.goto(`/studio/${importedDocumentId}`);
    await expect(isolatedPage.getByRole("status")).toContainText(
      /eliminado|ya no existe/iu,
    );
    await isolatedPage.close();
    await isolatedContext.close();
    isolatedContext = null;
  });

  test("18: importa por el navegador un documento >1 MB mediante archivo gzip y lo rehidrata completo", async () => {
    test.setTimeout(300_000);
    await page.goto("/dashboard");
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
    const largeName = `large-${runId}`;
    const largePayload = Buffer.from(
      JSON.stringify(largeCanonicalDocument()),
      "utf8",
    );
    expect(largePayload.byteLength).toBeGreaterThan(1_000_000);

    const archiveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/v1\/cad\/documents\/[0-9a-f-]{36}\/archive$/iu.test(
          response.url(),
        ),
      { timeout: 180_000 },
    );
    await page.locator('input[type="file"][accept*=".dxf"][accept*=".json"]').setInputFiles({
      name: `${largeName}.json`,
      mimeType: "application/json",
      buffer: largePayload,
    });
    const uploadedArchive = await archiveResponse;
    expect(uploadedArchive.status()).toBe(200);
    expect(uploadedArchive.request().headers()["content-type"]).toContain(
      "multipart/form-data",
    );
    const receipt = (await uploadedArchive.json()) as CadSaveReceipt;
    expect(receipt).toMatchObject({
      entityCount: 12_000,
      storedAsBlobPointer: true,
    });
    await expect(importStatus(page, /Importado: 12000 entidades/iu)).toBeVisible(
      { timeout: 120_000 },
    );

    const large = await openDocument(context, receipt.cadDocumentId);
    expect(large.status).toBe(200);
    expect(large.body.cadDocument?._storage).toBeUndefined();
    expect(large.body.cadDocument?.entities).toHaveLength(12_000);
  });

  test("19: el loader legacy encuentra server-side un marcador fuera de los primeros 200", async () => {
    test.setTimeout(300_000);
    const legacy = await apiPost<CadDocumentSummary>(
      context,
      "/v1/cad/documents",
      {
        name: `Legacy ${runId}`,
        projectId,
        model: LEGACY_MODEL,
        revision: LEGACY_REVISION,
      },
    );
    expect(legacy.status).toBe(201);

    const headers = await csrfHeaders(context);
    for (let offset = 0; offset < 201; offset += 20) {
      const responses = await Promise.all(
        Array.from(
          { length: Math.min(20, 201 - offset) },
          (_, relative) =>
            context.request.post(`${API_ORIGIN}/v1/cad/documents`, {
              headers,
              data: {
                name: `Filler ${runId} ${String(offset + relative).padStart(3, "0")}`,
                projectId,
              },
            }),
        ),
      );
      for (const response of responses) {
        expect(response.status(), await response.text()).toBe(201);
      }
    }

    const firstPage = await apiGet<PageResult<CadDocumentSummary>>(
      context,
      "/v1/cad/documents?limit=200",
    );
    expect(firstPage.body.total).toBeGreaterThan(200);
    expect(firstPage.body.items.map((item) => item.id)).not.toContain(
      legacy.body.id,
    );

    const query = new URLSearchParams({
      model: LEGACY_MODEL,
      revision: LEGACY_REVISION,
      limit: "1",
    });
    const filtered = await apiGet<PageResult<CadDocumentSummary>>(
      context,
      `/v1/cad/documents?${query.toString()}`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toEqual([
      expect.objectContaining({
        id: legacy.body.id,
        model: LEGACY_MODEL,
        revision: LEGACY_REVISION,
      }),
    ]);

    await page.goto("/legacy/studio");
    await expect(page).toHaveURL(new RegExp(`/studio/${legacy.body.id}$`, "u"), {
      timeout: 90_000,
    });
  });

  test("20: exporta DXF desde el estudio real y completa el round-trip mediante la importacion productiva", async () => {
    test.setTimeout(300_000);
    await page.goto(`/studio/${importedDocumentId}`);
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });
    await page.getByTitle(/Exportar a DXF/iu).click();
    const downloadButton = page.getByRole("button", { name: "Descargar DXF" });
    await expect(downloadButton).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);
    const browserDxf = await streamBuffer(await download.createReadStream());
    const browserDxfText = browserDxf.toString("utf8");
    expect(browserDxfText).toMatch(/\bSECTION\b/u);
    expect(browserDxfText).toMatch(/\bENTITIES\b/u);
    expect(browserDxfText).toMatch(/\bARC\b/u);

    const serverExport = await apiGet<{
      fileName: string;
      unit: string;
      dxf: string;
    }>(
      context,
      `/v1/cad/documents/${importedDocumentId}/export/dxf`,
    );
    expect(serverExport.status).toBe(200);
    expect(serverExport.body.dxf).toMatch(/\bARC\b/u);

    await page.goto("/dashboard");
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
    const roundTripName = `round-trip-${runId}`;
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/v1\/cad\/documents\/[0-9a-f-]{36}\/content$/iu.test(
          response.url(),
        ) &&
        response.ok(),
      { timeout: 120_000 },
    );
    await page.locator('input[type="file"][accept*=".dxf"][accept*=".json"]').setInputFiles({
      name: `${roundTripName}.dxf`,
      mimeType: "application/dxf",
      buffer: browserDxf,
    });
    const roundTripSave = (await (await saveResponse).json()) as CadSaveReceipt;
    await expect(importStatus(page, /Importado:/iu)).toBeVisible({
      timeout: 90_000,
    });

    const roundTrip = await openDocument(context, roundTripSave.cadDocumentId);
    expect(roundTrip.status).toBe(200);
    const arc = roundTrip.body.cadDocument?.entities.find(
      (entity) => entity.type === "arc",
    );
    expect(arc).toBeTruthy();
    expect(arc!.radius).toBeCloseTo(140, 6);
    expect(roundTripSave.entityCount).toBeGreaterThanOrEqual(1);

    expect(browserAuthorizationHeaders).toEqual([]);
    expect(
      await page.evaluate(() => localStorage.getItem("axos_access_token")),
    ).toBeNull();
  });
});
