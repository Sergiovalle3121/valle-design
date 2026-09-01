import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { worldPoint } from "../fixtures/world-point";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { fitFootprint } from "../fixtures/camera-preset";

/**
 * "Verificador de píxeles, no de botones" (campaña Paridad, OLA 0.2).
 *
 * Hasta hoy la única prueba de que el 3D "se construyó" era una lista de
 * botones (`cad-native-entity-*`) rellenada desde el JSON del documento, con
 * cero relación con si `CadNativeMassHosts` llegó a montar una sola malla en
 * la escena Three.js. Un muro cuya capa está apagada o congelada seguía
 * apareciendo como botón — porque la lista nunca miró la capa — mientras la
 * escena 3D real no dibujaba nada. Ese hueco es exactamente el que este
 * golden cierra: `cad-3d-solid-diagnostics` (`Cad3DSolidDiagnostics.tsx`,
 * alimentado por `CadNativeMassHosts.getSnapshot()`, que recorre la escena
 * Three.js de verdad) debe decir CERO cuando no hay malla, aunque el botón
 * heredado siga ahí.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
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
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

async function settlePlanView(page: Page) {
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await fitFootprint(page);
}

test("3D real: la malla del muro se cuenta, y el botón deja de mentir cuando la capa está congelada", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await settlePlanView(page);

  await type(page, "WA");
  const start = await worldPoint(page, { x: 2_000, y: 2_000 });
  await page.mouse.click(start.x, start.y);
  const end = await worldPoint(page, { x: 8_000, y: 2_000 });
  await page.mouse.click(end.x, end.y);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");

  const diagnostics = page.getByTestId("cad-3d-solid-diagnostics");

  await test.step("con la capa viva: malla real, no cero", async () => {
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.getByTestId("cad-render-pipeline")).toHaveAttribute(
      "data-settled",
      "true",
      { timeout: 30_000 },
    );
    await expect(diagnostics).toHaveAttribute("data-mesh-count", "1", {
      timeout: 15_000,
    });
    const vertexCount = Number(
      await diagnostics.getAttribute("data-vertex-count"),
    );
    expect(vertexCount).toBeGreaterThan(0);
    // El botón heredado también está — no se reemplaza, se le agrega evidencia real al lado.
    await expect(
      page.getByTestId("cad-native-entity-list").getByRole("button"),
    ).toHaveCount(1);
  });

  await test.step("capa congelada: el botón podría seguir existiendo, la malla real dice cero", async () => {
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.getByTitle(/Vista, capas/).click();
    await page.getByTestId("cad-layer-new-name").fill("TEMP");
    await page.getByTestId("cad-layer-create").click();
    await expect(page.getByTestId("cad-layer-row-TEMP")).toBeVisible();
    await page.getByTestId("cad-layer-active-TEMP").click();
    await page.getByTestId("cad-layer-frozen-0").click();

    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(diagnostics).toHaveAttribute("data-mesh-count", "0", {
      timeout: 15_000,
    });
  });
});
