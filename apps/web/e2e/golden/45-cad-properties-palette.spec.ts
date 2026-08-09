/**
 * Paleta de PROPIEDADES con designación múltiple.
 *
 * Lo que se prueba es el DOCUMENTO, no el aspecto del panel: se designan
 * varios objetos, se escribe una propiedad común y se comprueba que TODOS
 * cambiaron, que fue UN paso de deshacer y que sobrevive al guardado y a la
 * recarga.
 *
 * Las precondiciones —que el campo sostenga lo tecleado— se reintentan con los
 * ayudantes de `e2e/fixtures/dynamic-input.ts`, escritos para paneles que se
 * remontan al llegar una respuesta de red. Las ASERCIONES no se reintentan.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { applyNativeProperty } from '../fixtures/dynamic-input';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';

type CadCircle = Extract<CadEntity, { type: 'circle' }>;
type CadArc = Extract<CadEntity, { type: 'arc' }>;

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false, linetype: 'CONTINUOUS', lineweight: -1, plot: true },
      { id: 'STRUCTURE', name: 'STRUCTURE', color: '#f97316', visible: true, locked: false, linetype: 'CONTINUOUS', lineweight: -1, plot: true },
    ],
    entities: [
      { id: 'multi-circle-a', type: 'circle', center: { x: 2_000, y: 2_000, z: 0 }, radius: 300, layer: '0' },
      { id: 'multi-circle-b', type: 'circle', center: { x: 5_000, y: 2_000, z: 0 }, radius: 700, layer: 'STRUCTURE' },
      { id: 'multi-arc', type: 'arc', center: { x: 8_000, y: 2_000, z: 0 }, radius: 500, startAngle: 0, endAngle: 180, layer: 'STRUCTURE' },
    ],
    history: [], modelSpace: { entityIds: ['multi-circle-a', 'multi-circle-b', 'multi-arc'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 8_000, unit: 'mm', gridSize: 100,
  });
}

/**
 * Designa por id con el panel de selección profesional. `add` acumula sobre lo
 * ya designado, que es la única forma de llegar a una designación múltiple sin
 * depender de un clic en el lienzo con coordenadas de píxel.
 */
async function select(
  page: import('@playwright/test').Page,
  ids: readonly string[],
) {
  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId('cad-quick-select-text');
  for (const [index, id] of ids.entries()) {
    if (index > 0) await page.getByTestId('cad-selection-operation-add').click();
    await query.fill(id);
    await page.getByTestId('cad-quick-select-apply').click();
  }
  await expect(page.getByTestId('cad-selection-count')).toHaveText(`${ids.length} seleccionados`);
  await page.getByLabel('Cerrar panel profesional').click();
}

test('la paleta de propiedades edita N objetos a la vez y marca lo que difiere', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-multi-circle-a')).toBeVisible();

  await test.step('un solo objeto: la paleta enseña todas sus propiedades', async () => {
    await page.getByTestId('cad-native-entity-multi-circle-a').click();
    await expect(page.getByTestId('cad-properties-palette')).toHaveAttribute('data-count', '1');
    await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('300');
    await expect(page.getByTestId('cad-native-property-diameter')).toHaveValue('600');
    // Las categorías no son decoración: separan la capa de la geometría.
    await expect(page.getByTestId('cad-properties-group-General')).toBeVisible();
    await expect(page.getByTestId('cad-properties-group-Geometría')).toBeVisible();
  });

  await test.step('dos círculos: lo común se edita, lo divergente se marca', async () => {
    await select(page, ['multi-circle-a', 'multi-circle-b']);
    await expect(page.getByTestId('cad-properties-palette')).toHaveAttribute('data-count', '2');
    // Misma y en los dos centros → valor común y editable.
    await expect(page.getByTestId('cad-native-property-centerY')).toHaveValue('2000');
    // Radios distintos → el campo va VACÍO y el marcador va de placeholder.
    const radius = page.getByTestId('cad-native-property-radius');
    await expect(radius).toHaveAttribute('data-varies', 'true');
    await expect(radius).toHaveValue('');
    await expect(radius).toHaveAttribute('placeholder', '*VARIES*');

    await applyNativeProperty(page, 'radius', '900');
    await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('900');
    await expect(page.getByTestId('cad-native-property-radius')).not.toHaveAttribute('data-varies', 'true');
  });

  await test.step('tres tipos: sólo se ofrece la INTERSECCIÓN', async () => {
    await select(page, ['multi-circle-a', 'multi-circle-b', 'multi-arc']);
    await expect(page.getByTestId('cad-properties-palette')).toHaveAttribute('data-count', '3');
    // Círculo y arco comparten centro y radio; `diameter` es sólo del círculo y
    // `startAngle` sólo del arco, así que ninguno se ofrece.
    await expect(page.getByTestId('cad-native-property-centerY')).toHaveValue('2000');
    await expect(page.getByTestId('cad-native-property-diameter')).toHaveCount(0);
    await expect(page.getByTestId('cad-native-property-startAngle')).toHaveCount(0);
    await expect(page.getByTestId('cad-native-property-layer')).toHaveAttribute('data-varies', 'true');

    await applyNativeProperty(page, 'layer', 'STRUCTURE');
    await expect(page.getByTestId('cad-native-property-layer')).toHaveValue('STRUCTURE');
  });

  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  const circleA = stored.entities.find((entity) => entity.id === 'multi-circle-a') as CadCircle;
  const circleB = stored.entities.find((entity) => entity.id === 'multi-circle-b') as CadCircle;
  const arc = stored.entities.find((entity) => entity.id === 'multi-arc') as CadArc;
  expect(circleA.radius).toBe(900);
  expect(circleB.radius).toBe(900);
  expect(arc.radius).toBe(500); // el arco no estaba designado cuando se cambió el radio
  expect([circleA.layer, circleB.layer, arc.layer]).toEqual(['STRUCTURE', 'STRUCTURE', 'STRUCTURE']);

  // UN lote, UN paso de deshacer: editar dos radios deja UNA entrada de
  // historia, no dos. Es la propiedad central del embudo de mutación.
  expect(stored.history.filter((entry) => entry.label === 'properties:2')).toHaveLength(1);
  expect(stored.history.filter((entry) => entry.label === 'properties:3')).toHaveLength(1);
  // Y no queda rastro de la vía antigua, que aplicaba los comandos de uno en
  // uno y dejaba una entrada por entidad.
  expect(stored.history.filter((entry) => entry.label === 'properties:circle')).toHaveLength(0);

  await page.reload();
  await page.getByTestId('cad-native-entity-multi-circle-b').click();
  await expect(page.getByTestId('cad-native-property-radius')).toHaveValue('900');
  await page.getByTestId('cad-native-properties').screenshot({ path: testInfo.outputPath('properties-palette.png'), scale: 'css' });
});
