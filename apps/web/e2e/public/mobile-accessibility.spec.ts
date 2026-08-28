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
    /*
     * La portada YA NO PUBLICA TARIFAS, y eso es una decisión, no un olvido:
     * «Esta página no publica tarifas por su cuenta para que no haya dos
     * verdades sobre lo mismo». Las dos aserciones que había aquí —«Contactar
     * ventas» y «Precio no publicado»— comprobaban el texto de la tabla de
     * precios que la portada llevaba antes de ese cambio, así que medían una
     * página que ya no existe.
     *
     * Lo que sí hay que seguir garantizando es lo que aquellas aserciones
     * protegían de verdad: que la portada no se invente un precio y que lleve
     * al catálogo. Eso es lo que se comprueba ahora, y sobrevive al siguiente
     * rediseño porque no depende de una cadena decorativa.
     */
    await expect(page.getByRole("link", { name: "Ver precios" }).first()).toHaveAttribute("href", "/precios");
    const cuerpo = (await page.locator("body").innerText()).toLowerCase();
    expect(
      /\$\s?\d|\d+\s?(mxn|usd|eur)|\d+\s?(al mes|\/mes|por mes)/.test(cuerpo),
      "la portada publicó una tarifa por su cuenta: el catálogo vive en /precios y no puede haber dos verdades",
    ).toBe(false);

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
    await expect(page.getByLabel(/^Contrase/iu)).toBeVisible();
    /*
      El botón que importa es el de ENVIAR, no cualquiera. `getByRole("button")`
      a secas dejó de ser único cuando la página ganó un segundo botón, y una
      aserción ambigua no es más estricta: es una que se cae sola. Se nombra el
      que se está midiendo, que es el que el dedo tiene que acertar.
    */
    /*
      44 px es un MÍNIMO, no una medida exacta. Afirmarlo con igualdad hacía que
      la prueba se cayera cuando el producto MEJORA: el botón de envío pasó a 48
      px (`size="lg"`) y el gate lo dio por roto. Una regla de accesibilidad que
      castiga superarla está mal escrita.
    */
    const alto = await page
      .locator('button[type="submit"]')
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).minHeight));
    expect(alto, "el objetivo táctil del botón de envío baja de 44 px").toBeGreaterThanOrEqual(44);
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  });
}
