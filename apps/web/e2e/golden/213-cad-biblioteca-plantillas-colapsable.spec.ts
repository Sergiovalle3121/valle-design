import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * ESCÉPTICO — la biblioteca de plantillas se puede colapsar de verdad.
 *
 * El muelle izquierdo (`cad-left-dock`, con la tarjeta «Plantillas CAD» y
 * «Mis bloques») medía 240 px fijos (`w-60`) y la única forma de recuperar
 * ese espacio era la casilla «Biblioteca / capas» de «Workspace profesional»
 * — enterrada en un panel de ajustes, y que además lo OCULTA entero en vez de
 * angostarlo.
 *
 * Ola «armazón»: el control que faltaba ahora es EL RIEL (`cad-left-rail`,
 * `CadDockRail`, 44 px) — y el DEFAULT se invirtió: el muelle arranca
 * PLEGADO (`leftDockCollapsed: true`), como AutoCAD, no abierto. Este golden
 * prueba lo mismo que antes al revés: abrir el riel recupera el panel de
 * 280 px REAL, volver a pulsar el mismo icono lo pliega, y la preferencia
 * sobrevive a un `reload`.
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

test("el muelle de la biblioteca se colapsa a un riel y libera espacio real", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStudio(context, page);

  const muelle = page.getByTestId("cad-left-dock");
  const riel = page.getByTestId("cad-left-rail");
  const toggle = page.getByTestId("cad-rail-biblioteca");
  await expect(riel).toBeVisible();
  await expect(toggle).toBeVisible();

  // Arranca PLEGADO de fábrica (ola «armazón»): el riel mide <50 px y la
  // tarjeta no está en el DOM que se ve.
  await expect(muelle).toHaveAttribute("data-collapsed", "true");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const anchoRiel = (await riel.boundingBox())!.width;
  expect(anchoRiel).toBeLessThan(50);
  const anchoColapsado = (await muelle.boundingBox())!.width;
  expect(anchoColapsado).toBeLessThan(50);
  await expect(muelle.getByText("Plantillas CAD")).toBeHidden();

  await toggle.click();

  await expect(muelle).toHaveAttribute("data-collapsed", "false");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(muelle.getByText("Plantillas CAD")).toBeVisible();
  const anchoAbierto = (await muelle.boundingBox())!.width;
  // 280 px (`CAD_SHELL_METRICS.panel`); se admite el redondeo del navegador.
  expect(anchoAbierto).toBeGreaterThan(200);
  expect(anchoAbierto - anchoColapsado).toBeGreaterThan(150);
  // El riel SIGUE ahí, a su ancho propio — el panel se abre A SU LADO, no en
  // su lugar (máximo un panel abierto por lado, pero el riel es permanente).
  expect((await riel.boundingBox())!.width).toBeLessThan(50);

  /* ── La preferencia persiste: sobrevive a un reload, como `leftDock` ──── */
  await page.reload();
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  const muelleTrasRecargar = page.getByTestId("cad-left-dock");
  const toggleTrasRecargar = page.getByTestId("cad-rail-biblioteca");
  await expect(muelleTrasRecargar).toHaveAttribute("data-collapsed", "false");
  const anchoTrasRecargar = (await muelleTrasRecargar.boundingBox())!.width;
  expect(anchoTrasRecargar).toBeGreaterThan(200);

  /* ── Y se puede volver a plegar ───────────────────────────────────────── */
  await toggleTrasRecargar.click();
  await expect(muelleTrasRecargar).toHaveAttribute("data-collapsed", "true");
  await expect(muelleTrasRecargar.getByText("Plantillas CAD")).toBeHidden();
  const anchoRecolapsado = (await muelleTrasRecargar.boundingBox())!.width;
  expect(anchoRecolapsado).toBeLessThan(50);
});
