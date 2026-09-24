import { expect, type Page } from "@playwright/test";

/** Los goldens históricos medían la casa ya abierta; ahora el visitante la elige. */
export async function chooseDemoStart(
  page: Page,
  choice: "casa-habitacion" | "departamento" | "local-comercial" | "en-blanco" = "casa-habitacion",
): Promise<void> {
  const chooser = page.getByTestId("demo-first-choice");
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`demo-choice-${choice}`).getByRole("button").click();
  await expect(chooser).toHaveCount(0);
}
