/**
 * AUDITORÍA — LAS CAPAS DEL ESTRUCTURISTA SOBREVIVEN A LA XREF (T-41).
 *
 * Es lo primero que hace un arquitecto con una xref: apagar la retícula del
 * estructurista y dejar sus muros. Aquí no se podía: `xref-projection.ts`
 * sobrescribía la capa de cada entidad con UNA sola —`XREF|<nombre>`, gris,
 * grosor fijo— y las cuarenta capas del plano ajeno se volvían una. Desde
 * T-41 cada capa de origen se proyecta como `XREF|<xref>|<capa>` (la
 * convención de AutoCAD), con su color y su tipo de línea, y es una capa del
 * anfitrión como cualquier otra: se apaga, se congela y sobrevive al guardado.
 *
 * Lo que se afirma: se adjunta un plano de TRES capas tecleando XATTACH (el
 * mismo recorrido del golden 87), el gestor de capas lista las tres, se apaga
 * UNA y las otras dos siguen encendidas — en pantalla y en el documento que
 * recibe el servidor.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import { fitFootprint } from '../fixtures/camera-preset';
import type { CadDocument } from '../../src/lib/cad/cad-document';

const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: 'mm', gridSize: 100 };

function documento(entidades: Array<{ id: string; layer: string; y: number }>, capas: CadDocument['layers']): CadDocument {
  return {
    meta: { version: 1, schema: 3, ...FOOTPRINT },
    layers: capas,
    entities: entidades.map((e) => ({
      id: e.id, type: 'line', start: { x: 1_000, y: e.y, z: 0 }, end: { x: 8_000, y: e.y, z: 0 }, layer: e.layer,
    })),
    history: [], modelSpace: { entityIds: entidades.map((e) => e.id) }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

const CAPA_0 = { id: '0', name: '0', color: '#ffffff', visible: true, locked: false };

async function installCadBackend(context: BrowserContext) {
  const anfitrion = documento([{ id: 'host-line', layer: '0', y: 500 }], [CAPA_0]);
  // El plano del estructurista: tres capas con su color, una entidad en cada una.
  const estructura = documento(
    [
      { id: 'muro', layer: 'MUROS', y: 2_000 },
      { id: 'eje', layer: 'EJES', y: 4_000 },
      { id: 'rotulo', layer: 'TEXTOS', y: 6_000 },
    ],
    [
      CAPA_0,
      { id: 'MUROS', name: 'MUROS', color: '#ff0000', visible: true, locked: false },
      { id: 'EJES', name: 'EJES', color: '#00ff00', visible: true, locked: false, linetype: 'center' },
      { id: 'TEXTOS', name: 'TEXTOS', color: '#0000ff', visible: true, locked: false },
    ],
  );
  const backend = new CadV1Backend([
    { model: HOST_MODEL, revision: HOST_REVISION, document: anfitrion as unknown as Record<string, unknown>, version: 0, footprint: FOOTPRINT },
    { model: 'PLANTA-BASE', revision: 'R3', document: estructura as unknown as Record<string, unknown>, version: 1, footprint: FOOTPRINT },
  ]);
  await backend.install(context);
  return backend;
}

async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

test('adjuntar una xref de tres capas, apagar una y las otras dos siguen', async ({ context, page }) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByTitle(/Vista de plano 2D/).click();
  await fitFootprint(page);
  const log = page.getByTestId('cad-command-line-log');

  await test.step('XATTACH tecleado trae el plano de tres capas', async () => {
    await type(page, 'XATTACH');
    await type(page, 'PLANTA-BASE@R3');
    await page.keyboard.press('Enter'); // adjuntar
    await type(page, '0,0');
    await page.keyboard.press('Enter'); // escala 1
    await page.keyboard.press('Enter'); // giro 0
    await expect(log).toContainText(/PLANTA-BASE@R3 referenciado como adjunto/);
  });

  const fila = (capa: string) =>
    page.locator('[data-testid^="cad-layer-row-"]').filter({ hasText: `XREF|PLANTA-BASE|${capa}` });
  const idDe = async (capa: string) =>
    (await fila(capa).getAttribute('data-testid'))!.replace('cad-layer-row-', '');

  await test.step('el gestor de capas lista las tres capas del plano ajeno, con su color', async () => {
    await page.getByTitle(/Vista, capas/).click();
    await expect(page.getByTestId('cad-layer-properties')).toBeVisible();
    for (const capa of ['MUROS', 'EJES', 'TEXTOS']) await expect(fila(capa)).toBeVisible();
    // Host «0», la portadora «XREF|PLANTA-BASE» y las CUATRO capas del plano
    // ajeno proyectadas (su «0» también viaja, como en AutoCAD): seis filas.
    await expect(page.getByTestId('cad-layer-visible-count')).toHaveText('6/6 listadas');
  });

  await test.step('apagar EJES no toca MUROS ni TEXTOS', async () => {
    const ejes = await idDe('EJES');
    const muros = await idDe('MUROS');
    await page.getByTestId(`cad-layer-visible-${ejes}`).click();
    await expect(page.getByTestId(`cad-layer-visible-${ejes}`)).toHaveClass(/opacity-30/);
    await expect(page.getByTestId(`cad-layer-visible-${muros}`)).not.toHaveClass(/opacity-30/);
  });

  await test.step('y así llega al documento que recibe el servidor', async () => {
    // El gestor de capas tiene su propio «Guardar» (estados de capa): se cierra
    // antes de pulsar el de la barra, que es el que manda al servidor.
    await page.getByTitle(/Vista, capas/).click();
    await expect(page.getByTestId('cad-layer-properties')).toHaveCount(0);
    await saveAndSettle(page, {
      snapshot: () => ({ version: backend.snapshotFor(HOST_MODEL, HOST_REVISION).version }),
    });
    const guardado = backend.snapshotFor(HOST_MODEL, HOST_REVISION).document as unknown as CadDocument;
    const capa = (nombre: string) => guardado.layers.find((layer) => layer.name === nombre);
    expect(capa('XREF|PLANTA-BASE|EJES')?.visible, 'EJES apagada').toBe(false);
    expect(capa('XREF|PLANTA-BASE|MUROS')?.visible, 'MUROS encendida').toBe(true);
    expect(capa('XREF|PLANTA-BASE|TEXTOS')?.visible, 'TEXTOS encendida').toBe(true);
    expect(capa('XREF|PLANTA-BASE|MUROS')?.color, 'el color del remitente sobrevive').toBe('#ff0000');
    const raiz = guardado.blocks.find((block) => block.name.startsWith('XREF|PLANTA-BASE|R3'));
    expect(raiz, 'la proyección es un bloque del anfitrión').toBeTruthy();
    const capasDelBloque = new Set(raiz!.entities.map((entity) => entity.layer));
    expect(capasDelBloque.size, 'tres entidades en TRES capas, no aplastadas a una').toBe(3);
  });
});
