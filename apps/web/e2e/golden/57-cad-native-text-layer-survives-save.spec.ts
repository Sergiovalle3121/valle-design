import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { migrateCadDocument, type CadDocument } from '../../src/lib/cad/cad-document';

/**
 * TEXT es el único tipo con adaptador nativo (`text-entity-adapter.ts`) que
 * TAMBIÉN tiene sombra en el editor legado (`annotationsRef`/
 * `layerAssignmentsRef`, la `Ann` que produce `cadDocumentToEditorSnapshot`
 * al abrir). Antes de este spec, dos defectos reales y hasta entonces
 * latentes vivían en `Layout3DEditor.tsx` — ninguno de los dos podía
 * dispararse porque ningún comando nativo tocaba un TEXT antes de que
 * existiera su adaptador:
 *
 *  1. Al abrir, `legacy/layout-mapper.ts` descartaba la capa de las
 *     anotaciones (sólo la mezclaba para activos): la propiedad "Capa" de un
 *     TEXT en una capa real se leía "Text" desde el primer render.
 *  2. Al guardar, `snapshotDocument()` reconstruye siempre desde esa misma
 *     sombra, que ningún comando de propiedades actualizaba: editar el
 *     CONTENIDO de un TEXT y guardar revertía la edición, porque la sombra
 *     vieja ganaba sobre el documento canónico recién editado.
 *
 * Este spec siembra un TEXT en una capa real, confirma que la propiedad
 * "Capa" la dice bien nada más abrir (defecto 1) y que editar su contenido y
 * guardar conserva AMBOS —contenido nuevo y capa real— contra el backend
 * mock (defecto 2). Sin él, ninguno de los dos volvería a tener guardián.
 */
async function installCadBackend(context: BrowserContext) {
  const seed: CadDocument = migrateCadDocument({
    meta: { version: 1, schema: 10, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'NOTAS', name: 'NOTAS', color: '#22d3ee', visible: true, locked: false },
    ],
    entities: [
      { id: 'seed-text-1', type: 'text', x: 100, y: 200, text: 'Antes', layer: 'NOTAS' },
    ],
  });
  return installCadStudioBackend<CadDocument>(context, seed, {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

test('un TEXT en una capa real conserva su capa al abrir y su edición al guardar', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await page.getByTestId('cad-native-entity-seed-text-1').click();
  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('TEXT');
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Antes');
  // Defecto 1: la capa real, no "Text", nada más abrir.
  await expect(page.getByTestId('cad-native-property-layer')).toHaveValue('NOTAS');

  await page.getByTestId('cad-native-property-text').fill('Después');
  await page.getByTestId('cad-native-property-text').blur();
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Después');

  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document.entities.find((entity) => entity.id === 'seed-text-1');
  expect(stored?.type).toBe('text');
  if (stored?.type === 'text') {
    // Defecto 2: el guardado se queda con la edición fresca, no con la sombra.
    expect(stored.text).toBe('Después');
    expect(stored.layer).toBe('NOTAS');
  }

  await page.reload();
  await page.getByTestId('cad-native-entity-seed-text-1').click();
  await expect(page.getByTestId('cad-native-property-text')).toHaveValue('Después');
  await expect(page.getByTestId('cad-native-property-layer')).toHaveValue('NOTAS');
});
