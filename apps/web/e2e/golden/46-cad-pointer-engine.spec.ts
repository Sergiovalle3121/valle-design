import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { enter3DView } from '../fixtures/view-mode';
import { topView, fitFootprint } from "../fixtures/camera-preset";
import { startTool } from "../fixtures/tool-palette";

/**
 * FASE 2 — el PUNTERO entra en el motor de comandos.
 *
 * Hasta este cambio los 63 comandos del motor eran SÓLO de teclado: con el
 * ratón mandaba `cad-command.ts`, 162 líneas con siete comandos cableados. Un
 * CAD en el que dibujar con el ratón y dibujar con el teclado son dos motores
 * distintos se siente roto aunque los dos funcionen — la orden tecleada acepta
 * `Cerrar` y la del ratón no, y deshacer no significa lo mismo en los dos
 * caminos.
 *
 * Este golden fija que las DOS entradas producen la misma geometría, y lo hace
 * con el gesto completo de un CAD:
 *
 *   PLINE · clic · clic CERCA de un extremo existente (lo captura EXACTO) ·
 *   clic · botón derecho → «Cerrar»
 *
 * Lo que se afirma es el DOCUMENTO: una polilínea cerrada cuyo vértice
 * capturado vale EXACTAMENTE la coordenada del extremo sembrado, no «casi».
 * Que la insignia del snap aparezca no prueba nada si el punto que entra al
 * motor es el crudo del ratón; que el vértice guardado sea exacto, sí.
 */

/** Extremo sembrado al que hay que capturar. Números redondos a propósito. */
const SNAP_TARGET = { x: 6_000, y: 4_000 };

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'ancla',
        type: 'line',
        start: { x: 2_000, y: 4_000, z: 0 },
        end: { x: SNAP_TARGET.x, y: SNAP_TARGET.y, z: 0 },
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['ancla'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [],
    unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  return backend;
}

/**
 * Pantalla ↔ dibujo, deducido del propio editor.
 *
 * Se muestrea la coordenada que el editor publica bajo el cursor en tres
 * puntos y se invierte la afín resultante. Es el mismo método del golden 33:
 * no depende de la cámara, del zoom ni de la huella, sólo de que el editor
 * diga la verdad sobre dónde está el ratón.
 */
async function screenPointFor(page: Page, target: { x: number; y: number }) {
  const box = await page.getByTestId('cad-canvas').boundingBox();
  if (!box) throw new Error('El lienzo CAD no tiene caja');
  const coordinate = page.getByTestId('cad-cursor-coordinate');
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await expect.poll(async () => coordinate.getAttribute('data-x')).not.toBe('');
    return {
      x: Number(await coordinate.getAttribute('data-x')),
      y: Number(await coordinate.getAttribute('data-y')),
    };
  };
  const screen = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const origin = await sample(screen.x, screen.y);
  const horizontal = await sample(screen.x + 80, screen.y);
  const vertical = await sample(screen.x, screen.y + 80);
  const a = (horizontal.x - origin.x) / 80;
  const b = (vertical.x - origin.x) / 80;
  const c = (horizontal.y - origin.y) / 80;
  const d = (vertical.y - origin.y) / 80;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) throw new Error('La transformada mundo/pantalla es singular');
  const wx = target.x - origin.x;
  const wy = target.y - origin.y;
  return {
    x: screen.x + (d * wx - b * wy) / determinant,
    y: screen.y + (a * wy - c * wx) / determinant,
  };
}

test('dibujar una polilínea CON EL RATÓN captura un extremo existente y cierra por palabra clave', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);

  await startTool(page, 'polyline');
  // El prompt es el del MOTOR, no el de la máquina heredada: si el botón
  // siguiera arrancando `cad-command.ts`, aquí no habría diálogo del motor.
  await expect(page.getByTestId('cad-command-prompt')).toBeVisible();

  const first = await screenPointFor(page, { x: 2_000, y: 8_000 });
  await page.mouse.click(first.x, first.y);

  // --- CURSOR VIVO: acercarse al extremo sembrado enciende la insignia ------
  // Se apunta 60 unidades de dibujo AL LADO del extremo: dentro de la apertura
  // de captura, pero claramente no encima. Si el punto que entra al motor
  // fuese el crudo del ratón, el vértice guardado saldría desplazado.
  const nearEndpoint = await screenPointFor(page, {
    x: SNAP_TARGET.x - 60,
    y: SNAP_TARGET.y - 60,
  });
  await page.mouse.move(nearEndpoint.x, nearEndpoint.y);
  const badge = page.getByTestId('cad-live-snap');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-snap', 'endpoint');
  await page.mouse.click(nearEndpoint.x, nearEndpoint.y);

  const third = await screenPointFor(page, { x: 9_000, y: 8_000 });
  await page.mouse.click(third.x, third.y);

  // --- MENÚ CONTEXTUAL: las palabras clave del paso, bajo el botón derecho --
  await page.mouse.click(third.x, third.y, { button: 'right' });
  const menu = page.getByTestId('cad-pointer-menu');
  await expect(menu).toBeVisible();
  // Y ACEPTAR y CANCELAR, que faltaban: con dos puntos puestos el menú ofrecía
  // sólo «desHacer», así que cerrar lo que estabas dibujando obligaba a soltar
  // el ratón e ir al teclado. Aceptar va PRIMERO —queda bajo el cursor— y
  // cancelar al final, lejos, porque tirar el trabajo en curso no puede quedar
  // a un píxel de cerrarlo (`viewport/pointer-menu.ts`).
  const opciones = menu.getByRole('button');
  await expect(opciones.first(), 'aceptar encabeza el menú').toHaveText('Aceptar');
  await expect(opciones.last(), 'cancelar lo cierra').toHaveText('Cancelar');
  await expect(menu.getByTestId('cad-pointer-accept')).toBeVisible();
  await expect(menu.getByTestId('cad-pointer-cancel')).toBeVisible();
  const close = menu.getByTestId(/^cad-pointer-keyword-(Cerrar|Close)$/);
  await expect(close).toBeVisible();
  await close.click();

  // El comando terminó: ni prompt, ni menú, ni banda elástica.
  await expect(page.getByTestId('cad-command-prompt')).toBeHidden();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 2');

  // --- EL DOCUMENTO: la prueba de que las dos entradas coinciden ------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  const polyline = saved.entities.find((entity) => entity.type === 'polyline');
  expect(polyline, 'el ratón tiene que haber creado una POLILÍNEA canónica').toBeTruthy();
  if (polyline?.type !== 'polyline') throw new Error('inalcanzable');
  expect(polyline.closed, '«Cerrar» cierra la polilínea, no sólo termina el comando').toBe(true);
  expect(polyline.vertices).toHaveLength(3);
  expect(polyline.layer).toBe('0');

  // LA ANCLA ABSOLUTA. El segundo vértice vale EXACTAMENTE el extremo sembrado.
  // Sin captura valdría (5940, 3940) —donde cayó el ratón—, y la polilínea
  // parecería correcta en pantalla mientras deja un hueco de 85 mm.
  expect(polyline.vertices[1].x).toBeCloseTo(SNAP_TARGET.x, 6);
  expect(polyline.vertices[1].y).toBeCloseTo(SNAP_TARGET.y, 6);
  // Y la línea sembrada sigue intacta: dibujar encima no la mueve.
  const anchor = saved.entities.find((entity) => entity.id === 'ancla');
  expect(anchor).toMatchObject({ end: { x: SNAP_TARGET.x, y: SNAP_TARGET.y, z: 0 } });

  // UN paso de deshacer para la polilínea entera, no uno por vértice: es la
  // propiedad central del embudo de mutación, y el ratón no puede saltársela.
  await expect(page.getByTestId('cad-history-depth')).toHaveAttribute('data-undo', '1');
});

test('con el motor abierto, la máquina heredada no recibe el clic', async ({ context, page }) => {
  test.setTimeout(180_000);
  await openStudio(context, page);
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);

  await startTool(page, 'line');
  // ola1-paleta (2026-09-19): el atajo nativo «L» sólo dispara
  // TOOLBAR_SHORTCUT_IDS con el muelle de comandos OCULTO — si estuviera a la
  // vista, Fase 0 (editor-keyboard.ts) tecleaba la «L» EN la caja en vez de
  // arrancar la herramienta. `startTool` pliega ese muelle antes de pulsar la
  // tecla (`ensureCommandDockHidden`, tool-palette.ts) y no lo repone, así que
  // `cad-command-line-dock` — y con él `cad-command-prompt` — no vuelve a
  // montarse en lo que queda del test: ya no hay nada que mirar ahí. La
  // entrada dinámica junto al cursor (la señal de que el MOTOR, no la máquina
  // heredada, abrió el comando) la comprobó `startTool` justo antes de volver.
  // La prueba de que la heredada no recibió el clic sigue abajo, sobre el
  // DOCUMENTO: si también escuchara, el contador ya diría 2 antes del Enter.

  const a = await screenPointFor(page, { x: 3_000, y: 2_000 });
  const b = await screenPointFor(page, { x: 7_000, y: 2_000 });
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);

  // LINE encadena y NO escribe hasta terminar: un lote, un paso de deshacer.
  // Si además la máquina heredada estuviera escuchando, esos mismos dos clics
  // habrían creado su propio segmento y el contador ya diría 2.
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 1');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 2');
  await expect(page.getByTestId('cad-history-depth')).toHaveAttribute('data-undo', '1');

  // Y Esc sobre un comando nuevo cancela sin escribir nada. (El muelle de
  // comandos sigue oculto desde el primer `startTool` de arriba, así que
  // `cad-command-prompt` está oculto por no existir — la prueba real de que
  // no escribió nada es el contador, que sigue abajo.)
  await startTool(page, 'line');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 2');
  await expect(page.getByTestId('cad-history-depth')).toHaveAttribute('data-undo', '1');
});
