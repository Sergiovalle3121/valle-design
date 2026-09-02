import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { fitFootprint } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

const X0 = 3_000, Y0 = 2_500, X1 = 9_000, Y1 = 7_500;

function doc(): CadDocument {
  const planta: CadEntity = {
    id: "planta", type: "polyline", closed: true, layer: "0",
    vertices: [
      { x: X0, y: Y0, z: 0 }, { x: X1, y: Y0, z: 0 },
      { x: X1, y: Y1, z: 0 }, { x: X0, y: Y1, z: 0 },
    ],
  } as CadEntity;
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [planta], history: [], modelSpace: { entityIds: ["planta"] },
    paperSpaces: [], styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  } as unknown as CadDocument;
}

async function teclear(page: Page, texto: string) {
  const e = page.getByTestId("cad-command-input");
  await e.click(); await e.fill(texto); await e.press("Enter");
}

test("mapa de opacidad al ratón del panel de la línea de comandos", async ({ context, page }) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, doc(), {
    footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  await fitFootprint(page);

  // UCS tiene palabras clave: así el panel muestra BOTONES, el otro trozo
  // que reactiva el ratón. EXTRUDE sólo tiene el diálogo y la entrada.
  await teclear(page, "EXTRUDE");
  await expect(page.getByTestId("cad-command-line")).toContainText(/contornos cerrados/i);

  const panel = (await page.getByTestId("cad-command-line").boundingBox())!;
  const entrada = (await page.getByTestId("cad-command-input").boundingBox())!;
  const lienzo = (await page.getByTestId("cad-canvas").boundingBox())!;
  console.log(`\nLIENZO   y=${lienzo.y.toFixed(0)}..${(lienzo.y + lienzo.height).toFixed(0)}  x=${lienzo.x}..${lienzo.x + lienzo.width}`);
  console.log(`PANEL    y=${panel.y.toFixed(1)}..${(panel.y + panel.height).toFixed(1)}  x=${panel.x.toFixed(0)}..${(panel.x + panel.width).toFixed(0)}`);
  console.log(`ENTRADA  y=${entrada.y.toFixed(1)}..${(entrada.y + entrada.height).toFixed(1)}  x=${entrada.x.toFixed(0)}..${(entrada.x + entrada.width).toFixed(0)}`);

  const quien = async (x: number, y: number) =>
    page.evaluate(([px, py]) => {
      const a = document.elementFromPoint(px as number, py as number);
      if (!a) return "nada";
      const dock = document.querySelector('[data-testid="cad-command-line"]');
      if (dock && (a === dock || dock.contains(a))) {
        const t = (a as HTMLElement).closest("[data-testid]") as HTMLElement | null;
        return `PANEL(${t?.dataset.testid ?? a.tagName})`;
      }
      const l = document.querySelector('[data-testid="cad-canvas"]');
      if (l && (a === l || l.contains(a))) return "lienzo";
      return (a as HTMLElement).tagName.toLowerCase();
    }, [x, y]);

  // Rejilla fina sobre TODO el rectángulo del panel.
  const filas: string[] = [];
  let opacos = 0, total = 0;
  for (let y = Math.ceil(panel.y); y <= panel.y + panel.height - 1; y += 4) {
    const celdas: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      const x = Math.round(panel.x + 2 + (panel.width - 4) * (i / 8));
      const q = await quien(x, y);
      total += 1;
      if (q.startsWith("PANEL")) opacos += 1;
      celdas.push(q === "lienzo" ? "." : q.startsWith("PANEL") ? "#" : "?");
    }
    filas.push(`y=${y}  ${celdas.join("")}`);
  }
  console.log(`\nREJILLA (. = pasa al lienzo, # = lo come el panel)\n${filas.join("\n")}`);
  console.log(`\nOPACOS ${opacos}/${total} muestras (${((100 * opacos) / total).toFixed(1)}%)`);
  console.log(`Banda del lienzo bajo el panel: ${panel.height.toFixed(0)} px de ${lienzo.height.toFixed(0)} px de alto.`);
  const filaEntrada = entrada.y + entrada.height / 2;
  console.log(`En el centro de la ENTRADA (y=${filaEntrada.toFixed(0)}): ${await quien(entrada.x + entrada.width / 2, filaEntrada)}`);
});
