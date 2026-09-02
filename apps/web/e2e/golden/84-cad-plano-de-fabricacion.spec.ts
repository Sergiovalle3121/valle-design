import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA I — el plano de fabricación se TECLEA: el normalizado, su globo, la
 * lista de materiales, la cota con ajuste, la soldadura y el acabado, y todo
 * llega al servidor.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 5º
 * MECHANICAL): nada del toolset existía. Aquí, con el lienzo enfocado:
 *
 *   TORNILLO ⏎ · ⏎ · ⏎ · ⏎ · 1000,1000 ⏎ · ⏎        → M10 × 40 ISO 4017: bloque MECH-TORNILLO-M10x40 definido e insertado
 *   Ctrl+A · GLOBO ⏎ · 1500,1500 ⏎                     → globo 1 sobre el tornillo (la designación previa vale)
 *   BOM ⏎ · 4000,0 ⏎                                   → la lista de materiales con la posición del globo
 *   DIMLINEAR ⏎ · 0,3000 ⏎ · 40,3000 ⏎ · 20,2500 ⏎     → una cota de 40
 *   Ctrl+A · DTOL ⏎ · A ⏎ · H7 ⏎                       → «40.00 +0.025/0 mm»
 *   SOLDADURA ⏎ · 2000,0 ⏎ · 2500,300 ⏎ · ⏎ · ⏎ · 6 ⏎ · ⏎ · ⏎ · ⏎ · ⏎ → filete de 6 del lado de la flecha
 *   ACABADO ⏎ · ⏎ · ⏎ · ⏎ · 3000,800 ⏎ · ⏎            → mecanizado, Ra 3,2
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: el bloque con su
 * denominación y norma, la inserción, el globo con su marca, la TABLE con
 * «1 · 1 · Tornillo hexagonal M10 × 40 · ISO 4017», la cota con su
 * tolerancia en metadatos y los dos símbolos con la suya.
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

test("TORNILLO, GLOBO, BOM, DIMTOLERANCE, SOLDADURA y ACABADO tecleados llegan al servidor con bloque, marca, lista, tolerancia y símbolos", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(count(page)).toHaveText("Native 0");

  // --- el normalizado, por el alias en español y con Intro en todo ----------------
  await type(page, "TORNILLO");
  await expect(prompt(page)).toContainText("Indique el normalizado");
  await type(page, "");
  await expect(prompt(page)).toContainText("Precise la métrica (M6, M8, M10, M12, M16, M20, M24)");
  await type(page, "");
  await expect(prompt(page)).toContainText("Precise la longitud del tornillo (mm)");
  await type(page, "");
  await expect(prompt(page)).toContainText("Tornillo hexagonal M10 × 40 (ISO 4017). Precise el punto de inserción");
  await type(page, "1000,1000");
  await expect(prompt(page)).toContainText("Ángulo de rotación");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 1");
  await expect(log(page)).toContainText("STDPART: Tornillo hexagonal M10 × 40 (ISO 4017) en (1000, 1000); bloque MECH-TORNILLO-M10x40 definido en el dibujo.");

  // --- el globo sobre la pieza designada -------------------------------------------
  await page.keyboard.press("Control+a");
  await type(page, "GLOBO");
  await expect(prompt(page)).toContainText("Precise el centro del globo", { timeout: 15_000 });
  await type(page, "1500,1500");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 5");
  await expect(log(page)).toContainText("BALLOON: globo 1 sobre MECH-TORNILLO-M10x40 en (1500, 1500).");

  // --- la lista de materiales -------------------------------------------------------
  await type(page, "BOM");
  await expect(prompt(page)).toContainText("Precise el punto de inserción de la lista de materiales");
  await type(page, "4000,0");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 6");
  await expect(log(page)).toContainText("BOM: 1 posición(es), 1 unidad(es), 1 globo(s) en (4000, 0).");

  // --- la cota y su ajuste ---------------------------------------------------------
  await type(page, "DIMLINEAR");
  await expect(prompt(page)).toBeVisible();
  await type(page, "0,3000");
  await type(page, "40,3000");
  await type(page, "20,2500");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 7");
  await page.keyboard.press("Control+a");
  await type(page, "DTOL");
  await expect(prompt(page)).toContainText("1 cota(s). Indique la tolerancia", { timeout: 15_000 });
  await type(page, "A");
  await expect(prompt(page)).toContainText("Escriba el ajuste ISO 286");
  await type(page, "H7");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("DIMTOLERANCE: 1 cota(s) con el ajuste H7; la primera rotula «40.00 +0.025/0 mm».");

  // --- la soldadura ----------------------------------------------------------------
  await type(page, "SOLDADURA");
  await expect(prompt(page)).toContainText("Precise la junta (punta de la flecha)");
  await type(page, "2000,0");
  await expect(prompt(page)).toContainText("Precise el arranque de la línea de referencia");
  await type(page, "2500,300");
  await expect(prompt(page)).toContainText("Indique el tipo de soldadura");
  await type(page, "");
  await expect(prompt(page)).toContainText("Indique el lado");
  await type(page, "");
  await expect(prompt(page)).toContainText("Precise el tamaño");
  await type(page, "6");
  await expect(prompt(page)).toContainText("Precise la longitud del cordón");
  await type(page, "");
  await expect(prompt(page)).toContainText("¿Todo alrededor?");
  await type(page, "");
  await expect(prompt(page)).toContainText("¿Soldadura en obra?");
  await type(page, "");
  await expect(prompt(page)).toContainText("Escriba la nota de la cola");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("WELDSYMBOL: soldadura filete del lado de la flecha, tamaño 6 en (2000, 0).");

  // --- el acabado ------------------------------------------------------------------
  await type(page, "ACABADO");
  await expect(prompt(page)).toContainText("Indique el acabado");
  await type(page, "");
  await expect(prompt(page)).toContainText("Precise la rugosidad Ra en µm");
  await type(page, "");
  await expect(prompt(page)).toContainText("Indique la dirección de las estrías");
  await type(page, "");
  await expect(prompt(page)).toContainText("Precise el punto de apoyo sobre la superficie");
  await type(page, "3000,800");
  await expect(prompt(page)).toContainText("Ángulo de rotación");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("SURFACESYMBOL: acabado con arranque de material, Ra 3.2 µm en (3000, 800).");

  // --- lo que el servidor recibió -------------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  const block = saved.blocks.find((candidate) => candidate.id === "MECH-TORNILLO-M10x40");
  expect(block, "el bloque del tornillo").toBeTruthy();
  expect(block!.entities).toHaveLength(6);
  expect(block!.description).toBe("Tornillo hexagonal M10 × 40 · ISO 4017");
  const bolt = saved.entities.find((entity): entity is Extract<CadEntity, { type: "insert" }> => entity.type === "insert");
  expect(bolt?.block).toBe("MECH-TORNILLO-M10x40");
  expect([bolt!.insertion.x, bolt!.insertion.y, bolt!.scale.x]).toEqual([1000, 1000, 1]);

  const balloon = saved.entities.find((entity): entity is Extract<CadEntity, { type: "circle" }> => entity.type === "circle" && entity.context?.metadata?.mechanical === "balloon");
  expect(balloon, "el círculo del globo").toBeTruthy();
  expect(balloon!.context?.metadata).toEqual({ mechanical: "balloon", balloon: 1, balloonPart: "MECH-TORNILLO-M10x40", balloonTarget: bolt!.id });
  expect([balloon!.center.x, balloon!.center.y, balloon!.radius]).toEqual([1500, 1500, 120]);

  const table = saved.entities.find((entity): entity is CadTable => entity.type === "table");
  expect(table, "la lista de materiales").toBeTruthy();
  expect(cellTexts(table!, 1)).toEqual(["Pos.", "Cant.", "Denominación", "Norma", "Bloque"]);
  expect(cellTexts(table!, 2)).toEqual(["1", "1", "Tornillo hexagonal M10 × 40", "ISO 4017", "MECH-TORNILLO-M10x40"]);

  const dimension = saved.entities.find((entity): entity is Extract<CadEntity, { type: "dimension" }> => entity.type === "dimension");
  expect(dimension, "la cota").toBeTruthy();
  expect(dimension!.context?.metadata).toMatchObject({ tolerance: "deviation", toleranceUpper: 0.025, toleranceLower: 0, toleranceDecimals: 3, toleranceFit: "H7" });

  const weld = saved.entities.filter((entity) => entity.context?.metadata?.mechanical === "weld");
  expect(weld).toHaveLength(5);
  expect(weld[0].context?.metadata).toMatchObject({ weldType: "fillet", weldSide: "arrow", weldSize: 6, weldLength: 0, weldAllAround: false, weldField: false });
  const surface = saved.entities.filter((entity) => entity.context?.metadata?.mechanical === "surface");
  expect(surface).toHaveLength(5);
  expect(surface[0].context?.metadata).toEqual({ mechanical: "surface", surfaceType: "removal", surfaceRa: 3.2, surfaceLay: "" });
});
