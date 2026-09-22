import { expect, type Page } from "@playwright/test";
import type { CadDocument } from "../src/lib/cad/cad-document";

/** Adapt the example through the same layer controls available to its reader. */
export async function removeUnusedExampleLayer(
  page: Page,
  snapshot: () => { document: Record<string, unknown> },
) {
  const read = () => snapshot().document as unknown as CadDocument;
  const save = async () => {
    await page.getByTestId("cad-save").click();
    await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", {
      timeout: 30_000,
    });
  };
  await save();
  const before = read();
  expect(before.layers.find((layer) => layer.id === "equipment")).toBeDefined();
  const references = [
    ...before.entities,
    ...before.blocks.flatMap((block) => block.entities),
    ...before.unsupportedEntities,
  ].filter((entity) => entity.layer === "equipment");
  expect(
    references,
    "La capa del ejemplo debe estar vacía antes de borrarla",
  ).toEqual([]);

  const toggle = page.getByTitle(/Vista, capas y plano/);
  await toggle.click();
  await expect(page.getByTestId("cad-layer-manager")).toBeVisible();
  await page.getByTestId("cad-layer-delete-equipment").click();
  await expect(page.getByTestId("cad-layer-row-equipment")).toHaveCount(0);
  await toggle.click();
  await expect(page.getByTestId("cad-layer-manager")).toBeHidden();
  await save();
  await expect
    .poll(() => read().layers.some((layer) => layer.id === "equipment"))
    .toBe(false);
  expect(read().entities).toEqual(before.entities);
  expect(read().blocks).toEqual(before.blocks);
  expect(read().unsupportedEntities).toEqual(before.unsupportedEntities);
  await expect(page.getByTestId("app-toast")).toHaveCount(0, { timeout: 10_000 });
}
