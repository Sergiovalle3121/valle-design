import { expect, test } from "@playwright/test";

const ROOM_NAMES = [
  "SALA", "COMEDOR", "COCINA", "RECÁMARA PRINCIPAL", "RECÁMARA 2", "BAÑO",
] as const;

test("Esencial muestra seis nombres y m² sin etiquetas montadas en el plano demo", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 769 });
  await page.goto("/demo?cadUi=esencial");
  await expect(page.getByTestId("cad-essential-bar")).toBeVisible({ timeout: 60_000 });
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.count()) await skip.click();

  const badges = page.getByTestId("cad-room-area-overlay").locator(":scope > div");
  await expect(badges).toHaveCount(6);
  for (const name of ROOM_NAMES) {
    const label = badges.filter({ has: page.getByText(name, { exact: true }) });
    await expect(label, `falta el nombre visible ${name}`).toHaveCount(1);
    await expect(label.getByText(/^\d+[.,]\d{2} m²$/)).toBeVisible();
  }
  const overlap = await badges.evaluateAll((nodes) => {
    const rects = nodes.map((node) => node.getBoundingClientRect());
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
      if (Math.min(rects[i].right, rects[j].right) > Math.max(rects[i].left, rects[j].left) &&
          Math.min(rects[i].bottom, rects[j].bottom) > Math.max(rects[i].top, rects[j].top))
        return `${i + 1} con ${j + 1}`;
    }
    return null;
  });
  expect(overlap, "ningún nombre o área tapa el de otro cuarto").toBeNull();
  await testInfo.attach("esencial-room-labels-1440.png", { body: await page.screenshot(), contentType: "image/png" });
});

test("Pro conserva los rótulos del dibujo y sus badges de área", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 769 });
  await page.goto("/demo?cadUi=pro");
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  const badges = page.getByTestId("cad-room-area-overlay").locator(":scope > div");
  await expect(badges).toHaveCount(6);
  await expect(badges.getByText("RECÁMARA PRINCIPAL", { exact: true })).toHaveCount(0);
  await expect(badges.getByText(/^\d+[.,]\d{2} m²$/)).toHaveCount(6);
});
