import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { planarBodyVolume } from "../../src/lib/brep";
import { solid3dBody } from "../../src/lib/cad/solid3d-build";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";

/**
 * OLA E — ROOF y SLAB sobre el perímetro de una planta, tecleados y guardados.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 1º
 * ARCHITECTURE): no había techos ni cubiertas. Aquí la planta trae su
 * perímetro (un RECTANG de 6.000 × 4.000) y se designa desde la lista, como
 * en el golden 76:
 *
 *   [perímetro] ROOF ⏎ · D ⏎ · ⏎     → cubierta a dos aguas, 30 %, alero 600
 *   [perímetro] LOSA ⏎ · 200 ⏎       → losa de 200 con la cara superior a 0
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: la planta de cubiertas
 * (contorno del alero, cumbrera, flechas y rótulos «30 %») y dos SOLID3D
 * cuyo volumen, recalculado por el kernel sobre el árbol persistido, es el
 * de la fórmula en papel — y que la orden DIJO los números.
 */
function seedDocument(): CadDocument {
  const entities: CadEntity[] = [
    {
      id: "perimetro",
      type: "polyline",
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 6_000, y: 0, z: 0 }, { x: 6_000, y: 4_000, z: 0 }, { x: 0, y: 4_000, z: 0 }],
      closed: true,
      layer: "0",
    },
  ];
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
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
  } as unknown as CadDocument;
}

/** Designa desde la lista de entidades (la lista se oculta mientras hay algo designado). */
async function designar(page: Page, id: string) {
  const soltar = page.getByTestId("cad-native-properties").getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
  await page.getByTestId(`cad-native-entity-${id}`).click();
  await expect(page.getByTestId("cad-native-properties")).toBeVisible();
}

/** Teclea en la caja de la línea de comandos y confirma. */
async function teclear(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  if (value) await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const log = (page: Page) => page.getByTestId("cad-command-line-log");
const count = (page: Page) => page.getByTestId("cad-native-document-count");
const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));

test("ROOF a dos aguas y SLAB sobre el perímetro: planta de cubiertas, dos sólidos con volumen en papel y los números dichos", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(count(page)).toHaveText("Native 1");

  // --- la cubierta ---------------------------------------------------------------
  await designar(page, "perimetro");
  await teclear(page, "ROOF");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("Intro para construirla");
  await teclear(page, "D");
  await expect(prompt(page)).toContainText("Cubierta a dos aguas");
  await teclear(page, "");
  await expect(prompt(page)).toBeHidden();
  // Perímetro + contorno del alero + cumbrera + 2 flechas (asta y barbas) + 2 rótulos + sólido.
  await expect(count(page)).toHaveText("Native 10");
  await expect(log(page)).toContainText("ROOF: cubierta a dos aguas sobre 6,000 × 4,000 mm con alero 600 mm (7,200 × 5,200), pendiente 30 %: cumbrera a +780 mm sobre la cota 0; 2 faldones, 14.6 m³ bajo cubierta.");

  // --- la losa, por el alias en español -----------------------------------------
  await designar(page, "perimetro");
  await teclear(page, "LOSA");
  await expect(prompt(page)).toContainText("espesor de la losa");
  await teclear(page, "200");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 11");
  await expect(log(page)).toContainText("SLAB: losa de 200 mm sobre 24 m², cara superior a la cota 0; 4.8 m³.");

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities as CadEntity[];
  expect(saved.find((entity) => entity.id === "perimetro"), "el perímetro se conserva").toBeTruthy();
  const solids = saved.filter((entity): entity is CadSolid3dEntity => entity.type === "solid3d");
  expect(solids).toHaveLength(2);
  const texts = saved.filter((entity): entity is Extract<CadEntity, { type: "text" }> => entity.type === "text");
  expect(texts.map((text) => text.text)).toEqual(["30 %", "30 %"]);
  expect(saved.filter((entity) => entity.type === "line")).toHaveLength(1);

  const [roof, slab] = solids;
  expect(roof.name).toBe("Cubierta a dos aguas 30 %");
  expect(roof.nodes[0].op).toBe("brep");
  const h = 0.3 * 2_600;
  expect(volumeOf(roof) / ((7_200 * 5_200 * h) / 2)).toBeCloseTo(1, 9);

  expect(slab.name).toBe("Losa 200 mm");
  expect(slab.nodes[0].op).toBe("extrude");
  if (slab.nodes[0].op === "extrude") {
    expect(slab.nodes[0].height).toBe(200);
    expect(slab.nodes[0].frame?.origin.z).toBe(-200);
  }
  expect(volumeOf(slab) / (6_000 * 4_000 * 200)).toBeCloseTo(1, 9);
});
