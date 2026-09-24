import { expect, test } from "@playwright/test";

test("cuatro muros cerrados muestran aproximadamente 12 m² dentro del cuarto y al abrirlo el rótulo desaparece", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 769 });
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("valle:cad:ui-mode:v1"));
  await page.goto("/demo");
  const canvas = page.getByTestId("cad-canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("cad-scale-bar")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();

  const { widthPx, meters } = await page.getByTestId("cad-scale-bar").evaluate((bar) => {
    const line = bar.querySelector(":scope > div > div") as HTMLElement;
    const label = bar.querySelector("span")?.textContent?.trim() ?? "";
    const match = label.match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/i);
    if (!line || !match) throw new Error(`La regla visible no se pudo leer: ${label}`);
    const factor = match[2] === "mm" ? 0.001 : match[2] === "cm" ? 0.01 : 1;
    return { widthPx: line.getBoundingClientRect().width, meters: Number(match[1].replace(",", ".")) * factor };
  });
  const box = (await canvas.boundingBox())!;
  const width = 4 * widthPx / meters;
  const height = 3 * widthPx / meters;
  const x = box.x + 190;
  const y = box.y + 166;
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];

  await page.getByRole("button", { name: "Muro", exact: true }).click();
  for (const [cx, cy] of corners) {
    await page.mouse.move(cx, cy);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("Enter");

  const overlay = page.getByTestId("cad-room-area-overlay");
  const newRoom = overlay.locator(":scope > div").filter({ has: page.getByText(/^Cuarto \d+$/) }).first();
  await expect(newRoom, "el cuarto se mide dentro del propio plano, sin abrir propiedades").toBeVisible({ timeout: 15_000 });
  const area = newRoom.getByText(/^\d+[.,]\d{2} m²$/);
  await expect(area).toBeVisible();
  const squareMeters = Number((await area.textContent())!.replace(" m²", "").replace(",", "."));
  expect(squareMeters).toBeGreaterThanOrEqual(11.5);
  expect(squareMeters).toBeLessThanOrEqual(12.5);
  const label = (await area.boundingBox())!;
  const middle = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  expect(middle.x).toBeGreaterThan(x);
  expect(middle.x).toBeLessThan(x + width);
  expect(middle.y).toBeGreaterThan(y);
  expect(middle.y).toBeLessThan(y + height);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, middle))
    .toBe("CANVAS");

  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(newRoom, "al abrir el cuarto ya no se declara una superficie cerrada").toHaveCount(0);
});
