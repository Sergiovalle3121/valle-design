import { expect, test } from "@playwright/test";

const mobile = { width: 390, height: 844 };

test.describe("landing pública en móvil", () => {
  test.use({ viewport: mobile });

  test("es responsive, navegable y conserva una jerarquía accesible", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preguntas frecuentes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Crear cuenta" }).first()).toHaveAttribute("href", "/register");
    await expect(page.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    await expect(page.getByText("Contactar ventas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Precio no publicado", { exact: true }).first()).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });
});

for (const route of ["/login", "/register"] as const) {
  test(`${route} mantiene formulario accesible y usable en móvil`, async ({ page }) => {
    await page.setViewportSize(mobile);
    await page.goto(route);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button")).toHaveCSS("min-height", "44px");
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
}
