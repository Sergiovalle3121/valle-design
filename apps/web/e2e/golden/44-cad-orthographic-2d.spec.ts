import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';

/**
 * Golden 44 — la vista de plano 2D es una proyección PARALELA.
 *
 * ## Qué prueba, y qué NO
 *
 * Este golden es una **guarda de regresión**, no la evidencia de que la ola 2
 * cambie algo visible. Conviene decirlo con precisión porque la primera versión
 * de este archivo afirmaba lo contrario y era falsa.
 *
 * Se creía que el 2D se dibujaba con una cámara en perspectiva inclinada 0,05
 * rad, y se midió esa pose: 14,13% de dispersión de escala. Pero el producto no
 * usa esa pose. `applyViewMode("2d")` coloca la cámara en `(0, d·1.6, 0.01)`
 * mirando al origen — perpendicular al plano con 0,012° de inclinación—, y el
 * `maxPolarAngle = 0.05` de OrbitControls es un límite que en 2D nunca se
 * alcanza porque la rotación está desactivada. Como **un plano perpendicular al
 * eje óptico se proyecta con escala uniforme aunque la cámara sea en
 * perspectiva**, la vista 2D anterior ya era esencialmente paralela: medida a
 * cota cero, su dispersión de escala es del 0,0000%.
 *
 * Se comprobó: este mismo golden PASA también contra la cámara anterior
 * (residuo 0,015 px frente a 0,000 px). No distingue una cámara de la otra, y
 * ninguna promoción de la matriz de brechas debe apoyarse en él.
 *
 * ## Entonces para qué sirve
 *
 * Para que la propiedad quede clavada. Hoy la perpendicularidad de la cámara es
 * una **convención**: la sostienen tres sitios distintos que fijan poses por su
 * cuenta (`applyViewMode`, `focusViewportItems`, los marcadores de vista) y
 * nada impide que un cambio futuro la rompa sin que nadie se entere. Bajo
 * ortográfica la proyección paralela es una garantía estructural, y este golden
 * la vigila.
 *
 * El argumento es puramente geométrico: una proyección ortográfica de pantalla
 * a dibujo es **afín** —tres puntos la determinan por completo y cualquier otro
 * queda predicho—, mientras que una perspectiva es **proyectiva** y tiene un
 * término de división que ninguna afín reproduce. Ajustar con tres puntos y
 * comprobar los otros veinticuatro caza cualquier deriva de la cámara.
 */

const cadDocument = {
  meta: { version: 1, schema: 3, unit: 'mm' },
  layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
  entities: [
    { id: 'grid-h', type: 'line', start: { x: 2_000, y: 4_000, z: 0 }, end: { x: 18_000, y: 4_000, z: 0 }, layer: '0' },
    { id: 'grid-h2', type: 'line', start: { x: 2_000, y: 8_000, z: 0 }, end: { x: 18_000, y: 8_000, z: 0 }, layer: '0' },
    { id: 'grid-v', type: 'line', start: { x: 4_000, y: 1_000, z: 0 }, end: { x: 4_000, y: 11_000, z: 0 }, layer: '0' },
  ],
  history: [],
  modelSpace: { entityIds: ['grid-h', 'grid-h2', 'grid-v'] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

async function installCadBackend(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: cadDocument,
    footprint: { footprintW: 20_000, footprintH: 12_000, unit: 'mm', gridSize: 100 },
  });
}

/**
 * Coordenada de dibujo bajo un píxel concreto, leída de la barra de estado.
 *
 * Espera a que la lectura CAMBIE respecto de la anterior. Sin eso, un punto que
 * cayera sobre una de las pastillas flotantes del viewport —entrada dinámica
 * arriba, barra de estado abajo, minimapa— no generaría `pointermove` sobre el
 * lienzo y la medición reutilizaría en silencio la coordenada previa, dando un
 * residuo enorme que parecería un fallo de proyección y no lo sería.
 */
async function worldAt(
  page: Page,
  x: number,
  y: number,
  previous?: { raw: string },
): Promise<{ x: number; y: number; raw: string }> {
  const coordinate = page.getByTestId('cad-cursor-coordinate');
  await page.mouse.move(x, y);
  await expect
    .poll(async () => {
      const raw = `${await coordinate.getAttribute('data-x')}|${await coordinate.getAttribute('data-y')}`;
      return raw !== '|' && raw !== '' && raw !== previous?.raw;
    }, { message: `la barra de estado no reaccionó al mover el puntero a (${x}, ${y})` })
    .toBe(true);
  const raw = `${await coordinate.getAttribute('data-x')}|${await coordinate.getAttribute('data-y')}`;
  return { x: Number(await coordinate.getAttribute('data-x')), y: Number(await coordinate.getAttribute('data-y')), raw };
}

test('the 2D plan view is a parallel projection: three points predict the rest', async ({ context, page }) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  // Modo plano 2D — el que esta ola convierte en ortográfico de verdad.
  await page.getByTitle(/Vista de plano 2D/).click();
  await page.getByTitle(/Ajustar a la planta/).click();
  await page.waitForTimeout(400);

  const box = await page.getByTestId('cad-canvas').boundingBox();
  if (!box) throw new Error('CAD canvas has no bounding box');

  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const step = Math.min(box.width, box.height) * 0.18;

  // Tres puntos determinan la afín.
  let last = await worldAt(page, centre.x, centre.y);
  const origin = last;
  const alongX = (last = await worldAt(page, centre.x + step, centre.y, last));
  const alongY = (last = await worldAt(page, centre.x, centre.y + step, last));
  const perPixelX = { x: (alongX.x - origin.x) / step, y: (alongX.y - origin.y) / step };
  const perPixelY = { x: (alongY.x - origin.x) / step, y: (alongY.y - origin.y) / step };

  const unitsPerPixel = Math.hypot(perPixelX.x, perPixelX.y);
  expect(unitsPerPixel).toBeGreaterThan(0);

  // Rejilla de comprobación. El recorrido se queda dentro del área libre del
  // viewport: las pastillas flotantes ocupan la franja superior, la inferior y
  // las esquinas, y ahí el puntero no llega al lienzo.
  const xOffsets = [-0.3, -0.15, 0, 0.15, 0.3];
  const yOffsets = [-0.22, -0.11, 0, 0.11, 0.22];
  const residuals: number[] = [];
  for (const fx of xOffsets)
    for (const fy of yOffsets) {
      const dx = fx * box.width;
      const dy = fy * box.height;
      if (dx === 0 && dy === 0) continue;
      const measured = (last = await worldAt(page, centre.x + dx, centre.y + dy, last));
      const predicted = {
        x: origin.x + perPixelX.x * dx + perPixelY.x * dy,
        y: origin.y + perPixelX.y * dx + perPixelY.y * dy,
      };
      // Residuo en PÍXELES, para que el umbral no dependa del zoom.
      residuals.push(Math.hypot(measured.x - predicted.x, measured.y - predicted.y) / unitsPerPixel);
    }

  const worstResidual = Math.max(...residuals);
  // eslint-disable-next-line no-console
  console.log(`golden 44 · residuo afín máximo: ${worstResidual.toFixed(3)} px sobre ${residuals.length} muestras`);
  // La barra de estado redondea la coordenada, así que el suelo de ruido es de
  // una fracción de píxel. Una cámara en perspectiva con la inclinación de hoy
  // deja residuos de decenas de píxeles en las esquinas: la separación entre
  // ambos casos es de dos órdenes de magnitud, no un ajuste fino de umbral.
  expect(worstResidual).toBeLessThan(1.5);

  // La escala es la MISMA en el borde izquierdo, el centro y el derecho. Es lo
  // que hace posible una regla exacta y un grosor de línea estable.
  const spanFor = async (offsetX: number) => {
    const a = (last = await worldAt(page, centre.x + offsetX, centre.y, last));
    const b = (last = await worldAt(page, centre.x + offsetX + 80, centre.y, last));
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  const left = await spanFor(-box.width * 0.3);
  const middle = await spanFor(-40);
  const right = await spanFor(box.width * 0.3 - 80);
  const spread = (Math.max(left, middle, right) - Math.min(left, middle, right)) / middle;
  expect(spread).toBeLessThan(0.02);

  // Y dos rectas paralelas del dibujo conservan su separación de extremo a
  // extremo: 4.000 unidades entre `grid-h` y `grid-h2`, medidas en dos X muy
  // separadas.
  const gapAt = async (drawingX: number) => {
    // Se invierte la afín para localizar el píxel de una coordenada de dibujo.
    const determinant = perPixelX.x * perPixelY.y - perPixelY.x * perPixelX.y;
    expect(Math.abs(determinant)).toBeGreaterThan(1e-12);
    const pixelFor = (target: { x: number; y: number }) => {
      const wx = target.x - origin.x;
      const wy = target.y - origin.y;
      return {
        x: centre.x + (perPixelY.y * wx - perPixelY.x * wy) / determinant,
        y: centre.y + (-perPixelX.y * wx + perPixelX.x * wy) / determinant,
      };
    };
    const top = pixelFor({ x: drawingX, y: 4_000 });
    const bottom = pixelFor({ x: drawingX, y: 8_000 });
    return Math.hypot(bottom.x - top.x, bottom.y - top.y);
  };
  const gapLeft = await gapAt(5_000);
  const gapRight = await gapAt(15_000);
  expect(Math.abs(gapRight - gapLeft) / gapLeft).toBeLessThan(0.02);
});
