import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { enter3DView } from "../fixtures/view-mode";
import { fitFootprint, topView } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA F — ----GAS----GAS----: el tipo de línea con texto se VE y se EXPORTA.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 2º MEP):
 * «un plano de instalaciones distingue gas de drenaje de agua sólo por el tipo
 * de línea», y el lector `.lin` declaraba imposible el texto incrustado. Aquí
 * la planta trae una línea de gas de 10 m en la capa GAS = GAS_LINE con
 * LTSCALE 1000 (ciclo de 950 mm, «GAS» de 100 mm):
 *
 *   - el pipeline por lotes rasteriza los rótulos del tipo de línea en el
 *     atlas: 10 «GAS» son 30 glifos, y ninguno se cae;
 *   - LTSCALE 500 ⏎ los duplica en vivo: 20 «GAS», 60 glifos;
 *   - el DXF descargado lleva GAS_LINE con 74 = 2, S = 0,1, X = −0,1, Y = −0,05
 *     y el texto sobre su tramo.
 */
function seedDocument(): CadDocument {
  const entities: CadEntity[] = [
    { id: "gas", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10_000, y: 0, z: 0 }, layer: "GAS" },
  ];
  return {
    meta: { version: 1, schema: 9, unit: "mm", linetypeScale: 1000 },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "GAS", name: "GAS", color: "#f59e0b", visible: true, locked: false, linetype: "GAS_LINE" },
    ],
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

const badge = (page: Page) => page.getByTestId("cad-render-pipeline");
async function settled(page: Page) {
  await expect(badge(page)).toHaveAttribute("data-settled", "true", { timeout: 30_000 });
}
const numberOf = async (page: Page, attribute: string) => Number(await badge(page).getAttribute(attribute));

/** Teclea en la caja de la línea de comandos y confirma. */
async function teclear(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), { footprintW: 12_000, footprintH: 4_000, unit: "mm", gridSize: 100 });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");
}

test("GAS_LINE rotula la línea de gas en pantalla, responde a LTSCALE y sale al DXF con su texto", async ({ context, page }) => {
  test.setTimeout(180_000);
  await openStudio(context, page);
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);
  await settled(page);

  // --- 10 rótulos de 3 glifos, ninguno descartado ------------------------------
  expect(await numberOf(page, "data-glyphs")).toBeGreaterThanOrEqual(30);
  expect(await numberOf(page, "data-dropped-glyphs")).toBe(0);

  // --- LTSCALE 500: el ciclo baja a 475 mm y caben 20 --------------------------
  await teclear(page, "LTSCALE");
  await expect(page.getByTestId("cad-command-prompt")).toBeVisible();
  await teclear(page, "500");
  await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
  await expect
    .poll(async () => numberOf(page, "data-glyphs"), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(60);
  expect(await numberOf(page, "data-dropped-glyphs")).toBe(0);

  // --- el DXF lleva el tipo complejo -------------------------------------------
  await page.getByTitle(/Exportar a DXF/).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar DXF" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, "utf8");
  expect(content).toMatch(/\nLTYPE\n\s*2\nGAS_LINE\n/);
  expect(content).toMatch(/\n\s*49\n\s*-0\.25\n\s*74\n\s*2\n\s*75\n\s*0\n\s*46\n\s*0\.1\n\s*50\n\s*0\n\s*44\n\s*-0\.1\n\s*45\n\s*-0\.05\n\s*9\nGAS\n/);
  expect(content).toMatch(/\n\s*\$LTSCALE\n\s*40\n\s*500\n/);
});
