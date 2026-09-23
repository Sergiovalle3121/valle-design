import { expect, test } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { fitFootprint } from "../fixtures/camera-preset";
import { migrateCadDocument, type CadDocument, type CadWallEntity } from "../../src/lib/cad/cad-document";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadWallEntity => ({
  id, type: "wall", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 },
  thickness: 200, height: 2400, layer: "MURO",
});

test("un cuarto cerrado se renombra en el plano y reabre como espacio persistido sin rectángulo falso", async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const seed = migrateCadDocument({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MURO", name: "Muros", color: "#94a3b8", visible: true, locked: false },
    ],
    entities: [
      wall("sur", 2000, 2000, 6000, 2000), wall("este", 6000, 2000, 6000, 5000),
      wall("norte", 6000, 5000, 2000, 5000), wall("oeste", 2000, 5000, 2000, 2000),
    ],
  }) as CadDocument;
  const backend = await installCadStudioBackend<CadDocument>(context, seed, {
    footprintW: 10_000, footprintH: 8_000, unit: "mm", gridSize: 100,
  });

  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await fitFootprint(page);

  const overlay = page.getByTestId("cad-room-area-overlay");
  await expect(overlay.getByText("Cuarto 1", { exact: true })).toBeVisible();
  await overlay.getByText("Cuarto 1", { exact: true }).dblclick();
  await page.getByTestId("cad-room-name-input").fill("Estudio");
  await page.getByTestId("cad-room-name-input").press("Enter");
  await expect(overlay.getByText("Estudio", { exact: true })).toBeVisible();
  await expect(overlay.getByText("12.00 m²")).toBeVisible();

  await page.getByRole("button", { name: /^Deshacer/ }).click();
  await expect(overlay.getByText("Cuarto 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Rehacer/ }).click();
  await expect(overlay.getByText("Estudio", { exact: true })).toBeVisible();

  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  const space = stored.entities.find((entity) =>
    entity.type === "box" && entity.kind === "room" && entity.label === "Estudio");
  expect(space?.type).toBe("box");
  if (space?.type === "box") {
    expect(space.w * space.h).toBe(0);
    expect(space.context?.metadata?.roomSpaceAnchor).toBe(true);
  }

  await page.reload();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await fitFootprint(page);
  await expect(page.getByTestId("cad-room-area-overlay").getByText("Estudio", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cad-room-area-overlay").getByText("12.00 m²")).toBeVisible();
});
