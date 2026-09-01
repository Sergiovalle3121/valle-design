import { expect, type Page } from "@playwright/test";
import {
  CAD_TOOLBAR_ACTIONS,
  type CadToolbarActionId,
} from "../../src/lib/cad/toolbar";

/**
 * Arranca una herramienta de la paleta POR SU IDENTIFICADOR, no por su rótulo.
 *
 * ## Por qué esto existe
 *
 * Los goldens 32 y 33 pedían sus herramientas por el texto en inglés —«Line»,
 * «Pline», «Rect», «Circle»— porque así se llamaban cuando se escribieron. La
 * campaña de diseño los tradujo a «Línea», «Polilínea», «Rectángulo» y
 * «Círculo», y once llamadas se quedaron esperando 180 segundos a un botón que
 * ya no existía con ese nombre.
 *
 * El rótulo es PROSA DE PRODUCTO: cambia cuando cambia el idioma, el tono o el
 * criterio de diseño, y debe poder cambiar sin romper una prueba. El `id` es la
 * identidad: `"line"` seguirá siendo `"line"` en cualquier idioma.
 *
 * Así que el rótulo se LEE de `CAD_TOOLBAR_ACTIONS`, la misma constante que
 * pinta la paleta. Si mañana «Línea» pasa a «Trazo», esta fixture sigue
 * funcionando sin tocarse; y si alguien borra la acción, el typechecker lo dice
 * en el acto porque `CadToolbarActionId` es una unión cerrada.
 *
 * Es la misma lección que los presets de cámara y que el botón «Terminar», y ya
 * van tres: un nombre de la interfaz no es una identidad.
 */
export async function startTool(
  page: Page,
  id: CadToolbarActionId,
): Promise<void> {
  const action = CAD_TOOLBAR_ACTIONS.find((candidate) => candidate.id === id);
  if (!action) {
    throw new Error(
      `La paleta no declara ninguna acción con id "${id}". ` +
        "Se lee de CAD_TOOLBAR_ACTIONS: si la acción se retiró, el golden que " +
        "la usa está probando algo que el producto ya no ofrece.",
    );
  }
  await page
    .getByTestId("cad-toolbar")
    .getByRole("button", { name: action.label, exact: true })
    .click();
  await expect(page.getByTestId("cad-dynamic-input")).toBeVisible();
}
