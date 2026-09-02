import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * CONTRAPRUEBA DEL ESCÉPTICO — «la palabra Imprimir no lleva a imprimir».
 *
 * El informe afirma que el ÚNICO texto «Imprimir» del estudio es «Imprimir
 * hoja» de la ayuda de atajos (que imprime la chuleta). Pero el estudio tiene
 * un BUSCADOR de comandos —el botón «Paleta de comandos (⌘K / Ctrl K) — busca
 * comandos, herramientas y símbolos», dos iconos a la izquierda del de la
 * impresora— y el registro heredado de frases trae una entrada cuya ETIQUETA
 * es literalmente «Imprimir / Exportar» (registry.ts:1087), indexada por
 * `buildCadPaletteEntries`. Si buscar «imprimir» ahí lleva al PDF, el hallazgo
 * es falso.
 *
 * Se comprueban las dos mitades por separado:
 *   A. ¿SALE la palabra al buscarla?
 *   B. ¿LLEVA al PDF cuando se pulsa?
 */

const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };
const NAVE = { x0: 1_000, y0: 1_000, x1: 11_000, y1: 9_000 };

function documentoSemilla(): CadDocument {
  const esquinas = [
    [NAVE.x0, NAVE.y0, NAVE.x1, NAVE.y0],
    [NAVE.x1, NAVE.y0, NAVE.x1, NAVE.y1],
    [NAVE.x1, NAVE.y1, NAVE.x0, NAVE.y1],
    [NAVE.x0, NAVE.y1, NAVE.x0, NAVE.y0],
  ];
  const entities = esquinas.map(([ax, ay, bx, by], index) => ({
    id: `muro-${index}`,
    type: "line" as const,
    start: { x: ax, y: ay, z: 0 },
    end: { x: bx, y: by, z: 0 },
    layer: "0",
  }));
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#111827", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
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
  await installCadStudioBackend<CadDocument>(context, documentoSemilla(), FOOTPRINT);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

/** Los avisos desaparecen solos; se anotan según salen. */
async function anotarAvisos(page: Page) {
  await page.evaluate(() => {
    const ventana = window as unknown as { __avisos?: string[] };
    if (ventana.__avisos) return;
    ventana.__avisos = [];
    const recoger = () => {
      document.querySelectorAll('[data-testid="app-toast"]').forEach((nodo) => {
        const texto = (nodo as HTMLElement).innerText.trim();
        if (texto && !ventana.__avisos!.includes(texto)) ventana.__avisos!.push(texto);
      });
    };
    new MutationObserver(recoger).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    recoger();
  });
}

const avisos = (page: Page) =>
  page.evaluate(() => (window as unknown as { __avisos?: string[] }).__avisos ?? []);

/** Abre la paleta Ctrl+K y busca `texto`; devuelve lo que ofrece. */
async function buscarEnPaleta(page: Page, texto: string) {
  await page.getByTitle(/Paleta de comandos/).click();
  const buscador = page.getByPlaceholder("Buscar comando, herramienta o símbolo...");
  await expect(buscador).toBeVisible();
  await buscador.fill(texto);
  const panel = buscador.locator("xpath=ancestor::div[2]");
  await page.waitForTimeout(300);
  const filas = (await panel.getByRole("button").allInnerTexts()).map((fila) =>
    fila.replace(/\s+/g, " ").trim(),
  );
  return { panel, filas };
}

// ---------------------------------------------------------------------------
// A. ¿SALE la palabra?
// ---------------------------------------------------------------------------
test("A · buscar «imprimir» en la paleta Ctrl+K del estudio", async ({ context, page }) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await anotarAvisos(page);

  const { filas } = await buscarEnPaleta(page, "imprimir");
  console.log(`[escéptico·palabra] «imprimir» ofrece: ${JSON.stringify(filas)}`);

  const conLaPalabra = filas.filter((fila) => /imprim/i.test(fila));
  console.log(`[escéptico·palabra] filas con «imprim»: ${JSON.stringify(conLaPalabra)}`);
  expect(conLaPalabra.length, "el buscador no ofrece nada con la palabra").toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// B. ¿LLEVA al PDF?
// ---------------------------------------------------------------------------
test("B · pulsar la entrada «Imprimir / Exportar» ¿saca el plano?", async ({
  context,
  page,
}) => {
  // HOY NO SACA NADA, y por eso se marca aquí dentro (a nivel de archivo
  // marcaría los tres). La entrada existe, dice «Imprimir», y al pulsarla el
  // producto responde «Preview listo en el Copiloto CAD.» — un aviso de ÉXITO
  // por un preview que se deposita en una caja que ya no se renderiza
  // (Layout3DEditor.tsx, comentario del caso «aisle»: «Precargaba una caja NL
  // que ya no se renderiza»). No hay PDF. El día que imprima, Playwright
  // avisará de que este test «pasó cuando se esperaba que fallara».
  test.fail();
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await anotarAvisos(page);

  // Se le da al producto la MEJOR situación posible: la hoja ya existe, así
  // que publicar sólo depende de que la entrada dispare la publicación.
  await test.step("hoja creada de antemano", async () => {
    await page.getByTitle(/Paquete de entrega/).click();
    await expect(page.getByTestId("cad-sheet-package")).toBeVisible();
    await page.getByRole("button", { name: "+ Hoja" }).click();
    await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");
    await page.getByLabel("Cerrar paquete de entrega").click();
    await expect(page.getByTestId("cad-sheet-package")).toHaveCount(0);
  });

  const { panel } = await buscarEnPaleta(page, "imprimir");
  const entrada = panel.getByRole("button").filter({ hasText: /Imprimir/i }).first();
  await expect(entrada).toBeVisible();
  const rótulo = (await entrada.innerText()).replace(/\s+/g, " ").trim();

  const descarga = page.waitForEvent("download", { timeout: 25_000 });
  await entrada.click();
  const archivo = await descarga.catch(() => null);
  await page.waitForTimeout(1_500);

  console.log(
    `[escéptico·palabra] pulsada «${rótulo}» · pdf=${archivo ? archivo.suggestedFilename() : "NO"} ` +
      `· avisos=${JSON.stringify(await avisos(page))}`,
  );
  expect(archivo, "la entrada «Imprimir» de la paleta no sacó ningún PDF").not.toBeNull();
});

// ---------------------------------------------------------------------------
// C. La otra vía en español: teclear IMPRIMIR en la línea de comandos.
// ---------------------------------------------------------------------------
test("C · teclear IMPRIMIR en la línea de comandos", async ({ context, page }) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await anotarAvisos(page);

  const entrada = page.getByTestId("cad-command-input");
  await entrada.click();
  await entrada.fill("IMPRIMIR");
  await entrada.press("Enter");
  await page.waitForTimeout(1_500);
  const registro = (await page.getByTestId("cad-command-line-log").innerText())
    .replace(/\s+/g, " ")
    .trim();
  console.log(`[escéptico·palabra] IMPRIMIR ⏎ → ${JSON.stringify(registro.slice(-400))}`);
  // No se afirma nada aquí: es una lectura. La aserción es que el estudio
  // responde algo, para que quede el texto exacto en la corrida.
  expect(registro.length).toBeGreaterThan(0);
});
