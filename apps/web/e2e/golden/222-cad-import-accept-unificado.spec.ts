import { test, expect } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { installDashboardBackend } from "../fixtures/dashboard-backend";

/*
 * P07 — El input de importación del primer minuto y del tablero grande
 * comparten el MISMO atributo `accept`. Antes, FirstMinute tenía la lista
 * fija sin .dwg ni mallas, mientras page.tsx la calculaba con la bandera.
 *
 * Seed vacío para que el dashboard muestre el estado "empty" con FirstMinute.
 */

test("first-minute y dashboard usan el mismo accept", async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await installDashboardBackend(context, { projects: [], documents: [] });
  await loginAsStandaloneOwner(context);
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  const firstMinute = page.getByTestId("first-minute-import-input");
  const dashboard = page.getByTestId("dashboard-import-input");

  await expect(firstMinute).toBeAttached();
  await expect(dashboard).toBeAttached();

  const fmAccept = await firstMinute.getAttribute("accept");
  const dbAccept = await dashboard.getAttribute("accept");

  expect(fmAccept).toBeTruthy();
  expect(dbAccept).toBeTruthy();
  expect(
    fmAccept,
    `first-minute accept (${fmAccept}) must equal dashboard accept (${dbAccept})`,
  ).toBe(dbAccept);
});
