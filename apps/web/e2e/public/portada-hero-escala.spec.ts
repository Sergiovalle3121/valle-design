import { test, expect } from "@playwright/test";

/*
 * P04 — El hero ocupa >= 36 % del viewport en escritorio.
 *
 * Medido ANTES (layout de dos columnas): 608 × 473 = 22,2 %.
 * AHORA (layout de una columna, max-w-6xl): el ProductFrame toma el ancho
 * completo del contenedor, así que el área supera el 36 % sin cambios de CSS.
 * Este spec fija la medida para que no vuelva a encogerse.
 */

test("a 1440x900 el hero figure ocupa >= 36 % del viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const figure = page.locator('[data-testid="hero-figure"]');
  await expect(figure).toBeVisible();

  const box = await figure.boundingBox();
  expect(box).toBeTruthy();
  const area = box!.width * box!.height;
  const viewportArea = 1440 * 900;
  const pct = (area / viewportArea) * 100;

  expect(
    pct,
    `hero figure area ${pct.toFixed(1)} % (before: 22.2 %) must be >= 36 %`,
  ).toBeGreaterThanOrEqual(36);
});

test("a 1440x900 el h1 del hero no pasa de 4 líneas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const h1 = page.locator("#hero-title");
  await expect(h1).toBeVisible();

  const lineHeight = await h1.evaluate((el) =>
    parseFloat(getComputedStyle(el).lineHeight),
  );
  const height = await h1.evaluate((el) => el.getBoundingClientRect().height);
  const lines = Math.round(height / lineHeight);

  expect(lines, `h1 renders ${lines} lines, max 4`).toBeLessThanOrEqual(4);
});

test("a 1440x900 no hay scroll horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBe(1440);
});

test("a 390x844 no hay scroll horizontal (halo recortado)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBe(390);
});
