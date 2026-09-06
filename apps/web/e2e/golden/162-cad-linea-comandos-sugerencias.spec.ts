/**
 * T-74(c): «la línea de comandos no sugiere nada mientras escribo, y el
 * buscador ya existe» — Ctrl+K ya indexa los 182 comandos del motor
 * (`command-palette.ts`), pero tecleando en la línea real no aparecía ni
 * uno hasta pulsar Intro y descubrir un error. Este golden teclea de
 * verdad, con el navegador, porque es exactamente el tipo de interacción
 * (flechas que cambian de significado a media escritura, Tab que completa
 * sin ejecutar) que un spec sin DOM no puede ejercitar.
 */
import { expect, test } from "@playwright/test";

test("la línea de comandos sugiere por prefijo, Tab completa y las flechas navegan la lista", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
    timeout: 60_000,
  });

  const input = page.getByTestId("cad-command-input");
  await input.click();

  // CIRCL es prefijo único: CIRCLE existe, CIRCUITO no empieza igual
  // (difieren en la quinta letra), así que hay EXACTAMENTE una sugerencia.
  await input.pressSequentially("CIRCL");
  await expect(page.getByRole("listbox", { name: "Comandos sugeridos" })).toBeVisible();
  const opcion = page.getByRole("option", { name: /^CIRCLE/ });
  await expect(opcion).toBeVisible();
  await expect(opcion).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const opcionId = await opcion.getAttribute("id");
  expect(opcionId).not.toBeNull();
  await expect(input).toHaveAttribute("aria-activedescendant", opcionId!);

  // Tab completa el nombre SIN ejecutar — el gesto clásico de autocompletar.
  await input.press("Tab");
  await expect(input).toHaveValue("CIRCLE");

  // Con el nombre completo, Intro lo ejecuta de verdad: aparece en el
  // diálogo como entrada tecleada, y el prompt pide el centro del círculo
  // (confirma que el motor recibió el comando, no sólo que el texto cambió).
  await input.press("Enter");
  await expect(page.getByTestId("cad-command-line-log")).toContainText("> CIRCLE");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(/centro|radio/i);

  // Cancelar deja el estudio limpio para cualquier prueba que corra después.
  await page.keyboard.press("Escape");
});

test("con un prompt activo o argumentos ya escritos, las flechas vuelven a recuperar historial", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
    timeout: 60_000,
  });

  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill("CIRCLE");
  await input.press("Enter");
  // Con el prompt de CIRCLE activo (pide el centro), no hay sugerencias de
  // nombre de comando que mostrar — esto no debe reventar ni dejar una
  // lista fantasma.
  await expect(page.getByTestId("cad-command-prompt")).toContainText(/centro|radio/i);
  await expect(page.getByRole("listbox")).toHaveCount(0);

  // Escape cancela CIRCLE; lo tecleado («CIRCLE») ya quedó en el historial
  // ANTES de cancelar (`submit()` registra el input antes de despachar), así
  // que sigue disponible para recuperar con las flechas.
  await page.keyboard.press("Escape");
  await input.click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveValue("CIRCLE");
});
