/**
 * Gestor de propiedades de capa.
 *
 * Se afirma el DOCUMENTO, no el aspecto del panel: tipo de línea, grosor y
 * plot llegan a `CadLayerDef`; la congelación por viewport llega a
 * `viewport.layerVisibility` SIN apagar la capa en el resto del dibujo; y un
 * estado de capa guardado devuelve el reparto anterior.
 *
 * Los filtros sí se comprueban en la interfaz —son interfaz— pero como
 * PRECONDICIÓN de lo que se afirma después, nunca como la prueba entera.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument } from "../../src/lib/cad/cad-document";

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      {
        id: "0",
        name: "0",
        color: "#ffffff",
        visible: true,
        locked: false,
        linetype: "CONTINUOUS",
        lineweight: -1,
        plot: true,
      },
      {
        id: "STRUCTURE",
        name: "STRUCTURE",
        color: "#f97316",
        visible: true,
        locked: false,
        linetype: "CONTINUOUS",
        lineweight: -1,
        plot: true,
      },
      {
        id: "NOTES",
        name: "NOTES",
        color: "#22c55e",
        visible: true,
        locked: false,
        linetype: "CONTINUOUS",
        lineweight: -1,
        plot: true,
      },
    ],
    entities: [
      {
        id: "layer-base",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 9_000, y: 1_000, z: 0 },
        layer: "0",
      },
      {
        id: "layer-beam",
        type: "line",
        start: { x: 1_000, y: 4_000, z: 0 },
        end: { x: 9_000, y: 4_000, z: 0 },
        layer: "STRUCTURE",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["layer-base", "layer-beam"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000,
    footprintH: 8_000,
    unit: "mm",
    gridSize: 100,
  });
}

/**
 * Elige una opción y espera a que la sostenga.
 *
 * El menú de capas es un portal que se reconstruye al llegar la respuesta de
 * una escritura anterior, así que un `selectOption` suelto puede caer en el
 * hueco del remontaje y no cambiar nada. Se reintenta la PRECONDICIÓN —que el
 * control sostenga lo elegido—; la aserción sobre el documento sigue fuera y
 * sin reintento.
 */
async function chooseLayerOption(
  page: import("@playwright/test").Page,
  testId: string,
  value: string,
) {
  const control = page.getByTestId(testId);
  await expect(async () => {
    await expect(control).toBeVisible({ timeout: 1_000 });
    await control.selectOption(value);
    await expect(control).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("el gestor de capas escribe tipo de línea, grosor y plot, filtra, y guarda y restaura estados", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-layer-base")).toBeVisible();

  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  await expect(page.getByTestId("cad-layer-properties")).toBeVisible();
  // Sin presentación abierta no hay viewport que congelar, y la columna lo dice
  // en vez de ofrecer un interruptor que no iría a ninguna parte.
  await expect(
    page.getByTestId("cad-layer-vpfreeze-STRUCTURE"),
  ).toHaveAttribute("data-state", "unavailable");

  await test.step("tipo de línea, grosor y plot", async () => {
    await chooseLayerOption(page, "cad-layer-linetype-STRUCTURE", "DASHED");
    await chooseLayerOption(page, "cad-layer-lineweight-STRUCTURE", "0.5");
    await page.getByTestId("cad-layer-plot-NOTES").click();
    await expect(page.getByTestId("cad-layer-plot-NOTES")).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  await test.step("los dos filtros se acumulan", async () => {
    await page.getByTestId("cad-layer-filter-name").fill("str");
    await expect(page.getByTestId("cad-layer-row-STRUCTURE")).toBeVisible();
    await expect(page.getByTestId("cad-layer-row-0")).toHaveCount(0);
    await expect(page.getByTestId("cad-layer-visible-count")).toHaveText(
      "1/3 listadas",
    );
    // Nombre «str» + propiedad «no se imprimen» no deja ninguna: STRUCTURE sí
    // se imprime y NOTES no se llama así.
    await page.getByTestId("cad-layer-filter-property").selectOption("noplot");
    await expect(page.getByTestId("cad-layer-visible-count")).toHaveText(
      "0/3 listadas",
    );
    await page.getByTestId("cad-layer-filter-clear").click();
    await expect(page.getByTestId("cad-layer-visible-count")).toHaveText(
      "3/3 listadas",
    );
  });

  await test.step("un estado de capa devuelve el reparto anterior", async () => {
    await page.getByTestId("cad-layer-state-name").fill("Impresion");
    await page.getByTestId("cad-layer-state-save").click();
    await expect(page.getByTestId("cad-layer-state-Impresion")).toBeVisible();
    await page.getByTestId("cad-layer-visible-NOTES").click();
    await expect(page.getByTestId("cad-layer-visible-NOTES")).toHaveClass(
      /opacity-30/,
    );
    await page.getByTestId("cad-layer-state-restore-Impresion").click();
    await expect(page.getByTestId("cad-layer-visible-NOTES")).not.toHaveClass(
      /opacity-30/,
    );
  });

  await viewButton.click();
  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  expect(stored.layers.find((layer) => layer.id === "STRUCTURE")).toMatchObject(
    {
      linetype: "DASHED",
      lineweight: 0.5,
      plot: true,
      visible: true,
    },
  );
  expect(stored.layers.find((layer) => layer.id === "NOTES")).toMatchObject({
    plot: false,
    visible: true, // el estado la devolvió a visible
  });
  expect(
    stored.history.some((entry) => entry.label === "layer:update:STRUCTURE"),
  ).toBe(true);
  expect(
    stored.history.some((entry) => entry.label === "layer:update:NOTES"),
  ).toBe(true);

  await page.reload();
  await expect(page.getByTestId("cad-native-entity-layer-base")).toBeVisible();
  await viewButton.click();
  await expect(page.getByTestId("cad-layer-linetype-STRUCTURE")).toHaveValue(
    "DASHED",
  );
  await expect(page.getByTestId("cad-layer-lineweight-STRUCTURE")).toHaveValue(
    "0.5",
  );
  await expect(page.getByTestId("cad-layer-plot-NOTES")).toHaveAttribute(
    "data-active",
    "false",
  );
  // Los estados de capa viven en la SESIÓN, no en el documento: tras recargar
  // la lista está vacía. Es una limitación DECLARADA —`CadDocument` no tiene
  // dónde persistirlos y `lib/cad` pertenece a otra sesión— y se afirma para
  // que deje de serlo el día que se persistan.
  await expect(page.getByTestId("cad-layer-state-Impresion")).toHaveCount(0);
  await page
    .getByTestId("cad-layer-manager")
    .screenshot({
      path: testInfo.outputPath("layer-properties.png"),
      scale: "css",
    });
});

test("congelar una capa en un viewport no la apaga en el resto del dibujo", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-layer-base")).toBeVisible();

  // Hace falta una presentación con viewport activo: VP freeze es, por
  // definición, «sólo en esta ventana».
  await page.getByTitle(/Paquete de entrega/).click();
  await page.getByRole("button", { name: "Demo 3 hojas" }).click();
  await expect(page.getByTestId("cad-layout-manager")).toContainText(
    "Viewports · 1",
  );
  await page.getByLabel("Cerrar paquete de entrega").click();

  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const freeze = page.getByTestId("cad-layer-vpfreeze-STRUCTURE");
  await expect(freeze).toHaveAttribute("data-state", "thawed");
  await freeze.click();
  await expect(
    page.getByTestId("cad-layer-vpfreeze-STRUCTURE"),
  ).toHaveAttribute("data-state", "frozen");
  // Congelada en el viewport, ENCENDIDA en el dibujo: son cosas distintas y el
  // gestor no las confunde.
  await expect(page.getByTestId("cad-layer-visible-STRUCTURE")).not.toHaveClass(
    /opacity-30/,
  );
  await viewButton.click();

  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  const viewports = stored.paperSpaces.flatMap(
    (space) => space.viewports ?? [],
  );
  const frozen = viewports.filter(
    (viewport) => viewport.layerVisibility?.STRUCTURE === false,
  );
  expect(frozen).toHaveLength(1);
  expect(viewports.length).toBeGreaterThan(1);
  expect(stored.layers.find((layer) => layer.id === "STRUCTURE")?.visible).toBe(
    true,
  );
  expect(stored.layers.find((layer) => layer.id === "0")?.visible).toBe(true);
});
