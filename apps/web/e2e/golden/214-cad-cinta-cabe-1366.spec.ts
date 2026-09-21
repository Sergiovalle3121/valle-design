import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_RIBBON_DATA } from "../../src/lib/cad/ribbon";

/**
 * LA CINTA CABE EN LA VENTANA — sin scroll horizontal a 1366 ni a 1280.
 *
 * ## Por qué existe este archivo
 *
 * La tira de paneles de Inicio medía ~10 700 px con la barra de scroll
 * oculta (`scrollbar-width: none`): a 1366 px de ventana se veían veinte
 * botones de 159 y no había ninguna señal de que hubiera más. AutoCAD no
 * desplaza la cinta: pliega paneles de derecha a izquierda. Aquí el plan lo
 * calcula `lib/cad/ribbon-layout.ts` con anchos según el rótulo y mínimos
 * compartidos con los botones; este golden comprueba sus medidas en un
 * navegador real.
 *
 * Corrección del 2026-09-20: `cadRibbonPanelWidth` (`ribbon-layout.ts`) nunca contaba el PIE del
 * panel (el rótulo bajo la fila de botones) —sólo la fila—, y un panel "reduced" sin botón grande
 * no pinta fila ninguna: el pie es lo ÚNICO que hay. Este golden lo pescó por `scrollWidth >
 * clientWidth` de la tira (1579 px de contenido en 1366, 1415 en 1280) y ahora TAMBIÉN mide el
 * rótulo de cada panel por separado (más abajo), para que un rótulo demasiado ancho para su caja
 * no se cuele mudo con una elipsis en vez de desbordar la tira entera.
 *
 * ## Qué comprueba
 *
 *   · En las ocho pestañas, `scrollWidth <= clientWidth` de la tira, y
 *     ningún botón con su caja fuera de la tira.
 *   · Lo que los goldens 61 y 86 pulsan por testid está A LA VISTA en
 *     Inicio (LINE, CIRCLE, ARC, MOVE, COPY, ROTATE, TRIM, ERASE, LAYER) y
 *     en Anotar (DIMLINEAR), sin abrir ningún desplegable.
 *   · Ningún rótulo se sale de su botón NI SE CORTA dentro de él. Elidir un
 *     rótulo es esconder texto, y con `truncate` se escondía sin que la caja
 *     lo delatara: un texto elidido siempre «cabe», así que las tres medidas
 *     de caja daban verde mientras el nombre salía partido. Se mide lo que el
 *     texto PIDE (`scrollWidth`) contra lo que tiene (`clientWidth`), y se
 *     mide en los dos sitios: en el rótulo de cada COMANDO y en el de cada
 *     PANEL (plegado, con desplegable o solo), en las ocho pestañas.
 *   · Un panel plegado abre su desplegable con TODOS sus comandos, y
 *     Escape lo cierra devolviendo el foco.
 *   · La cinta entera mide ≤ 108 px de alto: a 720 px de alto el lienzo
 *     necesita cada píxel (golden 19).
 *   · Lo que se abre desde la cinta SE VE Y SE ALCANZA: cada botón del
 *     desplegable queda dentro de la ventana y `elementFromPoint` en su
 *     centro lo devuelve a él; la cinta no salta al abrir; la etiqueta de
 *     ayuda de «Línea» no queda recortada. `toBeVisible` no basta: ignora el
 *     recorte por `overflow`, y con él este golden daba verde mientras la
 *     tira (`overflow-x-auto`, que fuerza `overflow-y`) dejaba ver 76 de los
 *     187 px del desplegable de Modificar y 7 de los 65 de la etiqueta.
 *   · El rótulo de un panel ABRE su desplegable (como en AutoCAD); plegar
 *     a mano se pide desde el desplegable y sobrevive a una recarga.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
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
  } as unknown as CadDocument;
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  await expect(page.getByTestId("cad-ribbon")).toBeVisible();
}

interface Medida {
  tira: { scrollWidth: number; clientWidth: number };
  fuera: string[];
  rotulosQueSeSalen: string[];
  rotulosDePanelRecortados: string[];
}

/** Todo en una evaluación: la tira, sus botones y sus rótulos. */
async function medirTira(page: Page, tabId: string): Promise<Medida> {
  return page.evaluate((id) => {
    const tira = document.querySelector<HTMLElement>(
      `[data-testid="cad-ribbon-panels-${id}"]`,
    );
    if (!tira)
      throw new Error(`No hay [data-testid="cad-ribbon-panels-${id}"]`);
    const caja = tira.getBoundingClientRect();
    const fuera: string[] = [];
    const rotulosQueSeSalen: string[] = [];
    const botones = tira.querySelectorAll<HTMLElement>(
      '[data-testid^="cad-ribbon-command-"], [data-testid^="cad-ribbon-panel-toggle-"]',
    );
    for (const boton of botones) {
      const b = boton.getBoundingClientRect();
      if (b.left < caja.left - 1 || b.right > caja.right + 1)
        fuera.push(boton.dataset.testid!);
      const rotulo = boton.querySelector<HTMLElement>("span");
      if (!rotulo) continue;
      const r = rotulo.getBoundingClientRect();
      // Un rótulo que se sale de la caja de su botón, o que envuelve más de
      // dos líneas (un botón grande mide 60 px con el icono de 24), es texto
      // que se pisa con el vecino.
      if (
        r.right > b.right + 1 ||
        r.left < b.left - 1 ||
        r.bottom > b.bottom + 1
      ) {
        rotulosQueSeSalen.push(
          `${boton.dataset.testid} «${rotulo.textContent}»`,
        );
        continue;
      }
      // Y el caso que la caja NO delata: con `truncate` (overflow oculto más
      // puntos suspensivos) el rótulo cabe siempre en su botón —por eso las
      // tres comprobaciones de arriba daban verde— mientras el texto sale
      // cortado. El 2026-09-20, a 1280 px, «Rectángulo» se leía «Rectáng…»,
      // «Cota alineada» «Cota ali…» y «Deshacer aislar» «Deshac…». Quien mira
      // la cinta no sabe qué hace ese botón, que es justo lo que el rótulo
      // venía a resolver. `scrollWidth > clientWidth` mide lo que el texto
      // PIDE contra lo que tiene: es lo único que ve la elipsis.
      if (rotulo.scrollWidth > rotulo.clientWidth + 1) {
        rotulosQueSeSalen.push(
          `${boton.dataset.testid} «${rotulo.textContent}» CORTADO ` +
            `(pide ${rotulo.scrollWidth}px, cabe ${rotulo.clientWidth}px)`,
        );
      }
    }
    // El rótulo de un PANEL (plegado, con desplegable, o solo) también debe leerse entero.
    // Un rótulo de panel recortado esconde el nombre del panel entero:
    // `scrollWidth > clientWidth` lo delata aunque su caja no se salga de nada (la elipsis, por
    // diseño, SIEMPRE cabe en la caja).
    const rotulosDePanelRecortados: string[] = [];
    const rotulosDePanel = tira.querySelectorAll<HTMLElement>(
      '[id^="cad-ribbon-panel-label-"]',
    );
    for (const rotulo of rotulosDePanel) {
      if (rotulo.scrollWidth > rotulo.clientWidth + 1) {
        rotulosDePanelRecortados.push(`${rotulo.id} «${rotulo.textContent}»`);
      }
    }
    return {
      tira: { scrollWidth: tira.scrollWidth, clientWidth: tira.clientWidth },
      fuera,
      rotulosQueSeSalen,
      rotulosDePanelRecortados,
    };
  }, tabId);
}

/**
 * Lo que NO se ve o NO se alcanza de `selector`: fuera de la ventana, o con
 * otra cosa en su centro (un recorte por `overflow` deja el centro sobre lo
 * que haya debajo — el lienzo). Vacío = todo a la vista y a un clic.
 */
async function fueraDeAlcance(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const problemas: string[] = [];
    const elementos = Array.from(document.querySelectorAll<HTMLElement>(sel));
    if (elementos.length === 0) return [`nada coincide con ${sel}`];
    for (const el of elementos) {
      const nombre = el.dataset.testid ?? el.tagName;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        problemas.push(`${nombre}: sin caja`);
        continue;
      }
      if (
        r.left < 0 ||
        r.top < 0 ||
        r.right > window.innerWidth ||
        r.bottom > window.innerHeight
      ) {
        problemas.push(
          `${nombre}: fuera de la ventana (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)})`,
        );
        continue;
      }
      const encima = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      if (!encima || !(encima === el || el.contains(encima))) {
        const quien =
          encima?.closest<HTMLElement>("[data-testid]")?.dataset.testid ??
          encima?.tagName ??
          "nada";
        problemas.push(`${nombre}: en su centro está ${quien}`);
      }
    }
    return problemas;
  }, selector);
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`a ${viewport.width}×${viewport.height} ninguna pestaña de la cinta se desplaza y lo esencial está a la vista`, async ({
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await openStudio(context, page);

    const cinta = (await page.getByTestId("cad-ribbon").boundingBox())!;
    expect(
      cinta.height,
      `la cinta mide ${cinta.height}px; el lienzo necesita cada píxel a 720 de alto`,
    ).toBeLessThanOrEqual(108);

    for (const tab of CAD_RIBBON_DATA) {
      await page.getByTestId(`cad-ribbon-tab-${tab.id}`).click();
      await expect(
        page.getByTestId(`cad-ribbon-panels-${tab.id}`),
      ).toBeVisible();
      const medida = await medirTira(page, tab.id);
      expect(
        medida.tira.scrollWidth,
        `${tab.label}: la tira mide ${medida.tira.scrollWidth}px de contenido en ${medida.tira.clientWidth}px de ventana`,
      ).toBeLessThanOrEqual(medida.tira.clientWidth);
      expect(
        medida.fuera,
        `${tab.label}: botones con la caja fuera de la tira`,
      ).toEqual([]);
      expect(
        medida.rotulosQueSeSalen,
        `${tab.label}: rótulos que se salen de su botón`,
      ).toEqual([]);
      expect(
        medida.rotulosDePanelRecortados,
        `${tab.label}: rótulos de panel recortados con puntos suspensivos (esconden el nombre del panel)`,
      ).toEqual([]);
    }

    await page.getByTestId("cad-ribbon-tab-inicio").click();
    for (const name of [
      "LINE",
      "CIRCLE",
      "ARC",
      "MOVE",
      "COPY",
      "ROTATE",
      "TRIM",
      "ERASE",
      "LAYER",
    ]) {
      await expect(
        page.getByTestId(`cad-ribbon-command-${name}`),
        `${name} a la vista en Inicio sin abrir nada`,
      ).toBeVisible();
    }
    await page.getByTestId("cad-ribbon-tab-anotar").click();
    await expect(
      page.getByTestId("cad-ribbon-command-DIMLINEAR"),
    ).toBeVisible();
  });
}

test("un panel plegado abre su desplegable con todos sus comandos y Escape lo cierra", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);

  // El plan recupera comandos si sobra espacio. Para probar un panel plegado,
  // se pide ese estado por UI; no se presupone que Utilidades siempre lo esté.
  const utilidades = page.getByTestId("cad-ribbon-panel-Utilidades");
  if ((await utilidades.getAttribute("data-layout")) !== "collapsed") {
    await page.getByTestId("cad-ribbon-panel-toggle-Utilidades").click();
    await page.getByTestId("cad-ribbon-panel-collapse-Utilidades").click();
  }
  await expect(utilidades).toHaveAttribute("data-layout", "collapsed");
  await expect(page.getByTestId("cad-ribbon-command-LIST")).toHaveCount(0);

  const toggle = page.getByTestId("cad-ribbon-panel-toggle-Utilidades");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const flyout = page.getByTestId("cad-ribbon-panel-flyout-Utilidades");
  await expect(flyout).toBeVisible();
  const panelData = CAD_RIBBON_DATA.find(
    (tab) => tab.id === "inicio",
  )!.panels.find((panel) => panel.label === "Utilidades")!;
  for (const command of panelData.commands) {
    await expect(
      flyout.getByTestId(`cad-ribbon-command-${command.name}`),
    ).toBeVisible();
  }
  // `toBeVisible` no ve el recorte: cada botón del desplegable, y el que lo
  // abrió, dentro de la ventana y ÉL MISMO en su centro.
  expect(
    await fueraDeAlcance(
      page,
      '[data-testid="cad-ribbon-panel-flyout-Utilidades"] [data-testid^="cad-ribbon-command-"]',
    ),
    "botones del desplegable de Utilidades que no se ven o no se alcanzan",
  ).toEqual([]);
  expect(
    await fueraDeAlcance(
      page,
      '[data-testid="cad-ribbon-panel-toggle-Utilidades"]',
    ),
    "el botón que abrió el desplegable",
  ).toEqual([]);
  expect(
    await page
      .getByTestId("cad-ribbon-panels-inicio")
      .evaluate((tira) => tira.scrollTop),
    "abrir el desplegable no desplaza la tira (antes saltaba 78 px)",
  ).toBe(0);
  await page.keyboard.press("Escape");
  await expect(flyout).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // El RÓTULO abre el panel, como en AutoCAD; antes lo plegaba a un botón y
  // la cinta lo guardaba para siempre.
  const dibujo = page.getByTestId("cad-ribbon-panel-Dibujo");
  await expect(dibujo).toHaveAttribute("data-layout", "expanded");
  const rotuloDibujo = page.getByTestId("cad-ribbon-panel-toggle-Dibujo");
  await expect(rotuloDibujo).toContainText("Dibujo");
  await rotuloDibujo.click();
  await expect(
    page.getByTestId("cad-ribbon-panel-flyout-Dibujo"),
  ).toBeVisible();
  await expect(dibujo, "pulsar el rótulo no pliega el panel").toHaveAttribute(
    "data-layout",
    "expanded",
  );
  expect(
    await fueraDeAlcance(
      page,
      '[data-testid="cad-ribbon-panel-flyout-Dibujo"] [data-testid^="cad-ribbon-command-"]',
    ),
    "botones del desplegable de Dibujo que no se ven o no se alcanzan",
  ).toEqual([]);

  // Plegar a mano se pide a propósito desde la cabecera del desplegable; el
  // desplegable del panel plegado ofrece volver a mostrarlo, y la elección
  // sobrevive a una recarga.
  await page.getByTestId("cad-ribbon-panel-collapse-Dibujo").click();
  await expect(page.getByTestId("cad-ribbon-panel-Dibujo")).toHaveAttribute(
    "data-layout",
    "collapsed",
  );
  await page.reload();
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-ribbon-panel-Dibujo")).toHaveAttribute(
    "data-layout",
    "collapsed",
  );
  await page.getByTestId("cad-ribbon-panel-toggle-Dibujo").click();
  await page.getByTestId("cad-ribbon-panel-expand-Dibujo").click();
  await expect(page.getByTestId("cad-ribbon-panel-Dibujo")).toHaveAttribute(
    "data-layout",
    "expanded",
  );
  await expect(page.getByTestId("cad-ribbon-command-LINE")).toBeVisible();
});

test("a 1366×768 el desplegable de Modificar y la etiqueta de «Línea» se ven enteros y a un clic", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudio(context, page);

  // El caso medido en la vista previa de la PR #209: 32 comandos en el
  // desplegable de Modificar, 1175 px de ancho y 111 de sus 187 px de alto
  // recortados por la tira; la cinta saltaba 78 px al enfocar el primero.
  const toggle = page.getByTestId("cad-ribbon-panel-toggle-Modificar");
  await toggle.click();
  const flyout = page.getByTestId("cad-ribbon-panel-flyout-Modificar");
  await expect(flyout).toBeVisible();
  const caja = (await flyout.boundingBox())!;
  expect(
    caja.x,
    "el desplegable no empieza fuera de la pantalla",
  ).toBeGreaterThanOrEqual(0);
  expect(
    caja.x + caja.width,
    "ni se sale por la derecha (antes x=1448)",
  ).toBeLessThanOrEqual(1366);
  expect(caja.y + caja.height, "ni por abajo").toBeLessThanOrEqual(768);
  expect(
    await fueraDeAlcance(
      page,
      '[data-testid="cad-ribbon-panel-flyout-Modificar"] [data-testid^="cad-ribbon-command-"]',
    ),
    "botones del desplegable de Modificar que no se ven o no se alcanzan",
  ).toEqual([]);
  expect(
    await fueraDeAlcance(
      page,
      '[data-testid="cad-ribbon-panel-toggle-Modificar"]',
    ),
    "el botón que lo abrió",
  ).toEqual([]);
  expect(
    await page
      .getByTestId("cad-ribbon-panels-inicio")
      .evaluate((tira) => tira.scrollTop),
    "la cinta no salta al abrir",
  ).toBe(0);
  expect(
    await fueraDeAlcance(page, '[data-testid="cad-ribbon-command-LINE"]'),
    "la cinta sigue en su sitio: «Línea» a la vista",
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(flyout).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // La etiqueta de ayuda de «Línea»: la única que dice «LINE (L)». Colgada
  // del botón quedaba en x=-59 y recortada por la tira (7 de 65 px).
  await page.getByTestId("cad-ribbon-command-LINE").hover();
  const etiqueta = page.getByTestId("cad-ribbon-tooltip");
  await expect(etiqueta).toBeVisible();
  await expect(etiqueta).toContainText("LINE (L)");
  const medida = await etiqueta.evaluate((tip) => {
    const r = tip.getBoundingClientRect();
    const linea = document
      .querySelector('[data-testid="cad-ribbon-command-LINE"]')!
      .getBoundingClientRect();
    // No recibe el ratón (no tapa el lienzo); se le devuelve un instante
    // para preguntar qué hay en su centro: un recorte dejaría el lienzo.
    tip.style.pointerEvents = "auto";
    const encima = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    tip.style.pointerEvents = "";
    return {
      caja: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      bajoLinea: r.top >= linea.bottom,
      suya: encima !== null && tip.contains(encima),
      ventana: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  expect(
    medida.caja.left,
    "la etiqueta no empieza fuera de la pantalla",
  ).toBeGreaterThanOrEqual(0);
  expect(medida.caja.right).toBeLessThanOrEqual(medida.ventana.width);
  expect(medida.caja.bottom).toBeLessThanOrEqual(medida.ventana.height);
  expect(medida.bajoLinea, "la etiqueta va bajo su botón").toBe(true);
  expect(
    medida.suya,
    "en el centro de la etiqueta está la etiqueta, no lo que haya debajo",
  ).toBe(true);
});
