/**
 * T-74(j): «la cinta no recuerda nada» — cada carga volvía a Inicio y
 * desplegada. Ahora la pestaña activa y si está minimizada se recuerdan de
 * una carga a otra (comprobado por `CadRibbon.spec.ts` con más detalle sobre
 * DÓNDE se guarda) — esta es la prueba con navegador real de que sobreviven
 * a una recarga de verdad, algo que un spec sin DOM no puede demostrar.
 */
import { expect, test } from "@playwright/test";

test("la pestaña activa y el minimizado de la cinta sobreviven a una recarga", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
    timeout: 60_000,
  });

  // Por defecto: Inicio, desplegada.
  await expect(page.getByTestId("cad-ribbon")).toHaveAttribute("data-collapsed", "false");
  await expect(page.getByTestId("cad-ribbon-panels-inicio")).toBeVisible();

  // Cambia de pestaña y minimiza.
  await page.getByTestId("cad-ribbon-tab-anotar").click();
  await expect(page.getByTestId("cad-ribbon-panels-anotar")).toBeVisible();
  await page.getByTestId("cad-ribbon-collapse").click();
  await expect(page.getByTestId("cad-ribbon")).toHaveAttribute("data-collapsed", "true");

  await page.reload();
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
    timeout: 60_000,
  });

  // Lo elegido sobrevivió a la recarga — nada de volver a Inicio desplegada.
  await expect(page.getByTestId("cad-ribbon")).toHaveAttribute("data-collapsed", "true");
  await page.getByTestId("cad-ribbon-collapse").click();
  await expect(page.getByTestId("cad-ribbon-panels-anotar")).toBeVisible();
});
