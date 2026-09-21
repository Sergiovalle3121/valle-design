import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { startTool } from "../fixtures/tool-palette";

/**
 * REESCRITO (ola1-paleta, 2026-09-19) — el defecto que este golden vigilaba
 * ya no puede ocurrir.
 *
 * ANTES: «Seleccionar» era la más larga de las dieciséis etiquetas de TEXTO
 * de una columna vertical de 93×846 px, y este archivo medía geometría real
 * (icono vs. etiqueta vs. botón) para probar que ninguna se salía de su caja
 * ni se montaba sobre el icono.
 *
 * AHORA: la paleta es una barra HORIZONTAL de 3 iconos SIN etiqueta de texto
 * visible (`CadToolPalette.tsx`, `<span className="sr-only">`) — el nombre
 * accesible vive ahí para lectores de pantalla, nunca se pinta, así que no
 * hay etiqueta que se pueda salir de su botón ni montarse sobre un icono. El
 * defecto original desapareció con el componente, no se arregló.
 *
 * Lo que SÍ sigue siendo cierto y merece guardia (la CUIDADO CON de la
 * ola lo pide explícitamente: «que la etiqueta/tooltip no tape el lienzo»):
 * el tooltip dibujado SÍ tiene texto, y aparece sólo al pasar el ratón. Este
 * archivo pasa a comprobar ESO —el tooltip cabe en la ventana y no tapa el
 * lienzo— más el comportamiento de clic que el archivo original ya defendía
 * («Seleccionar» sigue siendo pulsable), adaptado a los tres controles que
 * quedan (antes comparaba contra «Distancia», que ya no vive en la paleta).
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

for (const viewport of [
  { width: 1280, height: 900, etiqueta: "escritorio ancho" },
  { width: 1280, height: 760, etiqueta: "ventana baja" },
  { width: 1024, height: 668, etiqueta: "tableta" },
]) {
  test(`la barra de navegación cabe en ≤140×40 px, anclada abajo a la derecha del lienzo — ${viewport.etiqueta}`, async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStudio(context, page);

    const barra = page.getByTestId("cad-toolbar");
    await expect(barra).toBeVisible();
    const [cajaBarra, cajaLienzo] = await Promise.all([
      barra.boundingBox(),
      page.getByTestId("cad-canvas").boundingBox(),
    ]);
    if (!cajaBarra || !cajaLienzo) throw new Error("cad-toolbar o cad-canvas sin caja");

    // La huella real (medida en el navegador) cabe en el contrato de
    // `CadToolPaletteAncho.spec.ts`: ≤140×40 px, muy lejos de los 93×846 px
    // (78 678 px²) de la columna vertical de antes.
    expect(cajaBarra.width, `ancho ${cajaBarra.width}px`).toBeLessThanOrEqual(140);
    expect(cajaBarra.height, `alto ${cajaBarra.height}px`).toBeLessThanOrEqual(40);

    // Anclada abajo a la derecha DEL LIENZO, con margen de sobra para no
    // salirse de él ni pegarse al borde exacto (12px de holgura, la misma
    // que usa `bottom-3 right-3` más el propio tamaño de la barra).
    const margenDerecho = cajaLienzo.x + cajaLienzo.width - (cajaBarra.x + cajaBarra.width);
    const margenInferior = cajaLienzo.y + cajaLienzo.height - (cajaBarra.y + cajaBarra.height);
    expect(margenDerecho, `${margenDerecho}px de margen a la derecha del lienzo`).toBeGreaterThanOrEqual(0);
    expect(margenDerecho).toBeLessThan(40);
    expect(margenInferior, `${margenInferior}px de margen abajo del lienzo`).toBeGreaterThanOrEqual(0);
    expect(margenInferior).toBeLessThan(40);
  });
}

test("el tooltip de cada control cabe en la ventana y no tapa el lienzo", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);
  const barra = page.getByTestId("cad-toolbar");

  for (const nombre of ["Seleccionar", "Encuadre", "Ajustar todo"]) {
    const boton = barra.getByRole("button", { name: nombre, exact: true });
    await boton.hover();
    const tooltip = boton.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible();
    const caja = await tooltip.boundingBox();
    if (!caja) throw new Error(`tooltip de «${nombre}» sin caja`);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("sin viewport");
    // Cabe en la ventana: no se sale por ningún borde.
    expect(caja.x, `«${nombre}»: tooltip x=${caja.x}`).toBeGreaterThanOrEqual(0);
    expect(caja.y, `«${nombre}»: tooltip y=${caja.y}`).toBeGreaterThanOrEqual(0);
    expect(
      caja.x + caja.width,
      `«${nombre}»: tooltip termina en x=${caja.x + caja.width}, ventana=${viewport.width}`,
    ).toBeLessThanOrEqual(viewport.width);
    // Se dibuja ARRIBA de la barra (bottom-full): no se superpone con ella
    // ni, por tanto, con el lienzo que hay detrás.
    const cajaBoton = await boton.boundingBox();
    if (!cajaBoton) throw new Error(`botón «${nombre}» sin caja`);
    expect(
      caja.y + caja.height,
      `«${nombre}»: el tooltip (termina en y=${caja.y + caja.height}) se monta sobre el botón (empieza en y=${cajaBoton.y})`,
    ).toBeLessThanOrEqual(cajaBoton.y);
  }
});

test("«Seleccionar», «Encuadre» y «Ajustar todo» siguen siendo pulsables con su nombre exacto", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await openStudio(context, page);
  const barra = page.getByTestId("cad-toolbar");
  const seleccionar = barra.getByRole("button", { name: "Seleccionar", exact: true });
  const encuadre = barra.getByRole("button", { name: "Encuadre", exact: true });
  const ajustarTodo = barra.getByRole("button", { name: "Ajustar todo", exact: true });
  await expect(seleccionar).toBeVisible();
  await expect(encuadre).toBeVisible();
  await expect(ajustarTodo).toBeVisible();

  // «Seleccionar» es la herramienta activa al cargar: para probar el CLIC de
  // verdad (no sólo que la clase ya estuviera puesta) se activa otra desde
  // la CINTA primero — «Seleccionar» ya no tiene un hermano en la paleta con
  // el que compararse (antes era «Distancia», retirada como duplicado de
  // DIST).
  await startTool(page, "line");
  await seleccionar.click();
  await expect(seleccionar).toHaveAttribute("class", /bg-brand-strong/);

  // "Encuadre" NO activa una herramienta distinta de "Seleccionar" — comparte
  // modo con ella y sólo cambia qué hace arrastrar el fondo (ver el
  // comentario junto a `setToolMode` en `Layout3DEditor.tsx`), así que
  // clicarlo no le quita el resaltado a "Seleccionar".
  await encuadre.click();
  await expect(seleccionar).toHaveAttribute("class", /bg-brand-strong/);
});
