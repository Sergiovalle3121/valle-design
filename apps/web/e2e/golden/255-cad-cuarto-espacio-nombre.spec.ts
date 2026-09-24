import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { migrateCadDocument, type CadDocument, type CadWallEntity } from "../../src/lib/cad/cad-document";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadWallEntity => ({
  id, type: "wall", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 },
  thickness: 200, height: 2400, layer: "MURO",
});

test("Esencial renombra un cuarto de plantilla, guarda y reabre nombre+m² sin rótulo original duplicado", async ({ context, page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 769 });
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
      { id: "sala-asset", type: "box", kind: "room", x: 3900, y: 3400, w: 200, h: 200,
        rotation: 0, layer: "0", shape: "rect", label: "SALA" },
      { id: "sala-text", type: "text", x: 4000, y: 3500, text: "SALA",
        height: 250, layer: "0" },
    ],
  }) as CadDocument;
  const backend = await installCadStudioBackend<CadDocument>(context, seed, {
    footprintW: 10_000, footprintH: 8_000, unit: "mm", gridSize: 100,
  });

  await page.goto("/legacy/studio?cadUi=esencial");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole("button", { name: "Encuadrar todo" }).click();

  const overlay = page.getByTestId("cad-room-area-overlay");
  await expect(overlay.getByText("SALA", { exact: true })).toBeVisible();
  await expect(overlay.getByRole("button", { name: "Renombrar este cuarto" })).toHaveCount(0);
  await page.getByTestId("cad-ui-mode-switch").click();
  await expect(overlay.getByRole("button", { name: "Renombrar este cuarto" })).toBeVisible();
  await page.getByTestId("cad-ui-mode-switch").click();
  await expect(overlay.getByText("SALA", { exact: true })).toBeVisible();
  await overlay.getByText("SALA", { exact: true }).dblclick();
  await page.getByTestId("cad-room-name-input").fill("Recámara");
  await page.getByTestId("cad-room-name-input").press("Enter");
  await expect(overlay.getByText("Recámara", { exact: true })).toBeVisible();
  await expect(overlay.getByText("12.00 m²")).toBeVisible();

  await page.getByRole("button", { name: /^Deshacer/ }).click();
  await expect(overlay.getByText("SALA", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Rehacer/ }).click();
  await expect(overlay.getByText("Recámara", { exact: true })).toBeVisible();

  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  const space = stored.entities.find((entity) =>
    entity.type === "box" && entity.kind === "room" && entity.label === "Recámara");
  expect(space?.type).toBe("box");
  if (space?.type === "box") {
    expect(space.w * space.h).toBe(0);
    expect(space.context?.metadata?.roomSpaceAnchor).toBe(true);
  }
  const originalBox = stored.entities.find((entity) => entity.id === "sala-asset");
  const originalText = stored.entities.find((entity) => entity.id === "sala-text");
  expect(originalBox?.type === "box" ? originalBox.label : null).toBe("SALA");
  expect(originalText?.type === "text" ? originalText.text : null).toBe("SALA");

  await page.reload();
  await page.getByRole("button", { name: "Encuadrar todo" }).click();
  await expect(page.getByTestId("cad-room-area-overlay").getByText("Recámara", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cad-room-area-overlay").getByText("12.00 m²")).toBeVisible();
  const badge = page.getByTestId("cad-room-area-overlay").locator(":scope > div").first();
  const rect = await badge.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) return;
  const screenshot = await page.screenshot();
  const left = Math.max(0, Math.floor(rect.x - 20));
  const top = Math.max(0, Math.floor(rect.y - 20));
  const { data, info } = await sharp(screenshot).extract({
    left, top,
    width: Math.min(1440 - left, Math.ceil(rect.x + rect.width + 20 - left)),
    height: Math.min(769 - top, Math.ceil(rect.y + rect.height + 20 - top)),
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let yellowTextPixels = 0;
  for (let p = 0; p < data.length; p += info.channels) {
    if (data[p] > 225 && data[p + 1] > 170 && data[p + 2] < 180) yellowTextPixels += 1;
  }
  expect(yellowTextPixels, "TEXT y sprite SALA antiguos no asoman detrás de Recámara").toBeLessThan(40);
  await testInfo.attach("recamara-esencial-1440.png", { body: screenshot, contentType: "image/png" });
});
