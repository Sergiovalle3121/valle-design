import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { worldPoint } from '../fixtures/world-point';

/**
 * LA CINTA, MEDIDA CONTRA SU PROPIA PROMESA.
 *
 * `docs/cad/evidence/ui-command-reach.json` dice 17 → 192 comandos
 * alcanzables con el ratón. Ese número es una cuenta estática sobre el
 * registro (`ribbon.spec.ts`); este golden es la otra mitad — la prueba de
 * que un usuario de verdad, con sólo el ratón, TRAZA UNA LÍNEA, LA ACOTA y
 * CAMBIA DE CAPA desde la cinta, sin tocar el teclado ni una vez. Ningún
 * `page.keyboard.*` aparece en este archivo a propósito: "Terminar" —el
 * botón, no Enter— es como se cierra cada comando.
 *
 * Cada botón de la cinta despacha `commandEngineRef.current.invoke(nombre)`
 * — el MISMO camino que la línea de comandos usa al teclear "LINE" y pulsar
 * Intro (`components/cad/ribbon/CadRibbonButton.tsx`) — así que este golden
 * también es la prueba de que ese despacho compartido funciona de verdad.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [
      { id: '0', name: '0', color: '#ffffff', visible: true, locked: false },
      { id: 'muros', name: 'Muros', color: '#f97316', visible: true, locked: false },
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

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  return backend;
}

/** La cinta es la superficie completa: el gate de cobertura vive en ribbon.spec.ts. */
const ribbon = (page: Page) => page.getByTestId('cad-ribbon');
const ribbonCommand = (page: Page, name: string) =>
  ribbon(page).getByTestId(`cad-ribbon-command-${name}`);

async function selectRibbonTab(page: Page, tabId: string) {
  await ribbon(page).getByTestId(`cad-ribbon-tab-${tabId}`).click();
}

/**
 * Cierra un comando encadenable del motor (LINE, PLINE…) con el ratón:
 * "Terminar comando" llama a `commitActiveDraftCommand`, lo mismo que Intro
 * — sin tocar el teclado ni una vez. Nace CON esta campaña: la cinta
 * despacha los 192 comandos por nombre y ninguno de ellos tenía, hasta
 * ahora, una forma de cerrarse sin teclado salvo el puñado con gemelo en la
 * paleta vieja (ver el comentario junto a `cad-engine-command-finish` en
 * `Layout3DEditor.tsx`).
 */
async function finishCommand(page: Page) {
  await page.getByTestId('cad-engine-command-finish').click();
}

async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${total}`);
}

test('desde la cinta, con el ratón y sin teclear: se traza una línea, se acota y se cambia de capa', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);

  // El estudio abre en 2D por defecto (ver e2e/fixtures/view-mode.ts): la
  // vista YA es cenital, así que `worldPoint` no necesita ningún preset de
  // cámara 3D — sólo encuadrar la huella para que los puntos de mundo caigan
  // dentro del lienzo.
  await page.getByTitle(/Ajustar a la planta/).click();

  await expect(ribbon(page)).toBeVisible();

  // El acompañante de los primeros cinco minutos flota sobre el lienzo en un
  // documento recién abierto y tapa el clic derecho que cierra los comandos
  // de este golden. Se salta con el ratón — el mismo gesto que un usuario
  // real haría en un documento donde ya sabe dibujar.
  const tourSkip = page.getByTestId('cad-guided-tour-skip');
  if (await tourSkip.count()) await tourSkip.click();

  // ── 1. TRAZAR UNA LÍNEA, en la capa "0" ────────────────────────────────
  await test.step('la cinta traza una línea con dos clics', async () => {
    // "Inicio" es la pestaña por defecto: ver CadRibbon.tsx.
    await ribbonCommand(page, 'LINE').click();
    const from = await worldPoint(page, { x: 2_000, y: 2_000 });
    await page.mouse.click(from.x, from.y);
    const to = await worldPoint(page, { x: 6_000, y: 2_000 });
    await page.mouse.click(to.x, to.y);
    await finishCommand(page);
    await expectNativeCount(page, 1);
  });

  // ── 2. ACOTARLA ─────────────────────────────────────────────────────────
  await test.step('la cinta acota con tres clics', async () => {
    await selectRibbonTab(page, 'anotar');
    const prompt = page.getByTestId('cad-command-prompt');
    await ribbonCommand(page, 'DIMLINEAR').click();
    await expect(prompt).toBeVisible();

    // Los orígenes NO se clavan sobre la línea recién trazada a propósito:
    // un clic que cae exactamente sobre una entidad se resuelve como
    // DESIGNAR ESA ENTIDAD (`CAD_ACCEPT_ENTITY_PICK`, `pointer-router.ts`),
    // no como el punto libre que este paso necesita — la misma razón por la
    // que annotation-commands.spec.ts acota TECLEANDO coordenadas en vez de
    // clicar el muro. Con el ratón, se acota un vano libre en el plano.
    const origin = await worldPoint(page, { x: 2_000, y: 5_000 });
    await page.mouse.click(origin.x, origin.y);
    const end = await worldPoint(page, { x: 6_000, y: 5_000 });
    await page.mouse.click(end.x, end.y);
    const placement = await worldPoint(page, { x: 4_000, y: 4_400 });
    await page.mouse.click(placement.x, placement.y);
    await expect(prompt).toBeHidden({ timeout: 5_000 });
    await expectNativeCount(page, 2);
  });

  // ── 3. CAMBIAR DE CAPA, desde la cinta ──────────────────────────────────
  await test.step('la cinta abre el gestor de capas y cambia la capa activa', async () => {
    await selectRibbonTab(page, 'administrar');
    await ribbonCommand(page, 'LAYER').click();
    const manager = page.getByTestId('cad-layer-manager');
    await expect(manager).toBeVisible();
    await manager.getByTestId('cad-layer-active-muros').click();
    await expect(manager.getByTestId('cad-layer-active-muros')).toHaveText('Muros');
  });

  // Prueba de que el cambio de capa surtió efecto: un segundo trazo, ahora
  // en "muros" — el mismo criterio que canonical-transaction.spec.ts usa
  // para el mismo cambio disparado desde el panel de capas clásico.
  await test.step('la línea nueva nace en la capa activa nueva', async () => {
    await selectRibbonTab(page, 'inicio');
    await ribbonCommand(page, 'LINE').click();
    // Puntos frescos, lejos de la línea y de la cota ya dibujadas: un clic
    // que cae sobre una entidad la DESIGNA en vez de dar un punto libre (ver
    // la nota sobre `CAD_ACCEPT_ENTITY_PICK` más arriba).
    const from = await worldPoint(page, { x: 2_000, y: 8_000 });
    await page.mouse.click(from.x, from.y);
    const to = await worldPoint(page, { x: 6_000, y: 8_000 });
    await page.mouse.click(to.x, to.y);
    await finishCommand(page);
    await expectNativeCount(page, 3);
  });

  await saveAndSettle(page, backend);
  const drawn = backend.snapshot().document;
  const lines = drawn.entities.filter((entity) => entity.type === 'line');
  const dimension = drawn.entities.find((entity) => entity.type === 'dimension');
  expect(lines, `entidades: ${drawn.entities.map((e) => e.type).join(', ')}`).toHaveLength(2);
  expect(dimension, `entidades: ${drawn.entities.map((e) => e.type).join(', ')}`).toBeTruthy();
  expect(lines[0].layer).toBe('0');
  expect(lines[1].layer).toBe('muros');
});
