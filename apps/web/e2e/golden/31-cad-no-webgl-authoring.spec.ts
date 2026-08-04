import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

type CadLine = Extract<CadEntity, { type: 'line' }>;

/**
 * Regresión P0 — el editor 2D es OPERABLE sin WebGL, no sólo superviviente.
 *
 * `29-cad-webgl-unavailable` ya fijaba que el árbol React no se cae y que el
 * usuario recibe un aviso. Eso no basta: en CI, Firefox no obtiene contexto
 * WebGL (`FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`) pese a las prefs que la
 * config intenta forzar, y ahí la suite dorada se caía en la BARRA DE
 * HERRAMIENTAS — clics a `Line`/`Circle` que expiraban a los 60 s — no en el
 * viewport. Sobrevivir no es lo mismo que poder trabajar.
 *
 * Este spec fija el contrato del §7.3 con el mismo navegador que el resto de la
 * suite, anulando `getContext` para WebGL: sin viewport 3D, el usuario debe
 * seguir pudiendo seleccionar, editar por propiedades, dibujar con entrada
 * dinámica, guardar, reabrir y exportar DXF. El aviso de degradación no puede
 * tapar controles ni interceptar el puntero.
 */
function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: 'nogl-line', type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 5_000, y: 1_000, z: 0 }, layer: '0' },
    ],
    history: [], modelSpace: { entityIds: ['nogl-line'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

/** Un navegador que no concede WebGL, como Firefox en el runner de CI. */
async function denyWebgl(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(
      this: HTMLCanvasElement,
      id: string,
      ...rest: unknown[]
    ) {
      if (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') return null;
      return (original as never as (...a: unknown[]) => unknown).call(this, id, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

test('the 2D editor stays fully operable when the browser denies WebGL', async ({ context, page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await denyWebgl(page);
  await page.goto('/legacy/studio');

  // El viewport se degrada con un aviso explícito…
  await expect(page.getByTestId('cad-webgl-unavailable')).toBeVisible();

  // …y la LISTA DE ENTIDADES sigue siendo la vía de trabajo real.
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  await page.getByTestId('cad-native-entity-nogl-line').click();

  // 1. Propiedades: leer y editar.
  const startX = page.getByTestId('cad-native-property-startX');
  await expect(startX).toHaveValue('1000');
  await startX.fill('1500');
  await startX.blur();

  // 2. La barra de herramientas responde. Éste es el punto exacto donde la
  //    suite moría en Firefox: el aviso de degradación no puede cubrirla.
  await page.getByRole('button', { name: 'Circle', exact: true }).click();
  const dynamic = page.getByTestId('cad-dynamic-input');
  await expect(dynamic).toBeVisible();
  await page.getByTestId('cad-dynamic-field-x').fill('4000');
  await page.getByTestId('cad-dynamic-field-y').fill('3000');
  await dynamic.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByTestId('cad-dynamic-field-radius').fill('250');
  await dynamic.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dynamic).toBeHidden();

  // 3. Guardar de verdad, contra el CAS real del contrato.
  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  expect((stored.entities.find((entity) => entity.id === 'nogl-line') as CadLine).start.x).toBe(1_500);
  expect(stored.entities.some((entity) => entity.type === 'circle')).toBe(true);

  // 4. Reabrir sin WebGL conserva exactamente lo guardado.
  await page.reload();
  await expect(page.getByTestId('cad-webgl-unavailable')).toBeVisible();
  await page.getByTestId('cad-native-entity-nogl-line').click();
  await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('1500');

  // 5. Exportar sigue disponible: sin viewport 3D no se pierde la ENTREGA.
  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar DXF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = importDxfPrimitives(await readFile(path!, 'utf8'));
  expect(exported.primitives.some((primitive) => primitive.kind === 'circle')).toBe(true);

  // Ninguna excepción escapó al árbol React en todo el recorrido.
  expect(pageErrors).toEqual([]);
});
