import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * ESCÉPTICO — el aviso inferior y la línea de comandos, medidos.
 *
 * Ambos anclan a `bottom-3` dentro de `cad-canvas`. El aviso vive a la
 * derecha (`right-3`, viewport-hints.tsx:115) y la línea de comandos a la
 * izquierda (`left-3`, Layout3DEditor.tsx:14729). Si los anchos sumados
 * superan el ancho del lienzo, el aviso queda oculto detrás de la línea de
 * comandos (`z-30`, `pointer-events-none`).
 *
 * Este golden mide los dos rectángulos y afirma que su intersección es de
 * área cero. Si la aserción falla, el arreglo es reanclar el aviso, no
 * mover la línea de comandos.
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

test("el aviso inferior no se solapa con la línea de comandos a 1280×720", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);

  const hint = page.getByTestId("cad-viewport-hint");
  const cmdline = page.getByTestId("cad-command-line");

  await expect(cmdline).toBeVisible();
  // El aviso puede estar oculto en viewports pequeños (@max-[50rem]:hidden);
  // a 1280 px (80 rem) debe ser visible.
  await expect(hint).toBeVisible();

  const hintRect = await hint.boundingBox();
  const cmdRect = await cmdline.boundingBox();
  expect(hintRect, "el aviso inferior no tiene caja").not.toBeNull();
  expect(cmdRect, "la línea de comandos no tiene caja").not.toBeNull();

  const h = hintRect!;
  const c = cmdRect!;

  // Intersección en X
  const overlapX = Math.max(0, Math.min(h.x + h.width, c.x + c.width) - Math.max(h.x, c.x));
  // Intersección en Y
  const overlapY = Math.max(0, Math.min(h.y + h.height, c.y + c.height) - Math.max(h.y, c.y));
  const overlapArea = overlapX * overlapY;

  expect(
    overlapArea,
    `aviso inferior (${h.x},${h.y},${h.width}×${h.height}) se solapa ${overlapX}×${overlapY} px con línea de comandos (${c.x},${c.y},${c.width}×${c.height})`,
  ).toBe(0);
});
