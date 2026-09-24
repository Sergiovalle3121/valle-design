import { expect, test, type Page } from "@playwright/test";
import { chooseDemoStart } from "../fixtures/demo-start";

async function startRoom(page: Page) {
  await page.setViewportSize({ width: 1440, height: 769 });
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("valle:cad:ui-mode:v1"));
  await page.goto("/demo");
  await chooseDemoStart(page);
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.count()) await skip.click();
  const scale = await page.getByTestId("cad-scale-bar").evaluate((bar) => {
    const line = bar.querySelector(":scope > div > div") as HTMLElement;
    const match = bar.querySelector("span")?.textContent?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/i);
    if (!line || !match) throw new Error("La regla del lienzo no está visible");
    const meters = Number(match[1].replace(",", ".")) * ({ mm: 0.001, cm: 0.01, m: 1 })[match[2].toLowerCase() as "mm" | "cm" | "m"];
    return line.getBoundingClientRect().width / meters;
  });
  const canvas = page.getByTestId("cad-canvas");
  const box = (await canvas.boundingBox())!;
  const x = box.x + 190;
  const y = box.y + 166;
  const width = 4 * scale;
  const height = 3 * scale;
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];
  await page.getByRole("button", { name: "Muro", exact: true }).click();
  for (const [px, py] of corners) {
    await page.mouse.move(px, py);
    await page.mouse.click(px, py);
    await page.waitForTimeout(250);
  }
  await page.keyboard.press("Enter");
  const roomLabel = page.getByTestId("cad-room-area-overlay").getByText(/^Cuarto \d+$/).first().locator("..");
  await expect(roomLabel.getByText(/^\d+[.,]\d{2} m²$/)).toBeVisible();
  const area = Number((await roomLabel.getByText(/^\d+[.,]\d{2} m²$/).textContent())!.replace(" m²", "").replace(",", "."));
  expect(area).toBeGreaterThanOrEqual(11.5);
  expect(area).toBeLessThanOrEqual(12.5);
  return { x, y, width, height };
}

test("la cantidad visible de puertas y ventanas sigue los huecos reales del plano", async ({ page }) => {
  test.setTimeout(150_000);
  const room = await startRoom(page);
  const counts = page.getByTestId("cad-opening-counts");
  const count = async (kind: "puerta" | "ventana") => {
    const match = (await counts.innerText()).match(new RegExp(`(\\d+)\\s+${kind}s?`));
    if (!match) throw new Error(`Falta el conteo visible de ${kind}`);
    return Number(match[1]);
  };
  const doorsBefore = await count("puerta");
  const windowsBefore = await count("ventana");

  await page.getByRole("button", { name: "Puerta", exact: true }).click();
  await page.mouse.move(room.x + room.width / 2, room.y);
  await page.mouse.click(room.x + room.width / 2, room.y);
  await expect.poll(() => count("puerta")).toBe(doorsBefore + 1);

  await page.getByRole("button", { name: "Ventana", exact: true }).click();
  await page.mouse.move(room.x + room.width, room.y + room.height / 2);
  await page.mouse.click(room.x + room.width, room.y + room.height / 2);
  await expect.poll(() => count("ventana")).toBe(windowsBefore + 1);
  expect(await count("puerta")).toBe(doorsBefore + 1);
});

test("la cota sobre un muro de cuatro metros tiene una medida legible en el lienzo", async ({ page }) => {
  test.setTimeout(150_000);
  const room = await startRoom(page);
  const labels = page.getByTestId("cad-dimension-label-overlay");
  await page.getByRole("button", { name: "Cota", exact: true }).click();
  for (const [px, py] of [[room.x, room.y], [room.x + room.width, room.y], [room.x + room.width / 2, room.y - 30]]) {
    await page.mouse.move(px, py);
    await page.mouse.click(px, py);
    await page.waitForTimeout(250);
  }
  await expect(labels.getByText(/4[.,]00 m/)).toBeVisible();
});
