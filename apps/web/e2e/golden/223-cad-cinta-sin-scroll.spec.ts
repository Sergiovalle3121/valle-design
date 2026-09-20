import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * LA CINTA DENSA — Ola 1 «cinta» (2026-09-19).
 *
 * ## Por qué existe este golden
 *
 * Medido en producción (`vallecad.com/demo`, 1440×825 CSS, una laptop de
 * 1366×768 con la barra del navegador): la pestaña Inicio sólo enseñaba 17
 * botones de comando de los 124 que tiene, porque catorce paneles declaraban
 * un botón GRANDE (4,25 rem) y el pequeño con rótulo medía 7 rem — ni de
 * lejos entraban en 1346 px. El número (17 → ≥45) lo afirma sin navegador
 * `ribbon-layout.spec.ts`; ÉSTE golden es la otra mitad — la prueba de que
 * un navegador real, con las clases reales de `CadRibbonButton.tsx`, llega a
 * la misma cifra sin desbordar la tira, y de que el botón pequeño DENSO
 * (sólo icono, `CAD_RIBBON_DENSE_METRICS.small` = 26 px) sigue teniendo su
 * nombre accesible aunque el rótulo ya no esté pintado — el requisito exacto
 * de la Ola 1 «cinta»: "`getByRole('button', { name: 'Línea' })` sigue
 * resolviendo".
 *
 * `214-cad-cinta-cabe-1366.spec.ts` ya prueba que ninguna pestaña se
 * desplaza y que LINE/CIRCLE/ARC/MOVE/COPY/ROTATE/TRIM/ERASE/LAYER están a
 * la vista; este archivo no repite esa cobertura — mide el CONTEO y el
 * escalón denso, que es lo nuevo de esta ola.
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

test("a 1366×768 Inicio enseña 45 comandos o más sin desplazar la tira (hoy son 17)", async ({ context, page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openStudio(context, page);

  await page.getByTestId("cad-ribbon-tab-inicio").click();
  const medida = await comandosVisibles(page, "inicio");
  expect(medida.scrollWidth, `la tira mide ${medida.scrollWidth}px en ${medida.clientWidth}px de ventana: se desplazaría`).toBeLessThanOrEqual(
    medida.clientWidth,
  );
  expect(medida.total, `Inicio enseña ${medida.total} comandos a 1366 px; el objetivo de la Ola 1 «cinta» es ≥45`).toBeGreaterThanOrEqual(45);

  const cinta = (await page.getByTestId("cad-ribbon").boundingBox())!;
  expect(cinta.height, "la cinta no cambia de alto con el escalón denso: sigue en ≤108 px").toBeLessThanOrEqual(108);
});

test("el botón pequeño denso pierde el rótulo a la vista pero conserva su nombre accesible", async ({ context, page }) => {
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
  await expect(boton, "denso: sin rótulo visible en el DOM").not.toContainText("Girar");
  await expect(boton, "el atributo que marca el escalón denso").toHaveAttribute("data-dense", "true");
  await expect(boton, "el ancho del botón denso es 1,625 rem (26 px)").toHaveCSS("width", "26px");

  // El requisito exacto del encargo: el localizador por NOMBRE accesible
  // sigue resolviendo aunque el rótulo ya no esté pintado — es EL MISMO
  // botón, no uno nuevo: los 86 ficheros de e2e que ya localizan comandos
  // por `getByRole('button', { name })` siguen valiendo tal cual.
  const porNombre = page.getByRole("button", { name: "Girar" });
  await expect(porNombre, "getByRole('button', { name: 'Girar' }) sigue resolviendo").toHaveCount(1);
  await expect(porNombre).toBeVisible();
  expect(await porNombre.getAttribute("data-testid"), "es el mismo botón, no un duplicado").toBe("cad-ribbon-command-ROTATE");
});
