/**
 * TRIM de un ARCO en el editor real: la otra mitad de la orden.
 *
 * EL HUECO. El PR anterior abrió la FRONTERA a círculos y arcos, pero el
 * OBJETIVO seguía teniendo que ser una línea: `applyCadLineEdit` buscaba el
 * objetivo con `entity.type === 'line'` y la compuerta de la interfaz exigía que
 * al menos una de las dos entidades lo fuese.
 *
 * Recortar un arco es OTRA operación: no mueve `start`/`end` sino
 * `startAngle`/`endAngle`, y hay que decidir cuál de los dos extremos angulares
 * se mueve. Conservando el inicio se corta en el primer cruce avanzando por el
 * barrido (antihorario desde `startAngle`) y se acorta `endAngle`.
 *
 * Aquí se comprueba que el usuario LLEGA a la orden y que el ángulo recortado
 * termina en el documento persistido — no sólo que la función pura acierta.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applySelectGroup } from "../fixtures/dynamic-input";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

type CadArc = Extract<CadEntity, { type: "arc" }>;

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
      // Semicírculo superior de radio 1000 centrado en (4000,3000).
      {
        id: "curva",
        type: "arc",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius: 1_000,
        startAngle: 0,
        endAngle: 180,
        layer: "0",
      },
      // Vertical por x = 4500: corta la curva en 60° (y también en −60°, que
      // queda FUERA del barrido y por tanto no cuenta).
      {
        id: "tope",
        type: "line",
        start: { x: 4_500, y: 1_000, z: 0 },
        end: { x: 4_500, y: 5_000, z: 0 },
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["curva", "tope"] },
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

test("TRIM recorta un ARCO por su ángulo y lo persiste", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId("cad-quick-select-text");
  await query.fill("curva");
  await page.getByTestId("cad-quick-select-apply").click();
  await page.getByTestId("cad-selection-operation-add").click();
  await query.fill("tope");
  await page.getByTestId("cad-quick-select-apply").click();
  await expect(page.getByTestId("cad-selection-count")).toHaveText("2 seleccionados");
  await page.getByLabel("Cerrar panel profesional").click();

  await expect(
    page.getByTestId("cad-line-edit-control"),
    "con un arco como objetivo el panel de TRIM tiene que estar disponible",
  ).toBeVisible();

  await applySelectGroup(
    page,
    {
      "cad-line-edit-operation": "trim",
      "cad-line-edit-target": "curva",
      "cad-line-edit-endpoint": "start",
    },
    "cad-line-edit-apply",
  );

  await saveAndSettle(page, backend);

  const stored = backend.snapshot().document;
  const curva = stored.entities.find(
    (entity): entity is CadArc => entity.id === "curva" && entity.type === "arc",
  );
  expect(curva, "la curva sigue siendo un arco: recortar no la convierte en otra cosa").toBeTruthy();
  expect(curva!.startAngle, "conservando el inicio, `startAngle` no se mueve").toBeCloseTo(0, 6);
  expect(
    curva!.endAngle,
    "se recorta `endAngle` hasta el cruce dentro del barrido — 60°, no −60°",
  ).toBeCloseTo(60, 6);
  // Recortar no reescala ni desplaza.
  expect(curva!.radius).toBe(1_000);
  expect(curva!.center).toEqual({ x: 4_000, y: 3_000, z: 0 });

  // Y el tope no se toca.
  const tope = stored.entities.find((entity) => entity.id === "tope");
  expect(tope?.type).toBe("line");
});
