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

async function openStudio(
  context: BrowserContext,
  page: Page,
  { saltarRecorrido = true }: { saltarRecorrido?: boolean } = {},
) {
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
  // El recorrido guiado es un estado de PRIMERA VEZ, no el estado en reposo:
  // el primer test lo descarta igual que el resto de goldens. El segundo NO,
  // porque la primera vez es justo cuando el recorrido tapaba la paleta.
  if (saltarRecorrido) {
    const saltar = page.getByTestId('cad-guided-tour-skip');
    if (await saltar.count()) await saltar.click();
  } else {
    await expect(page.getByTestId('cad-guided-tour')).toBeVisible();
  }
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

    /** ¿Cae (x, y) fuera de la caja VISIBLE de algún scroller que contiene al
     *  control? Es la regla de la ventana un nivel más adentro: lo que su
     *  banda con scroll recorta no se pinta, así que no es un botón que se ve y
     *  no funciona — todavía no está ahí. Sólo cuentan `auto`/`scroll`, que el
     *  usuario puede desplazar: lo que recorta un `overflow: hidden` no queda
     *  exento. La ventana ya la cubre la comprobación de abajo. */
    const fueraDeSuScroller = (el: HTMLElement, x: number, y: number): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(p);
        if (!/auto|scroll/.test(`${overflowX} ${overflowY}`)) continue;
        const r = p.getBoundingClientRect();
        const izquierda = r.left + p.clientLeft;
        const tope = r.top + p.clientTop;
        // `clientWidth/Height` descuentan la barra de scroll pero redondean a
        // entero: el borde exacto es el menor de los dos.
        const derecha = Math.min(r.right, izquierda + p.clientWidth);
        const fondo = Math.min(r.bottom, tope + p.clientHeight);
        if (x < izquierda || y < tope || x >= derecha || y >= fondo) {
          return true;
        }
      }
      return false;
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
      // Y lo mismo dentro de la ventana: desde que Guardar, el estado y el
      // cierre son una cola FIJA a la derecha de la barra superior (golden
      // 215), la banda de iconos se desplaza en su propia caja y recorta allí,
      // no en el borde de la ventana. Lo que asoma en ese punto es la cola,
      // pintada en su sitio — no una capa encima del icono.
      //
      // Pero sólo si el scroller lo RECORTA de verdad. Un control `fixed` (o
      // `absolute` con su bloque contenedor fuera del scroller) cuelga de él
      // en el DOM y se pinta fuera de su caja: ése sí puede quedar tapado —es
      // el reportero bajo el dock de mensajería de la cabecera—.
      // `elementsFromPoint` lista todo lo que responde en el punto, también lo
      // que queda DEBAJO de otra capa; lo recortado no aparece.
      if (
        fueraDeSuScroller(control, cx, cy) &&
        !document.elementsFromPoint(cx, cy).includes(control)
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

/* ═══════════════════════════════════════════════════════════════════════════
 * CON EL RECORRIDO GUIADO ABIERTO
 *
 * El test de arriba salta el recorrido antes de medir, y por eso no vio el
 * defecto que el dueño vio en producción: la tarjeta «Primeros cinco minutos»
 * flotaba sobre el lienzo, encima de la paleta de herramientas, con
 * `pointer-events-none`. `elementFromPoint` ignora lo que no captura el
 * puntero, así que para `controlesTapados` la paleta seguía «libre»… y lo
 * estaba: pulsar el TEXTO del recorrido encendía «Pasillo», «Área» o «Ajustar
 * todo», que estaban debajo. Una capa que se ve y no se puede pulsar miente.
 *
 * Por eso aquí se mide la TARJETA, no sólo los controles:
 *
 *  · que sus propios puntos —el título, el centro, el borde— respondan a ELLA;
 *  · que su caja no pise la paleta ni el lienzo (vive en el muelle izquierdo);
 *  · y, con ella abierta, lo mismo que el test de arriba: ningún control tapado.
 *
 * Plegada —que es como arranca— y desplegada: desplegada es cuando más tapaba.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface MedidaRecorrido {
  caja: string;
  colocacion: string | null;
  /** px² de la tarjeta encima del lienzo y de la paleta de herramientas. */
  solapeLienzo: number;
  solapePaleta: number;
  /** Puntos de la tarjeta donde responde OTRA cosa: clics que la atraviesan. */
  ajenos: string[];
}

async function medirRecorrido(page: Page): Promise<MedidaRecorrido> {
  return page.evaluate(() => {
    const tarjeta = document.querySelector<HTMLElement>('[data-testid="cad-guided-tour"]');
    if (!tarjeta) throw new Error('no hay recorrido guiado que medir');
    const r = tarjeta.getBoundingClientRect();
    const solape = (selector: string): number => {
      const otro = document.querySelector(selector);
      if (!otro) return 0;
      const o = otro.getBoundingClientRect();
      const ancho = Math.min(r.right, o.right) - Math.max(r.left, o.left);
      const alto = Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top);
      return ancho > 0 && alto > 0 ? Math.round(ancho * alto) : 0;
    };
    // Puntos de la tarjeta que NO son botones: ahí es donde el usuario
    // pincha «en el recorrido» y esperaba que no pasara nada.
    const puntos: Array<[string, number, number]> = [
      ['centro', r.left + r.width / 2, r.top + r.height / 2],
      ['borde izquierdo', r.left + 5, r.top + r.height / 2],
    ];
    const titulo = (
      tarjeta.querySelector('[data-testid="cad-guided-tour-title"]') ??
      tarjeta.querySelector('header')
    )?.getBoundingClientRect();
    if (titulo && titulo.width > 0) {
      puntos.push([
        'título',
        titulo.left + Math.min(titulo.width / 2, 40),
        titulo.top + titulo.height / 2,
      ]);
    }
    const ajenos: string[] = [];
    for (const [nombre, x, y] of puntos) {
      const arriba = document.elementFromPoint(x, y);
      if (arriba && tarjeta.contains(arriba)) continue;
      const quien =
        arriba?.closest('[data-testid]')?.getAttribute('data-testid') ??
        arriba?.getAttribute('title') ??
        arriba?.tagName.toLowerCase() ??
        'nada';
      ajenos.push(`${nombre} (${Math.round(x)}, ${Math.round(y)}) responde ${quien}`);
    }
    return {
      caja: `x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)}`,
      colocacion: tarjeta.dataset.placement ?? null,
      solapeLienzo: solape('[data-testid="cad-canvas"]'),
      solapePaleta: solape('[data-testid="cad-toolbar"]'),
      ajenos,
    };
  });
}

async function afirmarQueNoTapa(
  page: Page,
  estado: string,
  { tambienControles }: { tambienControles: boolean },
) {
  const medida = await medirRecorrido(page);
  const donde = `recorrido ${estado} en ${medida.caja} (colocación: ${medida.colocacion ?? 'sin declarar'})`;
  expect(
    medida.ajenos,
    `${donde}: la tarjeta deja pasar los clics a lo que tiene DEBAJO —el usuario pulsa ` +
      `el recorrido y se le enciende otra cosa—:\n  · ${medida.ajenos.join('\n  · ')}`,
  ).toEqual([]);
  expect(
    medida.solapePaleta,
    `${donde}: pisa ${medida.solapePaleta} px² de la paleta de herramientas`,
  ).toBe(0);
  expect(
    medida.solapeLienzo,
    `${donde}: tapa ${medida.solapeLienzo} px² del lienzo; su sitio es el muelle izquierdo`,
  ).toBe(0);

  // Todos los controles, en la MISMA ventana que el test de arriba (la de
  // serie, 1.280×720): lo único que cambia respecto a él es el recorrido
  // abierto, así que cualquier hallazgo nuevo es suyo.
  if (!tambienControles) return;
  const tapados = await controlesTapados(page);
  expect(
    tapados,
    `${donde}: deja controles sin poder pulsarse:\n` +
      tapados.map((t) => `  · ${t.control} (${t.caja}) lo tapa ${t.tapadoPor}`).join('\n'),
  ).toEqual([]);
}

test('con el recorrido guiado abierto, su tarjeta recibe sus propios clics y no tapa la paleta, el lienzo ni un control', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await openStudio(context, page, { saltarRecorrido: false });

  const tarjeta = page.getByTestId('cad-guided-tour');
  const toggle = page.getByTestId('cad-guided-tour-toggle');
  await afirmarQueNoTapa(page, 'tal como arranca', { tambienControles: true });

  // Arranca PLEGADO: una línea con el paso actual.
  await expect(tarjeta).toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('cad-guided-tour-progress')).toBeHidden();

  // Desplegado es cuando más tapaba: se mide otra vez.
  await toggle.click();
  await expect(tarjeta).toHaveAttribute('data-collapsed', 'false');
  await expect(page.getByTestId('cad-guided-tour-progress')).toBeVisible();
  await afirmarQueNoTapa(page, 'desplegado', { tambienControles: true });

  // Y en la ventana del reporte: un portátil de 1.366×768, donde paleta,
  // recorrido y aviso de la demo se comían cerca del 40 % del lienzo. Aquí se
  // mide la tarjeta; la cinta a 1.366 la vigila el golden 214.
  await page.setViewportSize({ width: 1366, height: 768 });
  await afirmarQueNoTapa(page, 'desplegado a 1.366×768', { tambienControles: false });
  await toggle.click();
  await expect(tarjeta).toHaveAttribute('data-collapsed', 'true');
  await afirmarQueNoTapa(page, 'plegado a 1.366×768', { tambienControles: false });
});

test('en una ventana estrecha, donde el recorrido tiene que flotar, sigue quedándose con sus propios clics', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  // Por debajo de 1.100 px el muelle izquierdo se oculta por CSS y el
  // recorrido vuelve a flotar sobre la línea de comandos (`tour-slot.ts`).
  await page.setViewportSize({ width: 1024, height: 700 });
  await openStudio(context, page, { saltarRecorrido: false });

  const tarjeta = page.getByTestId('cad-guided-tour');
  await expect(tarjeta).toHaveAttribute('data-placement', 'floating');
  // Flotando, plegado es lo que evita que tape un tercio del plano.
  await expect(tarjeta).toHaveAttribute('data-collapsed', 'true');

  const medida = await medirRecorrido(page);
  expect(
    medida.ajenos,
    `recorrido flotante en ${medida.caja}: los clics atraviesan la tarjeta:\n  · ${medida.ajenos.join('\n  · ')}`,
  ).toEqual([]);
});
