/**
 * Golden 215 — la barra superior cabe en el viewport.
 *
 * Guardar, el selector de estado y el cierre del editor deben ser visibles
 * y estar enteramente dentro del viewport en tres tamaños representativos.
 * La banda de iconos sigue desplazándose horizontalmente.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

/** Plano vacío: la barra superior no depende de lo que haya dibujado. */
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
  };
}

/**
 * Abre el estudio por la ruta HERMÉTICA de los goldens: `/legacy/studio`,
 * stubbeada en la frontera de red, resuelve el documento sembrado y redirige
 * a `/studio/<uuid>`. Ir directo a `/studio/mock-doc` no abre el editor:
 * `mock-doc` no es un UUID, la página se queda en «El identificador del
 * documento no es válido» y la barra superior nunca llega a montarse.
 */
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
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

for (const vp of VIEWPORTS) {
  test(`barra superior dentro del viewport a ${vp.width}x${vp.height}`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize(vp);
    await openStudio(context, page);

    // Esperar a que la barra superior exista
    const toolbar = page.getByTestId("cad-top-toolbar");
    await expect(toolbar).toBeVisible();

    // Los tres controles deben estar visibles y dentro del viewport
    const controls = [
      page.getByTestId("cad-save"),
      page.getByLabel("Estado de aprobación del plano"),
      page.getByTestId("cad-close-editor"),
    ];

    for (const control of controls) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    }
  });
}

test("la banda de iconos sigue desplazándose a 1280x720", async ({ context, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);

  const toolbar = page.getByTestId("cad-top-toolbar");
  await expect(toolbar).toBeVisible();
  // La cola fija completa (el selector de estado llega con el documento): se
  // mide la banda en reposo, no a medio montar.
  await expect(page.getByLabel("Estado de aprobación del plano")).toBeVisible();

  // La banda de iconos (primer hijo del toolbar) debe ser scrollable
  const iconBand = toolbar.locator("> div").first();
  const scrollWidth = await iconBand.evaluate((el) => el.scrollWidth);
  const clientWidth = await iconBand.evaluate((el) => el.clientWidth);
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});
