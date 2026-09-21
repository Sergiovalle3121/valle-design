/** Synthetic acceptance drawings, created through visible commands, never API PUT. */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";
import { worldPoint } from "../fixtures/world-point";
import { abrirPanelDerecho } from "../fixtures/docks";
import { applyNativeProperty } from "../fixtures/dynamic-input";
import type { CadDocument } from "../../src/lib/cad/cad-document";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requires the real local API and PostgreSQL.",
);

// Numeric input and persistence must preserve these values, independent of pixels.
const MODEL_TOLERANCE = 1e-6;

async function command(page: Page, ...values: string[]) {
  const input = page.getByTestId("cad-command-input");
  for (const value of values) {
    await input.fill(value);
    await input.press("Enter");
  }
}

async function layer(page: Page, name: string) {
  await command(page, "-LAYER", "N", name);
  await command(page, "-LAYER", "D", name);
}

async function readDocument(context: BrowserContext, id: string) {
  const result = await apiGet<{
    cadDocument: CadDocument;
    cadDocumentVersion: number;
  }>(context, `/v1/cad/documents/${id}`);
  expect(result.status).toBe(200);
  return result.body;
}

async function save(page: Page) {
  await page.getByTestId("cad-save").click();
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", {
    timeout: 30_000,
  });
}

async function createBlank(page: Page, name: string) {
  await page.goto("/dashboard");
  await page.getByLabel("Nombre del documento").fill(name);
  await Promise.all([
    page.waitForURL(/\/studio\/[0-9a-f-]{36}$/iu),
    page.getByLabel("Crear documento").click(),
  ]);
  await expect(page.getByTestId("cad-command-input")).toBeVisible({
    timeout: 120_000,
  });
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.isVisible()) await skip.click();
  return new URL(page.url()).pathname.split("/").pop()!;
}

test.describe("Entregables sintéticos por teclado y ratón, con persistencia real", () => {
  let context: BrowserContext;
  let page: Page;
  const run = Date.now().toString(36);

  test.beforeAll(async ({ browser, browserName }) => {
    test.setTimeout(180_000);
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();
    const email = `release-${browserName}-${run}@example.test`;
    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Prueba sintética ValleCAD");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await page.getByText(/^Acepto los/).click();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);
    const verification = await latestCapturedEmail(context.request, email);
    await page.goto(
      `/verify-email?token=${encodeURIComponent(capturedToken(verification))}`,
    );
    await expect(page.getByRole("status")).toContainText(
      /correo qued.* verificado/iu,
    );
    await page.goto("/login?returnTo=/dashboard");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: "Iniciar sesión" }).click(),
    ]);
    await page
      .getByLabel("Nombre del despacho")
      .fill(`Aceptación sintética ${browserName} ${run}`);
    await page.getByRole("button", { name: "Crear organización" }).click();
    await expect(page.getByLabel("Nombre del proyecto")).toBeVisible();
    await page
      .getByLabel("Nombre del proyecto")
      .fill("Muestras sin validez constructiva");
    await page.getByLabel("Crear proyecto").click();
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.afterEach(async ({}, info) => {
    await writeFile(info.outputPath("medicion.json"), JSON.stringify({
      task: info.title, browser: info.project.name, status: info.status,
      unit: "mm", durationMs: info.duration, retry: info.retry,
      scope: "Ejecución sintética automatizada, duración hasta afterEach; no sesión con usuarios externos.",
    }, null, 2));
  });

  test("B: placa 120 × 80 mm, cuatro perforaciones Ø20, copia, historial y DXF", async ({}, info) => {
    test.setTimeout(240_000);
    const id = await createBlank(page, "Placa sintética 120 × 80 mm");
    // Un documento recién creado guarda contenido null hasta el primer trazo.
    expect(
      (await readDocument(context, id)).cadDocument?.entities ?? [],
    ).toHaveLength(0);
    await layer(page, "Placa");
    await command(page, "RECTANG", "0,0", "120,80");
    await layer(page, "Perforaciones");
    await command(page, "CIRCLE", "20,20", "10");
    await command(page, "COPY", "U", "", "20,20", "100,20", "");
    await command(page, "CIRCLE", "20,60", "10");
    await command(page, "COPY", "U", "", "20,60", "100,60", "");
    await layer(page, "Cotas");
    await command(page, "DIMLINEAR", "0,0", "120,0", "60,-15");
    await command(page, "ZOOM", "E");
    await save(page);
    const original = await readDocument(context, id);
    expect(original.cadDocument.meta.unit).toBe("mm");
    const circles = original.cadDocument.entities.filter(
      (entity) => entity.type === "circle",
    );
    expect(circles).toHaveLength(4);
    const expected = [
      [20, 20],
      [100, 20],
      [20, 60],
      [100, 60],
    ];
    for (const [x, y] of expected) {
      const circle = circles.find(
        (entry) =>
          Math.abs(entry.center.x - x) < MODEL_TOLERANCE &&
          Math.abs(entry.center.y - y) < MODEL_TOLERANCE,
      );
      expect(circle, `perforación en ${x},${y}`).toBeDefined();
      expect(Math.abs(circle!.radius - 10)).toBeLessThan(MODEL_TOLERANCE);
    }
    await command(page, "MOVE", "TOdo", "", "0,0", "10,10");
    await command(page, "U");
    await command(page, "REDO");
    await command(page, "U");
    // SELECT comparte la designación por teclado con las herramientas que
    // reciben una preselección, incluida ROTATE.
    await command(page, "SELECT", "TOdo", "");
    await command(page, "ROTATE", "0,0", "90");
    await save(page);
    const rotated = (
      await readDocument(context, id)
    ).cadDocument.entities.filter((entity) => entity.type === "circle");
    expect(rotated).toHaveLength(4);
    for (const [x, y] of expected) {
      expect(
        rotated.some(
          (circle) =>
            Math.abs(circle.center.x + y) < MODEL_TOLERANCE &&
            Math.abs(circle.center.y - x) < MODEL_TOLERANCE &&
            Math.abs(circle.radius - 10) < MODEL_TOLERANCE,
        ),
      ).toBe(true);
    }
    await command(page, "U");
    await save(page);
    expect((await readDocument(context, id)).cadDocument.entities).toEqual(
      original.cadDocument.entities,
    );
    await page.goto("/dashboard");
    await page.goto(`/studio/${id}`);
    await expect(page.getByTestId("cad-command-input")).toBeVisible();
    expect((await readDocument(context, id)).cadDocument.entities).toEqual(
      original.cadDocument.entities,
    );
    await page.screenshot({ path: info.outputPath("placa-reabierta.png") });
    await page.getByTitle(/Exportar a DXF/iu).click();
    const losses = page.getByTestId("cad-dxf-loss-manifest");
    if (await losses.isVisible()) {
      await expect(losses).not.toHaveAttribute("data-blocking", "true");
      await info.attach("perdidas-declaradas-dxf", {
        body: await losses.innerText(),
        contentType: "text/plain",
      });
    }
    await page.screenshot({ path: info.outputPath("exportacion-dxf.png") });
    const downloading = page.waitForEvent("download");
    await page.getByTestId("cad-dxf-download").click();
    const download = await downloading;
    await download.saveAs(info.outputPath("placa-120x80.dxf"));
    await info.attach("documento-persistido", {
      body: JSON.stringify(original, null, 2),
      contentType: "application/json",
    });
    await writeFile(info.outputPath("documento-persistido.json"), JSON.stringify(original, null, 2));
    await page.goto("/dashboard");
    const roundtripName = `placa-intercambio-${run}`;
    await page.getByTestId("dashboard-import-input").setInputFiles({
      name: `${roundtripName}.dxf`,
      mimeType: "application/dxf",
      buffer: await readFile(info.outputPath("placa-120x80.dxf")),
    });
    await expect(page.getByRole("status").filter({ hasText: "Importado:" })).toBeVisible({ timeout: 90_000 });
    const list = await apiGet<{ items: Array<{ id: string; name: string }> }>(context, `/v1/cad/documents?q=${roundtripName}&limit=20`);
    const roundtripId = list.body.items.find((item) => item.name === roundtripName)?.id;
    expect(roundtripId).toBeTruthy();
    const roundtrip = (await readDocument(context, roundtripId!)).cadDocument;
    expect(roundtrip.meta.unit).toBe("mm");
    const roundtripCircles = roundtrip.entities.filter((entity) => entity.type === "circle");
    expect(roundtripCircles).toHaveLength(4);
    for (const [x, y] of expected) {
      const circle = roundtripCircles.find((entity) => Math.abs(entity.center.x - x) < MODEL_TOLERANCE && Math.abs(entity.center.y - y) < MODEL_TOLERANCE);
      expect(circle).toBeDefined();
      expect(Math.abs(circle!.radius - 10)).toBeLessThan(MODEL_TOLERANCE);
      expect(roundtrip.layers.find((entry) => entry.id === circle!.layer)?.name.toLowerCase()).toBe("perforaciones");
    }
    await page.screenshot({ path: info.outputPath("intercambio-dxf.png") });
    await info.attach("documento-reimportado", { body: JSON.stringify(roundtrip, null, 2), contentType: "application/json" });
    await writeFile(info.outputPath("documento-reimportado.json"), JSON.stringify(roundtrip, null, 2));
  });

  test("A: planta exterior 8000 × 6000, muros 150, vanos, A3 a 1:50 y PDF", async ({}, info) => {
    test.setTimeout(300_000);
    const id = await createBlank(page, "Planta sintética — no construir");
    await layer(page, "Muros");
    // Four centered axes offset 75 mm inward give the specified exterior envelope.
    await command(
      page,
      "WALL",
      "G",
      "150",
      "75,75",
      "7925,75",
      "7925,5925",
      "75,5925",
      "C",
    );
    await command(page, "ZOOM", "E");
    await layer(page, "Vanos");
    await command(page, "ZOOM", "0.75X");
    const door = await worldPoint(page, { x: 2000, y: 75 });
    await command(page, "DOOR");
    // La implementación se carga al primer uso: esperar el paso de designación
    // antes de clicar, igual que el dibujante espera el prompt de la orden.
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "Designe el muro donde alojar la puerta",
    );
    await page.mouse.click(door.x, door.y);
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
    await command(page, "ZOOM", "E");
    await command(page, "ZOOM", "0.75X");
    const window = await worldPoint(page, { x: 7925, y: 3000 });
    await command(page, "WINDOW");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "Designe el muro donde alojar la ventana",
    );
    await page.mouse.click(window.x, window.y);
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
    await layer(page, "Cotas");
    await command(page, "DIMLINEAR", "0,0", "8000,0", "4000,-800");
    // Calibration segment: its independent PDF measurement must be 160 ±0.1 mm.
    await command(page, "LINE", "0,-500", "8000,-500", "");
    await command(page, "DIMLINEAR", "75,75", "7925,75", "4000,650");
    await save(page);
    const original = await readDocument(context, id);
    expect(original.cadDocument.meta.unit).toBe("mm");
    const walls = original.cadDocument.entities.filter(
      (entry) => entry.type === "wall",
    );
    expect(walls).toHaveLength(4);
    for (const wall of walls) expect(wall.thickness).toBe(150);
    const endpoints = walls.flatMap((wall) => [wall.start, wall.end]);
    expect(Math.min(...endpoints.map((point) => point.x)) - 75).toBe(0);
    expect(Math.max(...endpoints.map((point) => point.x)) + 75).toBe(8000);
    expect(Math.min(...endpoints.map((point) => point.y)) - 75).toBe(0);
    expect(Math.max(...endpoints.map((point) => point.y)) + 75).toBe(6000);
    const openings = original.cadDocument.entities.filter(
      (entry) => entry.type === "opening",
    );
    expect(openings).toHaveLength(2);
    expect(openings.find((entry) => entry.kind === "door")?.width).toBe(900);
    expect(openings.find((entry) => entry.kind === "window")?.width).toBe(1200);
    for (const opening of openings)
      expect(walls.map((wall) => wall.id)).toContain(opening.hostId);
    const south = walls.find((wall) => wall.start.x === 75 && wall.end.x === 7925 && wall.start.y === 75 && wall.end.y === 75)!;
    const dimension = original.cadDocument.entities.find(
      (entry) => entry.type === "dimension" && entry.references?.length === 2 && entry.references.every((reference) => reference.entityId === south.id),
    );
    expect(dimension?.type).toBe("dimension");
    if (dimension?.type !== "dimension") throw new Error("Falta cota asociada al muro sur");
    expect(dimension.associationStatus).toBe("associated");
    expect(dimension.references).toHaveLength(2);
    expect(dimension.b.x - dimension.a.x).toBe(7850);
    await abrirPanelDerecho(page);
    await page.getByTestId(`cad-native-entity-${south.id}`).click();
    await applyNativeProperty(page, "endX", "8125");
    await save(page);
    const changed = (await readDocument(context, id)).cadDocument;
    const changedDimension = changed.entities.find((entry) => entry.id === dimension.id);
    expect(changedDimension).toMatchObject({ associationStatus: "associated", b: { x: 8125 } });
    if (changedDimension?.type !== "dimension") throw new Error("La cota desapareció tras editar el muro");
    expect(changedDimension.b.x - changedDimension.a.x).toBe(8050);
    expect(changed.entities.filter((entry) => entry.type === "opening")).toEqual(openings);
    await command(page, "U");
    await save(page);
    expect((await readDocument(context, id)).cadDocument.entities).toEqual(original.cadDocument.entities);
    await page.goto("/dashboard");
    await page.goto(`/studio/${id}`);
    await expect(page.getByTestId("cad-command-input")).toBeVisible();
    expect((await readDocument(context, id)).cadDocument.entities).toEqual(
      original.cadDocument.entities,
    );
    await command(page, "LO", "N", "Muestra sintetica");
    await command(
      page,
      "MV",
      "ESC",
      "layout:muestra-sintetica:viewport:1",
      "1:50",
    );
    await command(page, "PSET", "P", "A3");
    await save(page);
    const published = await readDocument(context, id);
    const layout = published.cadDocument.paperSpaces.find(
      (entry) => entry.name === "Muestra sintetica",
    );
    expect(layout?.pageSetup?.paper).toBe("A3");
    expect(layout?.viewports?.[0].scale).toBe(50);
    await page.screenshot({ path: info.outputPath("planta-a3.png") });
    const downloading = page.waitForEvent("download", { timeout: 60_000 });
    await command(page, "PLOT", "T", "muestra-sintetica");
    await (
      await downloading
    ).saveAs(info.outputPath("planta-sintetica-a3-1-50.pdf"));
    await info.attach("documento-persistido", {
      body: JSON.stringify(published, null, 2),
      contentType: "application/json",
    });
    await writeFile(info.outputPath("documento-persistido.json"), JSON.stringify(published, null, 2));
  });
});
