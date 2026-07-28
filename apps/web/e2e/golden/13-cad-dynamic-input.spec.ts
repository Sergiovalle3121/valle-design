import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { loginAsMaster } from '../fixtures/session';
import { API_ORIGIN } from '../fixtures/constants';

async function installCadBackend(context: BrowserContext) {
  await context.route(`${API_ORIGIN}/line-engineering/layout**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/line-engineering/layout' || route.request().method() !== 'GET')
      return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'AXOS-CAD-STUDIO', revision: 'UNIVERSAL',
        footprint: { footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100 },
        stations: [], dxf: null, connectors: [], assets: [], annotations: [], cells: [], layers: [],
        cadDocument: null, cadDocumentVersion: 0,
        approval: { status: 'draft', by: null, at: null, note: null },
      }),
    });
  });
}

test('dynamic input creates a circle by absolute center and locked diameter', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsMaster(context);
  await installCadBackend(context);
  await page.goto('/dashboard/cad');

  await page.getByRole('button', { name: 'Circle', exact: true }).click();
  const dynamic = page.getByTestId('cad-dynamic-input');
  await expect(dynamic).toBeVisible();
  const x = page.getByTestId('cad-dynamic-field-x');
  const y = page.getByTestId('cad-dynamic-field-y');
  await x.fill('4000');
  await x.press('Tab');
  await expect(y).toBeFocused();
  await y.fill('3000');
  await dynamic.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page.getByTestId('cad-dynamic-field-radius')).toBeVisible();
  await dynamic.getByRole('button', { name: 'Ø' }).click();
  const diameter = page.getByTestId('cad-dynamic-field-diameter');
  await diameter.fill('250mm');
  await dynamic.getByRole('button', { name: 'Bloquear Diámetro' }).click();
  await expect(dynamic.getByRole('button', { name: 'Desbloquear Diámetro' })).toHaveAttribute('aria-pressed', 'true');
  await dynamic.getByRole('button', { name: 'Aplicar' }).click();

  await expect(dynamic).toBeHidden();
  await expect(page.getByText(/1 equipos/)).toBeVisible();
  await expect(page.getByText('POLAR 45° · F10')).toBeVisible();
  await page.keyboard.press('F10');
  await expect(page.getByText('POLAR off · F10')).toBeVisible();
  await page.keyboard.press('F11');
  await expect(page.getByText('OTRACK off · F11')).toBeVisible();
});
