import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

function seedDocument(): CadDocument {
  const entities: CadEntity[] = [
    {
      id: "muro-1",
      type: "box",
      kind: "wall",
      x: 1_000,
      y: 1_000,
      w: 3_600,
      h: 200,
      rotation: 0,
      layer: "0",
      shape: "rect",
      label: "Muro de prueba",
    },
  ];
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((e) => e.id) },
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

async function selectObjectsOfLayer(page: Page, layerId: string) {
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const row = page.getByTestId(`cad-layer-row-${layerId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Sel", exact: true }).click();
  await viewButton.click();
}

test("CadMaterialPalette wired: se ve, se puede clicar, y materialId sobrevive a guardar", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();

  await selectObjectsOfLayer(page, "0");

  const palette = page.getByTestId("cad-material-palette");
  await expect(palette).toBeVisible();
  await expect(page.getByTestId("cad-material-option-none")).toBeVisible();

  const brickOption = page.getByTestId("cad-material-option-brick-red");
  await expect(brickOption).toBeVisible();
  await brickOption.click();

  await expect(page.getByTestId("cad-save-status")).toHaveText(/Modificado/);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(0);

  const saved = backend.snapshot().document;
  const entity = saved.entities.find((e) => e.id === "muro-1");
  expect(entity && "materialId" in entity ? entity.materialId : undefined).toBe("brick-red");

  await page.getByTestId("cad-material-option-none").click();
  await expect(page.getByTestId("cad-save-status")).toHaveText(/Modificado/);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(1);
  const saved2 = backend.snapshot().document;
  const entity2 = saved2.entities.find((e) => e.id === "muro-1");
  expect(entity2 && "materialId" in entity2 ? entity2.materialId : undefined).toBeUndefined();

  console.log("OK: CadMaterialPalette renderiza, selecciona y persiste materialId end-to-end.");
});
