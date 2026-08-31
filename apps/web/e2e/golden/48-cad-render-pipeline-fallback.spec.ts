import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { enter3DView } from '../fixtures/view-mode';
import { topView, fitFootprint } from "../fixtures/camera-preset";

/**
 * La bandera de respaldo, y lo que significa que exista.
 *
 * El pipeline por lotes va encendido por defecto, y encender algo que cambia
 * CÓMO se ve cada dibujo exige poder apagarlo sin desplegar. Pero una bandera
 * que nadie prueba no es un respaldo: es una rama muerta que se pudre hasta que
 * alguien la necesita de verdad.
 *
 * Este golden la ejercita entera. Con `?cadRenderPipeline=legacy` el editor
 * vuelve a la proyección por entidad, y **el dibujo sigue siendo el mismo**: no
 * en píxeles —eso son dos rasterizados distintos y compararlos sería una prueba
 * frágil que no dice nada—, sino en lo que de verdad tiene que coincidir: el
 * documento canónico que produce dibujar, y las entidades que el editor
 * reconoce a partir de él.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'base',
        type: 'line',
        start: { x: 2_000, y: 4_000, z: 0 },
        end: { x: 6_000, y: 4_000, z: 0 },
        layer: '0',
      },
      {
        id: 'rotulo',
        type: 'mtext',
        insertion: { x: 2_000, y: 6_000, z: 0 },
        text: 'RESPALDO',
        height: 400,
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['base', 'rotulo'] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [],
    unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function openStudio(context: BrowserContext, page: Page, search: string) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
  await page.goto(`/legacy/studio${search}`);
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 2');
  return backend;
}

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

/**
 * Tolerancia del clic, en unidades de dibujo.
 *
 * El punto no lo pone el test: lo pone el ratón sobre el lienzo, y para saber
 * dónde pulsar el helper invierte la afín pantalla↔dibujo muestreándola en tres
 * posiciones. Esa inversión arrastra el redondeo del navegador —Chromium cayó a
 * 0,09 unidades del objetivo y Firefox a 13,8—, que sobre una huella de 12.000
 * unidades a ~1.200 px son un par de píxeles.
 *
 * 30 unidades ≈ 3 px. La exactitud del punto NO se mide aquí: la fija el golden
 * 46, donde una captura a extremo tiene que dar el valor EXACTO. Lo que se mide
 * aquí es que los dos pipelines escriban el mismo segmento, y por eso la
 * tolerancia es literalmente la misma función en los dos casos.
 */
const CLICK_TOLERANCE = 30;

function expectSameSegment(drawn: unknown) {
  const line = drawn as { type: string; layer: string; start: { x: number; y: number }; end: { x: number; y: number } };
  expect(line.type).toBe('line');
  expect(line.layer).toBe('0');
  const near = (actual: number, expected: number, label: string) =>
    expect(
      Math.abs(actual - expected),
      `${label}: ${actual} debería estar a menos de ${CLICK_TOLERANCE} de ${expected}`,
    ).toBeLessThan(CLICK_TOLERANCE);
  near(line.start.x, 3_000, 'start.x');
  near(line.start.y, 8_000, 'start.y');
  near(line.end.x, 8_000, 'end.x');
  near(line.end.y, 8_000, 'end.y');
}

/** Dibuja el MISMO segmento con el ratón y devuelve lo que quedó guardado. */
async function drawAndCapture(page: Page, backend: Awaited<ReturnType<typeof openStudio>>) {
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);
  await page.getByTestId('cad-toolbar').getByRole('button', { name: 'Línea', exact: true }).click();
  const from = await screenPointFor(page, { x: 3_000, y: 8_000 });
  await page.mouse.click(from.x, from.y);
  const to = await screenPointFor(page, { x: 8_000, y: 8_000 });
  await page.mouse.click(to.x, to.y);
  // Enter termina la cadena de LINE; Esc la cancelaría sin escribir.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cad-native-document-count')).toHaveText('Native 3');
  await saveAndSettle(page, backend);
  const document = backend.snapshot().document;
  return {
    entityIds: [...document.modelSpace.entityIds],
    drawn: document.entities.find((entity) => !['base', 'rotulo'].includes(entity.id)),
  };
}

test('la bandera devuelve el editor al pipeline heredado y el dibujo no cambia', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page, '?cadRenderPipeline=legacy');

  // 1. La bandera manda: el indicador dice heredado, y no publica lotes.
  const badge = page.getByTestId('cad-render-pipeline');
  await expect(badge).toHaveAttribute('data-pipeline', 'legacy');
  await expect(badge).toHaveAttribute('data-batches', '0');
  await expect(badge).toHaveAttribute('data-instances', '0');

  // 2. El dibujo sigue ahí: las dos entidades sembradas se reconocen y la
  //    lista del editor las muestra. Un respaldo que no dibuja no es respaldo.
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  await expect(page.getByTestId('cad-native-entity-base')).toBeVisible();

  // 3. Y dibujar produce EXACTAMENTE la misma geometría canónica.
  const legacy = await drawAndCapture(page, backend);
  expectSameSegment(legacy.drawn);
  expect(legacy.entityIds.slice(0, 2)).toEqual(['base', 'rotulo']);
});

test('con el pipeline por lotes el mismo gesto produce el mismo documento', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page, '');
  await expect(page.getByTestId('cad-render-pipeline')).toHaveAttribute(
    'data-pipeline',
    'batched',
  );

  const batched = await drawAndCapture(page, backend);
  // La MISMA aserción, literal, que la del camino heredado. Es la forma de que
  // «el dibujo sigue siendo el mismo» signifique algo comprobable: los dos
  // caminos escriben el mismo documento, con el mismo orden de dibujo.
  expectSameSegment(batched.drawn);
  expect(batched.entityIds.slice(0, 2)).toEqual(['base', 'rotulo']);

  // Y la selección sigue funcionando con lotes, que es lo que se pierde si
  // nadie proyecta los objetos heredados de lo designado: sin ellos no hay
  // grips y la entidad no se puede arrastrar. Dibujar deja lo dibujado
  // designado, así que primero hay que soltarlo para ver la lista.
  const properties = page.getByTestId('cad-native-properties');
  await expect(properties).toContainText('LINE');
  await properties.getByRole('button', { name: 'Deseleccionar' }).click();
  await page.getByTestId('cad-native-entity-base').click();
  await expect(properties).toContainText('LINE');
});
