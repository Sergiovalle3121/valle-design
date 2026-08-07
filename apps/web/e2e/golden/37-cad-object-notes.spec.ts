/**
 * La nota de un objeto no se guardaba en ningún sitio.
 *
 * Es de otra clase que los defectos anteriores de la fase. Con las celdas, los
 * grupos, el `context` o la huella, el documento canónico SÍ tenía sitio y el
 * guardado los perdía por el camino. Aquí NO había sitio: `objectNotes` era
 * estado de React y nada más. No lo leía `snapshot()`, no viajaba en ningún
 * payload, no existía campo en el esquema, y al abrir no se restauraba nada.
 *
 * Lo que el usuario veía: escribe "pendiente de validar con el cliente" en un
 * equipo, el dibujo se marca como modificado, el guardado responde 200, y la
 * nota desaparece al recargar.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const NOTA = "Pendiente de validar con el cliente. Owner: J. Perez.";

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
      { id: "PROCESO", name: "PROCESO", color: "#60a5fa", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro-norte",
        type: "box",
        kind: "wall",
        x: 1_000,
        y: 1_000,
        w: 4_000,
        h: 200,
        rotation: 0,
        // Fuera de la capa por defecto: `cadDocumentToLayout` sólo emite
        // `asset.layer` cuando difiere de "0", y el gestor de capas es como se
        // selecciona el objeto sin depender del lienzo.
        layer: "PROCESO",
        shape: "rect",
        label: "Muro norte",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-norte"] },
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

/** Abre el gestor de capas, selecciona lo que hay en `layerId` y lo cierra. */
async function selectObjectsOfLayer(page: Page, layerId: string) {
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const row = page.getByTestId(`cad-layer-row-${layerId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Sel", exact: true }).click();
  await viewButton.click();
}

function boxOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  expect(entity?.type, `se esperaba una box ${id}`).toBe("box");
  return entity as Extract<CadEntityOf, { type: "box" }>;
}
type CadEntityOf = CadDocument["entities"][number];

test("la nota de un objeto llega al documento canónico y sobrevive a recargar", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");

  await selectObjectsOfLayer(page, "PROCESO");
  const notes = page.getByTestId("cad-object-notes");
  await expect(notes).toBeVisible();
  await expect(notes, "un objeto sin nota empieza vacío").toHaveValue("");

  await notes.fill(NOTA);
  await expect(notes).toHaveValue(NOTA);
  await expect(page.getByTestId("cad-save-status")).toHaveText(/Modificado/);

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(0);
  expect(
    boxOf(backend.snapshot().document, "muro-norte").notes,
    "la nota tiene que estar en lo que el servidor guardó: antes no había campo donde ponerla",
  ).toBe(NOTA);
  // Y no se llevó por delante nada de lo que el objeto ya tenía.
  expect(boxOf(backend.snapshot().document, "muro-norte").label).toBe("Muro norte");
  expect(boxOf(backend.snapshot().document, "muro-norte").layer).toBe("PROCESO");

  await page.reload();
  await expect(page.getByTestId("cad-save-status")).toBeVisible();
  await selectObjectsOfLayer(page, "PROCESO");
  await expect(
    page.getByTestId("cad-object-notes"),
    "y al reabrir la nota sigue ahí — este era el síntoma que veía el usuario",
  ).toHaveValue(NOTA);
});

test("borrar la nota también se guarda: no se queda pegada la anterior", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");

  await selectObjectsOfLayer(page, "PROCESO");
  const notes = page.getByTestId("cad-object-notes");
  await notes.fill(NOTA);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(() => boxOf(backend.snapshot().document, "muro-norte").notes)
    .toBe(NOTA);

  // Vaciar es una edición como cualquier otra. Si sólo se persistiera lo no
  // vacío, la nota borrada reaparecería al recargar.
  await notes.fill("");
  await expect(notes).toHaveValue("");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(() => boxOf(backend.snapshot().document, "muro-norte").notes)
    .toBeUndefined();

  await page.reload();
  await expect(page.getByTestId("cad-save-status")).toBeVisible();
  await selectObjectsOfLayer(page, "PROCESO");
  await expect(page.getByTestId("cad-object-notes")).toHaveValue("");
});
