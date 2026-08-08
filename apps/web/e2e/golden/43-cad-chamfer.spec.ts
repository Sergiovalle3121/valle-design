/**
 * CHAMFER en el editor real, y la compuerta que FILLET tenía mal.
 *
 * EL HUECO. `cad-fillet.ts` redondea la esquina de dos líneas con un ARC
 * tangente y está cableado desde hace tiempo. Su gemela —cortar esa esquina con
 * un tramo recto— sólo existía para MUROS legacy, sobre otro modelo de datos.
 * Sobre las entidades canónicas no había CHAMFER de ninguna forma.
 *
 * LA COMPUERTA. Al abrir TRIM/EXTEND a círculos, arcos y polilíneas, los paneles
 * de esquina heredaron esa compuerta ancha: con una línea y un círculo
 * seleccionados aparecía «FILLET · 2 LINE», y al pulsarlo sólo salía un error.
 * Ofrecer una orden imposible es peor que no ofrecerla. Aquí se comprueba que
 * TRIM sigue disponible en esa selección y que los paneles de esquina NO.
 *
 * Lo que este golden añade al spec unitario: que el usuario llega a la orden y
 * que la geometría achaflanada —los dos recortes y el tramo nuevo— termina en
 * el documento que se persiste.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applyFieldGroup } from "../fixtures/dynamic-input";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

type CadLine = Extract<CadEntity, { type: "line" }>;

function canonicalDocument(): CadDocument {
  return {
    meta: {
      version: 1,
      schema: 3,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      // Dos muros que forman una esquina recta en (2000,2000).
      {
        id: "muro-h",
        type: "line",
        start: { x: 2_000, y: 2_000, z: 0 },
        end: { x: 6_000, y: 2_000, z: 0 },
        layer: "0",
      },
      {
        id: "muro-v",
        type: "line",
        start: { x: 2_000, y: 2_000, z: 0 },
        end: { x: 2_000, y: 6_000, z: 0 },
        layer: "0",
      },
      // Una rotonda suelta, sólo para comprobar la compuerta.
      {
        id: "rotonda",
        type: "circle",
        center: { x: 9_000, y: 5_000, z: 0 },
        radius: 800,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-h", "muro-v", "rotonda"] },
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
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

/** Selecciona dos entidades por el panel profesional, sin depender del lienzo. */
async function selectTwo(
  page: import("@playwright/test").Page,
  first: string,
  second: string,
) {
  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId("cad-quick-select-text");
  await query.fill(first);
  await page.getByTestId("cad-quick-select-apply").click();
  await page.getByTestId("cad-selection-operation-add").click();
  await query.fill(second);
  await page.getByTestId("cad-quick-select-apply").click();
  await expect(page.getByTestId("cad-selection-count")).toHaveText(
    "2 seleccionados",
  );
  await page.getByLabel("Cerrar panel profesional").click();
}

test("CHAMFER corta la esquina de dos líneas y lo persiste", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await selectTwo(page, "muro-h", "muro-v");

  await expect(
    page.getByTestId("cad-chamfer-control"),
    "con dos líneas seleccionadas el panel de CHAMFER tiene que estar disponible",
  ).toBeVisible();

  await applyFieldGroup(
    page,
    {
      "cad-chamfer-distance-a": "500",
      "cad-chamfer-distance-b": "800",
    },
    "cad-chamfer-apply",
  );

  await saveAndSettle(page, backend);

  const stored = backend.snapshot().document;
  const horizontal = stored.entities.find(
    (entity): entity is CadLine => entity.id === "muro-h" && entity.type === "line",
  );
  const vertical = stored.entities.find(
    (entity): entity is CadLine => entity.id === "muro-v" && entity.type === "line",
  );
  expect(horizontal, "el muro horizontal sigue siendo una línea").toBeTruthy();
  expect(vertical, "y el vertical también").toBeTruthy();

  // El extremo CERCANO al vértice (2000,2000) es el que se mueve, a D1 sobre la
  // primera línea y D2 sobre la segunda.
  expect(
    horizontal!.start.x,
    "la primera línea se recorta a D1 = 500 del vértice",
  ).toBeCloseTo(2_500, 6);
  expect(horizontal!.start.y).toBeCloseTo(2_000, 6);
  expect(horizontal!.end.x, "y su extremo lejano no se toca").toBeCloseTo(6_000, 6);
  expect(
    vertical!.start.y,
    "la segunda a D2 = 800: las distancias no se intercambian",
  ).toBeCloseTo(2_800, 6);
  expect(vertical!.start.x).toBeCloseTo(2_000, 6);
  expect(vertical!.end.y, "y su lejano tampoco").toBeCloseTo(6_000, 6);

  // El chaflán es una LÍNEA nueva que une los dos cortes.
  const chamfer = stored.entities.find(
    (entity): entity is CadLine =>
      entity.type === "line" &&
      entity.id !== "muro-h" &&
      entity.id !== "muro-v",
  );
  expect(chamfer, "el chaflán llega al documento como una entidad nueva").toBeTruthy();
  const ends = [chamfer!.start, chamfer!.end];
  expect(
    ends.some((point) => Math.abs(point.x - 2_500) < 1e-6 && Math.abs(point.y - 2_000) < 1e-6),
    "un extremo del chaflán coincide con el corte de la horizontal",
  ).toBe(true);
  expect(
    ends.some((point) => Math.abs(point.x - 2_000) < 1e-6 && Math.abs(point.y - 2_800) < 1e-6),
    "y el otro con el corte de la vertical",
  ).toBe(true);

  // La rotonda no participaba y no se toca.
  const rotonda = stored.entities.find((entity) => entity.id === "rotonda");
  expect(rotonda?.type).toBe("circle");
});

test("los paneles de esquina no se ofrecen cuando la esquina no existe", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");

  // Una línea y un círculo: TRIM sí tiene sentido —recortar el muro contra la
  // rotonda— pero achaflanar o redondear «la esquina» no, porque no hay dos
  // rectas que la formen.
  await selectTwo(page, "muro-h", "rotonda");

  await expect(
    page.getByTestId("cad-line-edit-control"),
    "TRIM/EXTEND sigue disponible contra una curva",
  ).toBeVisible();
  await expect(
    page.getByTestId("cad-fillet-control"),
    "FILLET no se ofrece con un círculo: antes aparecía y al pulsarlo sólo daba error",
  ).toHaveCount(0);
  await expect(
    page.getByTestId("cad-chamfer-control"),
    "y CHAMFER tampoco",
  ).toHaveCount(0);
});
