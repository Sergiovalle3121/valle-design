/** Una entrega conserva una versión fechada mientras Compartir sigue al vivo. */
import { expect, test } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend, seedFootprint } from "../fixtures/cad-v1-backend";
import { installStandaloneIdentity, loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { readFile } from "node:fs/promises";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: "mm", gridSize: 100 };

function plan(label: string): CadDocument {
  const entities: CadDocument["entities"] = [
    { id: "sur", type: "wall", start: { x: 0, y: 0, z: 0 }, end: { x: 5_000, y: 0, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "este", type: "wall", start: { x: 5_000, y: 0, z: 0 }, end: { x: 5_000, y: 4_000, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "norte", type: "wall", start: { x: 5_000, y: 4_000, z: 0 }, end: { x: 0, y: 4_000, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "oeste", type: "wall", start: { x: 0, y: 4_000, z: 0 }, end: { x: 0, y: 0, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "nombre", type: "text", x: 2_000, y: 1_500, text: label, height: 180, layer: "0" },
  ];
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
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
  };
}

test("Entregar fija la versión y fecha; Compartir enseña la edición posterior", async ({ browser, context, page }) => {
  test.setTimeout(180_000);
  const backend = new CadV1Backend([{
    model: "AXOS-CAD-STUDIO", revision: "UNIVERSAL", name: "Casa Prueba",
    document: seedFootprint(plan("SALA") as unknown as Record<string, unknown>, FOOTPRINT),
    version: 1, footprint: FOOTPRINT,
  }]);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/studio/${DOCUMENT_ID}?cadUi=esencial`);
  await expect(page.getByTestId("cad-essential-bar")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Entregar", exact: true }).click();
  await expect(page.getByTestId("cad-essential-delivery-panel")).toBeVisible();
  await page.getByRole("button", { name: "Copiar enlace de entrega" }).click();
  const deliveryUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(deliveryUrl).toContain("/revision#cadReview=");
  expect(backend.reviewSessions[0]?.deliveredVersion).toBe(1);
  expect(backend.reviewSessions[0]?.allowComments).toBe(false);
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF con cajetín y QR" }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toBe("entrega-v1.pdf");
  expect((await readFile(await pdf.path())).subarray(0, 5).toString()).toBe("%PDF-");
  expect(backend.reviewSessions[1]).toMatchObject({ deliveredVersion: null, allowComments: false });
  const qrLiveUrl = new URL(`/revision#cadReview=${backend.reviewSessions[1].token}`, page.url()).toString();

  // El autor sigue trabajando: el enlace de entrega no cambia, Compartir sí.
  backend.replaceDocument("AXOS-CAD-STUDIO", "UNIVERSAL", seedFootprint(
    plan("COCINA") as unknown as Record<string, unknown>, FOOTPRINT,
  ), 2);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Compartir", exact: true }).click();
  await page.getByRole("button", { name: "Copiar enlace" }).click();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(backend.reviewSessions[2]?.allowComments).toBe(false);

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installMockBackend(guestContext);
  await installStandaloneIdentity(guestContext);
  await backend.install(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(deliveryUrl);
  await expect(guest.getByTestId("cad-review-delivery-date")).toContainText("Entregado el");
  await expect(guest.getByTestId("cad-review-text")).toContainText("SALA");
  await expect(guest.getByTestId("cad-review-text")).not.toContainText("COCINA");
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await guest.evaluate(() => document.documentElement.clientWidth),
  );
  await guest.goto(shareUrl);
  await expect(guest.getByTestId("cad-review-text")).toContainText("COCINA");
  await expect(guest.getByTestId("cad-review-delivery-date")).toHaveCount(0);
  await guest.goto(qrLiveUrl);
  await expect(guest.getByTestId("cad-review-text")).toContainText("COCINA");
  await guestContext.close();
});
