import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadWallEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * `CadArchitecturalMassHost` cableado: una habitación cerrada por muros
 * produce piso, cielorraso y techo en el visor 3D real, no sólo en el spec de
 * Node del propio anfitrión.
 *
 * `architectural-mass-host.spec.ts` ya prueba la reconciliación en Node, sin
 * navegador ni GPU; lo que ese spec no puede probar es que `Layout3DEditor.tsx`
 * de verdad instancie el anfitrión y lo sincronice contra el documento que
 * carga el editor. Este golden siembra cuatro muros que cierran un rectángulo
 * — la receta, no una malla — y comprueba lo que sólo un navegador real puede
 * confirmar: cero errores de página al extruir y teselar las losas, y que el
 * indicador de diagnóstico que publica el anfitrión (mismo patrón que
 * `cad-native-document-count` y `cad-render-pipeline`) refleja un cuarto y un
 * techo, no cero.
 */
function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): CadWallEntity {
  return {
    id,
    type: "wall",
    start: { ...start, z: 0 },
    end: { ...end, z: 0 },
    thickness: 200,
    height: 2_400,
    layer: "0",
  };
}

function seedDocument(): CadDocument {
  const entities: CadWallEntity[] = [
    wall("n", { x: 2_000, y: 2_000 }, { x: 6_000, y: 2_000 }),
    wall("e", { x: 6_000, y: 2_000 }, { x: 6_000, y: 5_000 }),
    wall("s", { x: 6_000, y: 5_000 }, { x: 2_000, y: 5_000 }),
    wall("w", { x: 2_000, y: 5_000 }, { x: 2_000, y: 2_000 }),
  ];
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
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

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

test("cuatro muros que cierran una habitación producen piso, cielorraso y techo en el visor 3D", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  const canvas = page.getByTestId("cad-canvas");
  await expect(canvas).toBeVisible();

  // Los cuatro muros ya cargaron como documento nativo: lo que sigue prueba la
  // MASA que se deriva de ellos, no si el documento se abrió.
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 4");

  await page.getByRole("button", { name: "3D", exact: true }).click();
  // Dos cuadros de render real: la extrusión (`lib/brep/`) y el teselado de
  // las tres losas corren en el primer `sync` contra el documento cargado.
  await page.waitForTimeout(300);

  const massCount = page.getByTestId("cad-architectural-mass-count");
  // Un anillo interior (la habitación) y la envolvente exterior son dos
  // anillos DISTINTOS que entrega la costura de HATCH sobre las caras unidas
  // de los muros — ver `roof-floor-generation.ts` — así que cerrar un solo
  // rectángulo de muros ya basta para producir ambos: un cuarto Y un techo.
  await expect(massCount).toHaveAttribute("data-rooms", "1");
  await expect(massCount).toHaveAttribute("data-roof", "true");

  await page.screenshot({
    path: testInfo.outputPath("architectural-mass-3d.png"),
    fullPage: true,
  });

  expect(
    pageErrors,
    `la extrusión y el teselado de piso/cielorraso/techo no deben lanzar en el navegador: ${pageErrors.join("; ")}`,
  ).toEqual([]);
});
