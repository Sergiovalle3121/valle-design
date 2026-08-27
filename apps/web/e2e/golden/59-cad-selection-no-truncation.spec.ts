import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * QSELECT y "seleccionar por capa" designan lo que DICEN designar, más allá
 * de 300/200 objetos.
 *
 * Campaña Paridad, OLA 0.3/1.1 (27 de agosto de 2026): `selectNative`
 * truncaba a `.slice(0, 300)` en silencio mientras el diálogo de QSELECT
 * (`select-query.ts`) seguía anunciando el total REAL sin truncar —
 * "350 de 350 objetos examinados casan; quedan 350 designado(s)" cuando en
 * realidad sólo 300 quedaban vivos en la selección. `selectCadLayerObjects`
 * (el botón «Sel» del gestor de capas) tenía la misma mentira con un tope
 * propio de 200, y además perdía en silencio los objetos heredados cuando
 * había nativos de por medio.
 *
 * Este golden prueba el efecto, no el mensaje: 350 líneas en una capa,
 * QSELECT por esa capa, y ERASE inmediato sobre "lo designado". Si el
 * tope silencioso sigue vivo, sobreviven 50 líneas que el mensaje dijo
 * haber designado — un objeto "borrado" que sigue en el documento es
 * exactamente la clase de pérdida silenciosa que el programa de paridad
 * existe para cazar.
 */
const LINE_COUNT = 350;

function seedDocument(): CadDocument {
  const entities: CadEntity[] = Array.from({ length: LINE_COUNT }, (_, index) => ({
    id: `linea-${index}`,
    type: "line",
    start: { x: index * 10, y: 0, z: 0 },
    end: { x: index * 10, y: 1000, z: 0 },
    layer: "0",
  }));
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
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
  } as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 4_000,
    footprintH: 1_200,
    unit: "mm",
    gridSize: 100,
  });
}

async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

test("QSELECT designa las 350 y ERASE las borra las 350 — sin tope de 300 en silencio", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");

  const commandLine = page.getByTestId("cad-command-line");
  await expect(commandLine).toBeVisible();
  const log = page.getByTestId("cad-command-line-log");
  const prompt = page.getByTestId("cad-command-prompt");
  const documentCount = page.getByTestId("cad-native-document-count");

  await expect(documentCount).toHaveText(`Native ${LINE_COUNT}`);

  // QSELECT: tipo=line, capa=0 — casan las 350.
  await type(page, "QSELECT");
  await expect(prompt).toContainText("Aplicar a");
  await type(page, "D");
  await type(page, "line");
  await type(page, "layer");
  await type(page, "=");
  await type(page, "0");
  await type(page, "N");
  await type(page, "R");
  await expect(log).toContainText(`${LINE_COUNT} de ${LINE_COUNT}`);
  await expect(log).toContainText(`quedan ${LINE_COUNT} designado(s)`);

  // ERASE actúa sobre lo YA designado (sin volver a preguntar): borra
  // exactamente lo que quedó vivo en la selección real, no lo que el
  // mensaje de arriba prometió.
  await type(page, "E");
  await expect(documentCount).toHaveText("Native 0");
});

test('"Sel" en el gestor de capas designa las 350 — sin tope de 200 en silencio', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");

  const documentCount = page.getByTestId("cad-native-document-count");
  await expect(documentCount).toHaveText(`Native ${LINE_COUNT}`);

  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const row = page.getByTestId("cad-layer-row-0");
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Sel", exact: true }).click();

  // Mismo efecto-no-mensaje que el test anterior: ERASE actúa sobre lo YA
  // designado por "Sel". Antes del arreglo, `.slice(0, 200)` dejaba 150
  // líneas vivas mientras el toast de arriba ya afirmaba las 350.
  await page.getByTestId("cad-command-input").click();
  await page.getByTestId("cad-command-input").fill("E");
  await page.getByTestId("cad-command-input").press("Enter");
  await expect(documentCount).toHaveText("Native 0");
});
