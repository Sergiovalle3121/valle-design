import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { enter3DView } from '../fixtures/view-mode';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * LAS SEIS CARAS DEL VIEWCUBE SON PULSABLES.
 *
 * El ViewCube muestra tres caras 3D (Superior, Frontal, Derecha) y tres
 * satélites (Izquierda, Posterior, Isométrica). Antes de este golden la cara
 * Derecha estaba de espaldas — `elementFromPoint` devolvía Frontal en su
 * posición — y Superior era una lámina de 12 px.
 *
 * ## Qué comprueba
 *
 * (a) REACHABILIDAD POR BARRIDO: para cada una de las seis caras, existe una
 *     zona de al menos 20×20 px donde todos los puntos barridos pertenecen a
 *     esa cara (o a un descendiente suyo).
 * (b) CLIC REAL: `getByTestId('cad-viewcube-face-X').click()` funciona para
 *     las seis sin «intercepts pointer events».
 * (c) NO CRECE: la caja del ViewCube cabe en 120×110 px.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
    ],
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

const VIEW_PRESETS = ['top', 'front', 'right', 'back', 'left', 'iso'] as const;
type Preset = (typeof VIEW_PRESETS)[number];

test.describe('ViewCube — seis caras pulsables', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await installCadStudioBackend<CadDocument>(context, seedDocument(), {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: 'mm',
      gridSize: 100,
    });
    page = context.pages()[0] ?? await context.newPage();
    await page.goto('/legacy/studio');
    await expect(page.getByTestId('cad-canvas')).toBeVisible();
    await enter3DView(page);
    // Saltar el recorrido guiado si aparece.
    const saltar = page.getByTestId('cad-guided-tour-skip');
    if (await saltar.count()) await saltar.click();
    // Esperar a que el ViewCube exista y sea alcanzable.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const c = document.querySelector('[data-testid="cad-viewcube"]');
            return c ? c.getBoundingClientRect().width : 0;
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  test('(c) el ViewCube no crece: cabe en 120×110 px', async () => {
    const box = await page.getByTestId('cad-viewcube').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(120);
    expect(box!.height).toBeLessThanOrEqual(110);
  });

  test('(a) cada cara tiene una zona accesible de ≥ 20×20 px', async () => {
    // Barrido: para cada cara, encontrar un cuadrado de ≥20×20 px donde
    // todos los puntos pertenezcan a esa cara.
    const result = await page.evaluate((presets: readonly string[]) => {
      const cube = document.querySelector('[data-testid="cad-viewcube"]');
      if (!cube) return { error: 'cad-viewcube no encontrado' };
      const cubeBox = cube.getBoundingClientRect();

      const hitTest = (x: number, y: number): string | null => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        // Buscar ascendiente con data-testid cad-viewcube-face-*
        let cur: Element | null = el;
        while (cur && cur !== cube) {
          const tid = cur.getAttribute('data-testid');
          if (tid?.startsWith('cad-viewcube-face-')) {
            return tid.replace('cad-viewcube-face-', '');
          }
          cur = cur.parentElement;
        }
        return null;
      };

      // Para cada preset, buscar una zona cuadrada de ≥20×20 donde TODOS
      // los puntos barridos (paso 2px) pertenezcan a esa cara.
      const zones: Record<string, { x: number; y: number; size: number } | null> = {};
      for (const preset of presets) {
        let found: { x: number; y: number; size: number } | null = null;
        // Probar esquinas en pasos de 4px dentro del cubo
        for (let sy = Math.floor(cubeBox.top); sy < cubeBox.bottom - 20; sy += 4) {
          for (let sx = Math.floor(cubeBox.left); sx < cubeBox.right - 20; sx += 4) {
            // Verificar si un cuadrado de 20×20 desde (sx,sy) pertenece todo a esta cara
            let dominated = true;
            for (let dy = 0; dy < 20 && dominated; dy += 2) {
              for (let dx = 0; dx < 20 && dominated; dx += 2) {
                const hit = hitTest(sx + dx, sy + dy);
                if (hit !== preset) dominated = false;
              }
            }
            if (dominated) {
              found = { x: sx, y: sy, size: 20 };
              break;
            }
          }
          if (found) break;
        }
        zones[preset] = found;
      }
      return { zones, cubeBox: { x: cubeBox.x, y: cubeBox.y, w: cubeBox.width, h: cubeBox.height } };
    }, VIEW_PRESETS);

    if ('error' in result) throw new Error(result.error);

    const missing = VIEW_PRESETS.filter((p) => !result.zones[p]);
    expect(
      missing,
      `Caras sin zona accesible ≥ 20×20: ${missing.join(', ')}. Caja: ${JSON.stringify(result.cubeBox)}`,
    ).toHaveLength(0);
  });

  test('(b) las seis caras responden a clic', async () => {
    for (const preset of VIEW_PRESETS) {
      const face = page.getByTestId(`cad-viewcube-face-${preset}`);
      await expect(face, `cara ${preset} visible`).toBeVisible();
      // Playwright comprueba accionabilidad: si otra capa intercepta el
      // puntero, `.click()` lanza «intercepts pointer events».
      await face.click();
    }
  });
});
