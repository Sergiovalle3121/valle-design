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
 * angostarlo. Este golden prueba el control que faltaba: un botón en la
 * propia cabecera del muelle que lo colapsa a un riel de 36 px (`w-9`) y lo
 * vuelve a abrir, con el ancho REAL medido en cada estado — y que la
 * preferencia sobrevive a un `reload`, como ya hacen las demás del workspace.
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
  await expect(muelle).toBeVisible();
  await expect(muelle).toHaveAttribute("data-collapsed", "false");
  await expect(muelle.getByText("Plantillas CAD")).toBeVisible();

  const anchoAbierto = (await muelle.boundingBox())!.width;
  // w-60 = 15rem = 240px a 16px/rem; se admite el redondeo del navegador.
  expect(anchoAbierto).toBeGreaterThan(200);

  const toggle = page.getByTestId("cad-left-dock-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await toggle.click();

  await expect(muelle).toHaveAttribute("data-collapsed", "true");
  const anchoColapsado = (await muelle.boundingBox())!.width;
  // w-9 = 2.25rem = 36px. El riel debe ser mucho más angosto que el panel
  // abierto — y debe liberar de verdad el ancho, no sólo cambiar una clase.
  expect(anchoColapsado).toBeLessThan(50);
  expect(anchoAbierto - anchoColapsado).toBeGreaterThan(150);
  await expect(muelle.getByText("Plantillas CAD")).toBeHidden();

  const toggleColapsado = page.getByTestId("cad-left-dock-toggle");
  await expect(toggleColapsado).toHaveAttribute("aria-expanded", "false");

  /* ── La preferencia persiste: sobrevive a un reload, como `leftDock` ──── */
  await page.reload();
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  const muelleTrasRecargar = page.getByTestId("cad-left-dock");
  await expect(muelleTrasRecargar).toHaveAttribute("data-collapsed", "true");
  const anchoTrasRecargar = (await muelleTrasRecargar.boundingBox())!.width;
  expect(anchoTrasRecargar).toBeLessThan(50);

  /* ── Y se puede volver a abrir ────────────────────────────────────────── */
  await page.getByTestId("cad-left-dock-toggle").click();
  await expect(muelleTrasRecargar).toHaveAttribute("data-collapsed", "false");
  await expect(muelleTrasRecargar.getByText("Plantillas CAD")).toBeVisible();
  const anchoReabierto = (await muelleTrasRecargar.boundingBox())!.width;
  expect(anchoReabierto).toBeGreaterThan(200);
});
