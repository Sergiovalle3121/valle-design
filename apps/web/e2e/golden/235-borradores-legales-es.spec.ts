import { expect, test } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";

test("los borradores legales en español son accesibles y no se presentan como aprobados", async ({
  page,
}) => {
  await page.goto("/privacidad");
  await expect(
    page.getByRole("heading", { name: "Aviso de privacidad" }),
  ).toBeVisible();
  await expect(
    page.getByText("Borrador para revisión de Sergio", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(
    page.getByText(/domicilio del responsable: pendiente/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Términos \(borrador\)/ }),
  ).toHaveAttribute("href", "/terminos");

  await page.goto("/terminos");
  await expect(
    page.getByRole("heading", { name: "Términos de servicio" }),
  ).toBeVisible();
  await expect(
    page.getByText("Borrador para revisión de Sergio", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.getByText(/reembolsos: pendiente/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Privacidad \(borrador\)/ }),
  ).toHaveAttribute("href", "/privacidad");
});

test("alta y pago enlazan a los borradores sin sustituir los textos versionados", async ({
  context,
  page,
}) => {
  await installMockBackend(context);
  await page.goto("/register");
  await expect(
    page.getByRole("link", { name: "Términos de Servicio" }),
  ).toHaveAttribute("href", "/terms");
  await expect(
    page.getByRole("link", { name: "Aviso de Privacidad" }),
  ).toHaveAttribute("href", "/privacy");
  await expect(
    page.getByRole("link", { name: "Borrador de términos" }),
  ).toHaveAttribute("href", "/terminos");
  await expect(
    page.getByRole("link", { name: "Borrador de privacidad" }),
  ).toHaveAttribute("href", "/privacidad");

  await page.goto("/precios/checkout");
  await expect(
    page.getByRole("link", { name: "Borrador de términos" }),
  ).toHaveAttribute("href", "/terminos");
  await expect(
    page.getByRole("link", { name: "Borrador de privacidad" }),
  ).toHaveAttribute("href", "/privacidad");
});
