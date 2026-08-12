import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * OLA DE UTILIDADES — consultar, configurar y automatizar desde la línea.
 *
 * Los comandos que no salen en los folletos y que se usan cincuenta veces al
 * día. Este golden los ejerce contra el producto de verdad, no contra un doble,
 * y afirma tres cosas que ninguna spec de Node puede afirmar sola:
 *
 * 1. **Las consultas están enchufadas.** DIST se teclea y contesta con la
 *    distancia, los deltas y el ángulo en el diálogo.
 *
 * 2. **UNITS cambia lo que las consultas ESCRIBEN.** Se mide una distancia en
 *    decimal, se cambia a arquitectónico y la MISMA medida sale en pies y
 *    pulgadas. Es la cadena entera —tabla de variables → formateador →
 *    comando— y es lo que hace que el producto se pueda usar en Estados
 *    Unidos.
 *
 * 3. **Teclear el nombre de una paleta la abre.** DSETTINGS abre el cuadro de
 *    ayudas al dibujo. Sin esto la paleta existe pero hay que saber en qué menú
 *    vive, que es lo mismo que no haberla entregado.
 *
 * Y de propina, la prueba de que la automatización sirve: `-LAYER` crea una
 * capa desde la línea y la capa aparece en el DOCUMENTO GUARDADO. Es la
 * variante sin diálogo, la única que un `.scr` puede ejecutar.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

test('consultar, configurar unidades, abrir paletas y crear una capa desde la línea de comandos', async ({
  context,
  page,
}) => {
  // El recorrido teclea DIST, AREA, LIST, UNITS, QSELECT y -LAYER seguidos: en
  // un runner lento el total rebasa los 60 s por defecto (el run 31586424841
  // midió 66 s y el `fill` de -LAYER murió con el reloj agotado). El reloj es
  // una suposición sobre la máquina, no parte del contrato.
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  const commandLine = page.getByTestId('cad-command-line');
  await expect(commandLine).toBeVisible();
  const log = page.getByTestId('cad-command-line-log');
  const prompt = page.getByTestId('cad-command-prompt');

  // --- 1. DIST contesta, y contesta en decimal -------------------------------
  await type(page, 'DI');
  await expect(prompt).toContainText('primer punto');
  await type(page, '0,0');
  await expect(prompt).toContainText('segundo punto');
  await type(page, '3000,4000');
  // 3-4-5: la distancia es exactamente 5000 y el ángulo, 53,13 grados.
  await expect(log).toContainText('Distancia = 5000.0000');
  await expect(log).toContainText('Delta X = 3000.0000');
  await expect(log).toContainText('Delta Y = 4000.0000');

  // --- 2. UNITS cambia lo que la MISMA medida escribe ------------------------
  await type(page, 'UNITS');
  await expect(prompt).toContainText('Formato de las longitudes');
  // Arquitectónico, precisión 1/16, grados decimales, 0 decimales, cero al este.
  await type(page, 'A');
  await type(page, '4');
  await type(page, 'G');
  await type(page, '0');
  await type(page, '0');
  await expect(log).toContainText('architectural');

  // La misma distancia de antes, ahora en pies y pulgadas: 42 unidades son
  // 3'-6". Si la configuración no llegara al formateador, seguiría saliendo 42.
  await type(page, 'DIST');
  await type(page, '0,0');
  await type(page, '42,0');
  await expect(log).toContainText(`3'-6"`);

  // --- 3. SETVAR y GETVAR: la tabla de variables está viva -------------------
  await type(page, 'SETVAR');
  await expect(prompt).toContainText('variable de sistema');
  await type(page, 'LTSCALE');
  await type(page, '3');
  await expect(log).toContainText('LTSCALE = 3');
  await type(page, 'GETVAR');
  await type(page, 'LTSCALE');
  // Si la escritura y la lectura no compartieran almacén, aquí saldría 1.
  await expect(log).toContainText('LTSCALE = 3');

  // --- 4. Teclear el nombre de una paleta la ABRE ----------------------------
  await expect(page.getByTestId('cad-draft-settings')).toHaveCount(0);
  await type(page, 'DSETTINGS');
  await expect(page.getByTestId('cad-draft-settings')).toBeVisible();
  await page.getByTestId('cad-draft-settings-close').click();
  await expect(page.getByTestId('cad-draft-settings')).toHaveCount(0);

  // El alias corto de AutoCAD lleva al mismo sitio.
  await type(page, 'OS');
  await expect(page.getByTestId('cad-draft-settings')).toBeVisible();
  await page.getByTestId('cad-draft-settings-close').click();

  // --- 5. QSELECT designa por propiedades ------------------------------------
  // Primero hay que tener algo que designar: dos líneas por coordenadas.
  await type(page, 'L');
  await type(page, '0,0');
  await type(page, '1000,0');
  await type(page, '');
  await type(page, 'L');
  await type(page, '0,500');
  await type(page, '1000,500');
  await type(page, '');
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 2');

  await type(page, 'QSELECT');
  await expect(prompt).toContainText('Aplicar a');
  await type(page, 'D');
  await type(page, 'line');
  await type(page, 'layer');
  await type(page, '=');
  await type(page, '0');
  await type(page, 'N');
  await type(page, 'R');
  // Casan las dos líneas, y el diálogo dice cuántas de cuántas examinó.
  await expect(log).toContainText('2 de 2');

  // --- 6. `-LAYER` crea una capa SIN diálogo, y persiste ---------------------
  await type(page, '-LAYER');
  await expect(prompt).toContainText('opción de capa');
  await type(page, 'N');
  await expect(prompt).toContainText('Nombre de la capa nueva');
  await type(page, 'PILARES');

  // El autosave tiene 2 s de rebote y comparte cola y token CAS con el guardado
  // manual. Se le deja terminar antes de confirmar a mano: sin esta espera, el
  // clic entra a la vez que el autosave programado y el recorrido depende de
  // cuánto tardó el navegador, no del producto.
  await expect(page.getByTestId('cad-save-status')).toHaveText('Guardado', {
    timeout: 20_000,
  });
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  expect(saved.layers.map((layer) => layer.name)).toContain('PILARES');
  // Y lo dibujado sigue ahí: la capa nueva no se llevó por delante la geometría.
  expect(saved.entities).toHaveLength(2);
});
