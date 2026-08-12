/**
 * Ediciones que ensuciaban el dibujo sin dejar un punto de deshacer.
 *
 * EL DEFECTO, y conviene ser preciso porque NO es "el cambio se pierde".
 * Agrupar, desagrupar y editar los campos del panel de propiedades —nombre,
 * tags, notas— llamaban a `markDirty()` sin `pushHistory()`. El cambio SÍ se
 * guarda. Lo que falla es la granularidad del deshacer: como no hay checkpoint,
 * el siguiente Ctrl+Z salta al ANTERIOR y revierte de golpe lo que el usuario
 * acaba de escribir Y la acción de antes, que no pidió deshacer. Con autosave
 * por medio, esa reversión llega al servidor.
 *
 * Y EL DEFECTO SIMÉTRICO, que estaba en los campos que sí tenían checkpoint.
 * Las coordenadas y el texto de una cota lo tomaban en `onFocus`, así que
 * ENFOCAR Y SALIR sin escribir nada ya dejaba una entrada de deshacer. Un
 * Ctrl+Z después no deshacía nada visible —era una entrada fantasma— y hacía
 * falta pulsarlo dos veces para llegar a la acción real.
 *
 * El arreglo unifica: el checkpoint lo abre la MUTACIÓN, una vez por sesión de
 * edición (`beginFieldEdit`), y el `onBlur` la cierra. Ni por pulsación —que
 * reconstruiría el documento entero en cada tecla, el coste que remontó el
 * formulario y rompió el golden 33— ni por foco.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { worldPoint } from "../fixtures/world-point";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

const FOOTPRINT = {
  footprintW: 12_000,
  footprintH: 10_000,
  unit: "mm",
  gridSize: 100,
};

/**
 * Dos muros heredados. `together` los pone en la MISMA capa —necesario para
 * agrupar— y si no, deja `muro-b` aparte: el panel de propiedades sólo se abre
 * con selección de UN objeto, así que los tests de campos necesitan que el
 * gestor de capas devuelva exactamente uno.
 */
function canonicalDocument(together = false): CadDocument {
  return {
    meta: { version: 1, schema: 3, ...FOOTPRINT },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "PROCESO", name: "PROCESO", color: "#60a5fa", visible: true, locked: false },
      { id: "MONTAJE", name: "MONTAJE", color: "#f59e0b", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro-a",
        type: "box",
        kind: "wall",
        x: 1_000,
        y: 1_000,
        w: 3_000,
        h: 200,
        rotation: 0,
        layer: "PROCESO",
        shape: "rect",
        label: "Muro A",
      },
      {
        id: "muro-b",
        type: "box",
        kind: "wall",
        x: 1_000,
        y: 3_000,
        w: 3_000,
        h: 200,
        rotation: 0,
        layer: together ? "PROCESO" : "0",
        shape: "rect",
        label: "Muro B",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-a", "muro-b"] },
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

async function installCadBackend(context: BrowserContext, together = false) {
  return installCadStudioBackend<CadDocument>(
    context,
    canonicalDocument(together),
    FOOTPRINT,
  );
}

/** Selecciona por el gestor de capas: no depende del lienzo ni del ratón. */
async function selectLayerObjects(page: Page, layerId: string) {
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const row = page.getByTestId(`cad-layer-row-${layerId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Sel", exact: true }).click();
  await viewButton.click();
}

const undoButton = (page: Page) => page.getByTitle('Deshacer (Ctrl+Z)');
const layerSelect = (page: Page) => page.getByTestId("cad-object-layer");
const labelField = (page: Page) => page.getByTestId("cad-object-label");

test("editar el nombre de un objeto deja SU punto de deshacer, sin arrastrar la acción anterior", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");

  await selectLayerObjects(page, "PROCESO");
  await expect(undoButton(page)).toBeDisabled();

  // ACCIÓN 1, que es la que NO debe perderse: cambiar la capa. Ya deja
  // checkpoint desde el PR #37.
  await layerSelect(page).selectOption("MONTAJE");
  await expect(layerSelect(page)).toHaveValue("MONTAJE");
  await expect(undoButton(page)).toBeEnabled();

  // ACCIÓN 2: renombrar. Sin checkpoint propio, el Ctrl+Z de abajo revertía
  // ESTO Y la acción 1 de una vez.
  await labelField(page).fill("Muro renombrado");
  await expect(labelField(page)).toHaveValue("Muro renombrado");
  await labelField(page).blur();

  // Un solo Ctrl+Z tiene que deshacer SÓLO el renombrado.
  await page.keyboard.press("Control+z");
  await expect(
    labelField(page),
    "deshacer devuelve el nombre anterior",
  ).toHaveValue("Muro A");
  await expect(
    layerSelect(page),
    "y NO se lleva por delante el cambio de capa: eso era el defecto",
  ).toHaveValue("MONTAJE");

  // El segundo Ctrl+Z sí alcanza la acción 1.
  await page.keyboard.press("Control+z");
  await expect(layerSelect(page)).toHaveValue("PROCESO");
});

test("enfocar un campo sin escribir NO deja una entrada de deshacer fantasma", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");

  await selectLayerObjects(page, "PROCESO");
  await expect(undoButton(page)).toBeDisabled();

  // Enfocar y salir de la X y del nombre, sin escribir nada. La X es un
  // `NumField`, que es donde estaba el checkpoint por FOCO: enfocar y salir
  // dejaba su entrada, y el siguiente Ctrl+Z no deshacía nada visible.
  const x = page.getByTestId("cad-object-x");
  await expect(x).toBeVisible();
  await x.focus();
  await x.blur();
  await labelField(page).focus();
  await labelField(page).blur();

  await expect(
    undoButton(page),
    "sin escribir nada no hay nada que deshacer: enfocar no es editar",
  ).toBeDisabled();
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");
});

/** Polilínea NATIVA para los grips multifuncionales (ciclo con Espacio y menú). */
function gripDocument(): CadDocument {
  const base = canonicalDocument();
  return {
    ...base,
    entities: [
      {
        id: "poli",
        type: "polyline",
        closed: false,
        vertices: [
          { x: 2_000, y: 2_000, z: 0 },
          { x: 6_000, y: 2_000, z: 0 },
          { x: 6_000, y: 6_000, z: 0 },
        ],
        layer: "PROCESO",
      },
    ],
    modelSpace: { entityIds: ["poli"] },
  };
}

type CadPolyline = Extract<CadEntity, { type: "polyline" }>;

const storedVertices = (backend: { snapshot(): { document: CadDocument } }) =>
  (
    backend
      .snapshot()
      .document.entities.find((entity) => entity.id === "poli") as CadPolyline
  ).vertices;

test("un arrastre de grip con acción CICLADA es UN paso de deshacer", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(
    context,
    gripDocument(),
    FOOTPRINT,
  );
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");
  // Modo 2D: la vista superior queda bloqueada y el mapa mundo↔pantalla es
  // afín por construcción — lo que `worldPoint` necesita para invertirlo.
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTitle(/Ajustar a la planta/).click();

  await selectLayerObjects(page, "PROCESO");
  await expect(undoButton(page)).toBeDisabled();

  // Los dos puntos se calculan ANTES de pulsar: el muestreo del helper mueve
  // el ratón para calibrar, y hacerlo con el botón pulsado arrastraría.
  const grip = await worldPoint(page, { x: 6_000, y: 2_000 });
  const destination = await worldPoint(page, { x: 7_000, y: 4_000 });
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 12, grip.y + 12, { steps: 2 });
  // Espacio cicla estirar → añadir vértice, sin soltar el ratón.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("cad-grip-action-badge")).toHaveAttribute(
    "data-action",
    "add-vertex",
  );
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  await page.mouse.up();

  await expect(undoButton(page)).toBeEnabled();
  await saveAndSettle(page, backend);
  expect(storedVertices(backend)).toHaveLength(4);

  // UN solo Ctrl+Z deshace el arrastre entero y deja la pila VACÍA.
  await page.keyboard.press("Control+z");
  await expect(undoButton(page), "un arrastre = un paso").toBeDisabled();
  await saveAndSettle(page, backend);
  expect(storedVertices(backend)).toHaveLength(3);
});

test("el grip caliente abre su menú y aplicar una acción deja su propio paso", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(
    context,
    gripDocument(),
    FOOTPRINT,
  );
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTitle(/Ajustar a la planta/).click();

  await selectLayerObjects(page, "PROCESO");
  const grip = await worldPoint(page, { x: 6_000, y: 2_000 });
  // Clic SIN arrastre sobre el grip = grip caliente.
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.up();

  const menu = page.getByTestId("cad-grip-menu");
  await expect(menu).toBeVisible();
  await page.getByTestId("cad-grip-action-remove-vertex").click();

  await expect(undoButton(page)).toBeEnabled();
  await saveAndSettle(page, backend);
  expect(storedVertices(backend)).toHaveLength(2);

  await page.keyboard.press("Control+z");
  await expect(undoButton(page)).toBeDisabled();
  await saveAndSettle(page, backend);
  expect(storedVertices(backend)).toHaveLength(3);
});

test("agrupar y desagrupar se pueden deshacer", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context, true);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado");

  await selectLayerObjects(page, "PROCESO");
  await expect(undoButton(page)).toBeDisabled();

  await page.getByRole("button", { name: "Agrupar", exact: true }).click();
  await expect(
    undoButton(page),
    "agrupar es una acción deliberada: tiene que dejar su punto de deshacer",
  ).toBeEnabled();

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(() =>
      backend
        .snapshot()
        .document.entities.filter(
          (entity) => entity.type === "box" && entity.group,
        ).length,
    )
    .toBe(2);

  await page.keyboard.press("Control+z");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(
      () =>
        backend
          .snapshot()
          .document.entities.filter(
            (entity) => entity.type === "box" && entity.group,
          ).length,
      { message: "deshacer tiene que disolver el grupo en lo guardado" },
    )
    .toBe(0);
});
