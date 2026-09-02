import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA E — el CUADRO DE SUPERFICIES con el nombre del local y el CUADRO DE
 * CARPINTERÍA, tecleados y guardados.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 1º
 * ARCHITECTURE): «un cuadro que dice L-03 en vez de Recámara principal no se
 * entrega a nadie». Aquí la planta trae dos locales cerrados por muros, un
 * rótulo TEXT dentro de cada uno —que es como se rotula en un despacho—, una
 * puerta y una ventana alojadas en muro:
 *
 *   DATAEXTRACTION ⏎ · S ⏎ · 9000,4000 ⏎   → cuadro de superficies con
 *                                             «RECÁMARA» y «BAÑO» y sus áreas
 *   DX ⏎ · P ⏎ · 9000,1000 ⏎               → cuadro de carpintería con
 *                                             P-090x210 y V-120x120 (antepecho 900)
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: dos TABLE con esas celdas.
 * Que el texto de las celdas salga en la lámina lo fija
 * `paper-space-table.spec.ts` leyendo los bytes del PDF.
 */
type CadTable = Extract<CadEntity, { type: "table" }>;

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id,
  type: "wall",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  thickness: 150,
  height: 2_400,
  layer: "MUROS",
});

function seedDocument(): CadDocument {
  const entities: CadEntity[] = [
    // 6.000 × 4.000 a ejes, con un tabique en x = 4.000: 16 m² y 8 m².
    wall("sur", 0, 0, 6_000, 0),
    wall("este", 6_000, 0, 6_000, 4_000),
    wall("norte", 6_000, 4_000, 0, 4_000),
    wall("oeste", 0, 4_000, 0, 0),
    wall("tabique", 4_000, 0, 4_000, 4_000),
    { id: "rotulo-recamara", type: "text", x: 2_000, y: 2_000, text: "RECÁMARA", height: 200, layer: "0" },
    { id: "rotulo-bano", type: "text", x: 5_000, y: 2_000, text: "BAÑO", height: 200, layer: "0" },
    { id: "p1", type: "opening", kind: "door", hostId: "sur", position: 2_000, width: 900, height: 2_100, sill: 0, swing: "left", hinge: "start", layer: "MUROS" },
    { id: "v1", type: "opening", kind: "window", hostId: "norte", position: 1_000, width: 1_200, height: 1_200, sill: 900, swing: "left", hinge: "start", layer: "MUROS" },
  ];
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#f59e0b", visible: true, locked: false },
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

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 14_000,
    footprintH: 8_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 9");
  return backend;
}

/** Teclea con el lienzo enfocado: la primera tecla enfoca la caja, Intro devuelve el foco. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await expect(input).not.toBeFocused();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(input).not.toBeFocused();
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const cellTexts = (table: CadTable, row: number) =>
  table.cells.filter((cell) => cell.row === row).sort((a, b) => a.column - b.column).map((cell) => cell.text);

test("DATAEXTRACTION Superficies y carPintería insertan los dos cuadros con el nombre de cada local", async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);

  // --- el cuadro de superficies -------------------------------------------------
  await type(page, "DATAEXTRACTION");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("Indique la salida");
  await type(page, "S");
  await expect(prompt(page)).toContainText("cuadro de superficies");
  await type(page, "9000,4000");
  await expect(prompt(page)).toBeHidden();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 10");

  // --- el cuadro de carpintería, por el alias ------------------------------------
  await type(page, "DX");
  await type(page, "P");
  await expect(prompt(page)).toContainText("cuadro de carpintería");
  await type(page, "9000,1000");
  await expect(prompt(page)).toBeHidden();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 11");

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const tables = saved.filter((entity): entity is CadTable => entity.type === "table");
  expect(tables).toHaveLength(2);

  const superficies = tables.find((table) => table.insertion.y === 4_000);
  expect(superficies, "el cuadro de superficies está en (9000, 4000)").toBeTruthy();
  expect(cellTexts(superficies!, 1)).toEqual(["Local", "Uso", "Área a ejes (m²)", "Área útil (m²)", "Perímetro (m)"]);
  // De mayor a menor área: la recámara (4 × 4 = 16 m²) y el baño (2 × 4 = 8 m²),
  // cada uno con el nombre de su rótulo y el uso que el clasificador reconoce.
  expect(cellTexts(superficies!, 2).slice(0, 3)).toEqual(["RECÁMARA", "Recámara", "16.00"]);
  expect(cellTexts(superficies!, 3).slice(0, 3)).toEqual(["BAÑO", "Baño", "8.00"]);

  const carpinteria = tables.find((table) => table.insertion.y === 1_000);
  expect(carpinteria, "el cuadro de carpintería está en (9000, 1000)").toBeTruthy();
  expect(cellTexts(carpinteria!, 1)).toEqual(["Marca", "Tipo", "Ancho (mm)", "Alto (mm)", "Antepecho (mm)", "Cant."]);
  expect(cellTexts(carpinteria!, 2)).toEqual(["P-090x210", "Puerta", "900", "2100", "0", "1"]);
  expect(cellTexts(carpinteria!, 3)).toEqual(["V-120x120", "Ventana", "1200", "1200", "900", "1"]);
});
