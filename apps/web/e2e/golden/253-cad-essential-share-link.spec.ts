/**
 * Compartir un dibujo desde Esencial debe necesitar dos gestos: emitir el
 * enlace y copiarlo. El invitado abre una revisión real, sin cuenta, en móvil.
 * El área se deriva de cuatro muros; no hay un MTEXT que pueda fingirla.
 */
import { expect, test } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend, seedFootprint } from "../fixtures/cad-v1-backend";
import {
  installStandaloneIdentity,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const FOOTPRINT = {
  footprintW: 12_000,
  footprintH: 9_000,
  unit: "mm",
  gridSize: 100,
};

function room(): CadDocument {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({
    id,
    type: "wall" as const,
    start: { x: start[0], y: start[1], z: 0 },
    end: { x: end[0], y: end[1], z: 0 },
    thickness: 250,
    height: 2_400,
    layer: "0",
  });
  const entities: CadDocument["entities"] = [
    wall("sur", [0, 0], [5_000, 0]),
    wall("este", [5_000, 0], [5_000, 4_000]),
    wall("norte", [5_000, 4_000], [0, 4_000]),
    wall("oeste", [0, 4_000], [0, 0]),
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

test("Compartir en Esencial abre en móvil un plano de solo lectura con m² derivados", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = new CadV1Backend([
    {
      model: "AXOS-CAD-STUDIO",
      revision: "UNIVERSAL",
      document: seedFootprint(room() as unknown as Record<string, unknown>, FOOTPRINT),
      version: 1,
      footprint: FOOTPRINT,
    },
  ]);

  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/studio/${DOCUMENT_ID}?cadUi=esencial`);
  await expect(page.getByTestId("cad-essential-bar")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Compartir", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compartir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copiar enlace" })).toBeVisible();
  await page.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(page.getByText("Enlace copiado")).toBeVisible();
  const enlace = await page.evaluate(() => navigator.clipboard.readText());
  expect(enlace).toContain("/revision#cadReview=");
  expect(backend.reviewSessions).toHaveLength(1);
  expect(backend.reviewSessions[0].allowComments).toBe(false);

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installMockBackend(guestContext);
  await installStandaloneIdentity(guestContext);
  await backend.install(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(enlace);
  await expect(guest.getByTestId("cad-review-banner")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => guest.getByTestId("cad-review-plan").locator("svg path").count()).toBeGreaterThan(0);
  await expect(guest.getByTestId("cad-review-room-area")).toContainText("SALA");
  await expect(guest.getByTestId("cad-review-room-area")).toContainText("20.00 m²");
  await expect(guest.getByTestId("cad-review-room-area"))
    .toHaveAttribute("aria-label", /20\.00 m².*17\.81 m²/);
  await expect(guest.getByTestId("cad-review-plan")).toBeVisible();
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await guest.evaluate(() => document.documentElement.clientWidth),
  );
  await guestContext.close();
});
