/**
 * Un muro con material de acabado (textura procedural real, generada en el
 * navegador) sobrevive a guardar y reabrir, y el lienzo 3D la renderiza sin
 * errores.
 *
 * Lo que este golden demuestra y ningún spec de Node puede demostrar:
 * `architecturalSurfaceMaps()` toca `document`/`canvas` — sólo corre aquí, en
 * un navegador de verdad, no bajo `run-specs.mjs`. El panel selector
 * (`CadMaterialPalette.tsx`) es un componente NUEVO sin cablear en
 * `Layout3DEditor.tsx` (fuera de alcance de esta tarea), así que este golden
 * no hace clic en él — siembra el `materialId` ya elegido, como si la paleta
 * ya lo hubiera guardado, y comprueba el resto de la cadena: render sin
 * errores, y persistencia real a través del documento canónico.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

const MURO_TEXTURA = "muro-textura";
const MURO_LISO = "muro-liso";

function seedDocument(): CadDocument {
  const entities: CadEntity[] = [
    {
      id: MURO_TEXTURA,
      type: "box",
      kind: "wall",
      x: 1_000,
      y: 1_000,
      w: 3_600,
      h: 200,
      rotation: 0,
      // Capa propia: selectObjectsOfLayer() designa por capa, y la de "0"
      // seleccionaría los DOS muros a la vez — el panel de notas no aparece
      // para una selección múltiple.
      layer: "MATERIALES",
      shape: "rect",
      label: "Muro con ladrillo",
      materialId: "brick-red",
    },
    {
      id: MURO_LISO,
      type: "box",
      kind: "wall",
      x: 1_000,
      y: 3_000,
      w: 3_600,
      h: 200,
      rotation: 0,
      layer: "0",
      shape: "rect",
      label: "Muro sin textura",
    },
  ];
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MATERIALES", name: "MATERIALES", color: "#60a5fa", visible: true, locked: false },
    ],
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

function wallOf(document: CadDocument, id: string) {
  const entity = document.entities.find((candidate) => candidate.id === id);
  expect(entity?.type, `se esperaba una box ${id}`).toBe("box");
  return entity as Extract<CadEntity, { type: "box" }>;
}

/** Selecciona los activos de una capa por el gestor de capas (patrón de
 *  object-notes.spec.ts) — designa sin depender de coordenadas del lienzo 3D. */
async function selectObjectsOfLayer(page: Page, layerId: string) {
  const viewButton = page.getByTitle(/Vista, capas/);
  await viewButton.click();
  const row = page.getByTestId(`cad-layer-row-${layerId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Sel", exact: true }).click();
  await viewButton.click();
}

test("un muro con material de acabado renderiza sin errores y su materialId sobrevive a guardar y reabrir", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-save-status")).toBeVisible();

  const canvas = page.getByTestId("cad-canvas");
  await expect(canvas).toBeVisible();
  // Deja correr un par de cuadros de render reales antes de capturar: la
  // generación procedural de texturas (canvas → CanvasTexture → GPU) corre en
  // el primer render de cada activo con `materialId`, que es exactamente lo
  // que este golden necesita ejecutar en un navegador de verdad.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: testInfo.outputPath("architectural-materials-3d.png"),
    fullPage: true,
  });

  // El documento carga ya "Guardado" (nada dirty) — Guardar sin una edición
  // real no dispara un PUT. Una nota trivial en el muro con textura es la
  // edición mínima para forzar el guardado canónico real y observar si
  // `materialId` sobrevive a `editorSnapshotToCadDocument()`, exactamente el
  // patrón de `object-notes.spec.ts`.
  await selectObjectsOfLayer(page, "MATERIALES");
  const notes = page.getByTestId("cad-object-notes");
  await expect(notes).toBeVisible();
  await notes.fill("verificado por el golden de materiales");
  await expect(page.getByTestId("cad-save-status")).toHaveText(/Modificado/);

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(0);
  {
    const saved = backend.snapshot().document;
    expect(wallOf(saved, MURO_TEXTURA).materialId).toBe("brick-red");
    expect(wallOf(saved, MURO_LISO).materialId).toBeUndefined();
    // Nada del resto del activo se llevó por delante.
    expect(wallOf(saved, MURO_TEXTURA).label).toBe("Muro con ladrillo");
    expect(wallOf(saved, MURO_TEXTURA).w).toBe(3_600);
  }

  await page.reload();
  await expect(page.getByTestId("cad-save-status")).toBeVisible();
  await expect(canvas).toBeVisible();

  // Reabrir y volver a guardar SIN tocar el material: si `materialId` sólo
  // sobreviviera por casualidad en el primer guardado (p.ej. porque el
  // cliente nunca lo soltó de su estado en memoria) esta segunda vuelta —
  // que sí pasa por abrir de verdad, `cadDocumentToEditorSnapshot` incluido —
  // lo delataría.
  await selectObjectsOfLayer(page, "MATERIALES");
  await expect(notes).toHaveValue("verificado por el golden de materiales");
  await notes.fill("verificado por el golden de materiales — segunda vuelta");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.snapshot().version).toBeGreaterThan(1);
  {
    const saved = backend.snapshot().document;
    expect(
      wallOf(saved, MURO_TEXTURA).materialId,
      "el material elegido tiene que sobrevivir a reabrir el documento, no sólo al primer guardado",
    ).toBe("brick-red");
    expect(wallOf(saved, MURO_LISO).materialId).toBeUndefined();
  }

  expect(
    pageErrors,
    `la generación procedural de texturas (canvas/CanvasTexture) no debe lanzar en el navegador: ${pageErrors.join("; ")}`,
  ).toEqual([]);
});
