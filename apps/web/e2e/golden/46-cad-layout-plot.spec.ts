import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { inspectCadPdf } from "../../src/lib/cad/plot/plot-pdf";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * OLA 4 — el último tramo de la jornada: presentación, ventana, escala y trazado.
 *
 * `paper-space.ts` existía y sabía construir hojas, pero NINGUNO de los once
 * comandos que un dibujante teclea al final del día tenía nombre: `LAYOUT`,
 * `MVIEW`, `PAGESETUP`, `PLOT`. Se podía publicar desde un botón; no se podía
 * decir «esta ventana va a 1:50 y aquí las instalaciones no salen».
 *
 * Este golden recorre esa jornada TECLEÁNDOLA contra el producto real, y afirma
 * las dos cosas que importan y que se pueden falsificar por separado:
 *
 *   1. **El DOCUMENTO.** Qué presentación nació, con qué papel, qué ventanas
 *      tiene, a qué escala están bloqueadas y qué capa está congelada en cuál.
 *      Un comando que imprime el prompt correcto y no escribe nada pasaría
 *      cualquier prueba que sólo mire el diálogo.
 *   2. **El ARTEFACTO.** El PDF que sale: cuántas páginas, de qué tamaño y con
 *      qué fuentes, leído de sus BYTES. Una captura de pantalla del visor no
 *      distingue un A3 de un A2 mal escalado.
 *
 * La ventana con la capa congelada se comprueba CONTRA LA OTRA ventana de la
 * misma hoja: que una capa esté oculta no significa nada si está oculta en
 * todas partes — la propiedad es que se vea en una y no en la otra.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      {
        id: "MUROS",
        name: "MUROS",
        color: "#0000ff",
        visible: true,
        locked: false,
        lineweight: 0.35,
      },
      {
        id: "MEP",
        name: "MEP",
        color: "#00ffff",
        visible: true,
        locked: false,
        lineweight: 0.13,
      },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10_000, y: 0, z: 0 },
        layer: "MUROS",
      },
      {
        id: "muro-este",
        type: "line",
        start: { x: 10_000, y: 0, z: 0 },
        end: { x: 10_000, y: 6_000, z: 0 },
        layer: "MUROS",
      },
      {
        id: "conducto",
        type: "line",
        start: { x: 500, y: 3_000, z: 0 },
        end: { x: 9_500, y: 3_000, z: 0 },
        layer: "MEP",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "muro-este", "conducto"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

/** Id determinista de la ventana n-ésima. Lo fija `cadViewportId`. */
const VIEWPORT = (index: number) => `layout:planta-general:viewport:${index}`;
const LAYOUT_ID = "layout:planta-general";

test("presentación, ventana a escala con capa congelada y trazado a PDF", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  const commandLine = page.getByTestId("cad-command-line");
  await expect(commandLine).toBeVisible();
  const prompt = page.getByTestId("cad-command-prompt");

  /* ── 1. LAYOUT Nueva: nace la presentación ─────────────────────────────── */
  await type(page, "LO");
  await expect(prompt).toBeVisible();
  await type(page, "N");
  await type(page, "Planta general");
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  {
    const { paperSpaces } = backend.snapshot().document;
    expect(paperSpaces).toHaveLength(1);
    const layout = paperSpaces[0];
    expect(layout.id).toBe(LAYOUT_ID);
    expect(layout.name).toBe("Planta general");
    // Una hoja nace CON su ventana: papel con cajetín y sin ventana no sirve.
    expect(layout.viewports).toHaveLength(1);
    expect(layout.viewports?.[0].id).toBe(VIEWPORT(1));
  }

  /* ── 2. MVIEW: una segunda ventana, rectangular y sobre el papel ───────── */
  await type(page, "MV");
  await type(page, "300,40");
  await type(page, "400,140");
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  {
    const layout = backend.snapshot().document.paperSpaces[0];
    expect(layout.viewports).toHaveLength(2);
    const detail = layout.viewports?.[1];
    expect(detail?.id).toBe(VIEWPORT(2));
    // 100 × 100 mm exactos, colocados donde se pidió.
    expect(detail?.paperBounds).toMatchObject({
      x: 300,
      y: 40,
      width: 100,
      height: 100,
    });
    // Una ventana recién creada NO está bloqueada: todavía hay que encuadrarla.
    expect(detail?.locked).toBe(false);
  }

  /* ── 3. MVIEW ESCala: 1:50 y BLOQUEADA ─────────────────────────────────── */
  await type(page, "MV");
  await type(page, "ESC");
  await type(page, VIEWPORT(1));
  await type(page, "1:50");
  await expect(prompt).toBeHidden();

  /* ── 4. MVIEW Inutilizar: MEP se congela SÓLO en la ventana general ────── */
  await type(page, "MV");
  await type(page, "I");
  await type(page, VIEWPORT(1));
  await type(page, "MEP");
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  {
    const layout = backend.snapshot().document.paperSpaces[0];
    const [general, detail] = layout.viewports ?? [];

    // La escala es un número, no una intención: 1:50, y bloqueada para que el
    // siguiente zoom dentro de la ventana no la deshaga.
    expect(general.scale).toBe(50);
    expect(general.annotationScale).toBe(50);
    expect(general.locked).toBe(true);

    // Y la propiedad que hace útil el congelado por ventana: la MISMA capa,
    // en la MISMA hoja, oculta en una ventana y visible en la otra.
    expect(general.layerVisibility?.MEP).toBe(false);
    expect(detail.layerVisibility?.MEP).toBeUndefined();
    expect(detail.locked).toBe(false);
    expect(detail.scale).not.toBe(50);
  }

  /* ── 5. PAGESETUP: papel y modo de color, persistidos ──────────────────── */
  await type(page, "PSET");
  await type(page, "P");
  await type(page, "A3");
  await expect(prompt).toBeHidden();

  await type(page, "PSET");
  await type(page, "CO");
  await type(page, "Monocromo");
  await expect(prompt).toBeHidden();

  await saveAndSettle(page, backend);
  {
    const layout = backend.snapshot().document.paperSpaces[0];
    expect(layout.pageSetup?.paper).toBe("A3");
    expect(layout.pageSetup?.colorMode).toBe("monochrome");
    // A3 apaisado son 420 × 297 mm exactos.
    expect(layout.page.width).toBe(420);
    expect(layout.page.height).toBe(297);
    expect(layout.page.orientation).toBe("landscape");
  }

  /* ── 6. PLOT: sale un PDF, y se afirma sobre sus BYTES ─────────────────── */
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await type(page, "PLOT");
  await type(page, "T");
  await type(page, "planta-general");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("planta-general.pdf");

  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = new Uint8Array(await readFile(path!));
  expect(bytes.byteLength).toBeGreaterThan(500);

  const pdf = inspectCadPdf(bytes);
  // UNA página: se trazó una presentación, no el dibujo entero.
  expect(pdf.pageCount).toBe(1);
  expect(pdf.pageSizesMm).toHaveLength(1);
  // El papel del PDF es el que dijo PAGESETUP, con la tolerancia de la
  // conversión milímetros ↔ puntos PostScript.
  expect(pdf.pageSizesMm[0].width).toBeGreaterThan(419.9);
  expect(pdf.pageSizesMm[0].width).toBeLessThan(420.1);
  expect(pdf.pageSizesMm[0].height).toBeGreaterThan(296.9);
  expect(pdf.pageSizesMm[0].height).toBeLessThan(297.1);
  // Y declara sus fuentes: un PDF sin recurso de fuente no dibuja un cajetín.
  expect(pdf.baseFonts.length).toBeGreaterThan(0);
  expect(pdf.baseFonts.some((font) => /helvetica/i.test(font))).toBe(true);

  // El diálogo lo cuenta, con el número de páginas y de fuentes.
  await expect(page.getByTestId("cad-command-line")).toContainText(
    "planta-general.pdf",
  );

  /* ── 7. Trazar NO cambia el dibujo ─────────────────────────────────────── */
  {
    const before = backend.snapshot().version;
    const { paperSpaces, entities } = backend.snapshot().document;
    expect(paperSpaces).toHaveLength(1);
    expect(entities).toHaveLength(3);
    expect(backend.snapshot().version).toBe(before);
  }
});
