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
 * calcula `lib/cad/ribbon-layout.ts` con ANCHOS CONSTANTES que deben
 * coincidir con las clases de los botones; este golden es el que comprueba
 * que esas constantes no mienten en un navegador real.
 *
 * ## Qué comprueba
 *
 *   · En las ocho pestañas, `scrollWidth <= clientWidth` de la tira, y
 *     ningún botón con su caja fuera de la tira.
 *   · Lo que los goldens 61 y 86 pulsan por testid está A LA VISTA en
 *     Inicio (LINE, CIRCLE, ARC, MOVE, COPY, ROTATE, TRIM, ERASE, LAYER) y
 *     en Anotar (DIMLINEAR), sin abrir ningún desplegable.
 *   · Ningún rótulo se sale de su botón: ni los pequeños (una línea) ni los
 *     de los paneles plegados. Elidir un rótulo sería esconder texto.
 *   · Un panel plegado abre su desplegable con TODOS sus comandos, y
 *     Escape lo cierra devolviendo el foco.
 *   · La cinta entera mide ≤ 108 px de alto: a 720 px de alto el lienzo
 *     necesita cada píxel (golden 19).
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
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
}

/** Todo en una evaluación: la tira, sus botones y sus rótulos. */
async function medirTira(page: Page, tabId: string): Promise<Medida> {
  return page.evaluate((id) => {
    const tira = document.querySelector<HTMLElement>(`[data-testid="cad-ribbon-panels-${id}"]`);
    if (!tira) throw new Error(`No hay [data-testid="cad-ribbon-panels-${id}"]`);
    const caja = tira.getBoundingClientRect();
    const fuera: string[] = [];
    const rotulosQueSeSalen: string[] = [];
    const botones = tira.querySelectorAll<HTMLElement>('[data-testid^="cad-ribbon-command-"], [data-testid^="cad-ribbon-panel-toggle-"]');
    for (const boton of botones) {
      const b = boton.getBoundingClientRect();
      if (b.left < caja.left - 1 || b.right > caja.right + 1) fuera.push(boton.dataset.testid!);
      const rotulo = boton.querySelector<HTMLElement>("span");
      if (!rotulo) continue;
      const r = rotulo.getBoundingClientRect();
      // Un rótulo que se sale de la caja de su botón, o que envuelve más de
      // dos líneas (un botón grande mide 60 px con el icono de 24), es texto
      // que se pisa con el vecino.
      if (r.right > b.right + 1 || r.left < b.left - 1 || r.bottom > b.bottom + 1) {
        rotulosQueSeSalen.push(`${boton.dataset.testid} «${rotulo.textContent}»`);
      }
    }
    return {
      tira: { scrollWidth: tira.scrollWidth, clientWidth: tira.clientWidth },
      fuera,
      rotulosQueSeSalen,
    };
  }, tabId);
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
    expect(cinta.height, `la cinta mide ${cinta.height}px; el lienzo necesita cada píxel a 720 de alto`).toBeLessThanOrEqual(108);

    for (const tab of CAD_RIBBON_DATA) {
      await page.getByTestId(`cad-ribbon-tab-${tab.id}`).click();
      await expect(page.getByTestId(`cad-ribbon-panels-${tab.id}`)).toBeVisible();
      const medida = await medirTira(page, tab.id);
      expect(
        medida.tira.scrollWidth,
        `${tab.label}: la tira mide ${medida.tira.scrollWidth}px de contenido en ${medida.tira.clientWidth}px de ventana`,
      ).toBeLessThanOrEqual(medida.tira.clientWidth);
      expect(medida.fuera, `${tab.label}: botones con la caja fuera de la tira`).toEqual([]);
      expect(medida.rotulosQueSeSalen, `${tab.label}: rótulos que se salen de su botón`).toEqual([]);
    }

    await page.getByTestId("cad-ribbon-tab-inicio").click();
    for (const name of ["LINE", "CIRCLE", "ARC", "MOVE", "COPY", "ROTATE", "TRIM", "ERASE", "LAYER"]) {
      await expect(page.getByTestId(`cad-ribbon-command-${name}`), `${name} a la vista en Inicio sin abrir nada`).toBeVisible();
    }
    await page.getByTestId("cad-ribbon-tab-anotar").click();
    await expect(page.getByTestId("cad-ribbon-command-DIMLINEAR")).toBeVisible();
  });
}

test("un panel plegado abre su desplegable con todos sus comandos y Escape lo cierra", async ({ context, page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);

  // A 1280 px Utilidades es un botón (ribbon-layout.spec.ts lo afirma sin
  // navegador); LIST vive dentro y no está en el DOM hasta abrir.
  const utilidades = page.getByTestId("cad-ribbon-panel-Utilidades");
  await expect(utilidades).toHaveAttribute("data-layout", "collapsed");
  await expect(page.getByTestId("cad-ribbon-command-LIST")).toHaveCount(0);

  const toggle = page.getByTestId("cad-ribbon-panel-toggle-Utilidades");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const flyout = page.getByTestId("cad-ribbon-panel-flyout-Utilidades");
  await expect(flyout).toBeVisible();
  const panelData = CAD_RIBBON_DATA.find((tab) => tab.id === "inicio")!.panels.find((panel) => panel.label === "Utilidades")!;
  for (const command of panelData.commands) {
    await expect(flyout.getByTestId(`cad-ribbon-command-${command.name}`)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(flyout).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // Plegar a mano un panel desplegado: el rótulo lo pliega, el desplegable
  // ofrece volver a mostrarlo, y la elección sobrevive a una recarga.
  await page.getByTestId("cad-ribbon-panel-collapse-Dibujo").click();
  await expect(page.getByTestId("cad-ribbon-panel-Dibujo")).toHaveAttribute("data-layout", "collapsed");
  await page.reload();
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-ribbon-panel-Dibujo")).toHaveAttribute("data-layout", "collapsed");
  await page.getByTestId("cad-ribbon-panel-toggle-Dibujo").click();
  await page.getByTestId("cad-ribbon-panel-expand-Dibujo").click();
  await expect(page.getByTestId("cad-ribbon-panel-Dibujo")).toHaveAttribute("data-layout", "expanded");
  await expect(page.getByTestId("cad-ribbon-command-LINE")).toBeVisible();
});
