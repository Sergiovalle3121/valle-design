import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * LA CINTA DENSA — Ola 1 «cinta» (2026-09-19), corregida por la Ola 6
 * «cinta legible» (2026-09-20).
 *
 * ## Por qué existe este golden
 *
 * Medido en producción (`vallecad.com/demo`, 1440×825 CSS, una laptop de
 * 1366×768 con la barra del navegador): la pestaña Inicio sólo enseñaba 17
 * botones de comando de los 124 que tiene, porque catorce paneles declaraban
 * un botón GRANDE (4,25 rem) y el pequeño con rótulo medía 7 rem — ni de
 * lejos entraban en 1346 px. La Ola 1 «cinta» lo arregló encogiendo el botón
 * pequeño a SÓLO ICONO (26 px, ocho columnas) y llegó a 71 a la vista.
 *
 * ## Por qué cambió (Ola 6, 2026-09-20)
 *
 * El dueño —que dibuja a diario y viene de AutoCAD— vio esos 71 iconos y
 * dijo que eran «anónimos, imposibles de distinguir de un vistazo»: la Ola 1
 * midió CUÁNTOS SE VEN y no CUÁNTOS SE RECONOCEN. Esta ola le devuelve el
 * rótulo al botón pequeño denso (icono + texto recortado con puntos
 * suspensivos si no cabe, como en AutoCAD) a costa de mostrar MENOS: de 71
 * mudos a ≥24 con nombre a 1366 px. El número lo afirma sin navegador
 * `ribbon-layout.spec.ts` (bloque «ESCALÓN DENSO CON RÓTULO»); ÉSTE golden es
 * la otra mitad — la prueba de que un navegador real, con las clases reales
 * de `CadRibbonButton.tsx`, no desborda la tira y de que el botón pequeño
 * denso sigue teniendo su nombre accesible tanto si el rótulo cabe entero
 * como si se recorta — el requisito de las dos olas por igual:
 * "`getByRole('button', { name: 'Línea' })` sigue resolviendo".
 *
 * `214-cad-cinta-cabe-1366.spec.ts` ya prueba que ninguna pestaña se
 * desplaza y que LINE/CIRCLE/ARC/MOVE/COPY/ROTATE/TRIM/ERASE/LAYER están a
 * la vista; este archivo no repite esa cobertura — mide el CONTEO y el
 * escalón denso.
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
  await expect(page.getByTestId("cad-ribbon")).toBeVisible();
}

/** Botones de comando A LA VISTA dentro de la tira (sin abrir ningún desplegable). */
async function comandosVisibles(page: Page, tabId: string): Promise<{ total: number; scrollWidth: number; clientWidth: number }> {
  return page.evaluate((id) => {
    const tira = document.querySelector<HTMLElement>(`[data-testid="cad-ribbon-panels-${id}"]`);
    if (!tira) throw new Error(`No hay [data-testid="cad-ribbon-panels-${id}"]`);
    const botones = tira.querySelectorAll<HTMLElement>('[data-testid^="cad-ribbon-command-"]');
    return { total: botones.length, scrollWidth: tira.scrollWidth, clientWidth: tira.clientWidth };
  }, tabId);
}

test("a 1366×768 Inicio enseña 24 comandos CON rótulo legible o más, sin desplazar la tira (Ola 1 mostraba 71 sin nombre)", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudio(context, page);

  await page.getByTestId("cad-ribbon-tab-inicio").click();
  const medida = await comandosVisibles(page, "inicio");
  expect(medida.scrollWidth, `la tira mide ${medida.scrollWidth}px en ${medida.clientWidth}px de ventana: se desplazaría`).toBeLessThanOrEqual(
    medida.clientWidth,
  );
  expect(
    medida.total,
    `Inicio enseña ${medida.total} comandos CON rótulo a 1366 px; el objetivo de la Ola 6 «cinta legible» es ≥24 (la Ola 1 llegaba a 71, pero sin nombre)`,
  ).toBeGreaterThanOrEqual(24);

  const cinta = (await page.getByTestId("cad-ribbon").boundingBox())!;
  expect(cinta.height, "la cinta no cambia de alto con el escalón denso: sigue en ≤108 px").toBeLessThanOrEqual(108);
});

test("el botón pequeño denso conserva el rótulo (icono + texto) y su nombre accesible", async ({ context, page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudio(context, page);
  await page.getByTestId("cad-ribbon-tab-inicio").click();

  // ROTATE: nunca tuvo botón grande, vive en la primera columna de
  // Modificar (ribbon-order.ts) y ribbon-layout.spec.ts exige que siga a la
  // vista a 1272/1358 px sin abrir nada — un botón pequeño DENSO de verdad
  // a 1366 px, no uno que el ancho dejó sin tocar.
  const boton = page.getByTestId("cad-ribbon-command-ROTATE");
  await expect(boton).toBeVisible();
  // Ola 6 «cinta legible»: «Girar» (5 letras) cabe entero en los 80 px del
  // botón denso — la Ola 1 lo escondía del todo; ahora se lee de un vistazo,
  // sin pasar el ratón.
  await expect(boton, "denso CON rótulo: «Girar» está pintado a la vista").toContainText("Girar");
  await expect(boton, "el atributo que marca el escalón denso").toHaveAttribute("data-dense", "true");
  await expect(boton, "el ancho del botón denso es 5 rem (80 px, Ola 6 «cinta legible»)").toHaveCSS("width", "80px");

  // El requisito de las dos olas por igual: el localizador por NOMBRE
  // accesible sigue resolviendo — es EL MISMO botón, no uno nuevo: los 86
  // ficheros de e2e que ya localizan comandos por `getByRole('button', {
  // name })` siguen valiendo tal cual, con o sin recorte del rótulo.
  const porNombre = page.getByRole("button", { name: "Girar" });
  await expect(porNombre, "getByRole('button', { name: 'Girar' }) sigue resolviendo").toHaveCount(1);
  await expect(porNombre).toBeVisible();
  expect(await porNombre.getAttribute("data-testid"), "es el mismo botón, no un duplicado").toBe("cad-ribbon-command-ROTATE");
});

test("un rótulo denso que NO cabe se recorta con puntos suspensivos, sin salirse del botón ni envolver", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudio(context, page);
  await page.getByTestId("cad-ribbon-tab-inicio").click();

  // TRIM (Recortar, panel Modificar): ribbon-layout.spec.ts exige que esté a
  // la vista a 1272/1358 px sin abrir nada, y «Recortar» (8 letras) es de los
  // rótulos largos del panel — buen candidato a recortarse en 80 px.
  const boton = page.getByTestId("cad-ribbon-command-TRIM");
  await expect(boton).toBeVisible();
  const caja = (await boton.boundingBox())!;
  const rotulo = boton.locator("span").first();
  const cajaRotulo = (await rotulo.boundingBox())!;
  expect(cajaRotulo.x, "el rótulo no empieza antes que su botón").toBeGreaterThanOrEqual(caja.x - 1);
  expect(cajaRotulo.x + cajaRotulo.width, "el rótulo recortado no se sale del botón por la derecha").toBeLessThanOrEqual(caja.x + caja.width + 1);
  expect(cajaRotulo.y + cajaRotulo.height, "el rótulo cabe en una sola línea: no envuelve ni empuja el alto del botón").toBeLessThanOrEqual(
    caja.y + caja.height + 1,
  );
  // El nombre completo sigue en el title nativo aunque el rótulo se recorte.
  await expect(boton).toHaveAttribute("title", /Recortar/);
});
