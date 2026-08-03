import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { migrateCadDocument, type CadDocument } from '../../src/lib/cad/cad-document';
import { cadDocumentToEditorSnapshot } from '../../src/lib/cad/editor-snapshot';

// MIGRACIÓN R3: mock en la superficie v1 real. DIFERENCIA de transporte
// documentada: el PUT legacy arrastraba el array `assets` junto al documento;
// en v1 SOLO viaja el documento canónico — los assets son su PROYECCIÓN
// (cadDocumentToEditorSnapshot, las mismas reglas del editor/adaptador), así
// que el snapshot los deriva del documento persistido. Mismos conteos.
async function installCadBackend(context: BrowserContext) {
  const { snapshot } = await installCadV1Backend(context, {
    document: null,
    footprint: { footprintW: 12_000, footprintH: 8_000, unit: 'mm', gridSize: 100 },
  });
  return {
    snapshot: () => {
      const current = snapshot();
      const document = current.document
        ? (current.document as unknown as CadDocument)
        : null;
      const assets = document
        ? cadDocumentToEditorSnapshot(migrateCadDocument(document)).assets
        : [];
      return { document, assets, version: current.version };
    },
  };
}

async function fillPoint(page: import('@playwright/test').Page, x: string, y: string) {
  await page.getByTestId('cad-dynamic-field-x').fill(x);
  await page.getByTestId('cad-dynamic-field-y').fill(y);
  await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'Aplicar' }).click();
}

test('neutral drawing uses units, layers, ABS/REL/POLAR, closed polyline and OFFSET', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);

  await test.step('1. Abrir dibujo', async () => {
    await page.goto('/legacy/studio');
    await expect(page.getByTestId('cad-canvas')).toBeVisible();
  });
  await test.step('2. Elegir unidades', async () => {
    const view = page.getByTitle(/Vista, capas/);
    await view.click();
    const manager = page.getByTestId('cad-layer-manager');
    await manager.getByRole('button', { name: 'm', exact: true }).click();
    await manager.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(manager).toContainText('mm');
  });
  await test.step('3. Crear capas', async () => {
    await page.getByTestId('cad-layer-new-name').fill('Acceptance Geometry');
    await page.getByTestId('cad-layer-create').click();
    await expect(page.getByTestId('cad-layer-row-Acceptance_Geometry')).toBeVisible();
    await page.getByTitle(/Vista, capas/).click();
  });

  await page.getByRole('button', { name: 'Line', exact: true }).click();
  await test.step('4/7. Coordenada absoluta y dynamic input', async () => {
    await expect(page.getByTestId('cad-dynamic-input')).toBeVisible();
    await fillPoint(page, '1000', '1000');
  });
  await test.step('5. Coordenada relativa', async () => {
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'REL' }).click();
    await fillPoint(page, '2000', '0');
  });
  await test.step('6. Coordenada polar', async () => {
    const dynamic = page.getByTestId('cad-dynamic-input');
    await dynamic.getByRole('button', { name: 'POLAR' }).click();
    await page.getByTestId('cad-dynamic-field-distance').fill('1500');
    await page.getByTestId('cad-dynamic-field-angle').fill('90deg');
    await dynamic.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expect(page.getByText(/2 equipos/)).toBeVisible();
  });

  await test.step('13. Crear polilínea cerrada', async () => {
    await page.getByRole('button', { name: 'Pline', exact: true }).click();
    await fillPoint(page, '2000', '4000');
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'REL' }).click();
    await fillPoint(page, '2000', '0');
    await fillPoint(page, '0', '1500');
    await page.getByTestId('cad-polyline-close').click();
    await expect(page.getByText(/5 equipos/)).toBeVisible();
  });

  await test.step('14. Aplicar offset', async () => {
    await page.getByTitle(/Selección profesional/).click();
    await page.getByTestId('cad-quick-select-text').fill('Pline 1');
    await page.getByTestId('cad-quick-select-apply').click();
    await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');
    await page.getByLabel('Cerrar panel profesional').click();
    await page.getByRole('button', { name: 'Offset', exact: true }).click();
    await page.getByTestId('cad-dynamic-field-offset').fill('250mm');
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/6 equipos/)).toBeVisible();
  });

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  // Se espera al CONTENIDO persistido, no a un número exacto de versiones CAS.
  //
  // `version` cuenta PUT aceptados, y el autosave (debounce 2 s) dispara varias
  // veces durante este recorrido de ~25 s: medido, 4 PUT a +7.9s, +12.2s,
  // +19.4s y +23.3s. Exigir `version === 1` afirmaba en realidad «el autosave
  // no disparó nunca» — una afirmación sobre el timing del test, no sobre el
  // producto, imposible de satisfacer de forma determinista mientras exista
  // autosave. Por eso el valor oscilaba entre 1, 3 y 4 según la máquina.
  //
  // Que el autosave versione el trabajo intermedio es DESEABLE en un CAD: es
  // lo que evita perder el dibujo si la sesión se cae. El requisito real de
  // este paso es que el guardado deje el dibujo completo en el servidor, y eso
  // es lo que se espera y se afirma aquí.
  await expect.poll(() => backend.snapshot().assets.length).toBe(6);
  expect(backend.snapshot().assets).toHaveLength(6);
  expect(backend.snapshot().assets.filter((asset) => asset.label?.startsWith('Pline'))).toHaveLength(4);
  expect(backend.snapshot().document?.layers.some((layer) => layer.id === 'Acceptance_Geometry')).toBe(true);
  await page.getByTestId('cad-canvas').screenshot({ path: testInfo.outputPath('neutral-precision-drawing.png'), scale: 'css' });
});
