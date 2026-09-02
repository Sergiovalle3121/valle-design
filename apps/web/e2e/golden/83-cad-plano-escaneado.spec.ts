import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { cadPngChecker } from "../../src/lib/cad/image-fixtures";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA H — el plano escaneado se ADJUNTA, se VE, se recorta y se atenúa, todo
 * tecleado, y todo llega al servidor.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 4º
 * RASTER): IMAGE insertaba un marco vacío que exigía un `asset://` que nadie
 * resolvía; no había píxeles, recorte ni ajuste. Aquí, con el lienzo
 * enfocado y un PNG de 8 × 4 px elegido por el selector del navegador:
 *
 *   IMAGEATTACH ⏎ · ⏎ (selector) · 1000,1000 ⏎ · 4000 ⏎ · ⏎   → la imagen dentro del dibujo, 500 mm por píxel
 *   Ctrl+A · ICL ⏎ · ⏎ · R ⏎ · 1500,1500 ⏎ · 4500,2500 ⏎     → recorte rectangular en píxeles
 *   Ctrl+A · IAD ⏎ · A ⏎ · 40 ⏎ · ⏎                          → atenuación 40
 *
 * Lo que se afirma: el visor cuenta 1 imagen con píxeles en pantalla
 * (`data-images` del indicador del pipeline), y el SERVIDOR recibió la
 * definición con su `data:image/png` y la entidad con recorte y atenuación.
 */
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

test("IMAGEATTACH, IMAGECLIP e IMAGEADJUST tecleados: la imagen se ve y llega al servidor con su data:, su recorte y su atenuación", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(count(page)).toHaveText("Native 0");

  // --- adjuntar por el selector del navegador -------------------------------------
  await type(page, "IMAGEATTACH");
  await expect(prompt(page)).toContainText("Elige el archivo de imagen");
  const chooser = page.waitForEvent("filechooser");
  await type(page, "");
  await (await chooser).setFiles([{ name: "plano.png", mimeType: "image/png", buffer: Buffer.from(cadPngChecker(8, 4)) }]);
  await expect(prompt(page)).toContainText("«plano.png» (8 × 4 px). Precise el punto de inserción");
  await type(page, "1000,1000");
  await expect(prompt(page)).toContainText("Precise el ancho de la imagen en unidades de dibujo");
  await type(page, "4000");
  await expect(prompt(page)).toContainText("Precise el ángulo de rotación");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 1");
  await expect(log(page)).toContainText("IMAGEATTACH: «plano.png» (8 × 4 px, 0 kB dentro del dibujo) en (1000, 1000); 1 px = 500 mm.");

  // --- se VE: el visor cuenta la imagen con sus píxeles ---------------------------
  const pipeline = page.getByTestId("cad-render-pipeline");
  await expect(pipeline).toHaveAttribute("data-pipeline", "batched");
  await expect(pipeline).toHaveAttribute("data-images", "1", { timeout: 30_000 });

  // --- recortar, por el alias de acad.pgp, con la imagen ya designada -----------
  // Ctrl+A designa todo lo nativo (la imagen es lo único que hay); la orden es
  // «command-first» y toma esa designación al arrancar, como JOIN en el golden 74.
  await page.keyboard.press("Control+a");
  await type(page, "ICL");
  await expect(prompt(page)).toContainText("Indique la opción de recorte", { timeout: 15_000 });
  await type(page, "");
  await expect(prompt(page)).toContainText("Indique el tipo de contorno");
  await type(page, "R");
  await expect(prompt(page)).toContainText("Precise la primera esquina del recorte");
  await type(page, "1500,1500");
  await expect(prompt(page)).toContainText("Precise la esquina opuesta");
  await type(page, "4500,2500");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("IMAGECLIP: recorte de 4 vértices en «plano.png».");

  // --- atenuar ---------------------------------------------------------------------
  await page.keyboard.press("Control+a");
  await type(page, "IAD");
  await expect(prompt(page)).toContainText("Brillo 50 · Contraste 50 · Atenuación 0", { timeout: 15_000 });
  await type(page, "A");
  await expect(prompt(page)).toContainText("Precise la atenuación (0 a 100)");
  await type(page, "40");
  await expect(prompt(page)).toContainText("Atenuación 40");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("IMAGEADJUST: «plano.png» brillo 50, contraste 50, atenuación 40.");
  await expect(pipeline).toHaveAttribute("data-images", "1");

  // --- lo que el servidor recibió -------------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  const definition = saved.imageDefinitions?.[0];
  expect(definition?.name).toBe("plano.png");
  expect(definition?.uri.startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
  expect([definition?.pixelWidth, definition?.pixelHeight]).toEqual([8, 4]);
  const image = saved.entities.find((entity): entity is Extract<CadEntity, { type: "image" }> => entity.type === "image");
  expect(image, "la entidad imagen").toBeTruthy();
  expect(image!.definition).toBe(definition!.id);
  expect([image!.uVector.x, image!.vVector.y]).toEqual([500, 500]);
  expect(image!.size).toEqual({ width: 8, height: 4 });
  expect(image!.clipBoundary).toEqual([{ x: 1, y: 1, z: 0 }, { x: 7, y: 1, z: 0 }, { x: 7, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }]);
  expect(image!.fade).toBe(40);
});
