/**
 * La COLOCACIÓN del plano DXF de fondo no se enviaba al subirlo.
 *
 * EL DEFECTO. Al importar, el editor calcula el encaje del plano en la planta
 * —escala para que quepa, y centrado— y lo guarda en `dxfMetaRef`. Pero lo
 * calculaba DESPUÉS del `PUT`, y el `PUT` no llevaba `placement`. El servidor,
 * cuando no recibe colocación, resetea a la suya por defecto: `scale: 1` en el
 * origen. Así que la pantalla mostraba el plano encajado y el servidor guardaba
 * otra cosa, y al recargar el plano saltaba de sitio y de escala.
 *
 * Sólo lo repescaba `propagateDxfPlacement`, que corre desde el guardado
 * HEREDADO — y ése no corre cuando hay `documentId`, o sea nunca en el estudio
 * moderno. Y había un segundo tapón: `putDxfRoute`, en el adaptador legacy→v1,
 * descartaba el campo `placement` aunque se enviara.
 *
 * La API ya lo aceptaba: no hay cambio de servidor ni de contrato. Comprobado
 * también contra la API REAL — con `placement` lo guarda exacto; sin él
 * devuelve `offsetX: 0, scale: 1`, que es justo lo que recibía el estudio.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/** Huella de la planta: 12 × 10 m. El plano de abajo mide 1000 × 500. */
const FOOTPRINT = {
  footprintW: 12_000,
  footprintH: 10_000,
  unit: "mm",
  gridSize: 100,
};

/** Un DXF mínimo pero real: una polilínea cerrada de 1000 × 500. */
const DXF = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "1000", "21", "0",
  "0", "LINE", "8", "0", "10", "1000", "20", "0", "11", "1000", "21", "500",
  "0", "LINE", "8", "0", "10", "1000", "20", "500", "11", "0", "21", "500",
  "0", "LINE", "8", "0", "10", "0", "20", "500", "11", "0", "21", "0",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, ...FOOTPRINT },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      {
        id: "planta-line",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 5_000, y: 1_000, z: 0 },
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["planta-line"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), FOOTPRINT);
}

test("el plano DXF se guarda con la colocación que el editor calculó, no con la de por defecto", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-planta-line")).toBeVisible();

  // Lo que se mide es el CUERPO de la subida: que lleve la colocación. Era
  // justo lo que faltaba, y sin ella el servidor aplica la suya por defecto.
  const upload = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      /\/dxf$/.test(new URL(request.url()).pathname),
    { timeout: 60_000 },
  );
  const storedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /\/dxf$/.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
  await page.getByTestId("cad-dxf-input").setInputFiles({
    name: "planta-cliente.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(DXF, "utf8"),
  });

  const body = (await upload).postDataJSON() as {
    name?: string;
    data?: string;
    placement?: Record<string, number | boolean>;
  };
  expect((await storedResponse).ok()).toBe(true);
  expect(body.name).toBe("planta-cliente.dxf");
  expect(body.data, "el DXF crudo sigue viajando").toContain("ENTITIES");

  const placement = body.placement;
  expect(
    placement,
    "la subida tiene que llevar la colocación: sin ella el servidor aplica scale 1 en el origen y el plano salta al recargar",
  ).toBeTruthy();

  // El encaje que calcula el editor: la escala mayor que quepa con 10 % de
  // margen, y centrado. Para 1000 × 500 en 12000 × 10000 manda el eje
  // horizontal — 12000/1000 · 0,9 = 10,8 — y el plano ocupa 10800 × 5400.
  expect(placement!.scale).toBeCloseTo(10.8, 6);
  expect(placement!.offsetX, "centrado en horizontal").toBeCloseTo(600, 6);
  expect(placement!.offsetY, "y en vertical").toBeCloseTo(2_300, 6);
  expect(placement!.rotation).toBe(0);
  expect(placement!.visible).toBe(true);

  // Y NO es la colocación por defecto del servidor, que es el defecto exacto.
  expect(placement!.scale).not.toBe(1);
  expect(placement!.offsetX).not.toBe(0);

  await expect(page.getByTestId("cad-native-entity-planta-line")).toBeVisible();
});
