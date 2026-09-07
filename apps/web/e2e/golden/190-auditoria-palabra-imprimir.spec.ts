import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * CONTRAPRUEBA DEL ESCÉPTICO — «la palabra Imprimir no lleva a imprimir».
 *
 * Nació en e2e/auditoria/ (2026-09-01): la única entrada de la paleta con la
 * palabra era «Imprimir / Exportar», una FRASE del registro heredado que al
 * pulsarla respondía «Preview listo en el Copiloto CAD» —un panel que ya no
 * existe— y no sacaba nada. El 2026-09-06 (T-12) las entradas de frase se
 * retiraron de la paleta y PLOT ganó su resumen en español («Imprime la
 * lámina…»), así que la palabra lleva al comando de trazado, que es lo que
 * lleva en AutoCAD. Graduado ese día; desde entonces defiende:
 *   A. ¿SALE la palabra al buscarla? (PLOT, el comando del motor)
 *   B. ¿LLEVA a trazar cuando se pulsa? (arranca PLOT en la línea de comandos)
 *   C. Qué responde la línea de comandos a IMPRIMIR ⏎ (lectura, sin aserción)
 */

const FOOTPRINT = {
  footprintW: 12_000,
  footprintH: 10_000,
  unit: "mm",
  gridSize: 100,
};
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
    layers: [
      { id: "0", name: "0", color: "#111827", visible: true, locked: false },
    ],
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
  await installCadStudioBackend<CadDocument>(
    context,
    documentoSemilla(),
    FOOTPRINT,
  );
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
        if (texto && !ventana.__avisos!.includes(texto))
          ventana.__avisos!.push(texto);
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
  page.evaluate(
    () => (window as unknown as { __avisos?: string[] }).__avisos ?? [],
  );

/** Abre la paleta Ctrl+K y busca `texto`; devuelve lo que ofrece. */
async function buscarEnPaleta(page: Page, texto: string) {
  await page.getByTitle(/Paleta de comandos/).click();
  const buscador = page.getByPlaceholder(
    "Buscar comando, herramienta o símbolo...",
  );
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
test("A · buscar «imprimir» en la paleta Ctrl+K del estudio", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await anotarAvisos(page);

  const { filas } = await buscarEnPaleta(page, "imprimir");
  console.log(
    `[escéptico·palabra] «imprimir» ofrece: ${JSON.stringify(filas)}`,
  );

  const conLaPalabra = filas.filter((fila) => /imprim/i.test(fila));
  console.log(
    `[escéptico·palabra] filas con «imprim»: ${JSON.stringify(conLaPalabra)}`,
  );
  expect(
    conLaPalabra.length,
    "el buscador no ofrece nada con la palabra",
  ).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// B. ¿LLEVA al PDF?
// ---------------------------------------------------------------------------
test("B · pulsar la entrada «Imprimir» de la paleta arranca PLOT", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);
  await anotarAvisos(page);

  const { panel, filas } = await buscarEnPaleta(page, "imprimir");
  const conLaPalabra = filas.filter((fila) => /imprim/i.test(fila));
  expect(
    conLaPalabra.length,
    "el buscador no ofrece nada con la palabra",
  ).toBeGreaterThan(0);
  // Ninguna de las filas es la frase retirada: todas son del motor o herramientas.
  for (const fila of conLaPalabra)
    expect(fila, "una fila anuncia la frase retirada").not.toMatch(
      /Frase ·|COMMAND$/,
    );

  const entrada = panel
    .getByRole("button")
    .filter({ hasText: /imprim/i })
    .first();
  await expect(entrada).toBeVisible();
  const rótulo = (await entrada.innerText()).replace(/\s+/g, " ").trim();
  await entrada.click();

  // Lo que hace AutoCAD con la palabra: abrir el trazado. Aquí, PLOT toma la
  // línea de comandos y ofrece sus opciones; «Trazar» es la que saca el PDF.
  const linea = page.getByTestId("cad-command-line");
  await expect(linea).toContainText(/PLOT/i, { timeout: 15_000 });
  await expect(page.getByTestId("cad-command-keyword-Trazar")).toBeVisible({
    timeout: 15_000,
  });
  console.log(
    `[graduado·palabra] pulsada «${rótulo}» → PLOT en la línea · avisos=${JSON.stringify(await avisos(page))}`,
  );
});

// ---------------------------------------------------------------------------
// C. La otra vía en español: teclear IMPRIMIR en la línea de comandos.
// ---------------------------------------------------------------------------
test("C · teclear IMPRIMIR en la línea de comandos", async ({
  context,
  page,
}) => {
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
  console.log(
    `[escéptico·palabra] IMPRIMIR ⏎ → ${JSON.stringify(registro.slice(-400))}`,
  );
  // No se afirma nada aquí: es una lectura. La aserción es que el estudio
  // responde algo, para que quede el texto exacto en la corrida.
  expect(registro.length).toBeGreaterThan(0);
});
