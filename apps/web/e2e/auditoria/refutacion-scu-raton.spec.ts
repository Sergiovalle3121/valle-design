import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { enter3DView } from "../fixtures/view-mode";
import { isoView } from "../fixtures/camera-preset";
import { startTool } from "../fixtures/tool-palette";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

const HUELLA_W = 12_000;
const HUELLA_H = 10_000;
const X0 = 3_000, Y0 = 2_500, X1 = 9_000, Y1 = 7_500, ALTURA = 3_000;

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

async function centro(page: Page) {
  const caja = await page.getByTestId("cad-canvas").boundingBox();
  return { x: caja!.x + caja!.width / 2, y: caja!.y + caja!.height / 2 };
}

// El mismo gesto, pero arrancando LINE DESDE LA PALETA (por id, no por rótulo)
// y con otros píxeles: si el fallo fuese del camino de teclado o de dos píxeles
// concretos, aquí no saldría.
test("ESCEPTICO: LINE desde la paleta, dos clics sobre la fachada con el SCU apoyado en ella", async ({
  context, page,
}) => {
  test.setTimeout(240_000);
  const backend = await abrirEstudio(context, page);
  await enter3DView(page);
  await isoView(page);
  await expect(page.getByTestId("cad-canvas")).toBeVisible();

  await teclear(page, "UCS");
  await page.getByTestId("cad-command-keyword-Cara").click();
  const c = await centro(page);
  await page.mouse.click(c.x, c.y);
  await page.getByTestId("cad-command-keyword-Aceptar").click();
  await expect(page.getByTestId("cad-command-line")).toContainText(/eje Z \(0, 1, 0\)/);

  // Herramienta por ID desde la paleta: el camino del ratón de punta a punta.
  await startTool(page, "line");
  await page.mouse.click(c.x + 40, c.y - 25);
  await page.mouse.click(c.x - 90, c.y + 55);
  await page.keyboard.press("Enter");

  const registro = await page.getByTestId("cad-command-line-log").innerText();
  console.log(`\n=== REGISTRO tras LINE con el ratón ===\n${registro.slice(-1200)}\n`);

  await saveAndSettle(page, backend);
  const guardado = backend.snapshot().document as unknown as CadDocument;
  const linea = guardado.entities.find((e) => e.type === "line") as
    | { start: { x: number; y: number; z?: number }; end: { x: number; y: number; z?: number } }
    | undefined;
  console.log(`\n=== LINEA GUARDADA ===\n${JSON.stringify(linea)}\n`);
  expect(linea, "los dos clics dejan una línea").toBeTruthy();
  for (const [i, p] of [linea!.start, linea!.end].entries()) {
    expect(p.y, `punto ${i + 1} (${p.x}, ${p.y}, ${p.z}) debería caer en la fachada y=${Y1}`).toBeCloseTo(Y1, 3);
    expect(p.z ?? 0, `punto ${i + 1} no puede quedar aplanado a cota 0`).toBeGreaterThan(1);
  }
});
