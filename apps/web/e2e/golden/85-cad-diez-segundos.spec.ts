import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { fitFootprint } from '../fixtures/camera-preset';
import { worldPoint } from '../fixtures/world-point';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LA PRUEBA DE LOS DIEZ SEGUNDOS.
 *
 * El instrumento A de `docs/competitive/distancia-autocad-completo-20260901.md`,
 * §3. Diez renglones, aprobado o reprobado, sin puntos parciales: la secuencia
 * que un dibujante de AutoCAD hace SIN PENSAR en los primeros diez segundos, con
 * el foco donde cae de forma natural —el lienzo— y afirmando el EFECTO, no el
 * aspecto del diálogo.
 *
 *   1. `L` ⏎                         → ¿empezó LINE?
 *   2. clic, clic, Espacio           → ¿terminó el comando?
 *   3. Espacio                       → ¿repitió LINE?
 *   4. `M` ⏎                         → ¿es MOVE (y no la herramienta de medir)?
 *   5. `E` ⏎                         → ¿es ERASE (y no exportar DXF)?
 *   6. arrastre izq→der              → ¿designó por ventana?
 *   7. arrastre der→izq              → ¿designó por cruce?
 *   8. doble clic sobre un MTEXT     → ¿abrió su editor?
 *   9. rueda sobre una esquina       → ¿se acercó a ESA esquina?
 *  10. `U` ⏎                         → ¿deshizo?
 *
 * ## Por qué `expect.soft`
 *
 * El informe pide un MARCADOR, no un primer fallo. Con `expect` normal, un
 * renglón rojo esconde los nueve siguientes y la siguiente ola no sabe si
 * arregló uno o cinco. Con `expect.soft` la prueba sigue hasta el final, falla
 * igual si algo falla —el veredicto no se ablanda— y el informe de Playwright
 * lista TODOS los renglones reprobados de una corrida. Es exactamente el
 * «aprobado/reprobado, sin puntos parciales» del instrumento.
 *
 * ## Cómo se distingue un comando de otro
 *
 * `M` y `E` resuelven los dos a «Designe objetos», así que el prompt no basta:
 * lo que separa MOVE de MEASURE y ERASE de «exportar DXF» es lo que PASA
 * después. MOVE, tras designar, pide el punto base; ERASE, tras designar,
 * BORRA. Las dos cosas se afirman sobre el documento del editor, no sobre el
 * texto de un diálogo.
 *
 * ## El orden real, y por qué se desvía del papel
 *
 * Los renglones 6 y 7 (designar por ventana y por cruce) se ejecutan antes que
 * el 4 y el 5, porque MOVE y ERASE CONSUMEN la designación y dejarían los dos
 * arrastres sin nada que medir. Cada renglón conserva su número del informe;
 * lo que cambia es el orden de ejecución, no lo que afirma.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      { id: 'baja', type: 'line', start: { x: 2_000, y: 2_000, z: 0 }, end: { x: 3_000, y: 2_000, z: 0 }, layer: '0' },
      { id: 'alta', type: 'line', start: { x: 2_000, y: 3_000, z: 0 }, end: { x: 3_000, y: 3_000, z: 0 }, layer: '0' },
      {
        id: 'rotulo',
        type: 'mtext',
        insertion: { x: 5_500, y: 4_500, z: 0 },
        text: 'PLANTA BAJA',
        height: 200,
        width: 2_000,
        rotation: 0,
        alignment: 'top-left',
        layer: '0',
      },
    ],
    history: [], modelSpace: { entityIds: ['baja', 'alta', 'rotulo'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function openPlan(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 8_000, footprintH: 6_000, unit: 'mm', gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const skip = page.getByTestId('cad-guided-tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByTitle(/Vista de plano 2D/).click();
  await fitFootprint(page);
}

const prompt = (page: Page) => page.getByTestId('cad-command-prompt');
const input = (page: Page) => page.getByTestId('cad-command-input');
const selection = (page: Page) => page.getByTestId('cad-selection-status-count');
const nativeCount = (page: Page) => page.getByTestId('cad-native-document-count');

/** Teclea con el LIENZO enfocado, sin pulsar la caja. Es el gesto entero. */
async function type(page: Page, value: string) {
  await page.keyboard.type(value);
  await expect(input(page)).toHaveValue(value);
  await page.keyboard.press('Enter');
}

/** Lo que el HUD lee en un píxel concreto, con la lectura forzada a refrescar. */
async function hudAt(page: Page, point: { x: number; y: number }) {
  const hud = page.getByTestId('cad-cursor-coordinate');
  const read = async () => `${await hud.getAttribute('data-x')}|${await hud.getAttribute('data-y')}`;
  await page.mouse.move(point.x - 4, point.y - 4);
  const neighbour = await read();
  await page.mouse.move(point.x, point.y);
  await expect.poll(read, { timeout: 15_000 }).not.toBe(neighbour);
  const [x, y] = (await read()).split('|').map(Number);
  return { x, y };
}

async function dragWorld(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await worldPoint(page, from);
  const b = await worldPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test('los diez segundos: los diez gestos que un dibujante de AutoCAD hace sin pensar', async ({ context, page }) => {
  test.setTimeout(300_000);
  await openPlan(context, page);
  /**
   * El centro del lienzo se recalcula CADA VEZ, no se captura una vez.
   *
   * Medido: designar abre el panel de propiedades a la derecha, el lienzo
   * encoge y un centro capturado al principio cae debajo del panel — el HUD se
   * queda congelado y el fallo no menciona el panel por ningún lado.
   */
  const centro = async () => {
    const box = (await page.getByTestId('cad-canvas').boundingBox())!;
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  };

  // ── 1 · `L` ⏎ empieza LINE ────────────────────────────────────────────────
  await type(page, 'L');
  await expect.soft(prompt(page), '1 · «L» ⏎ con el lienzo enfocado empieza LINE').toContainText('primer punto');

  // ── 2 · clic, clic, Espacio termina el comando ────────────────────────────
  const p1 = await worldPoint(page, { x: 5_000, y: 1_000 });
  await page.mouse.click(p1.x, p1.y);
  const p2 = await worldPoint(page, { x: 6_000, y: 1_000 });
  await page.mouse.click(p2.x, p2.y);
  await page.keyboard.press('Space');
  await expect.soft(prompt(page), '2 · Espacio termina el comando').toBeHidden();
  await expect.soft(nativeCount(page), '2 · y el segmento dibujado llegó al documento').toHaveText('Native 4');

  // ── 3 · Espacio otra vez repite LINE ──────────────────────────────────────
  await page.keyboard.press('Space');
  await expect.soft(prompt(page), '3 · Espacio repite el último comando').toContainText('primer punto');
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toBeHidden();

  // ── 6 · arrastre izq→der designa por VENTANA ──────────────────────────────
  await fitFootprint(page);
  await dragWorld(page, { x: 1_500, y: 1_500 }, { x: 3_500, y: 3_500 });
  await expect.soft(selection(page), '6 · arrastrar de izquierda a derecha designa por ventana').toContainText('2 sel');

  // ── 7 · arrastre der→izq designa por CRUCE ────────────────────────────────
  const centro7 = await centro();
  await page.mouse.click(centro7.x, centro7.y);
  await expect(selection(page)).toContainText('0 sel');
  await dragWorld(page, { x: 2_500, y: 2_500 }, { x: 1_500, y: 1_500 });
  await expect.soft(selection(page), '7 · arrastrar de derecha a izquierda designa por cruce').toContainText('1 sel');
  const centro7b = await centro();
  await page.mouse.click(centro7b.x, centro7b.y);
  await expect(selection(page)).toContainText('0 sel');

  // ── 4 · `M` ⏎ es MOVE, no la herramienta de medir ─────────────────────────
  //
  // Se designa DESPUÉS de teclear, como en AutoCAD, y lo que separa MOVE de
  // MEASURE es que tras designar pide el PUNTO BASE.
  await type(page, 'M');
  await expect.soft(prompt(page), '4 · «M» ⏎ pide objetos, como MOVE').toContainText('Designe objetos');
  const sobreBaja = await worldPoint(page, { x: 2_500, y: 2_000 });
  await page.mouse.click(sobreBaja.x, sobreBaja.y);
  await expect.soft(prompt(page), '4 · y tras designar pide el punto base: es MOVE, no MEASURE').toContainText('base');
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toBeHidden();

  // ── 5 · `E` ⏎ es ERASE, no el diálogo de exportar DXF ─────────────────────
  //
  // Se suelta antes lo que el renglón 4 dejó designado: con designación previa
  // ERASE borra sin preguntar —que es lo correcto y lo que hace AutoCAD— y este
  // renglón mide otra cosa, que la letra resuelva a ERASE.
  const centro5 = await centro();
  await page.mouse.click(centro5.x, centro5.y);
  await expect(selection(page)).toContainText('0 sel');
  await type(page, 'E');
  await expect.soft(prompt(page), '5 · «E» ⏎ pide objetos, como ERASE').toContainText('Designe objetos');
  const sobreAlta = await worldPoint(page, { x: 2_500, y: 3_000 });
  await page.mouse.click(sobreAlta.x, sobreAlta.y);
  await expect.soft(nativeCount(page), '5 · y borra lo designado: es ERASE, no exportar DXF').toHaveText('Native 3');

  // ── 10 · `U` ⏎ deshace ────────────────────────────────────────────────────
  await type(page, 'U');
  await expect.soft(nativeCount(page), '10 · «U» ⏎ deshace la última orden').toHaveText('Native 4');

  // ── 8 · doble clic sobre un MTEXT abre su editor ──────────────────────────
  await fitFootprint(page);
  const sobreRotulo = await worldPoint(page, { x: 5_600, y: 4_400 });
  await page.mouse.dblclick(sobreRotulo.x, sobreRotulo.y);
  await expect
    .soft(page.getByTestId('cad-mtext-editor'), '8 · doble clic sobre un MTEXT abre su editor')
    .toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Escape');

  // ── 9 · la rueda acerca HACIA EL CURSOR ───────────────────────────────────
  //
  // Dos aserciones, y las dos hacen falta: que el punto de mundo bajo el cursor
  // NO se mueva (el zoom fue hacia el cursor) y que el centro del lienzo SÍ se
  // mueva (hubo zoom de verdad, no un no-op que pasaría la primera).
  await page.keyboard.press('Escape');
  const centro9 = await centro();
  await page.mouse.click(centro9.x, centro9.y);
  await expect(selection(page)).toContainText('0 sel');
  await fitFootprint(page);
  const centro9b = await centro();
  const esquina = { x: centro9b.x + 180, y: centro9b.y - 120 };
  /** Unidades de mundo por cada 200 px: la escala de la vista, medida en el HUD. */
  const escala = async () => {
    const a = await hudAt(page, esquina);
    const b = await hudAt(page, { x: esquina.x + 200, y: esquina.y });
    return { bajoElCursor: a, unidadesPor200px: Math.abs(b.x - a.x) };
  };
  const antes = await escala();
  await page.mouse.move(esquina.x, esquina.y);
  for (let paso = 0; paso < 4; paso += 1) await page.mouse.wheel(0, -240);
  const despues = await escala();
  const derivaBajoElCursor = Math.hypot(
    despues.bajoElCursor.x - antes.bajoElCursor.x,
    despues.bajoElCursor.y - antes.bajoElCursor.y,
  );
  // Primero: que la rueda haya hecho ZOOM de verdad. Sin esta aserción, una
  // rueda muerta pasaría la segunda —el punto bajo el cursor no se movería
  // porque no se movió nada— y el renglón mentiría en la dirección más cara.
  expect
    .soft(despues.unidadesPor200px, '9 · la rueda acercó de verdad (la vista mide menos mundo por píxel)')
    .toBeLessThan(antes.unidadesPor200px * 0.9);
  // Y segundo: que el acercamiento haya ido HACIA EL CURSOR. Con
  // `zoomToCursor` el punto de mundo bajo la rueda es invariante; con el
  // defecto de OrbitControls el zoom va al centro de la vista y ese punto se
  // desplaza cientos de unidades (medido: 1715,7 antes de esta ola).
  expect
    .soft(derivaBajoElCursor, '9 · y fue HACIA EL CURSOR: el punto de mundo bajo la rueda no se movió')
    .toBeLessThan(antes.unidadesPor200px * 0.1);
});
