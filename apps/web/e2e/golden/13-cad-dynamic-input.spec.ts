/*
 * NOTA DE LA CAMPAÑA DE DISEÑO (2026-08-21) — por qué cambió una aserción.
 *
 * Este spec afirmaba `getByText(/0 equipos/)` VISIBLE. La afirmación de
 * fondo es buena y sigue intacta: dibujar geometría canónica no debe crear
 * un objeto HEREDADO por la puerta de atrás. Lo que cambió es su prueba.
 *
 * «N estaciones · N equipos» era vocabulario del producto industrial del
 * que salió este editor, pintado en la barra superior que ve un arquitecto.
 * La ola 5 lo sacó de la vista del cliente — pero NO del DOM: vive en el
 * bloque de diagnóstico con `data-testid="cad-legacy-asset-count"`.
 *
 * La aserción nueva es MÁS precisa que la anterior: apunta a un gancho
 * estable en vez de a una expresión regular sobre el texto de la página.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';

// MIGRACIÓN R3: mock en la superficie v1 real. Documento nunca guardado
// (cadDocument null, versión 0): el editor arranca en el lienzo por defecto —
// misma semántica que el layout vacío del origen (la huella de un documento
// null es la DEFAULT del dominio; este spec no depende de ella).
async function installCadBackend(context: BrowserContext) {
  const { snapshot } = await installCadV1Backend(context, { document: null });
  return {
    snapshot: () =>
      snapshot() as unknown as { document: CadDocument | null; version: number },
  };
}

test('dynamic input creates a circle by absolute center and locked diameter', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await page.getByRole('button', { name: 'Círculo', exact: true }).click();
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

  // PRIORIDAD 2 — esto afirmaba `/1 equipos/`: la herramienta CIRCLE creaba un
  // asset HEREDADO (una zona con `shape: 'circle'`) y el spec fijaba ese
  // defecto. Un círculo dibujado hoy es una entidad canónica, así que el
  // contador de equipo NO debe moverse y la geometría debe existir de verdad.
  await expect(page.getByTestId('cad-legacy-asset-count')).toContainText(
    '0 heredados',
  );
  // La transacción canónica deja la entidad SELECCIONADA, así que el panel de
  // propiedades ya describe el círculo recién dibujado sin tocar nada más.
  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('CIRCLE');
  await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('125');
  await expect(page.getByTestId('cad-native-property-diameter')).toHaveValue('250');
  await expect(page.getByTestId('cad-native-property-centerX')).toHaveValue('4000');
  await expect(page.getByTestId('cad-native-property-centerY')).toHaveValue('3000');

  // …y sobrevive al guardado como CÍRCULO canónico, sin rastro heredado.
  await saveAndSettle(page, backend as unknown as { snapshot(): { version: number } });
  const stored = backend.snapshot().document!;
  const circles = stored.entities.filter(
    (entity): entity is Extract<CadEntity, { type: 'circle' }> => entity.type === 'circle',
  );
  expect(circles).toHaveLength(1);
  expect(circles[0].radius).toBeCloseTo(125, 3);
  expect(circles[0].center).toMatchObject({ x: 4_000, y: 3_000, z: 0 });
  expect((circles[0] as { legacy?: unknown }).legacy).toBeUndefined();
  expect(stored.modelSpace.entityIds).toContain(circles[0].id);

  await expect(page.getByText('POLAR 45° · F10')).toBeVisible();
  await page.keyboard.press('F10');
  await expect(page.getByText('POLAR off · F10')).toBeVisible();
  await page.keyboard.press('F11');
  await expect(page.getByText('OTRACK off · F11')).toBeVisible();
});
