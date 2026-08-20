import { expect, type Page } from "@playwright/test";

/**
 * Abre el muelle de colaboración del estudio, como haría una persona.
 *
 * NACE PLEGADO a propósito: `fixed right-3 top-24 w-[19rem]` lo pone encima del
 * panel derecho del editor —lista de entidades y propiedades— y abierto no se
 * limita a taparlo, se queda sus CLICS. Playwright lo cazaba como
 * «cad-collab-dock subtree intercepts pointer events», y con él caían el golden
 * 40, el 10 y el 12; hay 38 goldens que tocan ese panel.
 *
 * Así que un flujo que va a comentar lo abre primero. Se comprueba por
 * `aria-expanded` y no por el texto del botón porque el estado es lo que se
 * afirma, no cómo se rotula.
 */
export async function openCollabDock(page: Page) {
  const dock = page.getByTestId("cad-collab-dock");
  await expect(dock).toBeVisible({ timeout: 60_000 });
  const toggle = page.getByTestId("cad-collab-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}
