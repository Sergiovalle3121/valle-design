/**
 * Dos mutaciones del estudio que NO cruzaban la frontera transaccional.
 *
 * El patrón de la fase B: la interfaz deja cambiar algo, el estado de React
 * cambia, el usuario lo ve cambiado — y el documento canónico no se entera.
 * Aquí se miden los dos casos que quedaban en objetos HEREDADOS:
 *
 *   1. CAMBIAR DE CAPA. `setSelectionLayer` y `assignSelectionToCadLayer`
 *      escribían `setLayerAssignments(...)` a pelo. Sin `pushHistory`, sin
 *      `markDirty` y sin guarda de solo-lectura. Consecuencias reales: no se
 *      programaba autosave, así que cambiar la capa y cerrar la pestaña lo
 *      perdía —la guarda de cierre mira `dirtyRef`, que seguía en falso—, y
 *      deshacer no lo alcanzaba porque no había punto de historial.
 *      Las entidades NATIVAS ya iban por `commitNativeCommands`; era la mitad
 *      heredada la que se escapaba.
 *
 *   2. RENOMBRAR UNA CELDA. Crear y borrar celdas ya pasaban por `commitCells`.
 *      Renombrar escribía `cellsRef.current` a mano y sólo marcaba dirty, así
 *      que el guardado —que reconstruye el documento desde la proyección— se
 *      llevaba el nombre viejo. El autosave respondía 200 y el nombre nuevo
 *      no estaba en lo guardado.
 *
 * Lo que se afirma abajo es el ciclo de aceptación completo de la fase:
 * crear → editar → deshacer → rehacer → guardar → recargar, sin pérdidas
 * visibles y contra lo que el servidor tiene de verdad.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * Un documento con objetos HEREDADOS y ninguno nativo.
 *
 * Es deliberado: `selectCadLayerObjects` (el botón «Sel» del gestor de capas)
 * prefiere la selección nativa cuando la hay, y lo que se quiere ejercitar
 * aquí es justo el camino heredado — el que no cruzaba ninguna frontera.
 */
function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "layout", name: "layout", color: "#94a3b8", visible: true, locked: false },
      { id: "PROCESO", name: "PROCESO", color: "#60a5fa", visible: true, locked: false },
      { id: "MONTAJE", name: "MONTAJE", color: "#f59e0b", visible: true, locked: false },
    ],
    entities: [
      {
        // Fuera de la capa por defecto a propósito: `cadDocumentToLayout` sólo
        // emite `asset.layer` cuando difiere de "0", así que un muro en "0"
        // caería en la capa por defecto de su tipo y el gestor de capas no lo
        // encontraría donde el documento dice que está.
        id: "muro-norte",
        type: "box",
        kind: "wall",
        x: 1_000,
        y: 1_000,
        w: 4_000,
        h: 200,
        rotation: 0,
        layer: "PROCESO",
        shape: "rect",
        label: "Muro norte",
      },
      {
        id: "est-1",
        type: "station",
        x: 3_000,
        y: 4_000,
        w: 800,
        h: 600,
        rotation: 0,
        layer: "layout",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-norte", "est-1"] },
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
async function selectLegacyObjectsOfLayer(page: Page, layerId: string) {
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const row = page.getByTestId(`cad-layer-row-${layerId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Sel", exact: true }).click();
  await viewButton.click();
}

const saveStatus = (page: Page) => page.getByTestId("cad-save-status");

function boxOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  expect(entity, `falta la entidad ${id}`).toBeTruthy();
  return entity!;
}

test("cambiar de capa un objeto heredado ensucia el dibujo, entra en el historial y llega al servidor", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(saveStatus(page)).toBeVisible();

  // Un dibujo recién abierto está limpio: sin esto la aserción de «Modificado»
  // no probaría nada.
  await expect(saveStatus(page)).toHaveText("Guardado");

  await selectLegacyObjectsOfLayer(page, "PROCESO");
  const layerSelect = page.getByTestId("cad-object-layer");
  await expect(layerSelect).toBeVisible();
  await expect(layerSelect).toHaveValue("PROCESO");

  // EL DEFECTO: esto cambiaba `layerAssignments` y nada más.
  await layerSelect.selectOption("MONTAJE");
  await expect(layerSelect).toHaveValue("MONTAJE");
  await expect(
    saveStatus(page),
    "cambiar de capa es una edición: tiene que ensuciar el documento y programar autosave",
  ).toHaveText(/Modificado/);

  // Y tiene que haber un punto de historial que deshacer alcance.
  await page.keyboard.press("Control+z");
  await expect(
    layerSelect,
    "deshacer tiene que devolver la capa anterior: antes no había checkpoint que deshacer",
  ).toHaveValue("PROCESO");
  await page.keyboard.press("Control+Shift+z");
  await expect(layerSelect, "y rehacer tiene que volver a aplicarla").toHaveValue(
    "MONTAJE",
  );

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(0);
  expect(
    boxOf(backend.snapshot().document, "muro-norte").layer,
    "la capa nueva tiene que estar en lo que el servidor guardó",
  ).toBe("MONTAJE");

  await page.reload();
  await expect(saveStatus(page)).toBeVisible();
  await selectLegacyObjectsOfLayer(page, "MONTAJE");
  await expect(
    page.getByTestId("cad-object-layer"),
    "y al reabrir el objeto sigue en su capa nueva",
  ).toHaveValue("MONTAJE");

  // El OTRO punto de entrada con el mismo agujero: «Asignar» del gestor de
  // capas. Su mitad nativa ya iba por `commitNativeCommands`; la heredada
  // escribía el estado a pelo, así que aquí tampoco había dirty ni historial.
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  await page
    .getByTestId("cad-layer-row-PROCESO")
    .getByRole("button", { name: "Asignar", exact: true })
    .click();
  await viewButton.click();
  await expect(page.getByTestId("cad-object-layer")).toHaveValue("PROCESO");
  await expect(
    saveStatus(page),
    "«Asignar» sobre objetos heredados también es una edición",
  ).toHaveText(/Modificado/);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(() => boxOf(backend.snapshot().document, "muro-norte").layer)
    .toBe("PROCESO");
});

test("renombrar una celda llega al documento canónico y sobrevive a recargar", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(saveStatus(page)).toBeVisible();

  // Las celdas agrupan ESTACIONES, que en este documento viven en `layout`.
  await selectLegacyObjectsOfLayer(page, "layout");

  const cellsButton = page.getByTitle(/Celdas \/ zonas/);
  await cellsButton.click();
  await page.getByTestId("cad-cells-create").click();
  const row = page.getByTestId("cad-cell-row");
  await expect(row).toHaveCount(1);
  const name = page.getByTestId("cad-cell-name");
  await expect(name).toHaveValue("Celda 1");

  // EL DEFECTO: esto escribía `cellsRef` a mano; `commitCells` no corría y el
  // guardado reconstruía el documento con el nombre viejo.
  await name.fill("Zona de soldadura");
  await name.blur();
  await expect(saveStatus(page)).toHaveText(/Modificado/);

  // El panel es un modal a pantalla completa: se cierra por su propia aspa,
  // no por el botón de la barra que queda detrás del velo.
  await page.getByTestId("cad-cells-close").click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(0);
  const saved = backend.snapshot().document.cells ?? [];
  expect(saved, "una celda creada tiene que estar en el documento guardado").toHaveLength(1);
  expect(
    saved[0]!.name,
    "el nombre NUEVO — el viejo era exactamente el defecto",
  ).toBe("Zona de soldadura");
  expect(saved[0]!.stationIds).toEqual(["est-1"]);

  await page.reload();
  await expect(saveStatus(page)).toBeVisible();
  await cellsButton.click();
  await expect(
    page.getByTestId("cad-cell-name"),
    "y al reabrir la celda conserva su nombre",
  ).toHaveValue("Zona de soldadura");
});
