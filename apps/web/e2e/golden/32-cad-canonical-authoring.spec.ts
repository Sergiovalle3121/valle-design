import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { importDxfPrimitives } from '../../src/lib/cad/dxf-import';

/**
 * PRIORIDAD 2 — corte VERTICAL de la autoría 2D canónica.
 *
 * Las cuatro herramientas neutras escribían assets heredados: LINE un muro,
 * POLYLINE varios muros desconectados, RECT una zona y CIRCLE una zona con
 * `shape: 'circle'`. Este spec recorre el ciclo completo que exige el encargo
 * sobre lo que ahora sí es geometría:
 *
 *   dibujar → nada heredado → tipos/coords/capa/ids/orden de dibujo →
 *   editar por propiedades → mover/copiar/borrar → undo/redo →
 *   guardar/reabrir → exportar DXF y reimportar
 *
 * El módulo puro (`draw-action-entities.spec.ts`) fija la conversión; esto fija
 * que atraviesa de verdad todos los límites del producto.
 */
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

/**
 * Fija un punto en coordenadas ABSOLUTAS.
 *
 * `CadDynamicInput` arranca en 'relative' en cuanto hay un ancla — el
 * comportamiento clásico del dynamic input de AutoCAD para los puntos
 * siguientes. Este spec quiere coordenadas inequívocas, así que declara ABS
 * explícitamente en cada punto en vez de depender del modo por defecto.
 */
async function point(page: Page, x: string, y: string) {
  const dynamic = page.getByTestId('cad-dynamic-input');
  await dynamic.getByRole('button', { name: 'ABS', exact: true }).click();
  await page.getByTestId('cad-dynamic-field-x').fill(x);
  await page.getByTestId('cad-dynamic-field-y').fill(y);
  await dynamic.getByRole('button', { name: 'Aplicar' }).click();
}

const properties = (page: Page) => page.getByTestId('cad-native-properties');

/**
 * Arranca una herramienta y espera a que su entrada dinámica esté lista.
 * Alimentar puntos antes de eso dejaba el primero en el vacío de vez en cuando
 * y la figura no llegaba a crearse.
 */
async function startTool(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('cad-dynamic-input')).toBeVisible();
}

/** Espera a que el EDITOR reconozca las entidades creadas hasta ahora. */
async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(
    `Native ${total}`,
  );
}

test('LINE, PLINE, RECT and CIRCLE author canonical geometry end to end', async ({ context, page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();

  await test.step('1. LINE crea UNA entidad `line`', async () => {
    await startTool(page, 'Line');
    await point(page, '1000', '1000');
    await point(page, '5000', '1000');
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expectNativeCount(page, 1);
  });

  await test.step('2. PLINE crea UNA `polyline`, no un muro por tramo', async () => {
    await startTool(page, 'Pline');
    await point(page, '1000', '3000');
    await point(page, '4000', '3000');
    await point(page, '4000', '5000');
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expectNativeCount(page, 2);
  });

  await test.step('3. RECT crea una `polyline` CERRADA de cuatro vértices', async () => {
    await startTool(page, 'Rect');
    await point(page, '6000', '1000');
    await point(page, '9000', '3000');
    await expectNativeCount(page, 3);
  });

  await test.step('4. CIRCLE crea una entidad `circle`', async () => {
    await startTool(page, 'Circle');
    await point(page, '8000', '6000');
    const radius = page.getByTestId('cad-dynamic-field-radius');
    await expect(radius).toBeVisible();
    await radius.fill('400');
    await page.getByTestId('cad-dynamic-input').getByRole('button', { name: 'Aplicar' }).click();
    await expectNativeCount(page, 4);
  });

  // ── 5. Nada heredado y tipos/geometría/capa correctos ──
  // Primero se confirma en el EDITOR que las cuatro entidades existen, y sólo
  // después se guarda y se afirma lo persistido. Sondear el documento del
  // servidor antes de guardar hacía que la prueba compitiera con el debounce
  // del autosave: bajo carga la cuarta entidad aún no había viajado y el fallo
  // parecía del producto cuando era del propio spec.
  await saveAndSettle(page, backend);
  const drawn = backend.snapshot().document;
  const typeCount = (type: CadEntity['type']) =>
    drawn.entities.filter((entity) => entity.type === type).length;

  expect(typeCount('line')).toBe(1);
  expect(typeCount('circle')).toBe(1);
  expect(typeCount('polyline')).toBe(2);
  // Ni muros, ni zonas, ni cajas: dibujar geometría neutra no crea assets.
  expect(typeCount('box')).toBe(0);
  expect(drawn.entities.every((entity) => !('legacy' in entity && entity.legacy))).toBe(true);
  expect(drawn.entities).toHaveLength(4);

  const line = drawn.entities.find((e): e is Extract<CadEntity, { type: 'line' }> => e.type === 'line')!;
  expect(line.start).toMatchObject({ x: 1_000, y: 1_000, z: 0 });
  expect(line.end).toMatchObject({ x: 5_000, y: 1_000, z: 0 });
  expect(line.layer).toBe('0');

  const polylines = drawn.entities.filter(
    (e): e is Extract<CadEntity, { type: 'polyline' }> => e.type === 'polyline',
  );
  const open = polylines.find((p) => !p.closed)!;
  const rect = polylines.find((p) => p.closed)!;
  expect(open.vertices).toHaveLength(3);
  expect(rect.vertices).toHaveLength(4);
  expect(rect.vertices.map((v) => [v.x, v.y])).toEqual([
    [6_000, 1_000],
    [9_000, 1_000],
    [9_000, 3_000],
    [6_000, 3_000],
  ]);

  const circle = drawn.entities.find((e): e is Extract<CadEntity, { type: 'circle' }> => e.type === 'circle')!;
  expect(circle.radius).toBeCloseTo(400, 3);

  // Ids estables y únicos, y orden de dibujo sin fantasmas ni omisiones.
  expect(new Set(drawn.entities.map((e) => e.id)).size).toBe(4);
  expect([...drawn.modelSpace.entityIds].sort()).toEqual(drawn.entities.map((e) => e.id).sort());
  // Lo último dibujado se dibuja encima.
  expect(drawn.modelSpace.entityIds[drawn.modelSpace.entityIds.length - 1]).toBe(circle.id);

  // ── 6. Editar por propiedades ──
  await test.step('6. Propiedades editan la entidad canónica', async () => {
    // Mientras haya selección, el panel de propiedades ocupa el sitio de la
    // lista de entidades: hay que soltar el círculo recién dibujado para poder
    // elegir la línea.
    await properties(page).getByRole('button', { name: 'Deseleccionar' }).click();
    await page.getByTestId(`cad-native-entity-${line.id}`).click();
    const startX = page.getByTestId('cad-native-property-startX');
    await expect(startX).toHaveValue('1000');
    await startX.fill('1500');
    await startX.blur();
    await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('1500');
  });

  // ── 7. Mover, copiar, borrar y deshacer ──
  await test.step('7. Move / copy / delete y undo/redo', async () => {
    await page.getByTestId('cad-native-move-x').click();
    await expect(page.getByTestId('cad-native-property-startX')).toHaveValue('1600');

    await properties(page).getByRole('button', { name: 'Copiar' }).click();
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.entities.filter((e) => e.type === 'line')).toHaveLength(2);

    await page.getByTestId('cad-native-delete').click();
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.entities.filter((e) => e.type === 'line')).toHaveLength(1);

    // Deshacer devuelve la copia borrada; rehacer la vuelve a quitar.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.entities.filter((e) => e.type === 'line')).toHaveLength(2);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.entities.filter((e) => e.type === 'line')).toHaveLength(1);
  });

  // ── 8. Reabrir conserva exactamente lo guardado ──
  const beforeReload = backend.snapshot().document;
  await page.reload();
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  await page.getByTestId(`cad-native-entity-${rect.id}`).click();
  await expect(properties(page)).toContainText('POLYLINE');
  const afterReload = backend.snapshot().document;
  expect(afterReload.entities.map((e) => e.id).sort()).toEqual(
    beforeReload.entities.map((e) => e.id).sort(),
  );
  expect(afterReload.modelSpace.entityIds).toEqual(beforeReload.modelSpace.entityIds);

  // ── 9. DXF: la geometría sale y vuelve a entrar ──
  await test.step('9. Round-trip DXF', async () => {
    await page.getByTitle(/Exportar a DXF/).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar DXF' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const reimported = importDxfPrimitives(await readFile(path!, 'utf8'));
    expect(reimported.primitives.some((primitive) => primitive.kind === 'circle')).toBe(true);
    expect(reimported.primitives.some((primitive) => primitive.kind === 'line')).toBe(true);
  });

  expect(pageErrors).toEqual([]);
});
