import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA F — el plano de instalaciones se TECLEA: tubería, ducto, símbolo y
 * su cuadro, y todo llega al servidor.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 2º MEP):
 * nada del toolset existía. Aquí, con el lienzo enfocado:
 *
 *   PIPE ⏎ · 0,0 ⏎ · 3000,0 ⏎ · 3000,4000 ⏎ · ⏎   → agua fría Ø19 en IH-AF (AGUA_FRIA)
 *   DUCTO ⏎ · 0,6000 ⏎ · 4000,6000 ⏎ · ⏎          → ducto de 300 en AA-INY: contorno + eje
 *   MEPSYMBOL ⏎ · V ⏎ · 1500,0 ⏎ · ⏎              → válvula: bloque MEP-VALVULA definido e insertado
 *   DX ⏎ · I ⏎ · 8000,0 ⏎                         → cuadro de instalaciones
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: las capas nuevas con su
 * tipo de línea, las polilíneas con su receta en metadatos, el bloque y su
 * inserción, y la TABLE con 7,00 m de agua fría Ø19, 4,00 m de ducto y 1 válvula.
 */
type CadTable = Extract<CadEntity, { type: "table" }>;

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 9, unit: "mm", linetypeScale: 1000 },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

/** Teclea con el lienzo enfocado: la primera tecla enfoca la caja, Intro devuelve el foco. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await expect(input).not.toBeFocused();
  if (value) await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(input).not.toBeFocused();
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const log = (page: Page) => page.getByTestId("cad-command-line-log");
const count = (page: Page) => page.getByTestId("cad-native-document-count");
const cellTexts = (table: CadTable, row: number) =>
  table.cells.filter((cell) => cell.row === row).sort((a, b) => a.column - b.column).map((cell) => cell.text);

test("PIPE, DUCTO, MEPSYMBOL y DATAEXTRACTION Instalaciones tecleados llegan al servidor con capas, receta, bloque y cuadro", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(count(page)).toHaveText("Native 0");

  // --- la tubería de agua fría ---------------------------------------------------
  await type(page, "PIPE");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("Agua fría Ø19 mm en IH-AF");
  await type(page, "0,0");
  await type(page, "3000,0");
  await type(page, "3000,4000");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 1");
  await expect(log(page)).toContainText("PIPE: 2 tramo(s) de agua fría Ø19 mm, 7,000 mm en la capa IH-AF.");

  // --- el ducto, por el alias en español ----------------------------------------
  await type(page, "DUCTO");
  await expect(prompt(page)).toContainText("Inyección de aire, ancho 300 mm en AA-INY");
  await type(page, "0,6000");
  await type(page, "4000,6000");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 3");
  await expect(log(page)).toContainText("DUCT: 1 tramo(s) de inyección de aire, ancho 300 mm, 4,000 mm por el eje en la capa AA-INY.");

  // --- la válvula -----------------------------------------------------------------
  await type(page, "MEPSYMBOL");
  await expect(prompt(page)).toContainText("Indique el símbolo");
  await type(page, "V");
  await expect(prompt(page)).toContainText("Válvula de compuerta. Precise el punto de inserción");
  await type(page, "1500,0");
  await expect(prompt(page)).toContainText("Ángulo de rotación");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 4");
  await expect(log(page)).toContainText("bloque MEP-VALVULA definido en el dibujo");

  // --- el cuadro ------------------------------------------------------------------
  await type(page, "DX");
  await type(page, "I");
  await expect(prompt(page)).toContainText("cuadro de instalaciones");
  await type(page, "8000,0");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 5");

  // --- lo que el servidor recibió -------------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  const layerNames = saved.layers.map((layer) => layer.name);
  expect(layerNames).toEqual(expect.arrayContaining(["IH-AF", "AA-INY"]));
  expect(saved.layers.find((layer) => layer.name === "IH-AF")?.linetype).toBe("AGUA_FRIA");
  const pipe = saved.entities.find((entity) => entity.type === "polyline" && entity.layer === "IH-AF");
  expect(pipe?.context?.metadata).toEqual({ mep: "pipe", service: "AF", size: 19 });
  const ducts = saved.entities.filter((entity) => entity.type === "polyline" && entity.layer === "AA-INY");
  expect(ducts).toHaveLength(2);
  expect(saved.blocks.find((block) => block.id === "MEP-VALVULA")?.entities).toHaveLength(4);
  const valve = saved.entities.find((entity) => entity.type === "insert");
  expect(valve && valve.type === "insert" ? valve.block : null).toBe("MEP-VALVULA");

  const table = saved.entities.find((entity): entity is CadTable => entity.type === "table");
  expect(table, "el cuadro de instalaciones").toBeTruthy();
  expect(cellTexts(table!, 1)).toEqual(["Servicio", "Capa", "Tipo", "Diám. / ancho (mm)", "Tramos", "Longitud (m)", "Cantidad"]);
  expect(cellTexts(table!, 2)).toEqual(["Inyección de aire", "AA-INY", "Ducto", "300", "1", "4.00", "-"]);
  expect(cellTexts(table!, 3)).toEqual(["Agua fría", "IH-AF", "Tubería", "19", "2", "7.00", "-"]);
  expect(cellTexts(table!, 4)).toEqual(["Válvula de compuerta", "IH-AF", "Equipo", "-", "-", "-", "1"]);
});
