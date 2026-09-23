/**
 * T2 — Los alias cortos (L, C, M, CO, TR, E, PL, DI) arrancan su comando
 * al pulsar Enter, aunque el desplegable de sugerencias esté abierto.
 *
 * El motor resuelve alias por `alias-table.ts`; la línea de comandos
 * envía el texto literal y el desplegable no se apropia de Enter salvo
 * que el usuario haya navegado con flechas.
 */
import { expect, test } from "@playwright/test";
import { abrirPanelDerecho } from "../fixtures/docks";

const ALIASES: [string, RegExp][] = [
  ["L", /LINE/],
  ["C", /CIRCLE/],
  ["M", /MOVE/],
  ["CO", /COPY/],
  ["TR", /TRIM/],
  ["E", /ERASE/],
  ["PL", /PLINE/],
  ["DI", /DIST/],
];

for (const [alias, patron] of ALIASES) {
  test(`${alias} + Enter arranca ${patron.source}`, async ({ page }) => {
    await page.goto("/demo?cadUi=pro");
    await abrirPanelDerecho(page);
    await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
      timeout: 60_000,
    });

    const input = page.getByTestId("cad-command-input");
    await input.click();
    await input.fill(alias);
    await input.press("Enter");

    // El historial muestra el alias como entrada tecleada.
    await expect(page.getByTestId("cad-command-line-log")).toContainText(`> ${alias}`);
    // El motor arrancó el comando: aparece un prompt o un mensaje del motor.
    await expect(page.getByTestId("cad-command-line-log")).toContainText(patron);

    // Cancelar para dejar limpio.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  });
}
