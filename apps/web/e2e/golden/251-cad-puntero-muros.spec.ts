import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function changedPixels(before: Buffer, after: Buffer): Promise<number> {
  const a = await sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([a.info.width, a.info.height]).toEqual([b.info.width, b.info.height]);
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 3) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]) >= 30) changed += 1;
  }
  return changed;
}

async function openDemo(page: Page) {
  await page.setViewportSize({ width: 1440, height: 769 });
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('valle:cad:ui-mode:v1'));
  await page.goto('/demo');
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByRole('button', { name: 'Muro', exact: true })).toBeVisible();
}

async function points(page: Page) {
  const box = await page.getByTestId('cad-canvas').boundingBox();
  if (!box) throw new Error('El lienzo no tiene caja');
  const x = box.x + box.width * 0.28;
  const y = box.y + box.height * 0.34;
  return [
    { x, y }, { x: x + 190, y }, { x: x + 190, y: y + 145 },
    { x, y: y + 145 }, { x, y },
  ];
}

async function wallCount(page: Page): Promise<number> {
  const value = await page.getByTestId('cad-native-document-count').textContent();
  return Number(value?.match(/\d+/)?.[0] ?? -1);
}

test('Muro acepta cinco clics directos sin mover el ratón entre ellos y cierra cuatro tramos', async ({ page }) => {
  test.setTimeout(150_000);
  await openDemo(page);
  const corners = await points(page);
  const before = await wallCount(page);
  const canvas = page.getByTestId('cad-canvas');
  const boxBefore = await canvas.boundingBox();
  const coordinates: { x: number; y: number }[] = [];
  const pixels: Buffer[] = [];
  await page.getByRole('button', { name: 'Muro', exact: true }).click();
  for (const point of corners) {
    await page.mouse.click(point.x, point.y);
    if (pixels.length < 2) {
      await page.waitForTimeout(250);
      pixels.push(await canvas.locator('canvas').first().screenshot());
    }
    const hud = page.getByTestId('cad-cursor-coordinate');
    const x = await hud.getAttribute('data-x');
    const y = await hud.getAttribute('data-y');
    expect(x).not.toBeNull();
    expect(y).not.toBeNull();
    expect(x).not.toBe('');
    expect(y).not.toBe('');
    coordinates.push({
      x: Number(x),
      y: Number(y),
    });
    expect(await canvas.boundingBox(), 'el lienzo conserva su posición y tamaño tras cada punto').toEqual(boxBefore);
  }
  expect(coordinates[4].x, 'el mismo píxel de pantalla sigue dando la misma X tras cuatro tramos')
    .toBeCloseTo(coordinates[0].x, 0);
  expect(coordinates[4].y, 'el mismo píxel de pantalla sigue dando la misma Y tras cuatro tramos')
    .toBeCloseTo(coordinates[0].y, 0);
  expect(coordinates[1].y, 'un clic horizontal no desplaza el origen Y').toBeCloseTo(coordinates[0].y, 0);
  expect(coordinates[2].x, 'un clic vertical no desplaza el origen X').toBeCloseTo(coordinates[1].x, 0);
  expect(coordinates[3].y, 'la segunda esquina horizontal conserva la escala Y').toBeCloseTo(coordinates[2].y, 0);
  expect(coordinates[4].x, 'la última esquina vertical conserva la escala X').toBeCloseTo(coordinates[3].x, 0);
  expect(await changedPixels(pixels[0], pixels[1]), 'el primer tramo se dibuja tras el segundo clic')
    .toBeGreaterThan(100);
  await page.keyboard.press('Enter');
  await expect.poll(() => wallCount(page)).toBe(before + 4);
  await expect(page.getByTestId('cad-selection-status-count'), 'los cuatro muros terminados quedan designados')
    .toHaveText('4 sel');
});

test('tras Esc y volver a elegir Muro los primeros dos clics forman un tramo', async ({ page }) => {
  test.setTimeout(150_000);
  await openDemo(page);
  const [first, second] = await points(page);
  const before = await wallCount(page);
  const muro = page.getByRole('button', { name: 'Muro', exact: true });
  await muro.click();
  await page.mouse.click(first.x, first.y);
  await page.keyboard.press('Escape');
  await muro.click();
  await page.mouse.click(first.x, first.y);
  await page.mouse.click(second.x, second.y);
  await page.keyboard.press('Enter');
  await expect.poll(() => wallCount(page)).toBe(before + 1);
});

test.describe('pantalla táctil', () => {
  test.use({ hasTouch: true });
  test('cinco toques sin hover forman cuatro muros', async ({ page }) => {
    test.setTimeout(150_000);
    await openDemo(page);
    const corners = await points(page);
    const before = await wallCount(page);
    const roomName = page.getByTestId('cad-room-name-hitbox').first();
    await expect(roomName).toHaveCSS('pointer-events', 'auto');
    await page.getByRole('button', { name: 'Muro', exact: true }).click();
    await expect(page.getByTestId('cad-essential-tool-wall')).toHaveAttribute('data-active', 'true');
    await expect(roomName).toHaveCSS('pointer-events', 'none');
    for (const point of corners) {
      await page.touchscreen.tap(point.x, point.y);
      await expect(page.getByTestId('cad-room-name-input')).toHaveCount(0);
    }
    await page.keyboard.press('Enter');
    await expect.poll(() => wallCount(page)).toBe(before + 4);
  });
});
