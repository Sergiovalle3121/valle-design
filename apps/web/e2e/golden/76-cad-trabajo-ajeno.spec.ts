import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA D — el TRABAJO AJENO: las órdenes que faltaban para trabajar sobre un
 * plano que dibujó otro, medidas el 2026-09-01 (distancia-autocad-completo-
 * 20260901.md, FRENTE 3: «faltan SELECTSIMILAR, XPLODE, SETBYLAYER, CHPROP y
 * NCOPY»). Se teclean contra el producto, designando desde la lista:
 *
 *   ADDSELECTED sobre la línea roja · 0,9000 · 3000,9000 ⏎
 *       → una LINE nueva en MUROS y roja (CECOLOR llega al dibujo)
 *   SETBYLAYER sobre la línea roja   → pierde el color explícito
 *   SELECTSIMILAR sobre un eje · Ctrl+X → se cortan las TRES líneas de MUROS
 *       (no la de la capa 0 ni la polilínea); PASTEORIG las devuelve
 *   CHPROP · CApa · MUROS sobre la línea de la capa 0 → cambia de capa
 *   XPLODE · CApa · 0 sobre la polilínea → dos tramos en la capa 0
 *
 * Lo que se afirma es lo que el SERVIDOR recibió.
 */
type CadLine = Extract<CadEntity, { type: "line" }>;

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#f59e0b", visible: true, locked: false },
    ],
    entities: [
      { id: "eje", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 5_000, y: 1_000, z: 0 }, layer: "MUROS" },
      {
        id: "roja",
        type: "line",
        start: { x: 1_000, y: 2_000, z: 0 },
        end: { x: 5_000, y: 2_000, z: 0 },
        layer: "MUROS",
        context: { presentation: { color: { source: "explicit", value: "#ff0000" } } },
      },
      { id: "otro", type: "line", start: { x: 1_000, y: 3_000, z: 0 }, end: { x: 5_000, y: 3_000, z: 0 }, layer: "0" },
      {
        id: "contorno",
        type: "polyline",
        vertices: [{ x: 7_000, y: 1_000, z: 0 }, { x: 9_000, y: 1_000, z: 0 }, { x: 9_000, y: 3_000, z: 0 }],
        closed: false,
        layer: "MUROS",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["eje", "roja", "otro", "contorno"] },
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
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 4");
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

test("ADDSELECTED, SETBYLAYER, SELECTSIMILAR, CHPROP y XPLODE sobre un plano ajeno", async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);

  // --- ADDSELECTED: «uno como éste» — LINE con la capa y el color de la roja ---
  await designar(page, "roja");
  await teclear(page, "ADDSELECTED");
  await expect(log(page)).toContainText("ADDSELECTED: LINE con capa MUROS, color #ff0000");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("primer punto");
  await teclear(page, "0,9000");
  await teclear(page, "3000,9000");
  await page.keyboard.press("Enter");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 5");

  // --- SETBYLAYER: la roja vuelve a PorCapa ------------------------------------
  await designar(page, "roja");
  await teclear(page, "SETBYLAYER");
  await expect(count(page)).toHaveText("Native 5");

  // --- SELECTSIMILAR + Ctrl+X: las tres líneas de MUROS, y sólo ésas -----------
  await designar(page, "eje");
  await teclear(page, "SELECTSIMILAR");
  await expect(log(page)).toContainText("3 objeto(s) similares designados: mismo tipo (LINE) y misma capa");
  await page.keyboard.press("Control+x");
  await expect(log(page)).toContainText("3 objeto(s) cortado(s) al portapapeles");
  await expect(count(page)).toHaveText("Native 2");
  await teclear(page, "PASTEORIG");
  await expect(count(page)).toHaveText("Native 5");

  // --- CHPROP: la línea de la capa 0 pasa a MUROS desde el teclado -------------
  await designar(page, "otro");
  await teclear(page, "CHPROP");
  await expect(prompt(page)).toContainText("Precise la propiedad");
  await teclear(page, "CA");
  await expect(prompt(page)).toContainText("Nueva capa");
  await teclear(page, "MUROS");
  await expect(prompt(page)).toContainText("Cambios: capa MUROS");
  await page.keyboard.press("Enter");
  await expect(prompt(page)).toBeHidden();

  // --- XPLODE: la polilínea, en dos tramos y en la capa 0 -----------------------
  await designar(page, "contorno");
  await teclear(page, "XPLODE");
  await expect(prompt(page)).toContainText("opción para las piezas");
  await teclear(page, "CA");
  await expect(prompt(page)).toContainText("Capa de las piezas");
  await teclear(page, "0");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 6");

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved.filter((entity) => entity.type === "polyline")).toHaveLength(0);
  const lines = saved.filter((entity): entity is CadLine => entity.type === "line");
  expect(lines).toHaveLength(6);

  // ADDSELECTED: la línea nueva está en MUROS y es roja.
  const added = lines.find((entity) => entity.start.y === 9_000);
  expect(added).toMatchObject({ layer: "MUROS", end: { x: 3_000, y: 9_000 } });
  expect(added?.context?.presentation?.color).toEqual({ source: "explicit", value: "#ff0000" });

  // SETBYLAYER: la roja (repuesta por PASTEORIG con id nuevo) ya no lleva color propio.
  const roja = lines.find((entity) => entity.start.y === 2_000);
  expect(roja?.context?.presentation?.color).toBeUndefined();

  // SELECTSIMILAR + Ctrl+X + PASTEORIG: las tres de MUROS son entidades nuevas en el mismo sitio.
  for (const y of [1_000, 2_000, 9_000]) {
    const line = lines.find((entity) => entity.start.y === y);
    expect(line, `la línea a y = ${y} volvió`).toBeTruthy();
    expect(line?.id).not.toMatch(/^(eje|roja)$/);
    expect(line?.layer).toBe("MUROS");
  }

  // CHPROP: «otro» sigue siendo «otro» (no se cortó: estaba en la capa 0) y ahora está en MUROS.
  expect(lines.find((entity) => entity.id === "otro")).toMatchObject({ layer: "MUROS" });

  // XPLODE: dos tramos en la capa 0 donde estaba la polilínea.
  const pieces = lines.filter((entity) => entity.layer === "0");
  expect(pieces).toHaveLength(2);
  expect(pieces.map((entity) => [entity.start.x, entity.start.y, entity.end.x, entity.end.y]).sort()).toEqual([
    [7_000, 1_000, 9_000, 1_000],
    [9_000, 1_000, 9_000, 3_000],
  ]);
});
