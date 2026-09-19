/**
 * Golden 215 — la barra superior cabe en el viewport.
 *
 * Guardar, el selector de estado y el cierre del editor deben ser visibles
 * y estar enteramente dentro del viewport en tres tamaños representativos.
 * La banda de iconos sigue desplazándose horizontalmente.
 */
import { test, expect } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`barra superior dentro del viewport a ${vp.width}x${vp.height}`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize(vp);
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);

    await page.goto("/studio/mock-doc");

    // Saltar recorrido guiado si aparece
    const skipBtn = page.getByRole("button", { name: /saltar|skip/i });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

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
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);

  await page.goto("/studio/mock-doc");

  const skipBtn = page.getByRole("button", { name: /saltar|skip/i });
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click();
  }

  const toolbar = page.getByTestId("cad-top-toolbar");
  await expect(toolbar).toBeVisible();

  // La banda de iconos (primer hijo del toolbar) debe ser scrollable
  const iconBand = toolbar.locator("> div").first();
  const scrollWidth = await iconBand.evaluate((el) => el.scrollWidth);
  const clientWidth = await iconBand.evaluate((el) => el.clientWidth);
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});
