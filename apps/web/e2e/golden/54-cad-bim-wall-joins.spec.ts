import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { worldPoint } from "../fixtures/world-point";
import type { CadDocument, CadWallEntity } from "../../src/lib/cad/cad-document";

/**
 * DOS MUROS ENCADENADOS EN L — la unión es receta, no geometría.
 *
 * La ola 1 de P4 deriva el inglete al dibujar (`wall-joins.ts`); este golden
 * demuestra lo único que un spec unitario no puede: que el ENCADENADO real de
 * WA (tres clics, dos tramos, un Enter) produce un documento donde la unión
 * NO existe como dato. Lo que se afirma es sobre el DOCUMENTO guardado:
 *
 *   1. Hay exactamente DOS muros, cada uno con su EJE — ni un vértice de
 *      contorno, ni un campo de unión, ni un polígono expandido.
 *   2. Los dos tramos COMPARTEN el vértice de la esquina con igualdad EXACTA:
 *      el mismo punto confirmado alimenta el final de un tramo y el arranque
 *      del siguiente. Esa coincidencia exacta es precisamente lo que hace
 *      derivable el inglete sin persistirlo.
 *
 * El render del inglete (caras cortadas en el punto exacto, testeros
 * absorbidos) se fija con geometría a mano en `wall-joins.spec.ts`; aquí no se
 * afirma ningún píxel del lienzo.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

/** Teclea en la línea de comandos y confirma. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

/** Vista de plano 2D + encuadre de la huella (la variante estable de 53). */
async function settlePlanView(page: Page) {
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTitle(/Ajustar a la planta/).click();
}

function wallsOf(document: CadDocument): CadWallEntity[] {
  return document.entities.filter(
    (entity): entity is CadWallEntity => entity.type === "wall",
  );
}

test("dos muros encadenados en L persisten dos ejes que comparten vértice, sin contorno ni unión en el documento", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await settlePlanView(page);

  // --- 1. WA con grosor 250 y TRES clics: dos tramos encadenados en L --------
  await type(page, "WA");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(
    "Precise el punto inicial del muro",
  );
  await type(page, "G");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(
    "Precise el grosor del muro",
  );
  await type(page, "250");

  const first = await worldPoint(page, { x: 2_000, y: 2_000 });
  await page.mouse.click(first.x, first.y);
  const corner = await worldPoint(page, { x: 8_000, y: 2_000 });
  await page.mouse.click(corner.x, corner.y);
  const last = await worldPoint(page, { x: 8_000, y: 8_000 });
  await page.mouse.click(last.x, last.y);
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 2");

  // --- 2. El documento guardado: dos RECETAS y ninguna unión -----------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  expect(saved.meta.schema).toBe(6);
  const walls = wallsOf(saved);
  expect(walls).toHaveLength(2);

  for (const wall of walls) {
    expect(wall.thickness).toBe(250);
    expect(wall.height).toBe(2_400);
    // La entidad es la receta PELADA: eje, grosor, altura y capa. Ningún campo
    // de contorno, vértices o unión — si apareciera uno, la unión habría
    // dejado de ser derivada.
    expect(Object.keys(wall).sort()).toEqual([
      "end",
      "height",
      "id",
      "layer",
      "start",
      "thickness",
      "type",
    ]);
    expect(Object.values(wall).some((value) => Array.isArray(value))).toBe(false);
  }

  // Los ejes caen donde se pinchó, con la resolución de entrada del clic
  // (media retícula, la misma tolerancia razonada del golden 53).
  const horizontal = walls.find(
    (wall) => Math.abs(wall.start.y - wall.end.y) <= Math.abs(wall.start.x - wall.end.x),
  );
  const vertical = walls.find((wall) => wall !== horizontal);
  expect(horizontal).toBeDefined();
  expect(vertical).toBeDefined();
  expect(Math.abs(horizontal!.start.x - 2_000)).toBeLessThanOrEqual(10);
  expect(Math.abs(horizontal!.start.y - 2_000)).toBeLessThanOrEqual(10);
  expect(Math.abs(horizontal!.end.x - 8_000)).toBeLessThanOrEqual(10);
  expect(Math.abs(horizontal!.end.y - 2_000)).toBeLessThanOrEqual(10);
  expect(Math.abs(vertical!.end.x - 8_000)).toBeLessThanOrEqual(10);
  expect(Math.abs(vertical!.end.y - 8_000)).toBeLessThanOrEqual(10);

  // El vértice de la esquina es EL MISMO punto en ambos tramos, con igualdad
  // exacta — no una tolerancia: el encadenado reutiliza el punto confirmado.
  // De esa coincidencia exacta se deriva el inglete al dibujar.
  expect(vertical!.start.x).toBe(horizontal!.end.x);
  expect(vertical!.start.y).toBe(horizontal!.end.y);

  // --- 3. Reabrir: el documento reabierto sigue teniendo SOLO los dos ejes ---
  await page.reload();
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 2");
});
