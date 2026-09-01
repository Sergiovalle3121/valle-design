import { type Page } from "@playwright/test";

/**
 * Pide un preset de cámara SIN AMBIGÜEDAD.
 *
 * ## Por qué hace falta una fixture para un clic
 *
 * Los presets viven ahora en DOS sitios, y los dos son correctos: la barra
 * superior de siempre y el **ViewCube** que estrenó la campaña de la cinta. Los
 * dos llevan el mismo `title` a propósito —misma acción, mismo nombre, que es
 * lo que un usuario espera—, así que `getByTitle(/Vista superior/)` pasó a
 * resolver a dos elementos y Playwright, en modo estricto, se niega.
 *
 * Rompió ONCE goldens de golpe, y ninguno por un defecto de producto: el
 * ViewCube funciona. Lo que estaba mal era el localizador, repetido a mano en
 * trece sitios. Aquí hay uno solo, acotado a la barra, y el día que aparezca un
 * tercer sitio con el mismo nombre se arregla en un archivo en vez de en trece.
 *
 * ## Por qué la BARRA y no el ViewCube
 *
 * Porque es lo que estos goldens ya ejercitaban: cambiar el objetivo cambiaría
 * silenciosamente lo que miden. El ViewCube tiene su propio golden.
 */
const toolbar = (page: Page) => page.getByTestId("cad-top-toolbar");

/** Vista cenital desde la barra superior. Requisito de `worldPoint`. */
export async function topView(page: Page): Promise<void> {
  await toolbar(page).getByTitle(/Vista superior/).click();
}

/** Encuadra toda la huella. Requisito de `worldPoint`. */
export async function fitFootprint(page: Page): Promise<void> {
  await toolbar(page).getByTitle(/Ajustar a la planta/).click();
}
