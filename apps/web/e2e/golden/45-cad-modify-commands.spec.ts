import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * Las órdenes de modificación que faltaban, contra el producto de verdad.
 *
 * El motor tenía ERASE, MOVE, COPY, OFFSET, ROTATE, SCALE, FILLET, CHAMFER,
 * TRIM, EXTEND, BREAK y MIRROR. Faltaban las que un dibujante usa cada hora:
 * `AR`, `S`, `LEN`, `J`, `X`, `AL`, `PE`, `SPE` y `MA` no resolvían a nada.
 *
 * Sus specs de Node prueban las máquinas de estados una por una. Este golden
 * prueba lo que ninguna de ellas puede probar: que el nombre LLEGA al producto,
 * que la orden muta el DOCUMENTO CANÓNICO y que lo escrito SOBREVIVE al
 * guardado. Un comando con la spec verde y sin registrar no existe para el
 * usuario, y esa diferencia sólo se ve aquí.
 *
 * Se eligen dos caminos porque son los dos que el producto sabe recorrer hoy:
 *
 *   · STRETCH se teclea ENTERO —ventana de captura, punto base y
 *     desplazamiento son coordenadas— y no necesita designar nada.
 *   · ARRAY parte de la selección del editor, que se hace con la paleta de
 *     selección profesional.
 *
 * Lo que este golden NO puede probar todavía: los comandos que exigen designar
 * con el ratón (LENGTHEN, JOIN, EXPLODE, PEDIT, MATCHPROP) siguen fuera de
 * alcance porque el puntero no está enrutado al motor. Es la frontera que ya
 * documenta `Layout3DEditor.tsx`, y aquí se comprueba al menos que sus nombres
 * resuelven y piden lo que tienen que pedir.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'wall',
        type: 'line',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 2000, y: 0, z: 0 },
        layer: '0',
      },
      {
        id: 'hole',
        type: 'circle',
        center: { x: 1000, y: 4000, z: 0 },
        radius: 300,
        layer: '0',
      },
    ],
    history: [],
    modelSpace: { entityIds: ['wall', 'hole'] },
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

test('STRETCH y ARRAY se teclean, mutan el documento canónico y sobreviven al guardado', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-native-entity-list')).toBeVisible();

  const commandLine = page.getByTestId('cad-command-line');
  await expect(commandLine).toBeVisible();
  const prompt = page.getByTestId('cad-command-prompt');

  // --- STRETCH: la ventana de captura coge UN extremo, no el objeto entero ----
  await type(page, 'S');
  await expect(prompt).toContainText('esquina');
  // Ventana [1000,−500]–[3000,500]: dentro cae el extremo derecho del muro
  // (2000,0) y NADA del círculo, que está en y=4000.
  await type(page, '1000,-500');
  await type(page, '3000,500');
  await expect(prompt).toContainText('base');
  await type(page, '0,0');
  await type(page, '500,0');
  await expect(prompt).toBeHidden();

  // --- ARRAY parte de la selección del editor ---------------------------------
  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  await palette.getByLabel('Filtrar por tipo').selectOption('circle');
  await page.getByTestId('cad-quick-select-apply').click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('1 seleccionados');

  await type(page, 'AR');
  await expect(prompt).toContainText('matriz');
  await type(page, 'R');
  await type(page, '1'); // filas
  await type(page, '3'); // columnas
  await type(page, '0'); // separación entre filas
  await type(page, '1500'); // separación entre columnas
  await expect(prompt).toBeHidden();

  // --- los nombres que todavía piden ratón, al menos RESUELVEN ------------------
  // Un comando que no llega al registro no existe para el usuario por muy verde
  // que esté su spec. Se comprueba que el alias resuelve y que el prompt es el
  // suyo, no el de otro.
  for (const [alias, expected] of [
    ['LEN', 'medir'],
    ['J', 'unir'],
    ['X', 'descomponer'],
    ['PE', 'polilínea'],
    ['MA', 'origen'],
  ] as const) {
    await type(page, alias);
    await expect(prompt).toContainText(expected);
    await page.getByTestId('cad-command-input').press('Escape');
    await expect(prompt).toBeHidden();
  }

  // --- el documento canónico, y lo que persiste ---------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;

  const wall = saved.find((entity) => entity.id === 'wall');
  expect(wall?.type).toBe('line');
  if (wall?.type !== 'line') throw new Error('el muro dejó de ser una línea');
  // El extremo de DENTRO de la ventana se movió 500; el de fuera no se movió.
  // Si STRETCH hubiera trasladado el objeto entero, el arranque estaría en 500.
  expect(wall.start).toMatchObject({ x: 0, y: 0 });
  expect(wall.end).toMatchObject({ x: 2500, y: 0 });

  const circles = saved.filter((entity) => entity.type === 'circle');
  expect(circles).toHaveLength(3);
  const xs = circles
    .map((entity) => (entity.type === 'circle' ? entity.center.x : 0))
    .sort((left, right) => left - right);
  expect(xs).toEqual([1000, 2500, 4000]);
  // Todas conservan el radio: una matriz copia, no escala.
  expect(
    circles.every((entity) => entity.type === 'circle' && entity.radius === 300),
  ).toBe(true);

  // La ASOCIATIVIDAD viaja con el documento. Sin ella, ARRAYEDIT no tendría de
  // dónde sacar los parámetros y «matriz asociativa» sería sólo un nombre.
  const arrayIds = new Set(
    circles.map((entity) => entity.context?.metadata?.arrayId).filter(Boolean),
  );
  expect(arrayIds.size).toBe(1);
  const params = circles[0].context?.metadata?.arrayParams;
  expect(typeof params).toBe('string');
  expect(String(params)).toContain('"cols":3');

  // El círculo original sigue siendo el índice 0: la matriz no lo recreó, y por
  // eso todo lo que lo apuntara seguiría apuntando.
  const original = saved.find((entity) => entity.id === 'hole');
  expect(original?.context?.metadata?.arrayIndex).toBe(0);
});
