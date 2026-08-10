import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * OLA 4 — AutoLISP deja de ser una isla.
 *
 * El subsistema `lib/lisp/` llevaba una ola entera terminado —lector,
 * evaluador, funciones de entidad por códigos DXF, sandbox con presupuesto— y
 * NADIE lo importaba. Un veterano de AutoCAD no podía cargar ni ejecutar una
 * sola de las rutinas que lleva veinte años escribiendo, que es exactamente lo
 * que le impide cambiar de herramienta.
 *
 * Este golden recorre el gesto completo contra el producto de verdad, con
 * NestJS y PostgreSQL detrás:
 *
 *   APPLOAD                → la consola LISP se abre
 *   se elige un .lsp       → aparece en la lista, con el comando que aporta
 *   MURETE ⏎               → el comando `c:` se teclea como si fuera nativo
 *   (+ 1 2) ⏎              → la evaluación directa responde 3
 *   Guardar                → la geometría está en el documento GUARDADO
 *
 * Lo que se afirma al final NO es lo que se ve en pantalla: es el documento
 * canónico que el backend recibió. Una rutina que dibuja algo que no se guarda
 * no ha conectado nada.
 */

/** Una rutina como las que trae un estudio: parametrizada y con su `c:` encima. */
const RUTINA = `
;;; MURETE.LSP — un murete con su eje, como los que reparte cualquier rutina
;;; de estudio. Dibuja con entmake sobre el documento canónico.

(defun vd:murete (x1 y1 x2 y2 espesor capa)
  (entmake (list (cons 0 "LWPOLYLINE")
                 (cons 90 4)
                 (cons 70 1)
                 (cons 8 capa)
                 (list 10 x1 y1)
                 (list 10 x2 y1)
                 (list 10 x2 (+ y1 espesor))
                 (list 10 x1 (+ y1 espesor))))
  (entmake (list (cons 0 "CIRCLE")
                 (cons 8 capa)
                 (list 10 x1 y1 0.0)
                 (cons 40 60.0)))
  espesor)

(defun c:MURETE ()
  (vd:murete 0.0 0.0 3000.0 0.0 250.0 "0")
  (princ "\\nmurete de 3000 x 250"))
`;

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [],
    history: [], modelSpace: { entityIds: [] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

test('APPLOAD carga un .lsp, su comando c: se teclea como nativo y la geometría llega al documento guardado', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await expect(page.getByTestId('cad-command-line')).toBeVisible();
  // La consola no está montada hasta que se pide: no ocupa sitio de balde.
  await expect(page.getByTestId('cad-lisp-palette')).toHaveCount(0);

  // --- APPLOAD abre la consola ----------------------------------------------
  await type(page, 'APPLOAD');
  const palette = page.getByTestId('cad-lisp-palette');
  await expect(palette).toBeVisible();

  // --- se elige el .lsp del disco del usuario --------------------------------
  await page.getByTestId('cad-lisp-file-input').setInputFiles({
    name: 'murete.lsp',
    mimeType: 'text/plain',
    buffer: Buffer.from(RUTINA, 'utf8'),
  });

  // La biblioteca dice qué se cargó y QUÉ COMANDO aporta. Sin esa segunda
  // mitad, cargar una rutina es un acto de fe.
  const routines = page.getByTestId('cad-lisp-routines');
  await expect(routines).toContainText('murete.lsp');
  await expect(routines).toContainText('v1');
  await expect(routines).toContainText('MURETE');
  await expect(page.getByTestId('cad-lisp-command-count')).toContainText('1 comando');

  // --- el comando c: se teclea en la línea de comandos, como cualquier nativo -
  await type(page, 'MURETE');

  // El editor reconoce la geometría: una polilínea y un círculo.
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 2');
  // Y lo que la rutina imprimió está en la consola, que es donde un .lsp escribe.
  await expect(page.getByTestId('cad-lisp-log')).toContainText('murete de 3000 x 250');

  // --- la evaluación directa responde en el acto ------------------------------
  await type(page, '(+ 1 2)');
  await expect(page.getByTestId('cad-command-line-log')).toContainText('3');
  // Las cadenas conservan sus mayúsculas pese a que el motor normalice el
  // nombre de lo tecleado: es la razón de que el texto original se apunte.
  await type(page, '(strcat "Valle " "Design")');
  await expect(page.getByTestId('cad-lisp-log')).toContainText('Valle Design');

  // --- y lo dibujado está en el documento GUARDADO ----------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved).toHaveLength(2);

  const polyline = saved.find((entity) => entity.type === 'polyline');
  expect(polyline).toBeDefined();
  if (polyline?.type === 'polyline') {
    // Anclas absolutas: el murete tiene que estar donde la rutina lo puso.
    expect(polyline.closed).toBe(true);
    expect(polyline.vertices).toHaveLength(4);
    expect(polyline.vertices[1]).toMatchObject({ x: 3000, y: 0 });
    expect(polyline.vertices[2]).toMatchObject({ x: 3000, y: 250 });
    expect(polyline.layer).toBe('0');
  }

  const circle = saved.find((entity) => entity.type === 'circle');
  expect(circle).toBeDefined();
  if (circle?.type === 'circle') {
    expect(circle.center).toMatchObject({ x: 0, y: 0 });
    expect(circle.radius).toBe(60);
  }
});

test('una rutina hostil se corta diciéndolo y deja el editor entero', async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-command-line')).toBeVisible();

  await type(page, 'APPLOAD');
  await page.getByTestId('cad-lisp-file-input').setInputFiles({
    name: 'hostil.lsp',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '(defun vd:bucle () (vd:bucle))\n(defun c:HOSTIL () (vd:bucle))\n',
      'utf8',
    ),
  });
  await expect(page.getByTestId('cad-lisp-routines')).toContainText('HOSTIL');

  await type(page, 'HOSTIL');

  // Falla DICIÉNDOLO. Un sandbox que corta en silencio deja al usuario creyendo
  // que su rutina hizo algo.
  await expect(page.getByTestId('cad-lisp-log')).toContainText('recursión');
  await expect(page.getByTestId('cad-lisp-trace')).toBeVisible();

  // Y el editor sigue entero: el comando siguiente funciona con normalidad y
  // dibuja de verdad.
  await type(page, 'L');
  await expect(page.getByTestId('cad-command-prompt')).toBeVisible();
  await type(page, '0,0');
  await type(page, '@1000,0');
  // Enter con la caja vacía termina la orden, que es el gesto de AutoCAD.
  await page.getByTestId('cad-command-input').press('Enter');
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 1');

  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  // Sólo la línea que se dibujó después: la rutina hostil no escribió nada.
  expect(saved).toHaveLength(1);
  expect(saved[0].type).toBe('line');
});
