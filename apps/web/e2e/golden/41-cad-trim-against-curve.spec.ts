/**
 * TRIM de una línea contra un CÍRCULO, en el editor real.
 *
 * EL HUECO. `cad-line-edit.ts` resolvía dos rectas paramétricas a mano y exigía
 * que ambas entidades fuesen `line`; la compuerta de la interfaz
 * (`selectedNativeLineIds`) exigía lo mismo, así que seleccionando una línea y
 * un arco el panel de TRIM/EXTEND **ni siquiera aparecía**. En AutoCAD recortar
 * un muro contra una rotonda es un gesto de dos segundos.
 *
 * Y no era por falta de matemática: `intersect.ts` ya tenía
 * `lineCircleIntersections` y `lineArcIntersections`, correctas. Nadie las había
 * cableado.
 *
 * LO QUE ESTE GOLDEN AÑADE al spec unitario: que el usuario LLEGA a la orden
 * —el panel aparece con una línea y un círculo seleccionados— y que el recorte
 * termina en el documento que se persiste.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applySelectGroup } from "../fixtures/dynamic-input";
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
      // Una vía horizontal que atraviesa la rotonda de lado a lado: la corta
      // en x=3000 y en x=5000.
      {
        id: "via",
        type: "line",
        start: { x: 1_000, y: 3_000, z: 0 },
        end: { x: 7_000, y: 3_000, z: 0 },
        layer: "0",
      },
      {
        id: "rotonda",
        type: "circle",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius: 1_000,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["via", "rotonda"] },
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

test("TRIM recorta una línea contra un círculo y lo persiste", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  // Selección por el panel profesional: no depende del lienzo ni del ratón, y
  // es el camino que ya usa el golden 25 para seleccionar dos entidades.
  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId("cad-quick-select-text");
  await query.fill("via");
  await page.getByTestId("cad-quick-select-apply").click();
  await page.getByTestId("cad-selection-operation-add").click();
  await query.fill("rotonda");
  await page.getByTestId("cad-quick-select-apply").click();
  await expect(page.getByTestId("cad-selection-count")).toHaveText("2 seleccionados");
  await page.getByLabel("Cerrar panel profesional").click();

  // Antes esto no aparecía: la compuerta exigía DOS líneas.
  await expect(
    page.getByTestId("cad-line-edit-control"),
    "con una línea y un círculo el panel de TRIM tiene que estar disponible",
  ).toBeVisible();

  await applySelectGroup(
    page,
    {
      "cad-line-edit-operation": "trim",
      "cad-line-edit-target": "via",
      "cad-line-edit-endpoint": "start",
    },
    "cad-line-edit-apply",
  );

  await saveAndSettle(page, backend);

  const stored = backend.snapshot().document;
  const via = stored.entities.find(
    (entity): entity is CadLine => entity.id === "via" && entity.type === "line",
  );
  expect(via, "la vía sigue siendo una línea").toBeTruthy();
  expect(via!.start.x, "conservando el inicio, el inicio no se mueve").toBe(1_000);
  // Conservando el inicio se recorta en el PRIMER cruce: x = 4000 - 1000.
  expect(
    via!.end.x,
    "se recorta en el primer cruce con el círculo, no en el más lejano",
  ).toBeCloseTo(3_000, 6);
  expect(via!.end.y).toBeCloseTo(3_000, 6);

  // Y la rotonda no se toca.
  const rotonda = stored.entities.find((entity) => entity.id === "rotonda");
  expect(rotonda?.type).toBe("circle");
});
