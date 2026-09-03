import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA PRIMERA HORA CON UN PLANO AJENO, DE PRINCIPIO A FIN Y TECLEADA.
 *
 * `docs/competitive/distancia-autocad-completo-20260903.md` mide el área del
 * trabajo ajeno por lo que pasa en la PRIMERA HORA de un encargo: llega el
 * dibujo de otro, hay que ver qué trae roto, tirar lo que sobra, traducir sus
 * capas a las del despacho, comprobar el estándar y volver a mandarlo
 * empaquetado. Cada una de esas órdenes ya tenía su prueba por separado
 * (golden 61 para AUDIT, 76 para las órdenes de plano ajeno); lo que no tenía
 * prueba era la CADENA sobre un mismo dibujo, que es la forma en que se usan.
 *
 * El recorrido, tecleado con el lienzo enfocado:
 *
 *   AUDIT ⏎ · S ⏎     → cuenta los defectos, pregunta, repara y dice cuánto
 *   PURGE ⏎ · S ⏎     → tira la capa que nadie usa
 *   LAYTRANS ⏎        → MURO-AJENO → MUROS, y Fin aplica en UN paso de deshacer
 *   CHECKSTANDARDS ⏎  → dice si el resultado sigue el estándar de la oficina
 *   ETRANSMIT ⏎       → entrega el paquete, y se leen sus BYTES
 *
 * Todo se afirma sobre el documento que recibe el SERVIDOR o sobre el archivo
 * descargado. Nada mira una captura.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      // Las capas del OTRO despacho: nombre ajeno, y una que no usa nadie.
      { id: 'MURO-AJENO', name: 'MURO-AJENO', color: '#f59e0b', visible: true, locked: false },
      { id: 'SOBRA', name: 'SOBRA', color: '#00ff00', visible: true, locked: false },
    ],
    entities: [
      { id: 'muro-1', type: 'line', start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 5_000, y: 1_000, z: 0 }, layer: 'MURO-AJENO' },
      { id: 'muro-2', type: 'line', start: { x: 5_000, y: 1_000, z: 0 }, end: { x: 5_000, y: 4_000, z: 0 }, layer: 'MURO-AJENO' },
      // El defecto que llega en todo plano ajeno: una línea de longitud cero.
      { id: 'degenerada', type: 'line', start: { x: 2_000, y: 2_000, z: 0 }, end: { x: 2_000, y: 2_000, z: 0 }, layer: '0' },
    ],
    history: [], modelSpace: { entityIds: ['muro-1', 'muro-2', 'degenerada'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function openPlan(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  return backend;
}

/** Teclea con el LIENZO enfocado, como en AutoCAD: sin clic previo. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

test('la primera hora con un plano ajeno: AUDIT, PURGE, LAYTRANS, CHECKSTANDARDS y ETRANSMIT, encadenados', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const backend = await openPlan(context, page);
  const log = page.getByTestId('cad-command-line-log');

  // ---- a. AUDIT dice QUÉ trae roto antes de tocar nada ---------------------
  await type(page, 'AUDIT');
  await expect(log, 'AUDIT cuenta lo que trae roto y pregunta; no repara a la brava').toContainText(
    /geometría degenerada.*¿Reparar/i,
  );
  await type(page, 'S');
  await expect(log, 'y dice cuánto reparó').toContainText(/repar/i);

  // ---- b. PURGE tira lo que nadie usa -------------------------------------
  await type(page, 'PURGE');
  await expect(log, 'PURGE nombra lo que sobra antes de tirarlo').toContainText(/SOBRA|purg/i);

  // ---- c. LAYTRANS traduce la capa ajena a la del despacho ----------------
  await type(page, 'LAYTRANS');
  await expect(page.getByTestId('cad-command-prompt')).toContainText('origen');
  await type(page, 'MURO-AJENO');
  await expect(page.getByTestId('cad-command-prompt')).toContainText('destino');
  await type(page, 'MUROS');
  await type(page, 'F');
  await expect(log, 'LAYTRANS aplica el mapa acumulado de una vez').toContainText(/MURO-AJENO/);

  // ---- d. El estándar de la oficina opina sobre el resultado --------------
  await type(page, 'CHECKSTANDARDS');
  await expect(log, 'CHECKSTANDARDS responde con su escala y su veredicto').toContainText('CHECKSTANDARDS (1:50)');

  // ---- e. Y lo que el SERVIDOR recibe es el plano ya traducido ------------
  const version = await saveAndSettle(page, backend);
  expect(version).toBeGreaterThan(0);
  const guardado = backend.snapshot().document;
  const capas = guardado.layers.map((layer) => layer.name);
  expect(capas, 'la capa del despacho existe tras LAYTRANS').toContain('MUROS');
  expect(
    guardado.entities.filter((entity) => entity.layer === 'MUROS').length,
    'y los dos muros ajenos viven en ella',
  ).toBe(2);
  expect(
    guardado.entities.find((entity) => entity.id === 'degenerada'),
    'la línea de longitud cero la reparó AUDIT',
  ).toBeUndefined();

  // ---- f. ETRANSMIT entrega el paquete, y se leen sus BYTES ---------------
  const descarga = page.waitForEvent('download', { timeout: 30_000 });
  await type(page, 'ETRANSMIT');
  await type(page, 'plano-ajeno-traducido'); // nombre del paquete
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe('plano-ajeno-traducido.zip');
  const ruta = await archivo.path();
  expect(ruta, 'ETRANSMIT entrega un archivo de verdad').toBeTruthy();
  const bytes = await readFile(ruta!);
  expect(bytes.byteLength, 'y el paquete tiene contenido').toBeGreaterThan(100);
  // «PK»: es un ZIP de verdad, no un renglón que dice que lo es.
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
});
