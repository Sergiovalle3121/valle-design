import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { planarBodyVolume } from "../../src/lib/brep";
import { solid3dBody } from "../../src/lib/cad/solid3d-build";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";

/**
 * OLA E — STAIR, la escalera recta paramétrica, tecleada y guardada.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 1º
 * ARCHITECTURE): no había escaleras; se dibujaban a mano y el reparto lo
 * hacía el dibujante con la calculadora. Aquí se teclea como en AutoCAD
 * Architecture, con el lienzo enfocado:
 *
 *   STAIR ⏎ · 0,0 ⏎ · 1000,0 ⏎               → 14 × 171,4 / 287,1 (2400 de
 *                                               planta, Blondel), hacia +X
 *   ESCALERA ⏎ · A ⏎ · 3000 ⏎ · H ⏎ · 280 ⏎
 *            · 0,3000 ⏎ · 0,8000 ⏎          → 17 × 176,5 / 280, hacia +Y
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: la planta (contorno,
 * contrahuellas, subida, flecha y SUBE) y UN SOLID3D reeditable por
 * escalera cuyo volumen, recalculado por el kernel B-rep sobre el árbol
 * persistido, es el de la fórmula del dentado `ancho · h · c · (N − 1) · N / 2`.
 * Y que la orden DIJO los números en la línea de comandos.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
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
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(input).not.toBeFocused();
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
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 0");
  return backend;
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const log = (page: Page) => page.getByTestId("cad-command-line-log");
const count = (page: Page) => page.getByTestId("cad-native-document-count");
const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));

test("STAIR teclea la escalera recta: planta, sólido con el volumen del dentado y los números en la línea de comandos", async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);

  // --- con los defaults: 2400 de planta, ancho 1000, Blondel -----------------
  await type(page, "STAIR");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("punto de arranque de la escalera");
  await type(page, "0,0");
  await expect(prompt(page)).toContainText("dirección de subida");
  await type(page, "1000,0");
  await expect(prompt(page)).toBeHidden();
  // Contorno + 12 contrahuellas interiores + subida + flecha + SUBE + sólido.
  await expect(count(page)).toHaveText("Native 17");
  await expect(log(page)).toContainText("STAIR: 14 contrahuellas de 171.4 mm y 13 huellas de 287.1 mm; desarrollo 3,732.9 mm, ancho 1,000 mm; 2c + h = 630 mm.");

  // --- por el alias en español, con Altura y Huella tecleadas, hacia +Y --------
  await type(page, "ESCALERA");
  await expect(prompt(page)).toContainText("punto de arranque");
  await type(page, "A");
  await expect(prompt(page)).toContainText("altura a salvar");
  await type(page, "3000");
  await expect(prompt(page)).toContainText("punto de arranque");
  await type(page, "H");
  await expect(prompt(page)).toContainText("huella");
  await type(page, "280");
  await type(page, "0,3000");
  await expect(prompt(page)).toContainText("dirección de subida");
  await type(page, "0,8000");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 37");
  await expect(log(page)).toContainText("STAIR: 17 contrahuellas de 176.5 mm y 16 huellas de 280 mm; desarrollo 4,480 mm");

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities as CadEntity[];
  const solids = saved.filter((entity): entity is CadSolid3dEntity => entity.type === "solid3d");
  expect(solids).toHaveLength(2);
  expect(saved.filter((entity) => entity.type === "line")).toHaveLength(12 + 15);
  const labels = saved.filter((entity): entity is Extract<CadEntity, { type: "text" }> => entity.type === "text");
  expect(labels.map((label) => label.text)).toEqual(["SUBE", "SUBE"]);
  expect(labels[0].rotation ?? 0).toBe(0);
  expect(labels[1].rotation).toBeCloseTo(90, 6);

  const [first, second] = solids;
  expect(first.nodes).toHaveLength(1);
  expect(first.nodes[0].op).toBe("extrude");
  expect(first.name).toBe("Escalera 14 × 171.4 / 287.1 mm");
  const c1 = 2400 / 14;
  const h1 = 630 - 2 * c1;
  expect(volumeOf(first) / (1000 * h1 * c1 * ((13 * 14) / 2))).toBeCloseTo(1, 9);

  expect(second.nodes[0].op).toBe("extrude");
  expect(second.name).toBe("Escalera 17 × 176.5 / 280 mm");
  if (second.nodes[0].op === "extrude") expect(second.nodes[0].frame?.origin).toEqual({ x: 0, y: 3000, z: 0 });
  expect(volumeOf(second) / (1000 * 280 * (3000 / 17) * ((16 * 17) / 2))).toBeCloseTo(1, 9);
});
