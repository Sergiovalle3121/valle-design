import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * EL DEFECTO. El efecto que construye escena/cámara/renderer/OrbitControls
 * estaba indexado por `[open, data]`. `data` es la respuesta del servidor:
 * CADA ronda de autosave la reemplaza por un objeto nuevo aunque el documento
 * sea el mismo (misma huella, mismo contenido salvo el cambio recién hecho).
 * Indexar por esa identidad tumbaba y reconstruía TODO —incluida la cámara,
 * que vuelve a su encuadre por defecto— en cada autosave: el usuario colocaba
 * una sola puerta y perdía dónde estaba mirando.
 *
 * Este golden reproduce el gesto exacto: aleja la cámara del encuadre inicial
 * (con la rueda del ratón, para que un reset sea observable), da de alta una
 * entidad desde el panel de propiedades (Copiar) y espera al autosave real
 * —el debounce de 2 s, no el botón «Guardar»—. Lee el encuadre a través del
 * HUD de coordenadas del cursor (`cad-cursor-coordinate`): en un mismo píxel
 * de pantalla, el mundo que reporta depende sólo de la proyección de cámara
 * vigente, así que un reset de cámara es un cambio de lectura ahí, sin tocar
 * el ratón entre una medición y la otra.
 */
function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
    ],
    entities: [
      {
        id: 'seed-line',
        type: 'line',
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 5_000, y: 1_000, z: 0 },
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['seed-line'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
}

/**
 * Lee el mundo bajo un píxel fijo desde el HUD del cursor. El HUD se
 * actualiza async con el `pointermove`; mover primero a un vecino y esperar
 * a que la lectura CAMBIE evita aceptar el valor de la posición anterior
 * (el mismo truco que usa el fixture `worldPoint`).
 */
async function readCursorWorld(page: Page, x: number, y: number) {
  const coordinate = page.getByTestId('cad-cursor-coordinate');
  const read = async () =>
    `${await coordinate.getAttribute('data-x')}|${await coordinate.getAttribute('data-y')}`;
  await page.mouse.move(x - 5, y - 5);
  await expect.poll(read).not.toBe('|');
  const neighbor = await read();
  await page.mouse.move(x, y);
  await expect.poll(read).not.toBe(neighbor);
  const [rawX, rawY] = (await read()).split('|');
  return { x: Number(rawX), y: Number(rawY) };
}

test('colocar una entidad y esperar al autosave no mueve el encuadre de cámara del usuario', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  await expect(page.getByTestId('cad-native-entity-seed-line')).toBeVisible();

  const box = await page.getByTestId('cad-canvas').boundingBox();
  if (!box) throw new Error('CAD canvas has no bounding box');
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  // Un píxel FUERA del centro: el rayo cámara→piso en el centro pasa por el
  // target de OrbitControls y su intersección con el piso no se mueve con un
  // zoom puro (dolly a lo largo de ese mismo rayo) — sólo la orientación o el
  // target lo moverían. Fuera del centro sí depende de dónde está la cámara,
  // que es justo lo que este spec necesita observar.
  const px = box.x + box.width * 0.25;
  const py = box.y + box.height * 0.3;

  // Aleja la cámara del encuadre inicial. Sin este paso el bug es invisible:
  // un rebuild completo recalcula el MISMO encuadre por defecto (misma
  // huella, misma fórmula) y una lectura antes/después coincidiría de todos
  // modos.
  const beforeZoom = await readCursorWorld(page, px, py);
  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, -1_500);
  // Deja asentar el damping de OrbitControls antes de la primera lectura.
  await page.waitForTimeout(300);

  const beforeAutosave = await readCursorWorld(page, px, py);
  expect(
    beforeAutosave.x,
    'la rueda del ratón no movió la cámara: el resto del spec no probaría nada',
  ).not.toBeCloseTo(beforeZoom.x, 0);

  // Alta de entidad real (no una edición de propiedad): «Copiar» desde el
  // panel de propiedades añade una entidad nueva y marca el dibujo sucio,
  // exactamente lo que dispara `scheduleAutosaveRef` (debounce 2 s).
  await page.getByTestId('cad-native-entity-seed-line').click();
  await page
    .getByTestId('cad-native-properties')
    .getByRole('button', { name: 'Copiar' })
    .click();

  // El autosave real, NO el botón «Guardar»: es la ruta que reproduce el bug.
  await expect.poll(() => backend.snapshot().version, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('cad-save-status')).toHaveText('Guardado');
  expect(backend.snapshot().document.entities).toHaveLength(2);

  const afterAutosave = await readCursorWorld(page, px, py);

  expect(
    afterAutosave.x,
    'el autosave reconstruyó la cámara y le devolvió el encuadre por defecto',
  ).toBeCloseTo(beforeAutosave.x, 0);
  expect(
    afterAutosave.y,
    'el autosave reconstruyó la cámara y le devolvió el encuadre por defecto',
  ).toBeCloseTo(beforeAutosave.y, 0);
});
