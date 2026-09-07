/**
 * AUDITORÍA — DESIGNAR EN 3D VA POR EL RAYO, NO POR LA SOMBRA (T-52, racimo B).
 *
 * El puente del motor de comandos definía `hitEntity` sobre el punto del
 * SUELO bajo el cursor y consultaba el índice 2D: con un comando pidiendo un
 * objeto, el clic sobre un sólido elevado designaba lo que hubiera bajo su
 * SOMBRA. El repositorio ya tenía el diagnóstico escrito en `solid-snap.ts`
 * y lo había resuelto para OSNAP; aquí se lleva el mismo arreglo a la
 * designación: `hitEntityAt` lanza el rayo de cámara contra la escena y va
 * antes que el pickbox del suelo.
 *
 * La escena: una LÍNEA en el suelo que pasa por el centro de la huella (donde
 * cae la sombra del centro del lienzo en la isométrica de la barra: cámara en
 * +0,6·d, +1,0·d y altura 0,85·d, mirando al centro) y una CAJA elevada
 * (z 2000-3000) colocada donde ese rayo la atraviesa. ERASE + clic en el
 * centro: tiene que borrarse la caja que se ve, no la línea bajo su sombra.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { enter3DView } from "../fixtures/view-mode";
import { isoView } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

const HUELLA_W = 12_000;
const HUELLA_H = 10_000;

function documento(): CadDocument {
  // La sombra del centro del lienzo cae en (6000, 5000, 0): sobre esta línea.
  const eje = {
    id: "eje-bajo-la-sombra",
    type: "line",
    layer: "0",
    start: { x: 5_000, y: 5_000, z: 0 },
    end: { x: 7_000, y: 5_000, z: 0 },
  } as unknown as CadEntity;
  // El rayo del centro sube hacia la cámara por (6000 + 0,6·s·d, 5000 + s·d,
  // 0,85·s·d): entre z = 2000 y 3000 pasa por x ≈ 7400-8100, y ≈ 7350-8550.
  const caja = {
    id: "cuerpo-elevado",
    type: "solid3d",
    layer: "0",
    root: "base",
    nodes: [
      {
        id: "base",
        op: "box",
        min: { x: 6_500, y: 6_500, z: 2_000 },
        max: { x: 9_500, y: 9_800, z: 3_000 },
      },
    ],
  } as unknown as CadEntity;
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [eje, caja],
    history: [],
    modelSpace: { entityIds: [eje.id, caja.id] },
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

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documento(), {
    footprintW: HUELLA_W,
    footprintH: HUELLA_H,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

async function teclear(page: Page, texto: string) {
  const entrada = page.getByTestId("cad-command-input");
  await entrada.click();
  await entrada.fill(texto);
  await entrada.press("Enter");
}

test("ERASE + clic sobre un sólido elevado borra el sólido que se ve, no la línea bajo su sombra", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 2");
  await enter3DView(page);
  await isoView(page);
  await expect(page.getByTestId("cad-canvas")).toBeVisible();

  const caja = await page.getByTestId("cad-canvas").boundingBox();
  const centro = { x: caja!.x + caja!.width / 2, y: caja!.y + caja!.height / 2 };
  const prompt = page.getByTestId("cad-command-prompt");
  await teclear(page, "ERASE");
  await expect(prompt).toContainText("Designe");
  await page.mouse.click(centro.x, centro.y);
  await expect(prompt, "ERASE termina al designar").toBeHidden();

  await saveAndSettle(page, backend);
  const guardado = backend.snapshot().document as unknown as CadDocument;
  const ids = guardado.entities.map((entidad) => entidad.id);
  expect(ids, "la caja que se VE es la que se borra").not.toContain("cuerpo-elevado");
  expect(ids, "la línea bajo la sombra del cursor sigue ahí").toContain("eje-bajo-la-sombra");
});
