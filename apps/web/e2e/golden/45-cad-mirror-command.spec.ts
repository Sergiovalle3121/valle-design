import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import { saveAndSettle } from '../fixtures/cad-save';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * MIRROR de punta a punta, por la línea de comandos.
 *
 * Espejar es la operación que más caminos toca a la vez, y hasta esta ola sólo
 * uno de los cuatro se había enterado de que el plano se puede invertir. La
 * selección de este golden está elegida para recorrerlos todos:
 *
 *  - una **polilínea con bulge**, cuyo signo codifica el sentido del arco;
 *  - una **cota**, que hasta ahora NO SE MOVÍA — su adaptador llevaba una copia
 *    local de `transformPoint` que sólo leía `{origin, rotationDeg, scale,
 *    translation}`, y bajo `{mirror}` ninguno de esos campos existe: evaluaba
 *    la identidad. Espejar un ala acotada dejaba las cotas clavadas midiendo
 *    puntos que ya no estaban ahí;
 *  - un **INSERT**, que no se explota jamás: se re-descompone en giro y escala,
 *    con exactamente un eje negado y el giro RESTADO, no sumado.
 *
 * Lo que se afirma es el DOCUMENTO CANÓNICO persistido, no el aspecto. Un
 * viewport que dibuja el espejo bien mientras el documento guarda otra cosa es
 * exactamente el fallo que este golden existe para impedir: el mismo documento
 * alimenta la selección, los límites y la exportación DXF.
 *
 * El eje es VERTICAL en x = 5.000, así que `2φ = 180°`: todo punto va a
 * `10.000 − x` y todo ángulo almacenado α acaba en `180 − α`.
 */
const AXIS_X = 5_000;
const mirroredX = (x: number) => 2 * AXIS_X - x;

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: 'mm' },
    layers: [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false }],
    entities: [
      {
        id: 'ala-poli', type: 'polyline',
        vertices: [
          { x: 4_000, y: 3_000, z: 0, bulge: 0.5 },
          { x: 4_400, y: 3_000, z: 0 },
          { x: 4_400, y: 3_300, z: 0 },
        ],
        closed: false, layer: '0',
      },
      {
        id: 'ala-cota', type: 'dimension',
        a: { x: 4_000, y: 2_000 }, b: { x: 4_800, y: 2_000 },
        dimensionKind: 'linear', axis: 'x', offset: 120, layer: '0',
      },
      {
        id: 'ala-puerta', type: 'insert', block: 'puerta',
        insertion: { x: 4_200, y: 4_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 }, rotation: 30, layer: '0',
      },
    ],
    blocks: [{
      id: 'puerta', name: 'PUERTA', basePoint: { x: 0, y: 0, z: 0 }, version: 1,
      entities: [{ id: 'puerta:hoja', type: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 400, y: 0, z: 0 }, layer: '0' }],
    }],
    history: [], modelSpace: { entityIds: ['ala-poli', 'ala-cota', 'ala-puerta'] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    constraints: [], externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000, footprintH: 10_000, unit: 'mm', gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId('cad-command-input');
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

const around = (value: number) => ((value % 360) + 360) % 360;

test('MIRROR espeja por la línea de comandos una selección con bloque, cota y polilínea con bulge', async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto('/legacy/studio');

  const count = page.getByTestId('cad-native-document-count');
  await expect(count).toHaveText('Native 3');

  // --- se designa la selección entera ----------------------------------------
  await page.getByTitle(/Selección profesional/).click();
  const palette = page.getByTestId('cad-selection-palette');
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(page.getByTestId('cad-selection-count')).toHaveText('3 seleccionados');
  // La paleta se cierra: el resto del recorrido es por teclado.
  await page.getByTitle(/Selección profesional/).click();

  // --- MIRROR por su alias, como en AutoCAD ----------------------------------
  const prompt = page.getByTestId('cad-command-prompt');
  await type(page, 'MI');
  // Con objetos ya designados el comando salta el «Designe objetos» y pide eje.
  await expect(prompt).toContainText('eje de simetría');

  await type(page, `${AXIS_X},0`);
  await type(page, `${AXIS_X},1000`);
  // El defecto de AutoCAD —y el prudente— es CONSERVAR el original: espejar es
  // casi siempre duplicar el ala simétrica, no una operación destructiva.
  await expect(prompt).toContainText('Borrar');
  await expect(page.getByTestId('cad-command-keyword-No')).toBeVisible();
  await type(page, 'N');
  await expect(prompt).toBeHidden();

  // Tres originales más tres copias reflejadas. Si MIRROR hubiera borrado el
  // origen habría tres, y si no hubiera hecho nada, tres también: el número
  // distingue las tres salidas.
  await expect(count).toHaveText('Native 6');

  // --- y lo que se guarda es el documento canónico ----------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved).toHaveLength(6);

  const copyOf = <T extends CadDocument['entities'][number]['type']>(type: T, originalId: string) =>
    saved.filter((entity) => entity.type === type && entity.id !== originalId)[0] as Extract<
      CadDocument['entities'][number],
      { type: T }
    >;

  // Polilínea: los vértices se reflejan Y el bulge cambia de SIGNO. Sin lo
  // segundo el arco quedaría combado hacia el mismo lado en las dos alas — una
  // esquina redondeada que se curva al revés, plausible y equivocada.
  const polyline = copyOf('polyline', 'ala-poli');
  expect(polyline.vertices.map((vertex) => Math.round(vertex.x))).toEqual([
    mirroredX(4_000), mirroredX(4_400), mirroredX(4_400),
  ]);
  expect(polyline.vertices.map((vertex) => Math.round(vertex.y))).toEqual([3_000, 3_000, 3_300]);
  expect(polyline.vertices[0].bulge).toBeCloseTo(-0.5, 9);
  expect(polyline.vertices[1].bulge).toBeUndefined();
  // Y el original NO se toca: reflejar la copia y dejar el origen quieto es lo
  // que distingue MIRROR de un espejo destructivo.
  const original = saved.find((entity) => entity.id === 'ala-poli');
  expect(original?.type === 'polyline' && original.vertices[0].x).toBe(4_000);
  expect(original?.type === 'polyline' && original.vertices[0].bulge).toBe(0.5);

  // Cota: ESTO es lo que no ocurría. Sus puntos de definición se mueven con el
  // resto de la selección; antes se quedaban donde estaban.
  const dimension = copyOf('dimension', 'ala-cota');
  expect(Math.round(dimension.a.x)).toBe(mirroredX(4_000));
  expect(Math.round(dimension.b.x)).toBe(mirroredX(4_800));
  expect(Math.round(dimension.a.y)).toBe(2_000);
  // Transformarla la desasocia: mide otra geometría, y el adaptador lo declara.
  expect(dimension.associative).toBe(false);

  // INSERT: no se explota. Se re-descompone — el giro se RESTA (180 − 30 = 150)
  // y exactamente UN eje de la escala queda negado. Sumar el giro habría dejado
  // 210° y la puerta con las bisagras en la jamba contraria.
  const insert = copyOf('insert', 'ala-puerta');
  expect(insert.block).toBe('puerta');
  expect(Math.round(insert.insertion.x)).toBe(mirroredX(4_200));
  expect(around(insert.rotation)).toBeCloseTo(150, 6);
  expect(insert.scale.x * insert.scale.y).toBeLessThan(0);
  expect(Math.abs(insert.scale.x)).toBeCloseTo(1, 9);
  expect(Math.abs(insert.scale.y)).toBeCloseTo(1, 9);
});
