import { type Page } from "@playwright/test";

/**
 * La barra de borrador, pedida SIN AMBIGÜEDAD.
 *
 * ## Por qué hace falta una fixture para un clic
 *
 * Ocho llamadas a `getByRole('button', { name: 'Terminar' })` repartidas por
 * tres goldens dejaron de funcionar el día que la campaña de la cinta añadió
 * al editor un botón «Terminar comando». El `name` de `getByRole` NO es exacto
 * por omisión: busca subcadena, así que «Terminar» pasó a resolver a los dos y
 * Playwright, en modo estricto, se niega.
 *
 * Es el mismo defecto que el ViewCube con los presets de cámara —una capa
 * nueva reusa un nombre que ya existía—, así que la respuesta es la misma: un
 * solo sitio donde arreglarlo, y un testid en el producto para que el
 * localizador deje de depender de la prosa de la interfaz. `exact: true`
 * habría tapado ESTE caso y vuelto a romperse con el siguiente botón que se
 * llamara exactamente igual.
 */
const barra = (page: Page) => page.getByTestId("cad-draft-finish");

/** Termina el trazo encadenado desde la barra de borrador (no el del motor). */
export async function finishDraft(page: Page): Promise<void> {
  await barra(page).click();
}
