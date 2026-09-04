import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { CadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA PUERTA DE ENTREGA — EN LOS BYTES QUE SE DESCARGAN.
 *
 * ## Qué estaba medido
 *
 * `ETRANSMIT` no consultaba NADA antes de empaquetar. Empaquetaba igual de
 * contento un plano correcto y uno con dos equipos llamados `P-101` o un
 * conductor que no aguanta su protección. El eTransmit de AutoCAD hace lo mismo
 * y **no puede hacer otra cosa**: su informe sabe de FICHEROS, no del proyecto.
 *
 * ## Qué fija este golden
 *
 * - con un hallazgo que bloquea **no sale paquete**: falla cerrado, y el motivo
 *   se dice con la etiqueta concreta, no con un «hay problemas»;
 * - un Enter **no vale por un sí**: armar una entrega con defectos es una
 *   decisión, y las decisiones se toman;
 * - dicho que sí, el ZIP se descarga y **lo dice por dentro** — se leen los
 *   BYTES del archivo y ahí está `REVISION.txt` con la advertencia y el
 *   hallazgo, porque el paquete se escribe sin comprimir (método STORE) y lo
 *   que dice se puede leer sin creerle a nadie.
 *
 * El caso contrario —un plano limpio que pasa de largo sin preguntar— lo fija
 * el golden 88, que teclea `ETRANSMIT` sobre un plano ya reparado y sigue
 * descargando su paquete sin un prompt de más.
 */
const HOST_MODEL = 'AXOS-CAD-STUDIO';
const HOST_REVISION = 'UNIVERSAL';
const FOOTPRINT = { footprintW: 40_000, footprintH: 40_000, unit: 'mm', gridSize: 100 };

function planoVacio(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  const backend = new CadV1Backend([
    {
      model: HOST_MODEL, revision: HOST_REVISION, version: 0, footprint: FOOTPRINT,
      document: planoVacio() as unknown as Record<string, unknown>,
    },
  ]);
  await backend.install(context);
  return backend;
}

async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  // Mismo enfoque que en los goldens 98 y 99: se pide el foco antes de teclear
  // para no depender de cómo cada navegador sintetiza lo que no está en el
  // teclado. Aquí todo lo tecleado es ASCII, pero un ayudante que se comporta
  // distinto entre goldens hermanos es cómo vuelve el mismo fallo.
  await input.focus();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
}

test('Con un defecto que bloquea, la entrega no se arma sola y el paquete lo dice por dentro', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const log = page.getByTestId('cad-command-line-log');

  // ---- a. Un ramal con la protección equivocada --------------------------
  // 30 m de 12 AWG con 30 A: la protección no cabe en el conductor.
  await type(page, 'AEWIRE');
  await type(page, 'C-1');
  await type(page, '12');
  await type(page, '0,0');
  await type(page, '15000,0');
  await page.keyboard.press('Enter');
  await type(page, 'AEWIRE');
  await type(page, 'C-1');
  await type(page, '12');
  await type(page, '15000,0');
  await type(page, '15000,15000');
  await page.keyboard.press('Enter');
  await type(page, 'AECIRCUIT');
  await type(page, 'C-1');
  await type(page, '30');
  await type(page, '127');
  await type(page, 'M');

  // ---- b. La entrega NO se arma sola -------------------------------------
  await type(page, 'ETRANSMIT');
  await type(page, 'entrega-parcial');
  await expect(log, 'el veredicto va delante del recuento de ficheros').toContainText(
    /ETRANSMIT — NO ENTREGABLE/,
  );
  await expect(log, 'y dice QUÉ bloquea, citando el artículo: sin eso no se puede arreglar').toContainText(
    /Eléctrico: Circuito C-1: .*240-4\(D\)/,
  );
  await expect(log, 'ofrece armarlo igual, porque hay entregas parciales y quien firma decide').toContainText(
    /¿Empaquetar de todos modos\? El paquete lo dirá por dentro/,
  );

  // Un Enter NO vale por un sí.
  await page.keyboard.press('Enter');
  await expect(log, 'armar una entrega con defectos es una decisión, y se toma').toContainText(
    /no se armó el paquete/i,
  );

  // ---- c. Dicho que sí, el paquete sale y LO DICE POR DENTRO -------------
  await type(page, 'ETRANSMIT');
  await type(page, 'entrega-parcial');
  await expect(log).toContainText(/¿Empaquetar de todos modos\?/);
  const descarga = page.waitForEvent('download', { timeout: 30_000 });
  await type(page, 'Empaquetar');
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe('entrega-parcial.zip');

  const ruta = await archivo.path();
  expect(ruta, 'el paquete es un archivo de verdad').toBeTruthy();
  const bytes = await readFile(ruta!);
  expect(bytes[0], 'los bytes empiezan con la firma ZIP «PK»').toBe(0x50);
  expect(bytes[1]).toBe(0x4b);

  // El ZIP se escribe con método STORE —sin comprimir, y el módulo lo dice por
  // sinceridad—, así que lo que el paquete afirma se LEE, no se supone.
  const dentro = bytes.toString('latin1');
  expect(dentro, 'el informe legible viaja dentro del paquete').toContain('REVISION.txt');
  expect(
    dentro,
    'y avisa a quien lo recibe de que se armó a pesar de los bloqueos: lo caro es que no lo sepa',
  ).toContain('A PESAR de los hallazgos que bloquean');
  expect(dentro, 'con el hallazgo concreto').toContain('240-4(D)');
  expect(
    dentro,
    'y con los límites de la revisión: un informe que no dice lo que NO mira se lee como un certificado',
  ).toContain('no mira la integridad del archivo');
  expect(
    dentro,
    'el manifiesto lo lleva además en un campo, para una máquina que lo verifique',
  ).toContain('"packedDespiteBlocking": true');
});
