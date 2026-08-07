/**
 * Redimensionar la planta no llegaba a lo guardado.
 *
 * EL DEFECTO. La huella —ancho, largo y paso de rejilla— es de donde el editor
 * saca el lienzo al abrir: el adaptador heredado la lee de
 * `meta.footprintW/footprintH/gridSize` y de ningún otro sitio. Pero al
 * guardar, `replaceEditorProjection` reconstruye `meta` desde el documento BASE
 * y sólo dejaba pasar `unit`, así que la huella del documento cargado se
 * reimponía sobre cualquier cambio. La nueva sólo viajaba en el payload de
 * `saveLegacy`, que NO corre cuando hay `documentId` — o sea, nunca en el
 * estudio moderno.
 *
 * Lo que el usuario veía: cambiaba el tamaño de la planta, el dibujo se marcaba
 * como modificado, el guardado respondía 200, y al recargar la planta volvía a
 * su tamaño anterior.
 *
 * Y un segundo agujero del mismo cambio: `applyFootprint` sólo llamaba a
 * `markDirty`, sin punto de historial, así que deshacer no lo alcanzaba.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

function canonicalDocument(): CadDocument {
  return {
    meta: {
      version: 1,
      schema: 3,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      {
        id: "planta-line",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 5_000, y: 1_000, z: 0 },
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["planta-line"] },
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

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

const viewPanel = (page: Page) => page.getByTitle(/Vista, capas/);

test("redimensionar la planta llega al documento canónico, entra en el historial y sobrevive a recargar", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-planta-line")).toBeVisible();
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");

  await viewPanel(page).click();
  await expect(page.getByTestId("cad-footprint-w")).toHaveValue("12000");
  await expect(page.getByTestId("cad-footprint-h")).toHaveValue("10000");
  await expect(page.getByTestId("cad-footprint-grid")).toHaveValue("100");

  await page.getByTestId("cad-footprint-w").fill("30000");
  await page.getByTestId("cad-footprint-h").fill("18000");
  await page.getByTestId("cad-footprint-grid").fill("250");
  await page.getByTestId("cad-footprint-apply").click();
  await expect(page.getByTestId("cad-save-status")).toHaveText(/Modificado/);

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(0);
  const saved = backend.snapshot().document.meta;
  expect(
    saved.footprintW,
    "el ancho nuevo tiene que estar en lo que el servidor guardó: era exactamente el defecto",
  ).toBe(30_000);
  expect(saved.footprintH).toBe(18_000);
  expect(saved.gridSize).toBe(250);
  // Y no se llevó por delante el contenido.
  expect(backend.snapshot().document.entities).toHaveLength(1);

  // Al reabrir, el lienzo es el nuevo — que es todo el sentido de guardarlo.
  await page.reload();
  await expect(page.getByTestId("cad-native-entity-planta-line")).toBeVisible();
  await viewPanel(page).click();
  await expect(page.getByTestId("cad-footprint-w")).toHaveValue("30000");
  await expect(page.getByTestId("cad-footprint-h")).toHaveValue("18000");
  await expect(page.getByTestId("cad-footprint-grid")).toHaveValue("250");
});

test("deshacer devuelve la huella anterior, y rehacer la vuelve a aplicar", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-planta-line")).toBeVisible();

  await viewPanel(page).click();
  await page.getByTestId("cad-footprint-w").fill("30000");
  await page.getByTestId("cad-footprint-grid").fill("250");
  await page.getByTestId("cad-footprint-apply").click();

  // «Aplicar tamaño» cierra el panel de vista; hay que reabrirlo para leer.
  await viewPanel(page).click();
  await expect(page.getByTestId("cad-footprint-w")).toHaveValue("30000");
  await expect(page.getByTestId("cad-footprint-grid")).toHaveValue("250");

  await page.keyboard.press("Control+z");
  await expect(
    page.getByTestId("cad-footprint-w"),
    "deshacer tiene que devolver la huella: sin punto de historial no había nada que deshacer, y sin leerla de vuelta del documento el checkpoint no devolvía nada",
  ).toHaveValue("12000");
  await expect(page.getByTestId("cad-footprint-grid")).toHaveValue("100");

  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("cad-footprint-w")).toHaveValue("30000");
  await expect(page.getByTestId("cad-footprint-grid")).toHaveValue("250");
});
