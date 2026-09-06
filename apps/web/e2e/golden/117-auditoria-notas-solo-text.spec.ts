/**
 * ESCÉPTICO — ¿se evapora del DXF una capa cuyo único contenido es un TEXT?
 *
 * Reproducción MÍNIMA de la primera pasada que el compañero describe: el plano
 * lleva geometría en MUROS, una cota en COTAS y UN SOLO rótulo TEXT en NOTAS
 * (sin MTEXT, que es lo que en el spec grande enmascara el síntoma).
 *
 * No se afirma nada sobre el receptor: sólo se contrasta lo que el CUADRO DE
 * EXPORTAR promete contra lo que la tabla LAYER del fichero descargado lleva.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../src/lib/cad/cad-document";

function plano(conMtext: boolean): CadDocument {
  const entities: CadEntity[] = [
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
      x: 2_000,
      y: 4_500,
      text: "SALA DE JUNTAS",
      height: 250,
      layer: "NOTAS",
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
  ] as CadEntity[];
  if (conMtext)
    entities.push({
      id: "rotulo-mtext",
      type: "mtext",
      insertion: { x: 6_000, y: 4_500, z: 0 },
      text: "NIVEL +0.00",
      height: 250,
      layer: "NOTAS",
    } as CadEntity);
  return migrateCadDocument({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#60a5fa", visible: true, locked: false },
      { id: "COTAS", name: "COTAS", color: "#fbbf24", visible: true, locked: false },
      { id: "NOTAS", name: "NOTAS", color: "#22d3ee", visible: true, locked: false },
    ],
    entities,
  });
}

function leerDxf(texto: string) {
  const lineas = texto.split(/\r?\n/).map((linea) => linea.trim());
  const capasDeLaTabla: string[] = [];
  const entidades: Array<{ tipo: string; capa?: string; texto?: string }> = [];
  let actual: { tipo: string; capa?: string; texto?: string } | null = null;
  let enTablaDeCapas = false;
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const codigo = lineas[i];
    const valor = lineas[i + 1];
    if (codigo === "0") {
      if (valor === "TABLE" || valor === "ENDTAB") enTablaDeCapas = false;
      actual = { tipo: valor };
      if (valor === "LAYER") enTablaDeCapas = true;
      else if (
        !["SECTION", "ENDSEC", "TABLE", "ENDTAB", "EOF", "SEQEND", "VERTEX", "APPID", "LTYPE", "STYLE"].includes(valor)
      )
        entidades.push(actual);
      continue;
    }
    if (!actual) continue;
    if (codigo === "2" && actual.tipo === "LAYER" && enTablaDeCapas) capasDeLaTabla.push(valor);
    if (codigo === "8") actual.capa = valor;
    if (codigo === "1" && (actual.tipo === "TEXT" || actual.tipo === "MTEXT")) actual.texto = valor;
  }
  return { capasDeLaTabla, entidades };
}

async function descargarDxf(page: Page) {
  const boton = page.getByTestId("cad-dxf-download");
  const manifiesto = page.getByTestId("cad-dxf-loss-manifest");
  const primer = page.waitForEvent("download", { timeout: 6_000 }).catch(() => null);
  await boton.click();
  let descarga = await primer;
  let perdidas: string[] = [];
  if (!descarga) {
    await expect(manifiesto).toBeVisible();
    perdidas = await page.getByTestId("cad-dxf-loss-row").allInnerTexts();
    if ((await manifiesto.getAttribute("data-blocking")) === "true")
      await page.getByTestId("cad-dxf-loss-accept").check();
    const segundo = page.waitForEvent("download");
    await boton.click();
    descarga = await segundo;
  } else if (await manifiesto.count()) {
    perdidas = await page.getByTestId("cad-dxf-loss-row").allInnerTexts();
  }
  const ruta = await descarga.path();
  expect(ruta, "no se entregó ningún fichero").not.toBeNull();
  return { texto: await readFile(ruta!, "utf8"), perdidas };
}

for (const conMtext of [false, true]) {
  test(`NOTAS ${conMtext ? "con TEXT + MTEXT" : "SÓLO con un TEXT"}: lo prometido vs la tabla LAYER`, async ({
    context,
    page,
  }) => {
    test.setTimeout(150_000);
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await installCadStudioBackend<CadDocument>(context, plano(conMtext), {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: "mm",
      gridSize: 100,
    });

    await page.goto("/legacy/studio");
    await expect(page.getByTestId("cad-canvas")).toBeVisible();
    if (await page.getByTestId("cad-guided-tour-skip").count())
      await page.getByTestId("cad-guided-tour-skip").click();

    await page.getByTitle(/Exportar a DXF/).click();
    await expect(page.getByTestId("cad-dxf-download")).toBeVisible();
    const cuadro = page.locator('[aria-labelledby="cad-exportar-dxf-titulo"]');
    const resumen = await cuadro.innerText();

    const { texto: dxf, perdidas } = await descargarDxf(page);
    const leido = leerDxf(dxf);

    console.log("\n===== CUADRO (conMtext=" + conMtext + ") =====\n" + resumen);
    console.log("===== PÉRDIDAS DECLARADAS (" + perdidas.length + ") =====");
    for (const fila of perdidas) console.log("  · " + fila.replace(/\s+/g, " "));
    console.log("===== TABLA LAYER DEL FICHERO =====");
    console.log("  " + JSON.stringify(leido.capasDeLaTabla));
    console.log("===== ENTIDADES DEL FICHERO =====");
    for (const e of leido.entidades)
      console.log(`  ${e.tipo} · capa=${e.capa ?? "?"}${e.texto ? " · «" + e.texto + "»" : ""}`);

    expect.soft(resumen, "el cuadro no prometió NOTAS").toContain("NOTAS");
    expect.soft(leido.capasDeLaTabla, "la tabla LAYER del fichero no lleva NOTAS").toContain("NOTAS");
    const rotulo = leido.entidades.find((e) => e.texto === "SALA DE JUNTAS");
    expect.soft(rotulo, "el TEXT no está en el fichero").toBeDefined();
    expect.soft(rotulo?.capa, "el TEXT salió en otra capa").toBe("NOTAS");
  });
}
