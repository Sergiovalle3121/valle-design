import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument, CadEntity } from '../../src/lib/cad/cad-document';
import { applyDynamicInput } from '../fixtures/dynamic-input';

/**
 * FASE 0 — la autoría canónica es TRANSACCIONAL y respeta el orden de dibujo.
 *
 * El golden 32 demostró que las herramientas neutras escriben geometría
 * canónica. Lo que NO cubría, y una auditoría posterior encontró roto:
 *
 *  · `applyDrawState` hacía `pushHistory()` + `markDirty()` alrededor de un
 *    `insertNativeEntities()` que ya registraba su propio checkpoint: DOS
 *    entradas de historial por dibujo, dos generaciones sucias, y un
 *    checkpoint fantasma cuando la acción se rechazaba.
 *  · `executeCadEntityCommand` alfabetizaba `modelSpace.entityIds`, así que
 *    cualquier edición reordenaba el plano entero por id.
 *  · El efecto de la escena capturaba `activeCadLayer` al montar: cambiar de
 *    capa y dibujar CON EL RATÓN seguía escribiendo en la capa anterior.
 *  · OFFSET no miraba `layer.locked` y descartaba en silencio lo que no sabía
 *    desfasar, así que una selección mixta se desfasaba a medias.
 *  · MOVE/COPY del flujo de comandos recorría la selección HEREDADA, de modo
 *    que sobre geometría canónica no hacía nada — y ni siquiera eran
 *    alcanzables desde la barra.
 *
 * La geometría exacta del desfase vive en `canonical-offset.spec.ts` y el
 * orden de dibujo a nivel de kernel en `canonical-draw-order.spec.ts`. Aquí se
 * fija que el EDITOR atraviesa esas fronteras de verdad.
 */

const DRAW_ORDER = ['zeta', 'medio', 'alfa'];

function line(id: string, index: number): CadEntity {
  return {
    id,
    type: 'line',
    start: { x: 1_000 + index * 1_000, y: 1_000, z: 0 },
    end: { x: 1_500 + index * 1_000, y: 2_000, z: 0 },
    layer: '0',
  };
}

function seedDocument(entityIds: string[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'muros', name: 'Muros', color: '#f97316', visible: true, locked: false },
    ],
    entities: entityIds.map(line),
    history: [],
    modelSpace: { entityIds: [...entityIds] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [],
    unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext, entityIds: string[] = []) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(entityIds), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

async function openStudio(context: BrowserContext, page: Page, entityIds: string[] = []) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context, entityIds);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  return backend;
}

/**
 * Fija un punto en coordenadas ABSOLUTAS por la entrada dinámica.
 *
 * `CadDynamicInput` se REMONTA en cuanto aparece el ancla: su `key` incluye
 * `anchored|origin`, así que en cuanto se fija el primer punto React sustituye
 * el formulario por uno nuevo con los campos vacíos. Rellenarlo mientras
 * ocurre ese reemplazo pierde el punto en silencio, y entonces LINE recibe dos
 * veces la misma coordenada, se rechaza por degenerada y no se crea nada.
 *
 * Por eso cada punto espera a que SU formulario esté listo antes de escribir y
 * confirma que el valor se quedó puesto antes de aplicar: el paso espera a su
 * propia condición en vez de a que el reloj acompañe.
 */
async function point(page: Page, x: string, y: string) {
  const dynamic = page.getByTestId('cad-dynamic-input');
  const fieldX = page.getByTestId('cad-dynamic-field-x');
  const fieldY = page.getByTestId('cad-dynamic-field-y');
  // Rellenar y COMPROBAR es una sola condición reintentable: si el formulario
  // se sustituyó a mitad, los campos vuelven vacíos, el intento falla y se
  // repite sobre el formulario nuevo. Sin esto el punto se perdía en silencio
  // de vez en cuando y el fallo aparecía después, como una figura que no se
  // creó. (No se puede exigir que el campo esté vacío de partida: sólo se
  // remonta al aparecer el ancla, así que del tercer punto en adelante
  // conserva legítimamente el valor anterior.)
  await expect(async () => {
    await dynamic.getByRole('button', { name: 'ABS', exact: true }).click();
    await fieldX.fill(x);
    await fieldY.fill(y);
    await expect(fieldX).toHaveValue(x, { timeout: 1_000 });
    await expect(fieldY).toHaveValue(y, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await dynamic.getByRole('button', { name: 'Aplicar' }).click();
}

/** La barra CAD, acotada: hay otros botones con estos nombres en el editor. */
const toolbar = (page: Page) => page.getByTestId('cad-toolbar');

async function startTool(page: Page, name: string) {
  await toolbar(page).getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('cad-dynamic-input')).toBeVisible();
}

async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${total}`);
}

async function historyDepth(page: Page) {
  const depth = page.getByTestId('cad-history-depth');
  return {
    undo: (await depth.getAttribute('data-undo')) ?? '',
    redo: (await depth.getAttribute('data-redo')) ?? '',
  };
}

/** Profundidad del historial: la evidencia directa del checkpoint duplicado. */
async function expectHistory(page: Page, undo: number, redo: number) {
  const depth = page.getByTestId('cad-history-depth');
  await expect(depth).toHaveAttribute('data-undo', String(undo));
  await expect(depth).toHaveAttribute('data-redo', String(redo));
}

/** El gestor de capas vive detrás del panel «Vista, capas». */
async function withLayerPanel(page: Page, run: () => Promise<void>) {
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  await run();
  await viewButton.click();
}

/**
 * Suelta la selección: mientras haya una, el panel de propiedades ocupa el
 * sitio de la lista de entidades y `cad-native-entity-*` deja de existir.
 */
async function deselect(page: Page) {
  const release = page
    .getByTestId('cad-native-properties')
    .getByRole('button', { name: 'Deseleccionar' });
  if (await release.count()) await release.click();
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
}

const undoButton = (page: Page) => page.getByTitle('Deshacer (Ctrl+Z)');
const redoButton = (page: Page) => page.getByTitle('Rehacer (Ctrl+Shift+Z)');
const properties = (page: Page) => page.getByTestId('cad-native-properties');

/**
 * Traduce coordenadas de mundo a pantalla muestreando el HUD del cursor: el
 * único modo de dibujar CON EL RATÓN de verdad y no por la entrada dinámica.
 */
async function worldPoint(page: Page, target: { x: number; y: number }) {
  const box = await page.getByTestId('cad-canvas').boundingBox();
  if (!box) throw new Error('CAD canvas has no bounding box');
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
  if (Math.abs(determinant) < 1e-9) throw new Error('CAD world/screen transform is singular');
  const wx = target.x - origin.x;
  const wy = target.y - origin.y;
  return {
    x: screen.x + (d * wx - b * wy) / determinant,
    y: screen.y + (-c * wx + a * wy) / determinant,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. Una acción de dibujo = UNA entrada de historial
   ══════════════════════════════════════════════════════════════════════════ */

test('every canonical draw records exactly one undo entry and one dirty transition', async ({ context, page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  const backend = await openStudio(context, page);

  await expectHistory(page, 0, 0);

  // Cada herramienta se dibuja y se DESHACE de inmediato. Con el checkpoint
  // duplicado, el primer Undo consumía la entrada fantasma y la entidad
  // seguía en pantalla.
  const draws: [string, () => Promise<void>][] = [
    ['Line', async () => {
      await startTool(page, 'Line');
      await point(page, '1000', '1000');
      await point(page, '5000', '1000');
      await page.getByRole('button', { name: 'Terminar' }).click();
    }],
    ['Pline', async () => {
      await startTool(page, 'Pline');
      await point(page, '1000', '3000');
      await point(page, '4000', '3000');
      await point(page, '4000', '5000');
      await page.getByRole('button', { name: 'Terminar' }).click();
    }],
    ['Rect', async () => {
      await startTool(page, 'Rect');
      await point(page, '6000', '1000');
      await point(page, '9000', '3000');
    }],
    ['Circle', async () => {
      await startTool(page, 'Circle');
      await point(page, '8000', '6000');
      await applyDynamicInput(page, { radius: '400' });
    }],
  ];

  for (const [name, draw] of draws) {
    await test.step(`${name}: dibujar deja UNA entrada; un Undo la deshace`, async () => {
      await draw();
      await expectNativeCount(page, 1);
      await expectHistory(page, 1, 0);

      await undoButton(page).click();
      await expectNativeCount(page, 0);
      await expectHistory(page, 0, 1);

      // Y no queda un segundo Undo fantasma detrás.
      await expect(undoButton(page)).toBeDisabled();

      await redoButton(page).click();
      await expectNativeCount(page, 1);
      await expectHistory(page, 1, 0);

      await undoButton(page).click();
      await expectNativeCount(page, 0);
    });
  }

  await test.step('REDO devuelve id, geometría, capa y orden idénticos', async () => {
    await startTool(page, 'Line');
    await point(page, '2000', '2000');
    await point(page, '7000', '4000');
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expectNativeCount(page, 1);
    await saveAndSettle(page, backend);
    const before = backend.snapshot().document;
    expect(before.entities).toHaveLength(1);

    await undoButton(page).click();
    await expectNativeCount(page, 0);
    await redoButton(page).click();
    await expectNativeCount(page, 1);
    await saveAndSettle(page, backend);

    const after = backend.snapshot().document;
    expect(after.entities).toHaveLength(1);
    expect(after.entities[0].id).toBe(before.entities[0].id);
    expect(after.entities[0].layer).toBe(before.entities[0].layer);
    expect(after.modelSpace.entityIds).toEqual(before.modelSpace.entityIds);
    const restored = after.entities[0] as Extract<CadEntity, { type: 'line' }>;
    const original = before.entities[0] as Extract<CadEntity, { type: 'line' }>;
    expect(restored.start).toEqual(original.start);
    expect(restored.end).toEqual(original.end);
  });

  await test.step('una acción DEGENERADA no toca documento, historial ni versión', async () => {
    const versionBefore = backend.snapshot().version;
    const historyBefore = await page.getByTestId('cad-history-depth').getAttribute('data-undo');

    // Dos veces el mismo punto no es una línea.
    await startTool(page, 'Line');
    await point(page, '3000', '3000');
    await point(page, '3000', '3000');
    await page.getByRole('button', { name: 'Terminar' }).click();

    await expectNativeCount(page, 1);
    await expect(page.getByTestId('cad-history-depth')).toHaveAttribute('data-undo', historyBefore!);
    expect(backend.snapshot().version).toBe(versionBefore);
  });

  expect(pageErrors).toEqual([]);
});

/* ══════════════════════════════════════════════════════════════════════════
   2. El orden de dibujo sobrevive a editar / copiar / borrar
   ══════════════════════════════════════════════════════════════════════════ */

test('editing, copying and deleting preserve adversarial draw order through save and reload', async ({ context, page }) => {
  test.setTimeout(180_000);
  // `zeta, medio, alfa` es exactamente el inverso del orden alfabético: un
  // `.sort()` sobre el z-order es imposible de confundir con "no pasó nada".
  const backend = await openStudio(context, page, DRAW_ORDER);
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  expect(backend.snapshot().document.modelSpace.entityIds).toEqual(DRAW_ORDER);

  await test.step('editar una propiedad no reordena el plano', async () => {
    await page.getByTestId('cad-native-entity-zeta').click();
    const startX = page.getByTestId('cad-native-property-startX');
    await expect(startX).toHaveValue('1000');
    await startX.fill('1250');
    await startX.blur();
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.modelSpace.entityIds).toEqual(DRAW_ORDER);
  });

  await test.step('mover no reenvía la entidad al fondo', async () => {
    await page.getByTestId('cad-native-move-x').click();
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.modelSpace.entityIds).toEqual(DRAW_ORDER);
  });

  let copiedId = '';
  await test.step('copiar añade la nueva entidad AL FRENTE, sin tocar el resto', async () => {
    await properties(page).getByRole('button', { name: 'Copiar' }).click();
    await saveAndSettle(page, backend);
    const order = backend.snapshot().document.modelSpace.entityIds;
    expect(order).toHaveLength(4);
    expect(order.slice(0, 3)).toEqual(DRAW_ORDER);
    copiedId = order[3];
    expect(DRAW_ORDER).not.toContain(copiedId);
  });

  await test.step('borrar quita SÓLO el id borrado', async () => {
    await page.getByTestId('cad-native-delete').click();
    await saveAndSettle(page, backend);
    const order = backend.snapshot().document.modelSpace.entityIds;
    expect(order).toEqual(DRAW_ORDER);
    expect(order).not.toContain(copiedId);
  });

  await test.step('reabrir devuelve el mismo orden, sin fantasmas ni omisiones', async () => {
    const saved = backend.snapshot().document;
    await page.reload();
    await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
    await saveAndSettle(page, backend);
    const reloaded = backend.snapshot().document;
    expect(reloaded.modelSpace.entityIds).toEqual(saved.modelSpace.entityIds);
    expect([...reloaded.modelSpace.entityIds].sort()).toEqual(
      reloaded.entities.map((entity) => entity.id).sort(),
    );
    expect(new Set(reloaded.modelSpace.entityIds).size).toBe(
      reloaded.modelSpace.entityIds.length,
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Cambiar de capa y dibujar CON EL RATÓN escribe en la capa nueva
   ══════════════════════════════════════════════════════════════════════════ */

test('switching the active layer changes where the MOUSE draws, and it survives reload', async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);
  await page.getByTitle(/Vista superior/).click();
  await page.getByTitle(/Ajustar a la planta/).click();

  // La capa se cambia DESPUÉS de montar el editor: es justo el caso que la
  // clausura obsoleta del efecto de la escena se comía.
  await withLayerPanel(page, async () => {
    await page.getByTestId('cad-layer-active-muros').click();
    await expect(page.getByTestId('cad-layer-active-muros')).toHaveText('Muros');
  });

  await toolbar(page).getByRole('button', { name: 'Line', exact: true }).click();
  const from = await worldPoint(page, { x: 2_000, y: 2_000 });
  await page.mouse.click(from.x, from.y);
  const to = await worldPoint(page, { x: 6_000, y: 5_000 });
  await page.mouse.click(to.x, to.y);
  await expectNativeCount(page, 1);

  await saveAndSettle(page, backend);
  const drawn = backend.snapshot().document;
  expect(drawn.entities).toHaveLength(1);
  expect(drawn.entities[0].layer).toBe('muros');

  await page.reload();
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  await saveAndSettle(page, backend);
  expect(backend.snapshot().document.entities[0].layer).toBe('muros');
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Capa bloqueada y OFFSET atómico
   ══════════════════════════════════════════════════════════════════════════ */

test('a locked layer refuses drawing and OFFSET, and rejection leaves zero history', async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page, ['zeta']);
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  await test.step('OFFSET de una selección válida crea UNA entidad y UNA entrada', async () => {
    await page.getByTestId('cad-native-entity-zeta').click();
    await expectHistory(page, 0, 0);
    await toolbar(page).getByRole('button', { name: 'Offset', exact: true }).click();
    await applyDynamicInput(page, { offset: '250' });
    await expectNativeCount(page, 2);
    await expectHistory(page, 1, 0);
    await undoButton(page).click();
    await expectNativeCount(page, 1);
    await expect(undoButton(page)).toBeDisabled();
  });

  await test.step('con la capa BLOQUEADA, OFFSET no muta y no deja historial', async () => {
    await withLayerPanel(page, async () => {
      await page.getByTestId('cad-layer-lock-0').click();
      await expect(page.getByTestId('cad-layer-lock-0')).toHaveText('Lock');
    });
    // Bloquear la capa ES una mutación del documento: deja su propia entrada de
    // historial y su propia versión. Se confirma esa escritura ANTES de medir,
    // porque si no el autosave pendiente aterrizaría durante el intento
    // siguiente y se le atribuiría al OFFSET. Lo que se afirma aquí es que el
    // OFFSET RECHAZADO no añade NADA sobre ese punto de partida.
    const versionBefore = await saveAndSettle(page, backend);
    const depthBefore = await historyDepth(page);

    await deselect(page);
    await page.getByTestId('cad-native-entity-zeta').click();
    await toolbar(page).getByRole('button', { name: 'Offset', exact: true }).click();
    await applyDynamicInput(page, { offset: '250' });

    await expectNativeCount(page, 1);
    await expect(page.getByTestId('cad-history-depth')).toHaveAttribute(
      'data-undo',
      depthBefore.undo,
    );
    expect(backend.snapshot().version).toBe(versionBefore);
  });

  await test.step('con la capa BLOQUEADA tampoco se dibuja encima', async () => {
    const depthBefore = await historyDepth(page);
    await startTool(page, 'Line');
    await point(page, '500', '500');
    await point(page, '900', '900');
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expectNativeCount(page, 1);
    await expect(page.getByTestId('cad-history-depth')).toHaveAttribute(
      'data-undo',
      depthBefore.undo,
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. MOVE y COPY desde el comando habitual, sobre la selección canónica
   ══════════════════════════════════════════════════════════════════════════ */

test('MOVE and COPY run from the ordinary command on the canonical selection', async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page, ['zeta']);
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  const original = backend.snapshot().document.entities[0] as Extract<CadEntity, { type: 'line' }>;

  await test.step('MOVE desplaza la geometría canónica de verdad', async () => {
    await page.getByTestId('cad-native-entity-zeta').click();
    await toolbar(page).getByRole('button', { name: 'Move', exact: true }).click();
    await point(page, '0', '0');
    await point(page, '1000', '500');
    await expectNativeCount(page, 1);
    await expectHistory(page, 1, 0);
    await saveAndSettle(page, backend);

    const moved = backend.snapshot().document.entities[0] as Extract<CadEntity, { type: 'line' }>;
    expect(moved.id).toBe('zeta');
    expect(moved.start.x).toBeCloseTo(original.start.x + 1_000, 6);
    expect(moved.start.y).toBeCloseTo(original.start.y + 500, 6);
    expect(moved.end.x).toBeCloseTo(original.end.x + 1_000, 6);
    expect(moved.end.y).toBeCloseTo(original.end.y + 500, 6);
  });

  await test.step('COPY duplica y deja el original intacto', async () => {
    await deselect(page);
    await page.getByTestId('cad-native-entity-zeta').click();
    await toolbar(page).getByRole('button', { name: 'Copy', exact: true }).click();
    await point(page, '0', '0');
    await point(page, '0', '2000');
    await expectNativeCount(page, 2);
    await saveAndSettle(page, backend);

    const document = backend.snapshot().document;
    expect(document.entities).toHaveLength(2);
    // La copia entra al frente y el original conserva su posición visual.
    expect(document.modelSpace.entityIds[0]).toBe('zeta');
    const source = document.entities.find((entity) => entity.id === 'zeta') as Extract<CadEntity, { type: 'line' }>;
    const copy = document.entities.find((entity) => entity.id !== 'zeta') as Extract<CadEntity, { type: 'line' }>;
    expect(copy.layer).toBe(source.layer);
    expect(copy.start.y).toBeCloseTo(source.start.y + 2_000, 6);
    expect(copy.start.x).toBeCloseTo(source.start.x, 6);
  });

  await test.step('un solo Undo deshace el COPY entero', async () => {
    await undoButton(page).click();
    await expectNativeCount(page, 1);
    await saveAndSettle(page, backend);
    expect(backend.snapshot().document.entities).toHaveLength(1);
  });
});
