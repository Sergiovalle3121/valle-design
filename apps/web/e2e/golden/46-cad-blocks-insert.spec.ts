import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';
import { resolveCadInsert } from '../../src/lib/cad/professional-blocks';

/**
 * OLA 4 — el bloque, la unidad de reutilización de un CAD.
 *
 * Hasta este cambio no había forma de crear un bloque. `block.ts`,
 * `professional-blocks.ts` y el adaptador de INSERT llevaban tiempo escritos y
 * probados, y nadie los llamaba desde el gesto con el que se usa un CAD: sin
 * BLOCK e INSERT tecleables, cada puerta de un plano se dibuja a mano otra vez.
 *
 * Este golden fija el gesto entero contra el producto de verdad:
 *
 *   (designar) · B ⏎ · PUERTA ⏎ · 0,0 ⏎ · ⏎        → la geometría es un bloque
 *   I ⏎ · PUERTA ⏎ · 3000,0 ⏎ · 2 ⏎ · ⏎ · ⏎        → inserción al doble
 *   I ⏎ · PUERTA ⏎ · 0,3000 ⏎ · ⏎ · ⏎ · 90 ⏎       → inserción girada 90°
 *   I ⏎ · PUERTA ⏎ · 5000,0 ⏎ · -1 ⏎ · 1 ⏎ · ⏎     → inserción ESPEJADA
 *   PU ⏎                                            → no hay nada que purgar
 *
 * Y lo que se afirma no es «hay tres inserciones»: es a qué COORDENADAS
 * concretas resuelve cada una después de guardar y volver a leer el documento
 * canónico. Una propiedad de ida y vuelta se cumple de forma vacía si el código
 * nunca toca el campo, y la escala negativa es precisamente el campo que un
 * `Math.abs` de conveniencia se come sin que nada falle: la puerta se sigue
 * viendo, sólo que abre hacia el otro lado.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'door-leaf',
        type: 'line',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1_000, y: 0, z: 0 },
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['door-leaf'] },
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

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

/** Enter con la caja vacía: aceptar el valor por defecto del paso. */
async function accept(page: Page) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.press('Enter');
}

async function expectNativeCount(page: Page, total: number) {
  await expect(page.getByTestId('cad-native-document-count')).toHaveText(`Native ${total}`);
}

/** Los extremos de las líneas a las que resuelve una inserción, ordenados. */
function resolvedSegments(document: CadDocument, insertId: string) {
  const resolved = resolveCadInsert(document, insertId);
  expect(resolved.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  return resolved.entities
    .filter((entity): entity is Extract<CadDocument['entities'][number], { type: 'line' }> =>
      entity.type === 'line',
    )
    .map((entity) => ({
      x1: Math.round(entity.start.x),
      y1: Math.round(entity.start.y),
      x2: Math.round(entity.end.x),
      y2: Math.round(entity.end.y),
    }));
}

test('BLOCK define, INSERT coloca con escala y giro —incluida la escala negativa— y PURGE respeta lo que se usa', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();
  await expect(page.getByTestId('cad-command-line')).toBeVisible();

  // --- BLOCK: se designa, se nombra y se da el punto base ---------------------
  await page.getByTestId('cad-native-entity-door-leaf').click();
  await type(page, 'B');
  const prompt = page.getByTestId('cad-command-prompt');
  await expect(prompt).toContainText('nombre del bloque');
  await type(page, 'PUERTA');
  await expect(prompt).toContainText('punto base');
  await type(page, '0,0');
  // Con objetos ya designados, Enter cierra la designación y crea el bloque.
  await expect(prompt).toContainText('Designe objetos');
  await accept(page);
  await expect(prompt).toBeHidden();
  // La línea desapareció y en su sitio hay UNA inserción: sigue habiendo una
  // entidad, pero ya no es la misma cosa.
  await expectNativeCount(page, 1);

  // --- INSERT ×3, con escala y giro distintos --------------------------------
  await type(page, 'I');
  await expect(prompt).toContainText('nombre del bloque');
  await type(page, 'PUERTA');
  await type(page, '3000,0');
  await type(page, '2'); // escala X
  await accept(page); // escala Y = X
  await accept(page); // sin giro
  await expectNativeCount(page, 2);

  await type(page, 'I');
  await type(page, 'PUERTA');
  await type(page, '0,3000');
  await accept(page); // escala X = 1
  await accept(page); // escala Y = X
  await type(page, '90'); // giro
  await expectNativeCount(page, 3);

  await type(page, 'I');
  await type(page, 'PUERTA');
  await type(page, '5000,0');
  // El signo se teclea. Y la Y se da explícitamente: con Enter tomaría también
  // el −1 y saldría un giro de 180°, que NO es un espejo.
  await type(page, '-1');
  await type(page, '1');
  await accept(page);
  await expectNativeCount(page, 4);

  // --- PURGE no propone lo que sí se usa --------------------------------------
  await type(page, 'PU');
  await expect(page.getByTestId('cad-command-line')).toContainText('nada que purgar');
  await expect(prompt).toBeHidden();

  // --- lo dibujado persiste y resuelve donde debe -----------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;

  expect(saved.blocks).toHaveLength(1);
  expect(saved.blocks[0].name).toBe('PUERTA');
  expect(saved.blocks[0].entities).toHaveLength(1);

  const inserts = saved.entities.filter(
    (entity): entity is Extract<CadDocument['entities'][number], { type: 'insert' }> =>
      entity.type === 'insert',
  );
  expect(inserts).toHaveLength(4);
  expect(saved.entities.some((entity) => entity.id === 'door-leaf')).toBe(false);

  const at = (x: number, y: number) => {
    const found = inserts.find(
      (insert) => Math.round(insert.insertion.x) === x && Math.round(insert.insertion.y) === y,
    );
    expect(found, `no hay ninguna inserción en ${x},${y}`).toBeDefined();
    return found!;
  };

  // ANCLA ABSOLUTA 1 — la escala ×2: la hoja mide 2000 desde el punto de inserción.
  const doubled = at(3_000, 0);
  expect(doubled.scale).toEqual({ x: 2, y: 2, z: 1 });
  expect(resolvedSegments(saved, doubled.id)).toEqual([
    { x1: 3_000, y1: 0, x2: 5_000, y2: 0 },
  ]);

  // ANCLA ABSOLUTA 2 — el giro de 90°: la hoja sube en vez de ir a la derecha.
  const rotated = at(0, 3_000);
  expect(rotated.rotation).toBe(90);
  expect(resolvedSegments(saved, rotated.id)).toEqual([
    { x1: 0, y1: 3_000, x2: 0, y2: 4_000 },
  ]);

  // ANCLA ABSOLUTA 3 — la escala NEGATIVA. Éste es el caso que se pierde solo:
  // el objeto de escala guardado lleva el −1, y la geometría resuelta va hacia
  // −x. Si alguien mete un `Math.abs` en el camino, la línea de abajo sale
  // 5000→6000 y este golden lo dice.
  const mirrored = at(5_000, 0);
  expect(mirrored.scale).toEqual({ x: -1, y: 1, z: 1 });
  expect(resolvedSegments(saved, mirrored.id)).toEqual([
    { x1: 5_000, y1: 0, x2: 4_000, y2: 0 },
  ]);

  // La inserción que dejó BLOCK en el sitio de la geometría original.
  const origin = at(0, 0);
  expect(resolvedSegments(saved, origin.id)).toEqual([
    { x1: 0, y1: 0, x2: 1_000, y2: 0 },
  ]);
});
