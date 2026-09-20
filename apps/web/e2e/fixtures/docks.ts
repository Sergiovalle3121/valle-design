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

export async function abrirPanelIzquierdo(page: Page) {
  const dock = page.getByTestId("cad-left-dock");
  await expect(dock).toBeVisible({ timeout: 60_000 });
  if ((await dock.getAttribute("data-collapsed")) !== "false") {
    await page.getByTestId("cad-rail-biblioteca").click();
  }
  await expect(dock).toHaveAttribute("data-collapsed", "false");
}
