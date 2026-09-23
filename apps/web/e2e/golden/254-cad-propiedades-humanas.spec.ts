import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { abrirPanelDerecho } from '../fixtures/docks';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';

const point = (x: number, y: number) => ({ x, y, z: 0 });

function documentWith(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: 'Dibujo', color: '#ffffff', visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
}

async function openWith(context: BrowserContext, page: Page, entities: CadEntity[], mode: 'esencial' | 'pro') {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, documentWith(entities), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
  await page.goto(`/legacy/studio?cadUi=${mode}`);
  await expect(page.getByTestId('cad-canvas')).toBeVisible({ timeout: 60_000 });
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await abrirPanelDerecho(page);
}

const wall: CadEntity = {
  id: 'wall-a', type: 'wall', start: point(0, 0), end: point(4_000, 0),
  thickness: 200, height: 2_400, layer: '0',
};
const rectangle: CadEntity = {
  id: 'rect-a', type: 'polyline', closed: true, layer: '0',
  vertices: [point(0, 0), point(3_000, 0), point(3_000, 2_000), point(0, 2_000)],
};

test('Esencial enseña el muro en metros y guarda los campos crudos detrás de Detalles técnicos', async ({ context, page }, testInfo) => {
  test.setTimeout(150_000);
  await openWith(context, page, [wall], 'esencial');
  await page.getByTestId('cad-native-entity-wall-a').click();
  const human = page.getByTestId('cad-human-properties');
  await expect(human).toBeVisible();
  await expect(human).toContainText('Muro 1');
  await expect(human.getByTestId('cad-human-property-length')).toContainText('4.00 m');
  await expect(human.getByTestId('cad-human-property-thickness')).toContainText('0.20 m');
  await expect(human.getByTestId('cad-human-property-height')).toContainText('2.40 m');
  await expect(human.getByTestId('cad-human-property-layer')).toContainText('Dibujo');
  const visible = (await page.getByTestId('cad-native-properties').innerText()).replace(/\s+/g, ' ');
  expect(visible).not.toMatch(/startX|endY|\*VARIES\*|curvas nativas|Geometría canónica|Grips/i);
  await expect(page.getByTestId('cad-native-property-startX')).not.toBeVisible();
  await page.getByText('Detalles técnicos', { exact: true }).click();
  await expect(page.getByTestId('cad-native-property-startX')).toBeVisible();
  await page.getByTestId('cad-native-properties').screenshot({ path: testInfo.outputPath('propiedades-humanas-muro.png') });
});

test('Pro conserva la edición exacta de las coordenadas del muro', async ({ context, page }) => {
  test.setTimeout(150_000);
  await openWith(context, page, [wall], 'pro');
  await page.getByTestId('cad-native-entity-wall-a').click();
  await expect(page.getByTestId('cad-native-property-startX')).toBeVisible();
  await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('0');
  await expect(page.getByTestId('cad-human-properties')).toHaveCount(0);
});

test('Esencial llama Rectángulo al rectángulo de planta y muestra su área real', async ({ context, page }) => {
  test.setTimeout(150_000);
  await openWith(context, page, [rectangle], 'esencial');
  const row = page.getByTestId('cad-native-entity-rect-a');
  await expect(row).toContainText('Rectángulo 1');
  await row.click();
  const human = page.getByTestId('cad-human-properties');
  await expect(human).toContainText('Rectángulo 1');
  await expect(human.getByTestId('cad-human-property-width')).toContainText('3.00 m');
  await expect(human.getByTestId('cad-human-property-height')).toContainText('2.00 m');
  await expect(human.getByTestId('cad-human-property-area')).toContainText('6.00 m²');
});
