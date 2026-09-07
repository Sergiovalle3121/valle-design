import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * CONTRAPRUEBA DEL ESCÉPTICO — «PLOT Extensión no traza nunca».
 *
 * El informe puede ser falso de tres maneras: mal uso (área mal elegida),
 * defecto conocido ajeno, o entorno. Por eso el mismo test hace primero el
 * CONTROL —PLOT con el área por defecto (Presentación)— y sólo después el
 * CASO. Si el control entrega PDF y el caso no, ni la fixture ni el puerto ni
 * la carga explican nada.
 */

const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };
const NAVE = { x0: 1_000, y0: 1_000, x1: 11_000, y1: 9_000 };

function documentoSemilla(): CadDocument {
  const esquinas = [
    [NAVE.x0, NAVE.y0, NAVE.x1, NAVE.y0],
    [NAVE.x1, NAVE.y0, NAVE.x1, NAVE.y1],
    [NAVE.x1, NAVE.y1, NAVE.x0, NAVE.y1],
    [NAVE.x0, NAVE.y1, NAVE.x0, NAVE.y0],
  ];
  const entities = esquinas.map(([ax, ay, bx, by], index) => ({
    id: `muro-${index}`,
    type: "line" as const,
    start: { x: ax, y: ay, z: 0 },
    end: { x: bx, y: by, z: 0 },
    layer: "0",
  }));
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#111827", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, documentoSemilla(), FOOTPRINT);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

/** Un trazado completo: opcionalmente elige área, y siempre pulsa Trazar. */
async function trazar(page: Page, area: "Presentación" | "EXtensión" | "LÍmites", nombre: string) {
  const entrada = page.getByTestId("cad-command-input");
  const descarga = page.waitForEvent("download", { timeout: 20_000 });
  await entrada.click();
  await entrada.fill("PLOT");
  await entrada.press("Enter");
  await expect(page.getByTestId("cad-command-keyword-Trazar")).toBeVisible();
  if (area !== "Presentación") {
    await page.getByTestId(`cad-command-keyword-${area}`).click();
    // El renglón del prompt tiene que reflejar el área elegida ANTES de trazar:
    // así se descarta que el clic no llegara.
    await expect(page.getByTestId("cad-command-line-log")).toContainText(
      area === "EXtensión" ? "Área Extensión" : "Área Límites",
    );
  }
  await page.getByTestId("cad-command-keyword-Trazar").click();
  await entrada.fill(nombre);
  await entrada.press("Enter");
  const archivo = await descarga.catch(() => null);
  const registro = (await page.getByTestId("cad-command-line-log").innerText()).trim();
  return { archivo, registro };
}

test("PLOT: control (Presentación) contra caso (Extensión y Límites)", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);

  await test.step("hay una presentación que trazar", async () => {
    await page.getByTitle(/Paquete de entrega/).click();
    await page.getByRole("button", { name: "+ Hoja" }).click();
    await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");
    await page.getByLabel("Cerrar paquete de entrega").click();
    await expect(page.getByTestId("cad-sheet-package")).toHaveCount(0);
  });

  const control = await trazar(page, "Presentación", "control-presentacion");
  console.log(
    `[escéptico·plot] CONTROL Presentación → archivo=${control.archivo ? control.archivo.suggestedFilename() : "NINGUNO"}`,
  );
  console.log(`[escéptico·plot] CONTROL log:\n${control.registro.slice(-600)}`);

  const extension = await trazar(page, "EXtensión", "caso-extension");
  console.log(
    `[escéptico·plot] CASO Extensión → archivo=${extension.archivo ? extension.archivo.suggestedFilename() : "NINGUNO"}`,
  );
  console.log(`[escéptico·plot] CASO log:\n${extension.registro.slice(-600)}`);

  const limites = await trazar(page, "LÍmites", "caso-limites");
  console.log(
    `[escéptico·plot] CASO Límites → archivo=${limites.archivo ? limites.archivo.suggestedFilename() : "NINGUNO"}`,
  );

  // El control es lo que decide si esta prueba puede afirmar algo.
  expect(control.archivo, "el CONTROL no dio PDF: la prueba no puede afirmar nada").not.toBeNull();
  // Y el caso, lo que se afirma del producto.
  expect(extension.archivo, "«PLOT Extensión» SÍ dio PDF: el informe sería falso").toBeNull();
  expect(extension.registro).toContain(
    "El área de trazado «extents» no está definida en este dibujo.",
  );
  expect(limites.archivo).toBeNull();
});
