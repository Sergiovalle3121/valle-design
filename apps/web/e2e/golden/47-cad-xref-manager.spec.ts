import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { resolveCadInsert } from '../../src/lib/cad/professional-blocks';

/**
 * OLA 4 — la referencia externa se GESTIONA desde la línea de comandos.
 *
 * El panel sabía adjuntar una referencia. Lo que no había era forma de teclear
 * `XR` y ver qué hay, descargarlo, volver a cargarlo o recortarlo; y con la
 * capa del xref naciendo BLOQUEADA, cualquier ruta que pasara por el guardia de
 * capa bloqueada del editor rechazaba tocar el INSERT que representa la
 * referencia. El candado no protegía nada —el contenido vive dentro de una
 * definición de bloque y no es editable de todos modos— y sí dejaba la
 * referencia inmanejable. Aquí se comprueba que ya no.
 *
 *   XR ⏎ · ? ⏎                 → dice qué referencias hay y sus rutas GUARDADAS
 *   XR ⏎ · D ⏎ · PLANTA ⏎      → descarga: desaparece el INSERT, queda el registro
 *   XR ⏎ · R ⏎ · PLANTA ⏎      → vuelve a cargar sin ir a la red
 *   XC ⏎ · R ⏎ · … ⏎ … ⏎       → recorta, y el recorte llega a la geometría
 *
 * Lo que se afirma del recorte no es que el metadato exista: es a qué
 * coordenadas resuelve la referencia después de guardar. Un contorno que se
 * guarda y no recorta nada pasaría cualquier prueba que sólo mire el DOM.
 */
const XREF_INSERT = 'xref:planta:insert';

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      {
        id: 'xref:planta:layer',
        name: 'XREF|PLANTA',
        color: '#64748b',
        visible: true,
        locked: false,
      },
    ],
    entities: [
      {
        id: XREF_INSERT,
        type: 'insert',
        block: 'xref:planta:root',
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: 'xref:planta:layer',
      },
    ],
    history: [],
    modelSpace: { entityIds: [XREF_INSERT] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [
      {
        id: 'xref:planta:root',
        name: 'XREF|PLANTA|rev-1',
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: 'xref:planta:root:entity:0',
            type: 'line',
            start: { x: 0, y: 0, z: 0 },
            end: { x: 4_000, y: 0, z: 0 },
            layer: 'xref:planta:layer',
          },
        ],
      },
    ],
    constraints: [],
    externalReferences: [
      {
        id: 'planta',
        name: 'PLANTA',
        uri: 'tenant-layout://asset-planta/rev-1',
        relativePath: 'plantas/base',
        revision: 'rev-1',
        loaded: true,
        mode: 'attachment',
        assetId: 'asset-planta',
        blockId: 'xref:planta:root',
        insertId: XREF_INSERT,
        status: 'loaded',
      },
    ],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
}

async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${total}`);
}

test('XREF gestiona la referencia desde la línea de comandos y XCLIP recorta de verdad', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  const commandLine = page.getByTestId('cad-command-line');
  await expect(commandLine).toBeVisible();
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  // --- XR ? enseña la referencia y las rutas que guarda -----------------------
  await type(page, 'XR');
  await expect(page.getByTestId('cad-command-prompt')).toContainText('Referencias externas');
  await type(page, '?');
  await expect(commandLine).toContainText('PLANTA');
  // Las TRES rutas guardadas. Cuando una falla, esto es lo que el dibujante
  // necesita leer para saber por dónde arreglarlo.
  await expect(commandLine).toContainText('plantas/base');
  await expect(commandLine).toContainText('tenant-layout://asset-planta/rev-1');

  // --- Descargar quita lo dibujado y conserva el registro ---------------------
  await type(page, 'XR');
  await type(page, 'D');
  await expect(page.getByTestId('cad-command-prompt')).toContainText('nombre de la referencia');
  await type(page, 'PLANTA');
  await expectNativeCount(page, 0);

  // --- Y volver a cargarla no necesita la red: la proyección sigue aquí -------
  await type(page, 'XR');
  await type(page, 'R');
  await type(page, 'PLANTA');
  await expectNativeCount(page, 1);

  // --- XCLIP recorta la referencia -------------------------------------------
  await page.getByTestId(`cad-native-entity-${XREF_INSERT}`).click();
  await type(page, 'XC');
  await expect(page.getByTestId('cad-command-prompt')).toContainText('Contorno de recorte');
  await type(page, 'R'); // Rectangular
  await type(page, '-500,-500');
  await type(page, '1500,500');
  await expect(page.getByTestId('cad-command-prompt')).toBeHidden();

  // --- lo guardado recorta de verdad ------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;

  const reference = saved.externalReferences[0];
  expect(reference.loaded).toBe(true);
  expect(reference.relativePath).toBe('plantas/base');

  const resolved = resolveCadInsert(saved, XREF_INSERT);
  expect(resolved.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  const segments = resolved.entities
    .filter((entity): entity is Extract<CadDocument['entities'][number], { type: 'line' }> =>
      entity.type === 'line',
    )
    .map((entity) => [Math.round(entity.start.x), Math.round(entity.end.x)]);
  // ANCLA ABSOLUTA: la línea del xref iba de 0 a 4000 y el contorno llega a
  // 1500, así que sale de 0 a 1500 — cortada EN el borde, no «un poco más
  // corta» ni entera.
  expect(segments).toEqual([[0, 1_500]]);
});
