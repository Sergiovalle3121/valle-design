/** Acceptance C/F: real persistence; all geometry is entered through the editor UI. */
import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  apiGet,
  apiLogin,
  apiPost,
  capturedToken,
  csrfHeaders,
  latestCapturedEmail,
  registrarCuenta,
} from "../fixtures/first-party";
import { abrirPanelDerecho } from "../fixtures/docks";
import { enter3DView } from "../fixtures/view-mode";
import { topView } from "../fixtures/camera-preset";
import { worldPoint } from "../fixtures/world-point";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";
import { bodyBounds } from "../../src/lib/brep";
import { resolveCadInsert } from "../../src/lib/cad/professional-blocks";
import {
  solid3dBody,
  solid3dMassProperties,
} from "../../src/lib/cad/solid3d-build";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requires the real local API and PostgreSQL.",
);
const MODEL_TOLERANCE = 1e-6;

async function jsonEvidence(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(name);
  await writeFile(path, JSON.stringify(value, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}

async function screenshotEvidence(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name);
  await page.screenshot({ path, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

async function command(page: Page, ...values: string[]) {
  const input = page.getByTestId("cad-command-input");
  for (const value of values) {
    await input.fill(value);
    await input.press("Enter");
  }
}

async function deselect(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

async function layer(page: Page, name: string) {
  await command(page, "-LAYER", "N", name);
  await command(page, "-LAYER", "D", name);
}

async function savedDocument(context: BrowserContext, id: string) {
  const response = await apiGet<{
    cadDocument: CadDocument;
    cadDocumentVersion: number;
  }>(context, `/v1/cad/documents/${id}`);
  expect(response.status).toBe(200);
  return response.body;
}

async function save(page: Page) {
  await page.getByTestId("cad-save").click();
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", {
    timeout: 30_000,
  });
}

async function createBlank(context: BrowserContext, page: Page, name: string) {
  // The account/document container is harness setup. No document content is injected.
  const response = await apiPost<{ id: string }>(context, "/v1/cad/documents", {
    name,
  });
  expect(response.status).toBe(201);
  const id = response.body.id;
  await page.goto(`/studio/${id}`);
  await expect(page.getByTestId("cad-command-input")).toBeVisible({
    timeout: 120_000,
  });
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.isVisible()) await skip.click();
  expect(
    (await savedDocument(context, id)).cadDocument?.entities ?? [],
  ).toHaveLength(0);
  return id;
}

function inserts(document: CadDocument) {
  return document.entities.filter(
    (entity): entity is Extract<CadEntity, { type: "insert" }> =>
      entity.type === "insert",
  );
}

function solid(document: CadDocument): CadSolid3dEntity {
  const solids = document.entities.filter(
    (entity): entity is CadSolid3dEntity => entity.type === "solid3d",
  );
  expect(solids).toHaveLength(1);
  return solids[0];
}

function expectSolid(document: CadDocument, height: number) {
  const entity = solid(document);
  const bounds = bodyBounds(solid3dBody(entity));
  for (const [actual, expected] of [
    [bounds.min.x, 5000],
    [bounds.max.x, 7000],
    [bounds.min.y, 4000],
    [bounds.max.y, 6000],
    [bounds.min.z, 0],
    [bounds.max.z, height],
  ])
    expect(Math.abs(actual - expected)).toBeLessThan(MODEL_TOLERANCE);
  expect(
    Math.abs(solid3dMassProperties(entity).volume - 2000 * 2000 * height),
  ).toBeLessThan(1);
  return entity;
}

test.describe("Bloques y sólidos sintéticos con API real", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser, browserName }) => {
    test.setTimeout(180_000);
    const run = `${browserName}-${Date.now().toString(36)}`;
    const email = `release-cf-${run}@example.test`;
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();
    await registrarCuenta(context.request, email, "Aceptación C/F sintética");
    const verification = await context.request.post(
      `${API_ORIGIN}/v1/auth/verify-email`,
      {
        data: {
          token: capturedToken(
            await latestCapturedEmail(context.request, email),
          ),
        },
      },
    );
    expect(verification.ok(), await verification.text()).toBe(true);
    await apiLogin(context, email);
    const organization = await apiPost<{ id: string }>(
      context,
      "/v1/organizations",
      {
        name: `Aceptación C/F ${run}`,
        slug: `release-cf-${run}`,
      },
    );
    expect(organization.status).toBe(201);
    const active = await context.request.post(
      `${API_ORIGIN}/v1/organizations/active`,
      {
        data: { organizationId: organization.body.id },
        headers: await csrfHeaders(context),
      },
    );
    expect(active.ok(), await active.text()).toBe(true);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.afterEach(async ({}, info) => {
    await jsonEvidence(info, "medicion.json", {
      task: info.title,
      browser: info.project.name,
      status: info.status,
      durationMs: info.duration,
      durationScope: "Playwright test duration before afterEach",
      unit: "mm",
      synthetic: true,
      persistence: "real API and PostgreSQL",
    });
  });

  test("C: símbolos, capas, conexiones, copia, giro y atributos de instancia", async ({}, info) => {
    test.setTimeout(240_000);
    const id = await createBlank(
      context,
      page,
      "Esquema sintético de símbolos",
    );
    await layer(page, "Simbolos");
    await command(page, "CIRCLE", "0,0", "250");
    await command(page, "LINE", "-350,0", "350,0", "");
    await command(
      page,
      "ATTDEF",
      "MARCA",
      "Identificador del símbolo",
      "S-01",
      "300,300",
      "100",
      "0",
    );
    await deselect(page);
    await command(page, "SELECT", "TOdo", "");
    await command(page, "BLOCK", "SENSOR", "0,0", "");
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
    await save(page);
    const initial = (await savedDocument(context, id)).cadDocument;
    expect(initial.blocks).toHaveLength(1);
    const definition = initial.blocks[0];
    expect(definition.name).toBe("SENSOR");
    expect(definition.entities.some((entity) => entity.type === "circle")).toBe(
      true,
    );
    expect(definition.entities.some((entity) => entity.type === "line")).toBe(
      true,
    );
    expect(inserts(initial)).toHaveLength(1);

    await command(page, "INSERT", "SENSOR", "1000,1000", "1", "1", "0", "S-02");
    await deselect(page);
    await command(page, "SELECT", "Último", "");
    await command(page, "ROTATE", "1000,1000", "90");
    await deselect(page);
    await command(page, "SELECT", "Último", "");
    await command(page, "COPY", "1000,1000", "3000,1000", "");
    await save(page);
    const duplicated = (await savedDocument(context, id)).cadDocument;
    const copied = inserts(duplicated).find(
      (entry) => entry.insertion.x === 3000,
    )!;
    expect(copied).toBeDefined();
    await deselect(page);
    await abrirPanelDerecho(page);
    await page.getByTestId(`cad-native-entity-${copied.id}`).click();
    await command(page, "ATTEDIT", "S-03");
    await deselect(page);
    await layer(page, "Conexiones");
    await command(page, "LINE", "1000,1000", "3000,1000", "");
    await layer(page, "Rotulos");
    await command(
      page,
      "TEXT",
      "1000,1600",
      "100",
      "0",
      "ESQUEMA SINTETICO SIN VALIDEZ CONSTRUCTIVA",
    );
    await command(page, "ZOOM", "E");
    await save(page);
    const saved = (await savedDocument(context, id)).cadDocument;
    expect(saved.meta.unit).toBe("mm");
    expect(
      saved.blocks[0],
      "editar una instancia conserva la definición compartida",
    ).toEqual(definition);
    const instances = inserts(saved);
    expect(instances).toHaveLength(3);
    expect(new Set(instances.map((entry) => entry.block)).size).toBe(1);
    const original = instances.find((entry) => entry.insertion.x === 0)!;
    const rotated = instances.find((entry) => entry.insertion.x === 1000)!;
    const copy = instances.find((entry) => entry.insertion.x === 3000)!;
    expect(original.rotation).toBe(0);
    expect(rotated.rotation).toBe(90);
    expect(copy.rotation).toBe(90);
    expect(rotated.attributes?.MARCA).toBe("S-02");
    expect(copy.attributes?.MARCA).toBe("S-03");
    for (const [instance, x] of [
      [rotated, 1000],
      [copy, 3000],
    ] as const) {
      const resolved = resolveCadInsert(saved, instance.id);
      expect(
        resolved.diagnostics.filter((entry) => entry.severity === "error"),
      ).toEqual([]);
      const segment = resolved.entities.find((entry) => entry.type === "line");
      expect(segment?.type).toBe("line");
      if (segment?.type !== "line")
        throw new Error("Falta el segmento del símbolo");
      for (const [actual, expected] of [
        [segment.start.x, x],
        [segment.end.x, x],
        [segment.start.y, 650],
        [segment.end.y, 1350],
      ])
        expect(Math.abs(actual - expected)).toBeLessThan(MODEL_TOLERANCE);
    }
    const layerIds = new Set(saved.layers.map((entry) => entry.id));
    expect(saved.entities.every((entry) => layerIds.has(entry.layer))).toBe(
      true,
    );
    const connectionLayer = saved.layers.find(
      (entry) => entry.name === "Conexiones",
    )!;
    expect(
      saved.entities.find(
        (entry) => entry.type === "line" && entry.layer === connectionLayer.id,
      ),
    ).toMatchObject({
      start: { x: 1000, y: 1000 },
      end: { x: 3000, y: 1000 },
    });
    expect(
      saved.entities.some(
        (entry) =>
          entry.type === "mtext" &&
          entry.text === "ESQUEMA SINTETICO SIN VALIDEZ CONSTRUCTIVA",
      ),
    ).toBe(true);
    await screenshotEvidence(page, info, "C-antes-reabrir.png");
    await page.reload();
    await expect(page.getByTestId("cad-command-input")).toBeVisible();
    await abrirPanelDerecho(page);
    await expect(
      page.getByTestId(`cad-native-entity-${copy.id}`),
    ).toBeVisible();
    const reopened = (await savedDocument(context, id)).cadDocument;
    expect(reopened.entities).toEqual(saved.entities);
    expect(reopened.blocks).toEqual(saved.blocks);
    await jsonEvidence(info, "C-documento-real.json", reopened);
    await screenshotEvidence(page, info, "C-despues-reabrir.png");
  });

  test("F: perfil, extrusión, órbita, edición de cara, historial y reapertura", async ({}, info) => {
    test.setTimeout(240_000);
    const id = await createBlank(
      context,
      page,
      "Sólido sintético 2000 × 2000 × 750 mm",
    );
    await layer(page, "Solidos");
    await command(page, "RECTANG", "5000,4000", "7000,6000");
    await deselect(page);
    await command(page, "SELECT", "Último", "");
    await command(page, "EXTRUDE", "500");
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
    await save(page);
    const extruded = (await savedDocument(context, id)).cadDocument;
    expect(extruded.meta.unit).toBe("mm");
    const base = expectSolid(extruded, 500);
    expect(base.nodes[0].op).toBe("extrude");
    expect(extruded.entities.some((entity) => entity.type === "polyline")).toBe(
      false,
    );

    await enter3DView(page);
    await command(page, "3DORBIT", "-45", "35");
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
    await screenshotEvidence(page, info, "F-orbita.png");
    await topView(page);
    await command(page, "ZOOM", "E");
    // La huella de un documento nuevo mide 20000 × 10000: su centro no es
    // el del sólido. Calibrar antes de activar el comando conserva el HUD libre.
    const face = await worldPoint(page, { x: 6000, y: 5000 });
    await command(page, "PRESSPULL");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      /cara/iu,
    );
    await page.mouse.click(face.x, face.y);
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      /distancia/iu,
    );
    await command(page, "250");
    await save(page);
    const pushed = (await savedDocument(context, id)).cadDocument;
    expect(
      expectSolid(pushed, 750).nodes.some((node) => node.op === "push"),
    ).toBe(true);
    await command(page, "U");
    await save(page);
    expectSolid((await savedDocument(context, id)).cadDocument, 500);
    await command(page, "REDO");
    await save(page);
    const redone = (await savedDocument(context, id)).cadDocument;
    expectSolid(redone, 750);
    expect(solid(redone).nodes).toEqual(solid(pushed).nodes);
    await screenshotEvidence(page, info, "F-antes-reabrir.png");
    await page.reload();
    await expect(page.getByTestId("cad-command-input")).toBeVisible();
    await abrirPanelDerecho(page);
    await expect(
      page.getByTestId(`cad-native-entity-${solid(redone).id}`),
    ).toBeVisible();
    const reopened = (await savedDocument(context, id)).cadDocument;
    expectSolid(reopened, 750);
    expect(solid(reopened).nodes).toEqual(solid(redone).nodes);
    await jsonEvidence(info, "F-documento-real.json", reopened);
    await screenshotEvidence(page, info, "F-despues-reabrir.png");
  });
});
