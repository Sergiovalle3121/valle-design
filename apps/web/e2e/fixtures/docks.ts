import { expect, type Page } from "@playwright/test";

/**
 * Abre los muelles laterales del estudio, como haría una persona.
 *
 * Desde la ola «armazón» (PR #224, `apps/web/src/lib/cad/cad-workspace.ts`:
 * `CAD_WORKSPACE_DEFAULTS`) los DOS muelles arrancan PLEGADOS a un riel de
 * iconos (`leftDockCollapsed: true`, `rightDockCollapsed: true`) — antes el
 * derecho (lista de entidades, propiedades) y el izquierdo (biblioteca)
 * nacían abiertos, y decenas de goldens leían su contenido sin abrir nada
 * primero. El golden 19 (`19-cad-professional-workbench.spec.ts`) fija ese
 * plegado por defecto como el contrato — NO se cambia aquí ni en ningún spec
 * de este grupo, se respeta pulsando el riel antes de leer el panel.
 *
 * Cada función pulsa el botón del riel SÓLO si el muelle sigue plegado
 * (`data-collapsed="true"`), así que llamarla dos veces no lo cierra —
 * idempotente a propósito, porque varios pasos de un mismo test pueden
 * necesitar el panel abierto sin saber si un paso anterior ya lo abrió.
 */

export async function abrirPanelDerecho(page: Page) {
  const dock = page.getByTestId("cad-right-dock");
  await expect(dock).toBeVisible({ timeout: 60_000 });
  if ((await dock.getAttribute("data-collapsed")) !== "false") {
    await page.getByTestId("cad-rail-properties").click();
  }
  await expect(dock).toHaveAttribute("data-collapsed", "false");
}

/**
 * Espera a que el LIENZO deje de cambiar de tamaño.
 *
 * Plegar o desplegar un muelle no es instantáneo: la columna de 280 px se va
 * con una transición y el lienzo crece detrás de ella. Medido el 2026-09-20 en
 * la vista previa de la ola «armazón» —abrir el panel derecho, cerrarlo y
 * pinchar dos segundos después— el lienzo todavía declaraba 911 px de los
 * 1191 finales, así que el punto pinchado correspondía a OTRA parte del
 * dibujo y no designaba nada. No es un fallo del producto: es que medir la
 * transformación mundo↔pantalla a mitad de la transición devuelve una
 * transformación que ya no vale cuando se suelta el ratón.
 *
 * Dos lecturas iguales seguidas bastan: la transición es monótona.
 */
export async function esperarLienzoQuieto(page: Page) {
  const canvas = page.getByTestId("cad-canvas");
  let anterior = -1;
  await expect
    .poll(
      async () => {
        const caja = await canvas.boundingBox();
        const ancho = caja ? Math.round(caja.width) : -1;
        const quieto = ancho > 0 && ancho === anterior;
        anterior = ancho;
        return quieto;
      },
      { timeout: 15_000, intervals: [100, 100, 150, 200, 300] },
    )
    .toBe(true);
}

export async function abrirPanelIzquierdo(page: Page) {
  const dock = page.getByTestId("cad-left-dock");
  await expect(dock).toBeVisible({ timeout: 60_000 });
  if ((await dock.getAttribute("data-collapsed")) !== "false") {
    await page.getByTestId("cad-rail-biblioteca").click();
  }
  await expect(dock).toHaveAttribute("data-collapsed", "false");
}
