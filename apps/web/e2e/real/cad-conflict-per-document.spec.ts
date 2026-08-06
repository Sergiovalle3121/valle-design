/**
 * Un conflicto CAS pertenece a UN documento — comprobado contra la API real.
 *
 * EL DEFECTO. El enclavamiento del conflicto vivía en un único ref y se
 * comparaba SÓLO por número de versión. Los números de versión no son únicos
 * entre documentos: cada dibujo tiene su contador y todos arrancan en 0. Así
 * que un 409 en el plano A con base v1 detenía el autosave del plano B en
 * cuanto B pasaba por su propia v1 — un dibujo que nadie había tocado desde
 * otra sesión, cuyo trabajo dejaba de subir al servidor con la única señal de
 * una etiqueta que hablaba de OTRO plano.
 *
 * Esto no se puede medir en un unit test: hace falta que el 409 lo produzca el
 * servidor de verdad y que el autosave del segundo documento llegue —o no— a
 * `PUT /v1/cad/documents/:id/content`. Aquí no se intercepta nada.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import { E2E_PASSWORD, apiGet, apiPost, apiPut } from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

function canonicalDocument(radius = 120) {
  return {
    meta: { version: 1, schema: 3, unit: "mm", footprintW: 12_000, footprintH: 10_000, gridSize: 100 },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "REAL", name: "REAL", color: "#60a5fa", visible: true, locked: false },
    ],
    entities: [
      {
        id: "real-arc",
        type: "arc",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius,
        startAngle: 0,
        endAngle: 180,
        layer: "REAL",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["real-arc"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** Edita el radio del arco. El editor programa autosave a los 2 s. */
async function editRadius(page: Page, radius: string): Promise<void> {
  await page.getByTestId("cad-native-entity-real-arc").click();
  const field = page.getByTestId("cad-native-property-radius");
  await expect(field).toBeVisible();
  await field.fill(radius);
  await field.blur();
}

test.describe("el conflicto CAS se enclava por documento, contra PostgreSQL", () => {
  let context: BrowserContext;
  let page: Page;
  let email: string;
  let runId: string;
  /** El dibujo que CHOCA. */
  let documentA: string;
  /** El dibujo inocente, que llega a tener el MISMO número de versión. */
  let documentB: string;

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(180_000);
    runId = `${browserName}-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.conflict.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });

    const registered = await context.request.post(`${API_ORIGIN}/v1/auth/register`, {
      data: { email, password: E2E_PASSWORD, displayName: "Valle Conflict" },
    });
    expect(registered.status()).toBe(202);
    const message = await context.request.get(
      `${API_ORIGIN}/_development/email-outbox?recipient=${encodeURIComponent(email)}`,
      {
        headers: {
          "x-valle-test-harness":
            process.env.E2E_IDENTITY_HARNESS_KEY ??
            "valle-design-e2e-harness-key-32-characters-minimum",
        },
      },
    );
    const token = ((await message.json()) as { payload: { token: string } }).payload.token;
    expect(
      (await context.request.post(`${API_ORIGIN}/v1/auth/verify-email`, { data: { token } })).status(),
    ).toBeLessThan(300);
    expect(
      (await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
        data: { email, password: E2E_PASSWORD },
      })).status(),
    ).toBe(200);

    const organization = await apiPost<{ id: string }>(context, "/v1/organizations", {
      name: `Valle Conflict ${runId}`,
      slug: `valle-conflict-${runId}`.toLowerCase(),
    });
    expect(organization.status).toBe(201);
    expect(
      [200, 201].includes(
        (await apiPost(context, "/v1/organizations/active", {
          organizationId: organization.body.id,
        })).status,
      ),
    ).toBe(true);

    // DOS documentos sembrados idénticamente: los dos quedan en la MISMA
    // versión, que es la condición que hacía colisionar los enclavamientos.
    for (const name of ["A", "B"]) {
      const created = await apiPost<{ id: string }>(context, "/v1/cad/documents", {
        name: `Conflict ${name} ${runId}`,
      });
      expect(created.status).toBe(201);
      const seeded = await apiPut<Record<string, unknown>>(
        context,
        `/v1/cad/documents/${created.body.id}/content`,
        { cadDocument: canonicalDocument(), expectedCadDocumentVersion: 0 },
      );
      expect(seeded.status).toBe(200);
      if (name === "A") documentA = created.body.id;
      else documentB = created.body.id;
    }

    const [versionA, versionB] = await Promise.all(
      [documentA, documentB].map(async (id) =>
        (await apiGet<{ cadDocumentVersion: number }>(context, `/v1/cad/documents/${id}`))
          .body.cadDocumentVersion,
      ),
    );
    expect(
      versionA,
      "el escenario EXIGE que los dos dibujos compartan número de versión",
    ).toBe(versionB);

    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1: el documento A choca de verdad contra el servidor", async () => {
    test.setTimeout(180_000);
    await page.goto(`/studio/${documentA}`);
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });

    // Un TERCER escritor mueve A por debajo de la pestaña.
    const current = await apiGet<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentA}`,
    );
    expect(
      (await apiPut<Record<string, unknown>>(
        context,
        `/v1/cad/documents/${documentA}/content`,
        {
          cadDocument: canonicalDocument(777),
          expectedCadDocumentVersion: current.body.cadDocumentVersion,
        },
      )).status,
    ).toBe(200);

    // El autosave de la pestaña se lleva un 409 REAL.
    const conflict = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === `${API_ORIGIN}/v1/cad/documents/${documentA}/content` &&
        response.status() === 409,
      { timeout: 90_000 },
    );
    await editRadius(page, "141");
    expect((await conflict).status()).toBe(409);
    await expect(page.getByText(/autosave detenido/iu)).toBeVisible({ timeout: 60_000 });
  });

  test("2: el documento B, con el MISMO número de versión, sigue guardando", async () => {
    test.setTimeout(180_000);
    // Misma pestaña, otro dibujo: es el caso real —abrir otro plano— y el que
    // heredaba el enclavamiento del anterior.
    await page.goto(`/studio/${documentB}`);
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });

    const before = (
      await apiGet<{ cadDocumentVersion: number }>(context, `/v1/cad/documents/${documentB}`)
    ).body.cadDocumentVersion;

    // NADIE ha tocado B desde otra sesión: su autosave tiene que llegar.
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === `${API_ORIGIN}/v1/cad/documents/${documentB}/content` &&
        response.ok(),
      { timeout: 90_000 },
    );
    await editRadius(page, "163");
    expect(
      (await saved).status(),
      "un conflicto en OTRO dibujo no puede detener el autosave de éste",
    ).toBe(200);

    await expect
      .poll(
        async () =>
          (await apiGet<{ cadDocumentVersion: number }>(
            context,
            `/v1/cad/documents/${documentB}`,
          )).body.cadDocumentVersion,
        { timeout: 60_000 },
      )
      .toBeGreaterThan(before);

    const persisted = await apiGet<{
      cadDocument: { entities: { id: string; radius?: number }[] } | null;
    }>(context, `/v1/cad/documents/${documentB}`);
    expect(
      persisted.body.cadDocument?.entities.find((entity) => entity.id === "real-arc")?.radius,
      "y el trabajo llega entero al servidor, no a medias",
    ).toBe(163);
  });

  test("3: al volver a A el conflicto sigue enclavado, y no se ha inventado un guardado", async () => {
    test.setTimeout(180_000);
    const serverBefore = (
      await apiGet<{ cadDocumentVersion: number }>(context, `/v1/cad/documents/${documentA}`)
    ).body.cadDocumentVersion;

    await page.goto(`/studio/${documentA}`);
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });

    // Reabrir A lo pone al día con el servidor, así que su base ya no es la
    // rechazada y puede volver a guardar. Lo que NUNCA puede haber pasado es
    // que el conflicto se resolviera solo sobrescribiendo al otro escritor.
    const persisted = await apiGet<{
      cadDocumentVersion: number;
      cadDocument: { entities: { id: string; radius?: number }[] } | null;
    }>(context, `/v1/cad/documents/${documentA}`);
    expect(
      persisted.body.cadDocumentVersion,
      "nadie ha escrito en A desde el 409: un conflicto no se resuelve en automático",
    ).toBe(serverBefore);
    expect(
      persisted.body.cadDocument?.entities.find((entity) => entity.id === "real-arc")?.radius,
      "lo que guardó el tercer escritor sigue intacto",
    ).toBe(777);
  });

  test("4: ninguna página registró un error", async () => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.reload();
    await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("axos_access_token"))).toBeNull();
  });
});
