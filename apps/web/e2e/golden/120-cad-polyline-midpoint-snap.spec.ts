/**
 * T-14 · El imán que devuelve un punto correcto con el nombre equivocado.
 *
 * Antes de este arreglo, `CadSnapKind` sólo tenía cinco valores y el puente en
 * `snap-scene.ts` repartía «todo lo demás → endpoints» (o, para el tramo de
 * una polilínea, hacia el cubo de puntos de control). Con MED encendido el
 * cursor SÍ se pegaba al medio de un tramo — la geometría estaba bien — pero
 * el HUD nunca anunciaba «medio», porque el adaptador declaraba ese punto
 * como `control`, no como `midpoint`. Este golden reproduce exactamente ese
 * gesto —MED, y sólo MED, sobre una POLILÍNEA— y afirma el rótulo, no sólo la
 * geometría: es la diferencia entre «el punto cae bien» y «el imán dice la
 * verdad sobre qué agarró».
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { enter3DView } from "../fixtures/view-mode";
import { worldPoint } from "../fixtures/world-point";

const cadDocument = {
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  entities: [
    {
      id: "muro-poligonal",
      type: "polyline",
      vertices: [
        { x: 2_000, y: 2_000, z: 0 },
        { x: 6_000, y: 2_000, z: 0 },
        { x: 6_000, y: 5_000, z: 0 },
      ],
      closed: false,
      layer: "0",
    },
  ],
  history: [],
  modelSpace: { entityIds: ["muro-poligonal"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

async function installCadBackend(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: cadDocument,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 },
  });
}

test("MED, y sólo MED, sobre un tramo de POLYLINE anuncia «medio» en el HUD", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible();
  await enter3DView(page);
  await page.getByTitle(/Vista superior/).click();
  await page.getByTitle(/Ajustar a la planta/).click();

  // Apaga los catorce y enciende SÓLO medio: si algún otro modo compitiera
  // por el mismo punto —«centro», «nodo»— este golden lo delataría en vez de
  // dar un falso verde por coincidencia.
  await page.getByTestId("cad-draft-status-settings").click();
  await expect(page.getByTestId("cad-draft-settings")).toBeVisible();
  await page.getByTestId("cad-osnap-none").click();
  await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText("0/14");
  await page.getByTestId("cad-osnap-mode-midpoint").check();
  await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText("1/14");
  await page.getByTestId("cad-draft-settings-close").click();

  await page.getByRole("button", { name: "Line", exact: true }).click();
  // Ancla lejos de la polilínea para no interferir con su propia designación.
  const anchor = await worldPoint(page, { x: 500, y: 8_000 });
  await page.mouse.click(anchor.x, anchor.y);

  // El medio real del primer tramo (2000,2000)-(6000,2000) es (4000,2000).
  const midpoint = await worldPoint(page, { x: 4_000, y: 2_000 });
  await page.mouse.move(midpoint.x, midpoint.y);
  const prompt = page.getByTestId("cad-live-prompt");
  await expect(prompt).toBeVisible();
  const text = (await prompt.textContent()) ?? "";
  await page.keyboard.press("Escape");

  expect(text).toContain("medio");
  expect(text).not.toContain("nodo");
  expect(text).not.toContain("centro");
});
