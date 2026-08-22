/*
 * NOTA DE LA CAMPAÑA DE DISEÑO (2026-08-21) — por qué cambió una aserción.
 *
 * Este spec afirmaba `getByText(/0 equipos/)` VISIBLE. La afirmación de
 * fondo es buena y sigue intacta: dibujar geometría canónica no debe crear
 * un objeto HEREDADO por la puerta de atrás. Lo que cambió es su prueba.
 *
 * «N estaciones · N equipos» era vocabulario del producto industrial del
 * que salió este editor, pintado en la barra superior que ve un arquitecto.
 * La ola 5 lo sacó de la vista del cliente — pero NO del DOM: vive en el
 * bloque de diagnóstico con `data-testid="cad-legacy-asset-count"`.
 *
 * La aserción nueva es MÁS precisa que la anterior: apunta a un gancho
 * estable en vez de a una expresión regular sobre el texto de la página.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadV1Backend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { migrateCadDocument, type CadDocument, type CadEntity } from '../../src/lib/cad/cad-document';
import { cadDocumentToEditorSnapshot } from '../../src/lib/cad/editor-snapshot';
import { saveAndSettle } from '../fixtures/cad-save';
import { applyDynamicInput } from '../fixtures/dynamic-input';
import { worldPoint } from '../fixtures/world-point';

// MIGRACIÓN R3: mock en la superficie v1 real. DIFERENCIA de transporte
// documentada: el PUT legacy arrastraba el array `assets` junto al documento;
// en v1 SOLO viaja el documento canónico — los assets son su PROYECCIÓN
// (cadDocumentToEditorSnapshot, las mismas reglas del editor/adaptador), así
// que el snapshot los deriva del documento persistido. Mismos conteos.
async function installCadBackend(context: BrowserContext) {
  const { snapshot } = await installCadV1Backend(context, {
    document: null,
    footprint: { footprintW: 12_000, footprintH: 8_000, unit: 'mm', gridSize: 100 },
  });
  return {
    snapshot: () => {
      const current = snapshot();
      const document = current.document
        ? (current.document as unknown as CadDocument)
        : null;
      const assets = document
        ? cadDocumentToEditorSnapshot(migrateCadDocument(document)).assets
        : [];
      return { document, assets, version: current.version };
    },
  };
}

/**
 * Antes escribía los dos campos y pulsaba «Aplicar» sin comprobar que el valor
 * hubiese cuajado. El panel se remonta al cambiar de fase y ahí el punto se
 * perdía en silencio — el helper compartido espera a su propia precondición.
 * El modo lo fija cada paso (ABS/REL/POLAR), así que aquí no se toca.
 */
/**
 * Un punto, con su MODO dentro del reintento.
 *
 * El fixture acepta `mode` justamente porque un re-montaje también resetea el
 * modo, y rellenar con el modo equivocado escribe el valor en otra coordenada.
 * Este spec pulsaba REL/POLAR por su cuenta, FUERA del `toPass`, así que ese
 * click podía perderse contra un panel que se estaba reconstruyendo y el punto
 * siguiente se interpretaba como absoluto.
 */
async function fillPoint(
  page: import('@playwright/test').Page,
  x: string,
  y: string,
  mode?: string,
) {
  await applyDynamicInput(page, { x, y }, mode ? { mode } : {});
}

test('neutral drawing uses units, layers, ABS/REL/POLAR, closed polyline and OFFSET', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);

  await test.step('1. Abrir dibujo', async () => {
    await page.goto('/legacy/studio');
    await expect(page.getByTestId('cad-canvas')).toBeVisible();
  });
  await test.step('2. Elegir unidades', async () => {
    const view = page.getByTitle(/Vista, capas/);
    await view.click();
    const manager = page.getByTestId('cad-layer-manager');
    await manager.getByRole('button', { name: 'm', exact: true }).click();
    await manager.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(manager).toContainText('mm');
  });
  await test.step('3. Crear capas', async () => {
    await page.getByTestId('cad-layer-new-name').fill('Acceptance Geometry');
    await page.getByTestId('cad-layer-create').click();
    await expect(page.getByTestId('cad-layer-row-Acceptance_Geometry')).toBeVisible();
    await page.getByTitle(/Vista, capas/).click();
  });

  await page.getByRole('button', { name: 'Line', exact: true }).click();
  await test.step('4/7. Coordenada absoluta y dynamic input', async () => {
    await expect(page.getByTestId('cad-dynamic-input')).toBeVisible();
    await fillPoint(page, '1000', '1000');
  });
  await test.step('5. Coordenada relativa', async () => {
    await fillPoint(page, '2000', '0', 'REL');
  });
  await test.step('6. Coordenada polar', async () => {
    await applyDynamicInput(page, { distance: '1500', angle: '90deg' }, { mode: 'POLAR' });
    await page.getByRole('button', { name: 'Terminar' }).click();
    // PRIORIDAD 2 — antes esto afirmaba `/2 equipos/`: LINE creaba MUROS
    // heredados, uno por tramo. Hoy son dos entidades `line` canónicas y el
    // contador de equipo no se mueve.
    await expect(page.getByTestId('cad-legacy-asset-count')).toContainText(
      '0 heredados',
    );
  });

  await test.step('13. Crear polilínea cerrada', async () => {
    await page.getByRole('button', { name: 'Pline', exact: true }).click();
    await fillPoint(page, '2000', '4000');
    await fillPoint(page, '2000', '0', 'REL');
    await fillPoint(page, '0', '1500', 'REL');
    await page.getByTestId('cad-polyline-close').click();
    // Antes: `/5 equipos/` — la polilínea se partía en un muro POR TRAMO. Hoy
    // es UNA entidad `polyline` cerrada, así que el conteo heredado no cambia.
    await expect(page.getByTestId('cad-legacy-asset-count')).toContainText(
      '0 heredados',
    );
    await expect(page.getByTestId('cad-native-properties')).toContainText('POLYLINE');
  });

  await test.step('14. Aplicar offset', async () => {
    // La secuencia del MOTOR: OFFSET es command-first. La polilínea se designa
    // con el pickbox sobre su arista inferior (2000,4000)→(4000,4000). El modo
    // 2D bloquea la vista superior (mapa mundo↔pantalla afín por construcción),
    // que es lo que `worldPoint` necesita para invertir la proyección.
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.getByTitle(/Ajustar a la planta/).click();
    await page.getByRole('button', { name: 'Offset', exact: true }).click();
    await applyDynamicInput(page, { offset: '250mm' });
    const on = await worldPoint(page, { x: 3_000, y: 4_000 });
    await page.mouse.click(on.x, on.y);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cad-native-properties')).toContainText('POLYLINE');
  });

  await saveAndSettle(page, backend);

  // El documento persistido contiene GEOMETRÍA CANÓNICA, no assets heredados.
  // Antes esto exigía 6 assets, de los cuales 4 etiquetados «Pline» — es decir,
  // fijaba el defecto: una polilínea troceada en un muro por tramo.
  const stored = backend.snapshot().document!;
  const byType = (type: CadEntity['type']) =>
    stored.entities.filter((entity) => entity.type === type);

  // LINE con tres puntos ⇒ dos segmentos ⇒ dos entidades `line`.
  expect(byType('line')).toHaveLength(2);

  // La polilínea cerrada y su desfase: DOS entidades, cada una completa.
  const polylines = byType('polyline') as Extract<CadEntity, { type: 'polyline' }>[];
  expect(polylines).toHaveLength(2);
  for (const polyline of polylines) {
    expect(polyline.closed).toBe(true);
    expect(polyline.vertices).toHaveLength(3);
    expect(polyline.vertices.every((vertex) => vertex.z === 0)).toBe(true);
  }
  // El desfase es geometría NUEVA, no la misma movida.
  expect(new Set(polylines.map((polyline) => polyline.id)).size).toBe(2);

  // Ningún asset heredado nació de dibujar geometría neutra.
  expect(backend.snapshot().assets).toHaveLength(0);

  // Todo lo dibujado está en el orden de dibujo, sin fantasmas ni omisiones.
  expect([...stored.modelSpace.entityIds].sort()).toEqual(
    stored.entities.map((entity) => entity.id).sort(),
  );

  expect(stored.layers.some((layer) => layer.id === 'Acceptance_Geometry')).toBe(true);
  await page.getByTestId('cad-canvas').screenshot({ path: testInfo.outputPath('neutral-precision-drawing.png'), scale: 'css' });
});
