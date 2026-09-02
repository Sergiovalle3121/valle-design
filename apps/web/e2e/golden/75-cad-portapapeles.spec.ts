import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA D — el portapapeles de GEOMETRÍA CANÓNICA con las teclas de siempre.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, FRENTE 3):
 * Ctrl+C sobre una selección nativa DUPLICABA en el sitio, Ctrl+X no hacía
 * nada y el botón prometía «copia al portapapeles CAD». Este golden fija el
 * gesto entero contra el producto:
 *
 *   designar el muro · Ctrl+C          → «1 objeto(s) copiado(s) … punto base 1000, 1000»
 *   Ctrl+V · 8000,2000 ⏎               → una LINE nueva trasladada por (destino − base)
 *   designar el pilar · Ctrl+X         → el pilar desaparece («cortado(s)»)
 *   PASTEORIG ⏎                        → vuelve a sus coordenadas con id nuevo
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: la copia exacta a 7.000 ×
 * 1.000 del original, el original intacto, y el pilar cortado y repuesto.
 */
type CadLine = Extract<CadEntity, { type: "line" }>;
type CadCircle = Extract<CadEntity, { type: "circle" }>;

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#f59e0b", visible: true, locked: false },
    ],
    entities: [
      { id: "muro", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 3_000, y: 1_500, z: 0 }, layer: "MUROS" },
      { id: "pilar", type: "circle", center: { x: 6_000, y: 6_000, z: 0 }, radius: 300, layer: "0" },
    ],
    history: [],
    modelSpace: { entityIds: ["muro", "pilar"] },
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
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 2");
  return backend;
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const log = (page: Page) => page.getByTestId("cad-command-line-log");
const count = (page: Page) => page.getByTestId("cad-native-document-count");

/**
 * Designa desde la lista del editor, como haría cualquiera. La lista sólo se
 * muestra sin selección (medido en el golden 69): primero se suelta la que haya.
 */
async function designar(page: Page, id: string) {
  const soltar = page.getByTestId("cad-native-properties").getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
  await page.getByTestId(`cad-native-entity-${id}`).click();
  await expect(page.getByTestId("cad-native-properties")).toBeVisible();
}

/** Teclea en la caja de la línea de comandos y confirma. */
async function teclear(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
}

test("Ctrl+C, Ctrl+V, Ctrl+X y PASTEORIG mueven geometría canónica por el portapapeles", async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);

  // --- Ctrl+C: al portapapeles, no un duplicado en el sitio -------------------
  await designar(page, "muro");
  await page.keyboard.press("Control+c");
  await expect(log(page)).toContainText("1 objeto(s) copiado(s) al portapapeles; punto base 1000, 1000");
  await expect(count(page)).toHaveText("Native 2");

  // --- Ctrl+V: pide el punto de inserción y pega trasladado -------------------
  await page.keyboard.press("Control+v");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("punto de inserción (1 objeto(s))");
  await teclear(page, "8000,2000");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 3");

  // --- Ctrl+X: corta; PASTEORIG lo devuelve a su sitio ------------------------
  await designar(page, "pilar");
  await page.keyboard.press("Control+x");
  await expect(log(page)).toContainText("1 objeto(s) cortado(s) al portapapeles");
  await expect(count(page)).toHaveText("Native 2");
  await teclear(page, "PASTEORIG");
  await expect(count(page)).toHaveText("Native 3");

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const lines = saved.filter((entity): entity is CadLine => entity.type === "line");
  expect(lines).toHaveLength(2);
  const original = lines.find((entity) => entity.id === "muro");
  expect(original).toMatchObject({ start: { x: 1_000, y: 1_000 }, end: { x: 3_000, y: 1_500 } });
  const copy = lines.find((entity) => entity.id !== "muro");
  expect(copy, "la copia es una LINE nueva").toBeTruthy();
  // Punto base implícito = esquina inferior izquierda de la envolvente = (1000, 1000);
  // destino (8000, 2000) → traslación (7000, 1000).
  expect(copy).toMatchObject({ start: { x: 8_000, y: 2_000 }, end: { x: 10_000, y: 2_500 }, layer: "MUROS" });

  const circles = saved.filter((entity): entity is CadCircle => entity.type === "circle");
  expect(circles).toHaveLength(1);
  expect(circles[0].id, "el pilar repuesto es una entidad nueva").not.toBe("pilar");
  expect(circles[0]).toMatchObject({ center: { x: 6_000, y: 6_000 }, radius: 300 });
});
