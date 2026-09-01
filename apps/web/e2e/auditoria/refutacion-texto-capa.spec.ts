/**
 * ESCÉPTICO — ¿de verdad el TEXT sale en una capa inventada, o es la fixture?
 *
 * Reproducción MÍNIMA e independiente del spec del compañero: un plano con
 * UNA línea en MUROS y UN rótulo TEXT en NOTAS. Sin MTEXT, sin cota, sin
 * bloques, sin herramientas de dibujo. Se exporta por la puerta del producto
 * y se lee el fichero. Si el TEXT sale en «Text» aquí, no hay fixture rara
 * que lo explique.
 */
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../src/lib/cad/cad-document";

function plano(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#60a5fa", visible: true, locked: false },
      { id: "NOTAS", name: "NOTAS", color: "#22d3ee", visible: true, locked: false },
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
        id: "rotulo-sala",
        type: "text",
        x: 2_000, y: 4_500,
        text: "SALA DE JUNTAS",
        height: 250,
        layer: "NOTAS",
      },
    ] as CadEntity[],
  });
}

test("el TEXT de la capa NOTAS sale del exportador en la capa NOTAS", async ({ context, page }) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, plano(), {
    footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100,
  });

  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  await page.getByTitle(/Exportar a DXF/).click();
  await expect(page.getByTestId("cad-dxf-download")).toBeVisible();

  const cuadro = page.locator('[aria-labelledby="cad-exportar-dxf-titulo"]');
  const resumen = await cuadro.innerText();
  console.log("\n===== EL CUADRO DEL PRODUCTO =====\n" + resumen);

  const espera = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
  await page.getByTestId("cad-dxf-download").click();
  let descarga = await espera;
  let perdidas: string[] = [];
  if (!descarga) {
    await expect(page.getByTestId("cad-dxf-loss-manifest")).toBeVisible();
    perdidas = await page.getByTestId("cad-dxf-loss-row").allInnerTexts();
    if ((await page.getByTestId("cad-dxf-loss-manifest").getAttribute("data-blocking")) === "true")
      await page.getByTestId("cad-dxf-loss-accept").check();
    const segundo = page.waitForEvent("download");
    await page.getByTestId("cad-dxf-download").click();
    descarga = await segundo;
  } else if (await page.getByTestId("cad-dxf-loss-manifest").count()) {
    perdidas = await page.getByTestId("cad-dxf-loss-row").allInnerTexts();
  }
  const ruta = await descarga!.path();
  const dxf = await readFile(ruta!, "utf8");
  console.log("PÉRDIDAS DECLARADAS: " + JSON.stringify(perdidas));

  // Lectura directa del fichero: busco el bloque TEXT y leo su código 8.
  const lineas = dxf.split(/\r?\n/).map((l) => l.trim());
  let capaDelText: string | null = null;
  let contenido: string | null = null;
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    if (lineas[i] === "0" && lineas[i + 1] === "TEXT") {
      for (let j = i + 2; j + 1 < lineas.length && lineas[j] !== "0"; j += 2) {
        if (lineas[j] === "8") capaDelText ??= lineas[j + 1];
        if (lineas[j] === "1") contenido ??= lineas[j + 1];
      }
      if (contenido === "SALA DE JUNTAS") break;
      capaDelText = null; contenido = null;
    }
  }
  console.log(`TEXT «${contenido}» → capa=${capaDelText}`);
  expect(contenido, "el rótulo no llegó al fichero").toBe("SALA DE JUNTAS");
  expect(capaDelText, "el TEXT salió en una capa que el arquitecto nunca creó").toBe("NOTAS");
});
