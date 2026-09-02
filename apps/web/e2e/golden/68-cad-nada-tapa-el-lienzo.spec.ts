import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * NADA FLOTANTE TAPA EL LIENZO.
 *
 * ## Por qué existe este archivo
 *
 * El golden 67 vigila que ninguna capa deje un CONTROL sin poder pulsarse. El
 * lienzo no es un control, y por ese hueco se coló el quinto caso de la misma
 * familia: la barra de estado estaba montada DENTRO de `cad-canvas`, absoluta,
 * abajo a la derecha, y se comía el `pointerdown` de cualquier arrastre que
 * empezara ahí. Medido en la auditoría del 2026-09-01 (`e2e/auditoria/
 * capas.spec.ts`): un recuadro de selección desde el centro del lienzo designa
 * 3 objetos a 180 px y CERO a 200 px, porque a 200 px `document.elementFromPoint`
 * ya no responde `<canvas>` sino `span[testid=cad-save-status]`. Un recuadro
 * mayor que contiene al menor designa menos que él, que es imposible en
 * cualquier CAD.
 *
 * ## Qué comprueba, exactamente
 *
 * Una rejilla de puntos sobre la caja de `cad-canvas` —los cuatro rincones con
 * un margen de 12 px, los puntos medios de cada borde y una malla interior de
 * 9×7— y, en cada uno, QUIÉN responde en `document.elementFromPoint`. Es lo
 * mismo que el navegador le entrega al ratón. Todo lo que no sea el `<canvas>`
 * de WebGL es una capa que está robando ese píxel al dibujo.
 *
 * ## Lo que se admite, y por qué está escrito
 *
 * Hay capas que SÍ viven sobre el dibujo a propósito, como en AutoCAD: la
 * línea de comandos flotante (abajo a la izquierda) y la barra de herramientas.
 * Van en `CAPAS_ADMITIDAS` con su motivo. Un punto que caiga sobre una de
 * ellas no es un hallazgo. Todo lo demás, sí: la lista de residuos es un
 * trinquete en las dos direcciones, igual que en el golden 67 — un residuo que
 * desaparece exige borrar su línea.
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

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: 'mm',
    gridSize: 100,
  });
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
  // Mismo motivo que en el golden 67: las capas que se montan tras su primer
  // fetch tienen que estar puestas antes de medir.
  await page.waitForTimeout(2_500);
}

/**
 * Capas que SÍ pueden estar sobre el dibujo. Cada una con el motivo y con la
 * forma de reconocerla (un `data-testid` propio o de un ancestro).
 */
const CAPAS_ADMITIDAS: { testid: string; motivo: string }[] = [
  {
    testid: 'cad-command-line',
    motivo:
      'La línea de comandos flota sobre el dibujo abajo a la izquierda, como la ' +
      'ventana de comandos de AutoCAD desde 2013. Su envoltorio es ' +
      'pointer-events-none; sólo el muelle propio toma el ratón.',
  },
  {
    testid: 'cad-toolbar',
    motivo: 'La barra de herramientas vertical es una paleta anclada al borde del lienzo.',
  },
  {
    testid: 'cad-navigation-corner',
    motivo:
      'La esquina superior derecha es la de las ayudas de navegación, como el ' +
      'ViewCube y la barra de navegación de AutoCAD (sólo en 3D) y el minimapa ' +
      'cuando el usuario lo enciende: está apagado de fábrica justo porque roba ' +
      'el ratón donde esté.',
  },
];

interface Robo {
  punto: string;
  tapadoPor: string;
}

async function puntosRobados(page: Page): Promise<Robo[]> {
  return page.evaluate((admitidas: string[]) => {
    const lienzo = document.querySelector<HTMLElement>('[data-testid="cad-canvas"]');
    if (!lienzo) throw new Error('No hay [data-testid="cad-canvas"]');
    const caja = lienzo.getBoundingClientRect();
    const margen = 12;
    const xs: number[] = [];
    const ys: number[] = [];
    const columnas = 9;
    const filas = 7;
    for (let i = 0; i < columnas; i += 1)
      xs.push(caja.left + margen + ((caja.width - 2 * margen) * i) / (columnas - 1));
    for (let j = 0; j < filas; j += 1)
      ys.push(caja.top + margen + ((caja.height - 2 * margen) * j) / (filas - 1));
    // Una fila más a 40 px del borde inferior: es donde cae el centro de una
    // barra de ~30 px anclada a `bottom-3`, y la malla regular puede saltársela.
    ys.push(caja.bottom - 40);

    /** Cómo se llama la capa que roba: el primer ancestro CON NOMBRE por
     *  debajo del lienzo. Subir hasta el primer `data-testid` a secas devolvía
     *  «cad-canvas» —el propio lienzo— para la barra de estado, que no tiene
     *  testid, y dejaba al lector sin saber qué capa mover. */
    const capa = (el: Element | null): string => {
      const nombre = (nodo: HTMLElement): string | null => {
        if (nodo.dataset.testid) return `[data-testid="${nodo.dataset.testid}"]`;
        if (typeof nodo.className !== 'string' || !nodo.className.trim()) return null;
        // Las utilidades de Tailwind no nombran nada; un gancho semántico
        // (`cad-status-bar`) sí. Se prefiere el primero que lo parezca.
        const clases = nodo.className.trim().split(/\s+/);
        const semantica = clases.find((c) => /^cad-/.test(c));
        return `${nodo.tagName.toLowerCase()}.${semantica ?? clases.slice(0, 2).join('.')} [${nodo.className.slice(0, 90)}]`;
      };
      const cadena: string[] = [];
      let actual: Element | null = el;
      while (actual && actual !== lienzo && cadena.length < 4) {
        const n = nombre(actual as HTMLElement);
        if (n) cadena.push(n);
        if (n && (n.startsWith('[data-testid') || /\.cad-/.test(n))) break;
        actual = actual.parentElement;
      }
      return cadena.length ? cadena.join(' › ') : el ? `${el.tagName.toLowerCase()} (sin nombre)` : 'nada';
    };

    const robos: Robo[] = [];
    for (const y of ys) {
      for (const x of xs) {
        const arriba = document.elementFromPoint(x, y);
        if (!arriba) continue;
        if (arriba.tagName.toLowerCase() === 'canvas') continue;
        const admitida = admitidas.some((testid) => arriba.closest(`[data-testid="${testid}"]`));
        if (admitida) continue;
        // Posición RELATIVA al lienzo, en tercios, para que el informe se lea
        // sin la ventana delante y no envejezca con el tamaño de pantalla.
        const fx = (x - caja.left) / caja.width;
        const fy = (y - caja.top) / caja.height;
        const horizontal = fx < 1 / 3 ? 'izquierda' : fx > 2 / 3 ? 'derecha' : 'centro';
        const vertical = fy < 1 / 3 ? 'arriba' : fy > 2 / 3 ? 'abajo' : 'medio';
        robos.push({ punto: `${vertical}-${horizontal}`, tapadoPor: capa(arriba) });
      }
    }
    return robos;
  }, CAPAS_ADMITIDAS.map((capa) => capa.testid));
}

/**
 * RESIDUO CONOCIDO — trinquete en las dos direcciones, como en el golden 67.
 * Debe llegar a cero.
 */
const RESIDUO_CONOCIDO: { tapadoPor: string; motivo: string }[] = [];

test('ninguna capa flotante roba el ratón al área de dibujo', async ({ context, page }) => {
  test.setTimeout(120_000);
  await openStudio(context, page);

  const robos = await puntosRobados(page);
  const porCapa = new Map<string, Set<string>>();
  for (const robo of robos) {
    const zonas = porCapa.get(robo.tapadoPor) ?? new Set<string>();
    zonas.add(robo.punto);
    porCapa.set(robo.tapadoPor, zonas);
  }

  const nuevos = [...porCapa.entries()].filter(
    ([tapadoPor]) => !RESIDUO_CONOCIDO.some((r) => r.tapadoPor === tapadoPor),
  );
  const resueltos = RESIDUO_CONOCIDO.filter((r) => !porCapa.has(r.tapadoPor));

  const informe = nuevos
    .map(([tapadoPor, zonas]) => `  · ${tapadoPor} responde en ${[...zonas].join(', ')}`)
    .join('\n');

  expect(
    nuevos.map(([tapadoPor]) => tapadoPor),
    nuevos.length === 0
      ? ''
      : `Hay ${nuevos.length} capa(s) sobre el área de dibujo que se quedan con el ratón:\n${informe}\n\n` +
          'Un arrastre de selección que empiece ahí no llega nunca al lienzo. Saque la capa ' +
          'del lienzo o declárela en CAPAS_ADMITIDAS con su motivo.',
  ).toEqual([]);

  expect(
    resueltos.map((r) => r.tapadoPor),
    resueltos.length === 0
      ? ''
      : 'Estas entradas de RESIDUO_CONOCIDO ya no tienen hallazgo: alguien las arregló. ' +
          'Borre la línea para que la lista no mienta.',
  ).toEqual([]);
});
