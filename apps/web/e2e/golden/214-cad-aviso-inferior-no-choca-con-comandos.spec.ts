import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * La chuleta permanente formaba una columna de letras por su contención
 * inline-size. Se retira del plano: la ayuda del comando sigue en la línea
 * acoplada, que debe quedar fuera del rectángulo de dibujo también al usarla.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

test("el lienzo no tiene chuleta permanente y el comando guía desde su fila a 1280×720", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);

  const canvas = page.getByTestId("cad-canvas");
  const cmdline = page.getByTestId("cad-command-line");

  await expect(cmdline).toBeVisible();
  await expect(page.getByTestId("cad-viewport-hint")).toHaveCount(0);
  const input = page.getByTestId("cad-command-input");
  await input.fill("LINE");
  await input.press("Enter");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(/punto/i);
  const canvasRect = await canvas.boundingBox();
  const cmdRect = await cmdline.boundingBox();
  expect(canvasRect, "el lienzo tiene caja").not.toBeNull();
  expect(cmdRect, "la línea de comandos no tiene caja").not.toBeNull();
  expect(
    cmdRect!.y,
    "la guía de comandos queda debajo del dibujo",
  ).toBeGreaterThanOrEqual(canvasRect!.y + canvasRect!.height);
});
