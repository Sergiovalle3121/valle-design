import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * ESCÉPTICO — la etiqueta «Seleccionar» de la barra de herramientas, medida.
 *
 * «Seleccionar» es la más larga de las dieciséis etiquetas de la paleta (11
 * caracteres) y el botón mide 56 px (`w-14`) menos el relleno. Sin un punto de
 * quiebre, una palabra sin espacios no se envuelve sola: el texto se salía del
 * botón por los dos lados y quedaba montado sobre lo que hubiera al lado — un
 * defecto de layout/tamaño, no de lógica (el `onClick` seguía funcionando).
 *
 * Se mide geometría real —`getBoundingClientRect` del icono, la etiqueta y el
 * botón que los contiene— en vez de una captura: una captura no distingue
 * "se ve apretado" de "se sale 8 px por cada lado".
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

/** Rectángulos de la caja del botón, su icono y su etiqueta de texto. */
async function medirBotonSeleccionar(page: Page) {
  const boton = page.getByTestId("cad-toolbar").getByRole("button", {
    name: "Seleccionar",
    exact: true,
  });
  await expect(boton).toBeVisible();
  return boton.evaluate((el) => {
    const boton = el.getBoundingClientRect();
    const iconoEl = el.querySelector("svg")!;
    const icono = iconoEl.getBoundingClientRect();
    // La etiqueta es el otro hijo directo de primer nivel con texto VISIBLE
    // — el tercer hijo es el tooltip, `hidden` hasta el hover, con caja
    // 0×0. Se compara por NODO (`child !== iconoEl`), no por rectángulo:
    // dos llamadas a `getBoundingClientRect()` devuelven objetos distintos
    // aunque midan lo mismo, así que comparar rectángulos nunca descarta
    // el propio icono.
    const etiquetaEl = Array.from(el.children).find((child) => {
      if (child === iconoEl) return false;
      const rect = child.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })!;
    const etiqueta = etiquetaEl.getBoundingClientRect();
    return {
      boton: { x: boton.x, y: boton.y, width: boton.width, height: boton.height },
      icono: { x: icono.x, y: icono.y, width: icono.width, height: icono.height },
      etiqueta: { x: etiqueta.x, y: etiqueta.y, width: etiqueta.width, height: etiqueta.height },
    };
  });
}

for (const viewport of [
  { width: 1280, height: 900, etiqueta: "escritorio ancho" },
  { width: 1280, height: 760, etiqueta: "ventana baja (rejilla a dos columnas)" },
  { width: 1024, height: 668, etiqueta: "tableta" },
]) {
  test(`«Seleccionar» no se sale de su botón ni se monta sobre el icono — ${viewport.etiqueta}`, async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStudio(context, page);

    const { boton, icono, etiqueta } = await medirBotonSeleccionar(page);
    // Margen de 1 px por redondeo de sub-píxel entre navegadores.
    const MARGEN = 1;

    expect(
      etiqueta.x,
      `la etiqueta empieza en x=${etiqueta.x}, el botón en x=${boton.x}`,
    ).toBeGreaterThanOrEqual(boton.x - MARGEN);
    expect(
      etiqueta.x + etiqueta.width,
      `la etiqueta termina en x=${etiqueta.x + etiqueta.width}, el botón en x=${boton.x + boton.width}`,
    ).toBeLessThanOrEqual(boton.x + boton.width + MARGEN);

    // El icono y la etiqueta no se pisan verticalmente: el icono termina
    // antes de que la etiqueta empiece.
    expect(
      icono.y + icono.height,
      `el icono (termina en y=${icono.y + icono.height}) se monta sobre la etiqueta (empieza en y=${etiqueta.y})`,
    ).toBeLessThanOrEqual(etiqueta.y + MARGEN);
  });
}

test("el botón «Seleccionar» sigue siendo pulsable y activa la herramienta", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await openStudio(context, page);
  const barra = page.getByTestId("cad-toolbar");
  const seleccionar = barra.getByRole("button", { name: "Seleccionar", exact: true });
  // "Encuadre" NO activa una herramienta distinta — comparte modo con
  // "Seleccionar" y sólo cambia qué hace arrastrar el fondo (ver el
  // comentario junto a `setToolMode` en `Layout3DEditor.tsx`), así que nunca
  // gana `bg-brand-strong`. "Distancia" sí activa un `toolMode` propio.
  const distancia = barra.getByRole("button", { name: "Distancia", exact: true });

  // "Seleccionar" es la herramienta activa al cargar: para probar el CLIC de
  // verdad (no sólo que la clase ya estuviera puesta) se activa otra primero.
  await distancia.click();
  await expect(distancia).toHaveAttribute("class", /bg-brand-strong/);
  await expect(seleccionar).not.toHaveAttribute("class", /bg-brand-strong/);

  await seleccionar.click();
  // El fix es de layout, no de lógica: el clic debe seguir funcionando.
  await expect(seleccionar).toHaveAttribute("class", /bg-brand-strong/);
  await expect(distancia).not.toHaveAttribute("class", /bg-brand-strong/);
});
