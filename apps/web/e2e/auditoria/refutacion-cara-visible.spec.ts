import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { enter3DView } from "../fixtures/view-mode";
import { isoView } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * ESCÉPTICO. ¿De verdad el sólido se pinta HUECO, o el compañero miró un estilo
 * alámbrico / una vista sin asentar?
 *
 * No se afirma nada aquí: se CAPTURA. El veredicto lo da el análisis de píxeles
 * de las capturas, fuera de esta prueba.
 */
const HUELLA_W = 12_000;
const HUELLA_H = 10_000;
const X0 = 3_000, Y0 = 2_500, X1 = 9_000, Y1 = 7_500, ALTURA = 3_000;
const SALIDA = process.env.ESC_OUT ?? "/tmp/esc";

function documentoConCaja(): CadDocument {
  const caja = {
    id: "cuerpo",
    type: "solid3d",
    layer: "0",
    root: "base",
    nodes: [{ id: "base", op: "box", min: { x: X0, y: Y0, z: 0 }, max: { x: X1, y: Y1, z: ALTURA } }],
  } as unknown as CadEntity;
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [caja],
    history: [],
    modelSpace: { entityIds: ["cuerpo"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documentoConCaja(), {
    footprintW: HUELLA_W, footprintH: HUELLA_H, unit: "mm", gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

async function teclear(page: Page, texto: string) {
  const entrada = page.getByTestId("cad-command-input");
  await entrada.click();
  await entrada.fill(texto);
  await entrada.press("Enter");
}

test("capturo la caja sombreada: iso, cursor sobre la cara y cara designada", async ({
  context, page,
}) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await enter3DView(page);
  await isoView(page);
  const lienzo = page.getByTestId("cad-canvas");
  await expect(lienzo).toBeVisible();
  // Que la vista se asiente: dos cuadros largos, no un `waitForTimeout` corto.
  await page.waitForTimeout(2_000);

  // El estilo visual vigente, dicho por el propio producto.
  await teclear(page, "VSCURRENT");
  const registro1 = await page.getByTestId("cad-command-line-log").innerText();
  console.log(`\n=== VSCURRENT ===\n${registro1.slice(-600)}\n`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await lienzo.screenshot({ path: `${SALIDA}/A-iso-reposo.png` });

  const caja = await lienzo.boundingBox();
  const centro = { x: caja!.x + caja!.width / 2, y: caja!.y + caja!.height / 2 };

  await teclear(page, "PRESSPULL");
  await expect(page.getByTestId("cad-command-line")).toContainText(/cara/i);
  await page.mouse.move(centro.x, centro.y);
  await page.waitForTimeout(800);
  await lienzo.screenshot({ path: `${SALIDA}/B-cursor-sobre-la-cara.png` });

  await page.mouse.click(centro.x, centro.y);
  await expect(page.getByTestId("cad-command-line")).toContainText(/distancia/i);
  await page.waitForTimeout(800);
  await lienzo.screenshot({ path: `${SALIDA}/C-cara-designada.png` });

  const registro2 = await page.getByTestId("cad-command-line-log").innerText();
  console.log(`\n=== PRESSPULL tras designar ===\n${registro2.slice(-800)}\n`);
});
