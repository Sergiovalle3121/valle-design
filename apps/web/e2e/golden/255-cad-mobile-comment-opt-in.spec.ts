/** Comentarios desde móvil sólo después de autorización expresa del autor. */
import { expect, test } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend, seedFootprint } from "../fixtures/cad-v1-backend";
import { openCollabDock } from "../fixtures/collab-dock";
import { installStandaloneIdentity, loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: "mm", gridSize: 100 };

function room(): CadDocument {
  const entities: CadDocument["entities"] = [
    { id: "sur", type: "wall", start: { x: 0, y: 0, z: 0 }, end: { x: 5_000, y: 0, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "este", type: "wall", start: { x: 5_000, y: 0, z: 0 }, end: { x: 5_000, y: 4_000, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "norte", type: "wall", start: { x: 5_000, y: 4_000, z: 0 }, end: { x: 0, y: 4_000, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "oeste", type: "wall", start: { x: 0, y: 4_000, z: 0 }, end: { x: 0, y: 0, z: 0 }, thickness: 250, height: 2_400, layer: "0" },
    { id: "nombre", type: "text", x: 2_000, y: 1_500, text: "SALA", height: 180, layer: "0" },
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

test("el autor habilita comentarios; el cliente comenta desde 390×844 y el autor lo ve", async ({ browser, context, page }) => {
  test.setTimeout(180_000);
  const backend = new CadV1Backend([{
    model: "AXOS-CAD-STUDIO", revision: "UNIVERSAL", name: "Casa Prueba",
    document: seedFootprint(room() as unknown as Record<string, unknown>, FOOTPRINT),
    version: 1, footprint: FOOTPRINT,
  }]);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await openCollabDock(page);

  const allowComments = page.getByTestId("cad-review-allow-comments");
  await expect(allowComments).not.toBeChecked();
  await page.getByTestId("cad-review-link-new").click();
  await expect(page.getByTestId("cad-review-link-issued")).toBeVisible();
  const viewOnlyUrl = (await page.getByTestId("cad-review-link-url").textContent())!.trim();
  expect(backend.reviewSessions[0]?.allowComments).toBe(false);

  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  await installMockBackend(guestContext);
  await installStandaloneIdentity(guestContext);
  await backend.install(guestContext);
  const viewer = await guestContext.newPage();
  await viewer.goto(viewOnlyUrl);
  await expect(viewer.getByTestId("cad-review-plan")).toBeVisible();
  await expect(viewer.getByTestId("cad-review-banner")).toContainText("SOLO VISTA");
  await expect(viewer.getByTestId("cad-collab-disabled")).toBeVisible();
  await expect(viewer.getByTestId("cad-collab-submit")).toHaveCount(0);

  await allowComments.check();
  await page.getByTestId("cad-review-link-new").click();
  await expect.poll(() => backend.reviewSessions.length).toBe(2);
  const commentUrl = (await page.getByTestId("cad-review-link-url").textContent())!.trim();
  expect(backend.reviewSessions[1]?.allowComments).toBe(true);
  await expect(allowComments).not.toBeChecked();

  const commenter = await guestContext.newPage();
  await commenter.goto(commentUrl);
  await expect(commenter.getByTestId("cad-review-plan")).toBeVisible();
  await expect(commenter.getByTestId("cad-review-banner")).toContainText("COMENTARIOS");
  await commenter.getByTestId("cad-collab-place").click();
  await commenter.getByTestId("cad-review-plan").click({ position: { x: 200, y: 180 } });
  await expect(commenter.getByTestId("cad-collab-pending-anchor")).toBeVisible();
  await commenter.getByTestId("cad-collab-draft").fill("La ventana debe abrir hacia dentro.");
  await commenter.getByTestId("cad-collab-submit").click();
  await expect.poll(() => backend.comments.rows.filter((row) => row.reviewSessionId === backend.reviewSessions[1].id).length).toBe(1);
  const comment = backend.comments.rows.find((row) => row.reviewSessionId === backend.reviewSessions[1].id)!;
  expect(comment.anchor).toMatchObject({ kind: "point", version: 1, space: "model" });
  await expect(page.getByTestId(`cad-collab-thread-${comment.id}`)).toBeVisible();
  await expect(page.getByTestId(`cad-collab-pin-${comment.id}`)).toBeVisible();
  expect(await commenter.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await commenter.evaluate(() => document.documentElement.clientWidth),
  );
  await guestContext.close();
});
