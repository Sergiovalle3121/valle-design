import { expect, type Page } from "@playwright/test";
import { type CadToolbarActionId } from "../../src/lib/cad/toolbar";
import { CAD_RIBBON_DATA } from "../../src/lib/cad/ribbon";

/** En qué pestaña vive un comando de la cinta, por nombre canónico. */
function ribbonLocationFor(
  name: string,
): { tabId: string; panelLabel: string } | null {
  for (const tab of CAD_RIBBON_DATA) {
    for (const panel of tab.panels) {
      if (panel.commands.some((command) => command.name === name)) {
        return { tabId: tab.id, panelLabel: panel.label };
      }
    }
  }
  return null;
}

/**
 * Arranca una herramienta POR SU IDENTIFICADOR, no por su rótulo.
 *
 * ## Por qué esto existe
 *
 * Los goldens 32 y 33 pedían sus herramientas por el texto en inglés —«Line»,
 * «Pline», «Rect», «Circle»— porque así se llamaban cuando se escribieron. La
 * campaña de diseño los tradujo a «Línea», «Polilínea», «Rectángulo» y
 * «Círculo», y once llamadas se quedaron esperando 180 segundos a un botón que
 * ya no existía con ese nombre. El `id` es la identidad; el rótulo es prosa
 * de producto y puede cambiar sin romper una prueba.
 *
 * ## ola1-paleta (2026-09-19) — la paleta flotante se podó a 3 controles
 *
 * `CadToolPalette` («cad-toolbar») ya sólo declara `select`, `pan` y
 * `fit_view` (`CAD_TOOLBAR_ACTIONS`, `toolbar.ts`): los otros catorce ids que
 * esta fixture sabía arrancar ya NO tienen botón de paleta. El registro de
 * comandos no se tocó — siguen siendo `CadToolbarActionId` válidos y
 * `runToolbarAction`/`TOOLBAR_SHORTCUT_IDS` los siguen atendiendo — así que
 * `startTool` los arranca por OTRO camino según el id:
 *
 *  - `select` | `pan` | `fit_view`: el botón sigue en `cad-toolbar`, igual
 *    que siempre.
 *  - `line` | `circle`: el atajo de una letra («L», «C»), con el muelle de
 *    la línea de comandos plegado primero. NO se despachan por la cinta:
 *    los goldens 28, 31, 52 y 198 dejaron por escrito (antes de esta ola,
 *    ver sus comentarios «la paleta, no la cinta») que el botón retirado
 *    hacía DOS cosas que `commandEngineRef.invoke(...)` —lo que dispara un
 *    clic en la cinta— no hace: (a) pone `tool` en React, que es lo que
 *    pinta el HUD `cad-live-prompt`; (b) cuando no hay WebGL/enrutador del
 *    puntero, cae a la máquina de dibujo heredada en vez de exigir texto en
 *    la línea de comandos. El atajo de teclado dispara la MISMA función que
 *    disparaba el botón (`runToolbarAction`, vía `TOOLBAR_SHORTCUT_IDS`), así
 *    que hereda las dos.
 *  - los demás ids CON comando (measure, polyline, rect, move, copy, offset,
 *    text, undo, redo): la CINTA, por `data-testid="cad-ribbon-command-…"`.
 *    Es el mismo despacho (`commandEngineRef.invoke`) que ya prueban los
 *    goldens 26 y 46 para LINE/PLINE — sólo cambia de qué botón sale el clic.
 *
 * `aisle`/`zone`/`equipment` (Pasillo/Área/Símbolos) no tienen entrada aquí:
 * eran vocabulario industrial heredado sin equivalente en la cinta y esta
 * ola los retiró de la superficie visible sin darles una casa nueva (ver
 * «pendiente» del resumen de la ola). Ningún golden de esta lista los usaba.
 */

/** id de paleta → nombre de comando de la cinta, para los que se despachan ahí. */
const RIBBON_COMMAND_NAME: Partial<Record<CadToolbarActionId, string>> = {
  measure: "DIST",
  polyline: "PLINE",
  rect: "RECTANG",
  move: "MOVE",
  copy: "COPY",
  offset: "OFFSET",
  text: "TEXT",
  undo: "U",
  redo: "REDO",
};

/** id de paleta → tecla suelta del registro (`keyboard-shortcuts.ts`). */
const NATIVE_SHORTCUT_KEY: Partial<Record<CadToolbarActionId, string>> = {
  line: "l",
  circle: "c",
};

/**
 * Pliega el muelle de la línea de comandos si está desplegado.
 *
 * Con el muelle a la vista, una letra suelta se teclea EN la línea de
 * comandos («Fase 0» de `editor-keyboard.ts`) en vez de disparar el atajo de
 * la barra: `TOOLBAR_SHORTCUT_IDS` sólo vive con el muelle oculto. El panel
 * de workspace (riel derecho, ola «armazón») trae el interruptor.
 */
async function ensureCommandDockHidden(page: Page): Promise<void> {
  const checkbox = page.getByTestId("cad-workspace-commandDock");
  if (!(await checkbox.isVisible())) {
    await page.getByTestId("cad-rail-workspace").click();
    await expect(checkbox).toBeVisible();
  }
  if (await checkbox.isChecked()) await checkbox.uncheck();
  // Cierra el panel con su botón propio (el golden 72 ya prueba que existe):
  // no debe quedarse tapando el muelle derecho para el resto del golden.
  await page.getByLabel("Cerrar panel profesional").click();
  await expect(checkbox).toBeHidden();
}

/** Arranca LINE o CIRCLE por su atajo nativo (ver docstring de arriba). */
async function startNativeDrawTool(page: Page, key: string): Promise<void> {
  await ensureCommandDockHidden(page);
  await page.keyboard.press(key);
}

/**
 * Arranca un comando desde la cinta por su `data-testid`. `ribbonLocationFor`
 * dice en qué pestaña vive (hoy los nueve que usa esta fixture tienen un
 * espejo en «Inicio», la pestaña de fábrica) — se cambia de pestaña sólo si
 * hace falta, así ningún golden que ya esté en otra pestaña se desordena.
 */
async function clickRibbonCommand(page: Page, name: string): Promise<void> {
  const location = ribbonLocationFor(name);
  if (location) {
    const tab = page.getByTestId(`cad-ribbon-tab-${location.tabId}`);
    if (
      (await tab.count()) &&
      (await tab.getAttribute("aria-selected")) !== "true"
    ) {
      await tab.click();
    }
  }
  const button = page.getByTestId(`cad-ribbon-command-${name}`);
  // La cinta adapta los comandos visibles al ancho. Los restantes se montan
  // al abrir el desplegable de su panel, el mismo gesto que hace el usuario.
  if (location && !(await button.isVisible())) {
    await page
      .getByTestId(`cad-ribbon-panel-toggle-${location.panelLabel}`)
      .click();
  }
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await button.click();
}

export async function startTool(
  page: Page,
  id: CadToolbarActionId,
): Promise<void> {
  if (id === "select" || id === "pan" || id === "fit_view") {
    const toolbar = page.getByTestId("cad-toolbar");
    const label =
      id === "select"
        ? "Seleccionar"
        : id === "pan"
          ? "Encuadre"
          : "Ajustar todo";
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    return;
  }
  const nativeKey = NATIVE_SHORTCUT_KEY[id];
  if (nativeKey) {
    await startNativeDrawTool(page, nativeKey);
    await expect(page.getByTestId("cad-dynamic-input")).toBeVisible();
    return;
  }
  const ribbonName = RIBBON_COMMAND_NAME[id];
  if (!ribbonName) {
    throw new Error(
      `startTool("${id}") no tiene despacho: no es de navegación, ni "line"/"circle", ` +
        "ni está en RIBBON_COMMAND_NAME. Si es una orden real, añade su nombre de cinta ahí.",
    );
  }
  await clickRibbonCommand(page, ribbonName);
  // Deshacer/Rehacer se resuelven de un clic: no abren una sesión de puntos,
  // así que no hay `cad-dynamic-input` que esperar.
  if (id !== "undo" && id !== "redo") {
    await expect(page.getByTestId("cad-dynamic-input")).toBeVisible();
  }
}
