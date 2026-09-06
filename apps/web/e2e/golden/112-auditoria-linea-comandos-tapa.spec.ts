import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { fitFootprint } from "../fixtures/camera-preset";
import { worldPoint } from "../fixtures/world-point";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * ESCÉPTICO: ¿la línea de comandos desplegada IMPIDE pinchar el dibujo?
 *
 * Se afirma que con un comando en curso el panel se monta sobre la banda baja
 * del lienzo y que el lado inferior del rectángulo «no se puede pinchar».
 * Aquí se mide: geometría del solape, quién responde en ese píxel, y el clic.
 */
const HUELLA_W = 12_000;
const HUELLA_H = 10_000;
const X0 = 3_000;
const Y0 = 2_500;
const X1 = 9_000;
const Y1 = 7_500;

function documentoConPlanta(): CadDocument {
  const planta: CadEntity = {
    id: "planta",
    type: "polyline",
    vertices: [
      { x: X0, y: Y0, z: 0 },
      { x: X1, y: Y0, z: 0 },
      { x: X1, y: Y1, z: 0 },
      { x: X0, y: Y1, z: 0 },
    ],
    closed: true,
    layer: "0",
  } as CadEntity;
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [planta],
    history: [],
    modelSpace: { entityIds: ["planta"] },
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

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documentoConPlanta(), {
    footprintW: HUELLA_W,
    footprintH: HUELLA_H,
    unit: "mm",
    gridSize: 100,
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

/** Quién responde de verdad en un píxel, según el navegador. */
async function quienResponde(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => {
    const arriba = document.elementFromPoint(px as number, py as number);
    if (!arriba) return "nada";
    const lienzo = document.querySelector('[data-testid="cad-canvas"]');
    if (lienzo && (arriba === lienzo || lienzo.contains(arriba))) {
      const dock = document.querySelector('[data-testid="cad-command-line"]');
      const dentroDelDock = dock && (arriba === dock || dock.contains(arriba));
      return dentroDelDock ? `DOCK: ${arriba.tagName}` : "EL LIENZO";
    }
    const conId = (arriba as HTMLElement).closest("[data-testid]") as HTMLElement | null;
    return conId ? `[data-testid="${conId.dataset.testid}"]` : arriba.tagName.toLowerCase();
  }, [x, y]);
}

test("¿el panel de la línea de comandos impide pinchar el dibujo?", async ({ context, page }) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await fitFootprint(page);

  // El píxel que el compañero dice que queda inalcanzable: la arista y=7500.
  const objetivo = await worldPoint(page, { x: (X0 + X1) / 2, y: Y1 });
  const lienzo = (await page.getByTestId("cad-canvas").boundingBox())!;
  console.log(`\nLIENZO: x=${lienzo.x} y=${lienzo.y} w=${lienzo.width} h=${lienzo.height}`);
  console.log(`OBJETIVO (mundo 6000,7500) -> pantalla (${objetivo.x}, ${objetivo.y})`);

  // Ahora se arranca el comando: el panel se despliega.
  await teclear(page, "EXTRUDE");
  await expect(page.getByTestId("cad-command-line")).toContainText(/contornos cerrados/i);

  const panel = (await page.getByTestId("cad-command-line").boundingBox())!;
  console.log(
    `PANEL desplegado: x=${panel.x}..${panel.x + panel.width} y=${panel.y}..${panel.y + panel.height}`,
  );

  const solapa =
    objetivo.x >= panel.x &&
    objetivo.x <= panel.x + panel.width &&
    objetivo.y >= panel.y &&
    objetivo.y <= panel.y + panel.height;
  console.log(`¿el objetivo cae DENTRO del rectángulo del panel? ${solapa}`);
  console.log(`¿quién responde en el objetivo? -> ${await quienResponde(page, objetivo.x, objetivo.y)}`);

  // Barrido de toda la banda del panel a la altura del objetivo, y del centro
  // del panel: ¿hay ALGÚN píxel del panel que se coma el ratón del lienzo?
  const muestras: string[] = [];
  for (const fy of [panel.y + 4, panel.y + panel.height * 0.25, panel.y + panel.height * 0.5, panel.y + panel.height * 0.75, panel.y + panel.height - 4]) {
    muestras.push(`y=${Math.round(fy)} -> ${await quienResponde(page, panel.x + panel.width / 2, fy)}`);
  }
  console.log(`BARRIDO VERTICAL en el centro del panel:\n  ${muestras.join("\n  ")}`);

  // LA PRUEBA DE VERDAD: pinchar ahí, con el comando en curso, y ver si designa.
  await page.mouse.click(objetivo.x, objetivo.y);
  await expect(
    page.getByTestId("cad-command-line"),
    "si el panel comiera el clic, EXTRUDE seguiría pidiendo contornos",
  ).toContainText(/altura de la extrusión/i);
  console.log("\nEL CLIC SOBRE LA BANDA DEL PANEL DESIGNÓ LA ENTIDAD: EXTRUDE pide altura.\n");
});

test("el orden original del compañero: worldPoint CON el comando ya arrancado", async ({ context, page }) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await fitFootprint(page);
  await teclear(page, "EXTRUDE");
  await expect(page.getByTestId("cad-command-line")).toContainText(/contornos cerrados/i);
  // Justo lo que él dice que tuvo que reordenar: muestrear el HUD con el
  // comando en curso. Si el panel se comiera el pointermove, esto reventaría.
  const objetivo = await worldPoint(page, { x: (X0 + X1) / 2, y: Y1 });
  console.log(`\nworldPoint CON EXTRUDE en curso convergió: (${objetivo.x}, ${objetivo.y})\n`);
  await page.mouse.click(objetivo.x, objetivo.y);
  await expect(page.getByTestId("cad-command-line")).toContainText(/altura de la extrusión/i);
});
