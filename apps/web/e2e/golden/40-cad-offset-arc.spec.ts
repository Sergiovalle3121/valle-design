/**
 * OFFSET de un ARCO, de punta a punta y contra lo que el backend guarda.
 *
 * EL HUECO. `offsetCanonicalEntity` admitía línea, polilínea sin arcos y
 * círculo. Un `arc` —entidad de primera clase aquí: se dibuja, se selecciona,
 * tiene grips y snaps propios, y va y viene por DXF— recibía «OFFSET sólo
 * admite líneas, polilíneas y círculos». Desfasar un arco es elemental en
 * cualquier CAD 2D: un muro curvo, un carril, un radio de giro.
 *
 * Y es EXACTO, no una aproximación: el offset de un arco de circunferencia ES
 * otro arco de circunferencia — mismo centro, mismos ángulos, radio ± la
 * distancia. El mismo caso que el círculo, que no es más que un arco de 360°.
 *
 * El spec unitario cubre la geometría; esto cubre que el usuario llega a ella:
 * seleccionar el arco, ejecutar la orden, y que el arco concéntrico esté en el
 * documento que se persiste.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applyDynamicInput } from "../fixtures/dynamic-input";
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
      {
        id: "muro-curvo",
        type: "arc",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius: 1_000,
        startAngle: 0,
        endAngle: 90,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-curvo"] },
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

test("OFFSET sobre un arco produce un arco concéntrico y lo persiste", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await page.getByTestId("cad-native-entity-muro-curvo").click();
  await expect(page.getByTestId("cad-native-properties")).toContainText("ARC");

  await page.getByRole("button", { name: "Offset", exact: true }).click();
  await applyDynamicInput(page, { offset: "250mm" });

  // Antes esto dejaba el toast «OFFSET sólo admite líneas, polilíneas y
  // círculos» y no creaba nada.
  await saveAndSettle(page, backend);

  const stored = backend.snapshot().document;
  const arcs = stored.entities.filter(
    (entity): entity is CadArc => entity.type === "arc",
  );
  expect(arcs, "el original más su desfase").toHaveLength(2);

  const original = arcs.find((arc) => arc.id === "muro-curvo");
  const offset = arcs.find((arc) => arc.id !== "muro-curvo");
  expect(original?.radius, "el original no se toca").toBe(1_000);
  expect(offset, "el desfase existe y es una entidad nueva").toBeTruthy();

  // Concéntrico y exacto: mismo centro, mismos ángulos, radio + distancia.
  expect(offset!.radius).toBe(1_250);
  expect(offset!.center).toEqual({ x: 4_000, y: 3_000, z: 0 });
  expect(offset!.startAngle).toBe(0);
  expect(offset!.endAngle).toBe(90);
  expect(offset!.layer).toBe("0");
});
