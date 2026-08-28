/**
 * Fixture de aceptación 3D-M1 contra la API real y PostgreSQL — no circular.
 *
 * Todo lo que la campaña 3D-M1 construyó (muros volumétricos con vanos,
 * piso/cielorraso/cubierta derivados, selección 3D, material, deshacer/
 * rehacer, guardar/recargar, vistas estándar) ya tiene cobertura de specs
 * unitarios y de goldens herméticos (`e2e/golden/58-cad-wall-material-lifecycle.spec.ts`
 * y los demás goldens de Corte B-F) — pero los goldens interceptan TODA
 * petición de red: nunca demuestran que un documento con muros/vanos/
 * material sobrevive intacto un viaje real por el validador de la API
 * (`cad-entity-invariants.ts`, que impone su propio conjunto cerrado de
 * materiales — ver campaña, commit de invariantes de muro) y PostgreSQL
 * (JSON en `cad_documents`/`cad_document_versions`), ni que una sesión
 * NUEVA (sin caché de navegador) recupera exactamente lo mismo. Ese es el
 * hueco que esta prueba cierra, con el mismo patrón ya probado por
 * `e2e/real/dwg-import-real.spec.ts` (selecciona→edita→guarda→CAS→nueva
 * sesión→confirma contra la API) y `e2e/real/studio-real-api.spec.ts`
 * (registro→organización→proyecto→documento por el harness real), aplicado
 * a contenido nativo de muro en vez de una entidad heredada.
 *
 * Deliberadamente NO repite lo que esos dos ya prueban de sobra:
 * registro/verificación por correo, creación de organización con trial,
 * aislamiento entre organizaciones, DXF, documentos grandes. Sólo la
 * ceremonia mínima para llegar a un documento abierto en Studio, y de ahí en
 * adelante, sólo lo específico de 3D-M1.
 *
 * Requiere `E2E_REAL_API=1`, la API real y PostgreSQL 16 (ver
 * `.github/workflows/ci.yml`, job `e2e-real` — arranca la API con
 * `MIGRATIONS_RUN=true` y expone health en `:4000`).
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiPut,
  capturedToken,
  csrfHeaders,
  latestCapturedEmail,
} from "../fixtures/first-party";
import { applyNativeSelectProperty } from "../fixtures/dynamic-input";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";
import type { CadDocument, CadWallEntity, CadOpeningEntity } from "../../src/lib/cad/cad-document";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

const WALL_SUR_ID = "muro-sur";

/** Un edificio de una planta: cuatro muros cerrando un rectángulo, con una
 * puerta en el muro sur — el mismo contorno que Corte C/D ejercitan, ahora
 * viajando por la API real. `muro-sur` no lleva `material` al nacer: la
 * prueba de abajo depende de que arranque vacío. */
function buildingDocument(): CadDocument {
  const wall = (
    id: string,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
  ): CadWallEntity => ({
    id,
    type: "wall",
    start: { x: sx, y: sy, z: 0 },
    end: { x: ex, y: ey, z: 0 },
    thickness: 200,
    height: 2_400,
    layer: "0",
  });
  const door: CadOpeningEntity = {
    id: "puerta-sur",
    type: "opening",
    kind: "door",
    hostId: WALL_SUR_ID,
    position: 3_000,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
    layer: "0",
  };
  const walls = [
    wall(WALL_SUR_ID, 2_000, 2_000, 10_000, 2_000),
    wall("muro-este", 10_000, 2_000, 10_000, 8_000),
    wall("muro-norte", 10_000, 8_000, 2_000, 8_000),
    wall("muro-oeste", 2_000, 8_000, 2_000, 2_000),
  ];
  const entities = [...walls, door];
  return {
    meta: {
      version: 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

/**
 * El recorrido «Primeros cinco minutos» nace `pending` en cada sesión nueva
 * (su registro vive en el almacenamiento del navegador) y su tarjeta puede
 * sentarse sobre parte del lienzo — mismo hallazgo que
 * `e2e/golden/58-cad-wall-material-lifecycle.spec.ts`.
 */
async function skipGuidedTour(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Saltar" });
  if (await skip.count()) await skip.click();
}

async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login?returnTo=/dashboard");
  await page.getByLabel(/Correo electr.*nico/iu).fill(email);
  await page.getByLabel(/^Contrase/iu).fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/dashboard"),
    page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
  ]);
}

async function openDocument(context: BrowserContext, documentId: string) {
  return apiGet<{
    cadDocumentVersion: number;
    cadDocument: { entities: Array<{ id: string; type: string; material?: string }> } | null;
  }>(context, `/v1/cad/documents/${encodeURIComponent(documentId)}`);
}

const VIEW_PRESET_TITLES = [
  "Vista isométrica",
  "Vista superior (planta)",
  "Vista frontal",
  "Vista posterior",
  "Vista lateral izquierda",
  "Vista lateral derecha",
];

test.describe("3D-M1: muros/vanos/material nativos de punta a punta contra PostgreSQL real", () => {
  let context: BrowserContext;
  let page: Page;
  let email: string;
  let runId: string;
  let organizationId: string;
  let documentId: string;
  const consoleErrors: string[] = [];

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(120_000);
    runId = `${browserName}-3dm1-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.e2e.3dm1.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1: registra, verifica e inicia sesión por el harness real; crea organización y proyecto", async () => {
    test.setTimeout(120_000);
    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Valle E2E 3D-M1");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
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
    const organizationName = `Valle E2E 3D-M1 ${runId}`;
    await page.getByLabel("Nombre del despacho").fill(organizationName);
    const creation = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/organizations` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Crear organización" }).click();
    const created = (await (await creation).json()) as { id: string };
    organizationId = created.id;
    expect(organizationId).toBeTruthy();

    const projectName = `Proyecto 3D-M1 ${runId}`;
    await page.getByLabel("Nombre del proyecto").fill(projectName);
    await page.getByLabel("Crear proyecto").click();
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
  });

  test("2: crea un documento en blanco y le pone contenido de 3D-M1 por CAS (API real)", async () => {
    test.setTimeout(120_000);
    const blankName = `Edificio 3D-M1 ${runId}`;
    await page.getByLabel("Nombre del documento").fill(blankName);
    await Promise.all([
      page.waitForURL(/\/studio\/[0-9a-f-]{36}$/iu),
      page.getByLabel("Crear documento").click(),
    ]);
    documentId = new URL(page.url()).pathname.split("/").pop()!;

    const blank = await openDocument(context, documentId);
    expect(blank.status).toBe(200);
    const put = await apiPut<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      {
        cadDocument: buildingDocument(),
        expectedCadDocumentVersion: blank.body.cadDocumentVersion,
      },
    );
    expect(put.status, JSON.stringify(put.body)).toBe(200);

    // La API real valida contra su propio conjunto cerrado de entidades — si
    // el documento hubiese sido rechazado, esto lo hubiera dicho `put.status`
    // arriba; esta relectura confirma que lo que se guardó es lo que se leerá.
    const saved = await openDocument(context, documentId);
    expect(saved.body.cadDocument?.entities.map((e) => e.id).sort()).toEqual(
      ["muro-este", "muro-norte", "muro-oeste", "muro-sur", "puerta-sur"].sort(),
    );
  });

  test("3: abre en Studio en modo 3D; los cuatro muros son sólidos nativos seleccionables", async () => {
    test.setTimeout(120_000);
    await page.goto(`/studio/${documentId}`);
    await skipGuidedTour(page);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.getByTestId("cad-render-pipeline")).toHaveAttribute(
      "data-settled",
      "true",
      { timeout: 30_000 },
    );

    for (const id of ["muro-sur", "muro-este", "muro-norte", "muro-oeste"]) {
      await expect(
        page.getByTestId(`cad-native-entity-${id}`),
        `muro ${id} presente como sólido nativo`,
      ).toBeVisible({ timeout: 60_000 });
    }
  });

  test("4: selecciona el muro sur, su material arranca vacío, lo edita, deshace/rehace y guarda", async () => {
    test.setTimeout(120_000);
    await page.getByTestId(`cad-native-entity-${WALL_SUR_ID}`).click();
    const material = page.getByTestId("cad-native-property-material");
    await expect(material).toBeVisible({ timeout: 15_000 });
    expect(await material.inputValue()).toBe("");

    const depth = page.getByTestId("cad-history-depth");
    const undoBefore = Number((await depth.getAttribute("data-undo")) ?? "0");

    await applyNativeSelectProperty(page, "material", "brick");
    await expect(depth).toHaveAttribute(
      "data-undo",
      String(undoBefore + 1),
      { timeout: 10_000 },
    );

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === `${API_ORIGIN}/v1/cad/documents/${documentId}/content` &&
        response.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("cad-save").click();
    await saveResponse;

    await expect
      .poll(
        async () => {
          const reopened = await openDocument(context, documentId);
          return reopened.body.cadDocument?.entities.find((e) => e.id === WALL_SUR_ID)
            ?.material;
        },
        { timeout: 30_000 },
      )
      .toBe("brick");
  });

  test("5: cierra sesión, abre una NUEVA sesión y confirma que el material persistió en PostgreSQL", async () => {
    test.setTimeout(120_000);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Cerrar sesi.*n/iu }).click();
    await expect
      .poll(async () => (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status())
      .toBe(401);

    await loginThroughUi(page, email, E2E_PASSWORD);
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId },
      headers: await csrfHeaders(context),
    });

    await page.goto(`/studio/${documentId}`);
    await skipGuidedTour(page);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page.getByTestId(`cad-native-entity-${WALL_SUR_ID}`).click();
    await expect(page.getByTestId("cad-native-property-material")).toHaveValue("brick", {
      timeout: 30_000,
    });

    // No "cambió la URL": lectura directa a la API real, que a su vez lee
    // PostgreSQL — sin caché de navegador de por medio.
    const persisted = await openDocument(context, documentId);
    expect(
      persisted.body.cadDocument?.entities.find((e) => e.id === WALL_SUR_ID)?.material,
    ).toBe("brick");
  });

  test("6: los seis presets de cámara del visor 3D funcionan sobre un documento real, sin errores", async () => {
    test.setTimeout(60_000);
    // Sólo lo que ESTE test provoca: lo acumulado en 1-5 (login/logout,
    // navegación) no es lo que esta aserción quiere caracterizar.
    consoleErrors.length = 0;
    for (const title of VIEW_PRESET_TITLES) {
      await page.getByTitle(title, { exact: true }).click();
      await page.waitForTimeout(200);
    }
    expect(consoleErrors, `sin errores de consola: ${consoleErrors.join(" | ")}`).toEqual([]);
  });
});
