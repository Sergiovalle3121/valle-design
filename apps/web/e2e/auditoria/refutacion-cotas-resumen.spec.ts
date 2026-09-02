/**
 * ESCÉPTICO — ¿de verdad el cuadro de «Exportar a DXF» dice «Cotas 0» cuando el
 * dibujo lleva una cota?
 *
 * Plano MÍNIMO: una línea y UNA cota lineal nativa. Sin textos, sin notas, sin
 * nada que pueda confundir el recuento. Si el resumen dice «Cotas 0» y el
 * fichero descargado lleva una DIMENSION, el fallo no depende del resto del
 * recorrido del compañero.
 *
 * Y de paso: la casilla «Incluir cotas» — si desmarcarla no quita la cota del
 * fichero, el contador no es un nombre distinto, es un mando desconectado.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../src/lib/cad/cad-document";

function planoConUnaCota(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#60a5fa", visible: true, locked: false },
      { id: "COTAS", name: "COTAS", color: "#fbbf24", visible: true, locked: false },
    ],
    entities: [
      {
        id: "fachada-sur",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 9_000, y: 1_000, z: 0 },
        layer: "MUROS",
      },
      {
        id: "cota-fachada",
        type: "dimension",
        a: { x: 1_000, y: 1_000 },
        b: { x: 9_000, y: 1_000 },
        dimensionKind: "linear",
        axis: "x",
        offset: 600,
        layer: "COTAS",
      },
    ] as CadEntity[],
  });
}

async function descargar(page: Page): Promise<string> {
  const boton = page.getByTestId("cad-dxf-download");
  const primer = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
  await boton.click();
  let descarga = await primer;
  if (!descarga) {
    const manifiesto = page.getByTestId("cad-dxf-loss-manifest");
    await expect(manifiesto).toBeVisible();
    if ((await manifiesto.getAttribute("data-blocking")) === "true")
      await page.getByTestId("cad-dxf-loss-accept").check();
    const segundo = page.waitForEvent("download");
    await boton.click();
    descarga = await segundo;
  }
  const ruta = await descarga.path();
  expect(ruta).not.toBeNull();
  return readFile(ruta!, "utf8");
}

const cuentaDimension = (dxf: string) =>
  dxf.split(/\r?\n/).map((l) => l.trim()).filter((l) => l === "DIMENSION").length;

test("el resumen del cuadro de exportar cuenta la cota nativa", async ({ context, page }) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, planoConUnaCota(), {
    footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100,
  });

  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  await page.getByTitle(/Exportar a DXF/).click();
  await expect(page.getByTestId("cad-dxf-download")).toBeVisible();
  const cuadro = page.locator('[aria-labelledby="cad-exportar-dxf-titulo"]');

  const conCotas = await cuadro.innerText();
  console.log("\n===== CUADRO, «Incluir cotas» MARCADA =====\n" + conCotas);
  const dxfConCotas = await descargar(page);
  console.log("  DIMENSION en el fichero: " + cuentaDimension(dxfConCotas));

  expect.soft(cuentaDimension(dxfConCotas), "la cota no llegó al fichero").toBe(1);
  expect
    .soft(/Cotas\s*\n\s*0/.test(conCotas), "el resumen anuncia «Cotas 0» con una cota en el fichero")
    .toBe(false);

});

test("desmarcar «Incluir cotas» quita la cota nativa del fichero", async ({ context, page }) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, planoConUnaCota(), {
    footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  await page.getByTitle(/Exportar a DXF/).click();
  await expect(page.getByTestId("cad-dxf-download")).toBeVisible();
  const cuadro = page.locator('[aria-labelledby="cad-exportar-dxf-titulo"]');

  // Ahora el mando: desmarco «Incluir cotas».
  await page.getByLabel("Incluir cotas").uncheck();
  const sinCotas = await cuadro.innerText();
  console.log("\n===== CUADRO, «Incluir cotas» DESMARCADA =====\n" + sinCotas);
  const dxfSinCotas = await descargar(page);
  console.log("  DIMENSION en el fichero: " + cuentaDimension(dxfSinCotas));
  expect
    .soft(cuentaDimension(dxfSinCotas), "desmarqué «Incluir cotas» y la DIMENSION sigue en el fichero")
    .toBe(0);
});
