import { expect, test } from "@playwright/test";

test("el visitante comparte desde /demo una copia guardada del plano sin cuenta", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  let published: Record<string, unknown> | null = null;
  await page.route("**/v1/cad/demo-shares", async (route) => {
    published = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        shareToken: `vdrl_${"a".repeat(43)}`,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo?cadUi=esencial");
  await expect(page.getByTestId("cad-essential-bar")).toBeVisible({
    timeout: 60_000,
  });
  const input = page.getByTestId("cad-command-input");
  for (const token of ["LINE", "123,456", "2345,456"]) {
    await input.click();
    await input.fill(token);
    await input.press("Enter");
  }
  await input.press("Enter");
  await expect(page.getByTestId("cad-save-status")).toHaveAttribute(
    "data-state",
    "guardado",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Compartir", exact: true }).click();
  await expect(page.getByText(/copia de este momento/i)).toBeVisible();
  await page.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(page.getByText("Enlace copiado")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "/revision#cadReview=vdrl_",
  );
  expect(published).not.toBeNull();
  expect(
    new TextEncoder().encode(JSON.stringify(published!.document)).length,
  ).toBeLessThanOrEqual(256 * 1024);
  const entities = (
    published!.document as {
      entities: Array<{ type: string; start?: { x: number; y: number } }>;
    }
  ).entities;
  expect(entities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "line",
        start: expect.objectContaining({ x: 123, y: 456 }),
      }),
    ]),
  );
});
