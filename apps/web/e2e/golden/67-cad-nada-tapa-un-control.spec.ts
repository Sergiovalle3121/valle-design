import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installMockBackend } from '../fixtures/mock-backend';
import { installCadStudioBackend } from '../fixtures/cad-v1-backend';
import { loginAsStandaloneOwner } from '../fixtures/standalone-identity';
import type { CadDocument } from '../../src/lib/cad/cad-document';

/**
 * NADA FLOTANTE TAPA UN CONTROL.
 *
 * ## Por qué existe este archivo
 *
 * Tres veces seguidas, el mismo defecto, en tres esquinas distintas:
 *
 *  · La barra de videollamada se montó en `fixed right-3 top-3`, dentro de la
 *    banda de la barra superior, y tapó **«Guardar»**. Un usuario real no
 *    habría podido guardar su plano.
 *  · El dock de mensajería (`left-3 bottom-16 z-[75]`) se montó encima del
 *    reportero de incidencias (`left-3 bottom-14 z-[70]`) y se comió sus
 *    clics. Playwright reintentó 426 veces durante cinco minutos.
 *  · El ViewCube duplicó el `title` de los presets de la barra y dejó
 *    diecinueve archivos de pruebas apuntando a dos elementos.
 *
 * Los tres son la misma clase de fallo —una capa nueva cae sobre algo que ya
 * estaba— y ninguno lo cazó nada. Se descubrieron de uno en uno, por
 * casualidad, y el último costó una suite entera sin veredicto.
 *
 * ## Qué comprueba, exactamente
 *
 * Para CADA control visible y habilitado del estudio: quién responde en el
 * centro de su propia caja. `document.elementFromPoint` devuelve el elemento
 * de más arriba en ese punto — que es literalmente lo que el navegador le da
 * al usuario cuando hace clic ahí, y lo mismo que Playwright exige antes de
 * pulsar. Si responde otra cosa que no es el control ni un hijo suyo, hay una
 * capa encima y el control es INALCANZABLE con el ratón, por muy visible que
 * se vea.
 *
 * No mide estética ni posiciones: mide si se puede pulsar. Por eso no hay
 * números mágicos que envejezcan — mover una capa 20 px no rompe este golden,
 * sólo taparla con otra.
 *
 * ## Lo que deliberadamente NO comprueba
 *
 * Diálogos y menús abiertos: un modal TAPA lo de detrás a propósito, y ésa es
 * su función. El recorrido abre el estudio en reposo, sin nada desplegado, que
 * es el estado en el que ningún control debería estar tapado.
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
  // `/legacy/studio` y no `/studio/[id]`: es la ruta HERMÉTICA que usan los
  // goldens, stubbeada en la frontera de red. La otra exige el flujo de
  // identidad real y devuelve 401 de forma intermitente bajo un fixture.
  await page.goto('/legacy/studio');
  await expect(page.getByTestId('cad-canvas')).toBeVisible();
  // El recorrido guiado es un estado de PRIMERA VEZ, no el estado en reposo, y
  // además es modal por naturaleza: mientras está abierto tapa cosas a
  // propósito. Se descarta igual que en el resto de goldens.
  const saltar = page.getByTestId('cad-guided-tour-skip');
  if (await saltar.count()) await saltar.click();
  // La barra de llamada, el dock de mensajería y la capa de colaboración se
  // montan tras su primer fetch: sin esta espera el golden mediría un estudio
  // que todavía no tiene encima las capas que vino a vigilar.
  await page.waitForTimeout(2_500);
}

interface Tapado {
  control: string;
  tapadoPor: string;
  caja: string;
}

/**
 * Quién responde en el centro de cada control. Todo en una sola evaluación:
 * cruzar la frontera por cada botón multiplica el coste por cien y hace que el
 * golden dependa del reloj de la máquina en vez del DOM.
 */
async function controlesTapados(page: Page): Promise<Tapado[]> {
  return page.evaluate(() => {
    /** Cómo se llama el control tapado: por SÍ MISMO, nunca por su contenedor.
     *  Nombrarlo con `closest('[data-testid]')` devuelve el panel que lo
     *  contiene y deja al lector sin saber CUÁL de sus quince botones falla. */
    const identidad = (el: HTMLElement): string => {
      if (el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;
      const aria = el.getAttribute('aria-label');
      if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
      if (el.title) return `${el.tagName.toLowerCase()}[title="${el.title}"]`;
      const texto = (el.textContent ?? '').trim().slice(0, 40);
      if (texto) return `${el.tagName.toLowerCase()} \u00ab${texto}\u00bb`;
      return `${el.tagName.toLowerCase()} (sin nombre)`;
    };

    /** Cómo se llama QUIEN TAPA: aquí sí vale el contenedor, porque lo que
     *  interesa es qué capa hay que mover, no qué píxel suyo asoma. */
    const capa = (el: Element | null): string => {
      if (!el) return 'nada';
      const conId = el.closest('[data-testid]') as HTMLElement | null;
      if (conId) return `[data-testid="${conId.dataset.testid}"]`;
      const titulado = el.closest('[title]') as HTMLElement | null;
      if (titulado) return `${el.tagName.toLowerCase()}[title="${titulado.title}"]`;
      const conClase = (el as HTMLElement).className;
      return `${el.tagName.toLowerCase()}${typeof conClase === 'string' && conClase ? `.${conClase.split(/\s+/)[0]}` : ''}`;
    };

    const hallazgos: {
      control: string;
      tapadoPor: string;
      caja: string;
    }[] = [];

    const controles = Array.from(
      document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'),
    );

    for (const control of controles) {
      if (control.hasAttribute('disabled')) continue;
      if (control.getAttribute('aria-hidden') === 'true') continue;
      const caja = control.getBoundingClientRect();
      if (caja.width < 4 || caja.height < 4) continue;
      const estilo = getComputedStyle(control);
      if (
        estilo.visibility === 'hidden' ||
        estilo.display === 'none' ||
        Number(estilo.opacity) === 0 ||
        estilo.pointerEvents === 'none'
      ) {
        continue;
      }
      const cx = caja.left + caja.width / 2;
      const cy = caja.top + caja.height / 2;
      // Un control fuera de la ventana (una barra con scroll horizontal, por
      // ejemplo) no lo tapa nadie: simplemente no está ahí todavía.
      if (
        cx < 0 ||
        cy < 0 ||
        cx > window.innerWidth ||
        cy > window.innerHeight
      ) {
        continue;
      }

      const arriba = document.elementFromPoint(cx, cy);
      if (!arriba) continue;
      if (arriba === control || control.contains(arriba)) continue;
      // Un hijo que se pinta encima de su propio padre no es una capa ajena.
      if (arriba.contains(control)) continue;

      hallazgos.push({
        control: identidad(control),
        tapadoPor: capa(arriba),
        caja: `x=${Math.round(caja.left)} y=${Math.round(caja.top)} w=${Math.round(caja.width)} h=${Math.round(caja.height)}`,
      });
    }
    return hallazgos;
  });
}

/**
 * RESIDUO CONOCIDO — y es un TRINQUETE, no un escondite.
 *
 * Dos solapes ANTERIORES a la campaña de mensajería, que este golden destapó al
 * escribirse. Se declaran con su motivo en vez de dejar el gate apagado: un
 * gate que no corre hasta que todo esté perfecto no caza el defecto de mañana,
 * y el defecto de mañana es exactamente lo que este archivo viene a evitar.
 *
 * El trinquete va en las DOS direcciones. Si aparece un solape que no está
 * aquí, falla. Y si una entrada de aquí deja de tener hallazgo —porque alguien
 * lo arregló— TAMBIÉN falla, pidiendo que se borre la línea. Una lista de
 * excepciones que sobrevive a su motivo deja de describir el producto y pasa a
 * dar permiso a lo próximo que caiga en ese hueco.
 *
 * Debe llegar a cero, y no entra nada nuevo sin arreglarlo primero.
 */
const RESIDUO_CONOCIDO: {
  control: string;
  tapadoPor: string;
  motivo: string;
}[] = [
  // Vacía desde 2026-09-02: la única entrada —«Release Sin validar» bajo la
  // barra de herramientas— desapareció al sacar la barra de estado del lienzo
  // a su propia franja (golden 68). Rehacer la banda inferior era exactamente
  // lo que la entrada pedía.
];

const mismaEntrada = (
  a: { control: string; tapadoPor: string },
  b: { control: string; tapadoPor: string },
): boolean => a.control === b.control && a.tapadoPor === b.tapadoPor;

test('ninguna capa flotante deja un control del estudio sin poder pulsarse', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await openStudio(context, page);

  const tapados = await controlesTapados(page);

  const nuevos = tapados.filter(
    (t) => !RESIDUO_CONOCIDO.some((r) => mismaEntrada(r, t)),
  );
  const resueltos = RESIDUO_CONOCIDO.filter(
    (r) => !tapados.some((t) => mismaEntrada(r, t)),
  );

  const informe = nuevos
    .map((t) => `  · ${t.control} (${t.caja}) lo tapa ${t.tapadoPor}`)
    .join('\n');

  expect(
    nuevos,
    nuevos.length === 0
      ? ''
      : `Hay ${nuevos.length} control(es) que el usuario NO puede pulsar porque otra ` +
          `capa responde en el centro de su caja:\n${informe}\n\n` +
          `Cada uno es un botón que se ve y no funciona. Mueva la capa que tapa, ` +
          `no el control tapado: la capa es la que llegó después.`,
  ).toEqual([]);

  expect(
    resueltos.map((r) => r.control),
    resueltos.length === 0
      ? ''
      : 'Estas entradas de RESIDUO_CONOCIDO ya no tienen hallazgo: alguien las ' +
          'arregló. Borre la línea para que la lista no mienta ni sirva de escondite ' +
          'a la próxima capa que caiga en ese hueco.',
  ).toEqual([]);
});
