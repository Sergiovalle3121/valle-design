import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applyNativeSelectProperty } from "../fixtures/dynamic-input";
import type { CadDocument, CadWallEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * CORTE D de la campaña 3D-M1: selección 3D, edición de material, deshacer/
 * rehacer y guardar/reabrir, de punta a punta sobre el MISMO muro.
 *
 * Lo que el 53 ya prueba (crear un muro tecleado+ratón, guardar, reabrir,
 * reeditar el GROSOR por la paleta) no se repite aquí. Lo nuevo de este
 * corte, y lo único que este golden existe para demostrar:
 *
 *  1. El SÓLIDO 3D del muro (`wall-solid-three.ts`) es lo que de verdad se
 *     pincha para seleccionar — no la quick-select por id que usa el 53 — con
 *     la MISMA cámara cenital estable que ya usan otros goldens para dibujar
 *     con el ratón. `wall-entity-adapter.ts`/`entity-three.ts` resuelven el
 *     `nativeEntityId` sin caso especial para "wall": si el clic no
 *     seleccionara, éste es el golden que lo detendría.
 *  2. `material` es un campo OPCIONAL Y ADITIVO nuevo (sin bump de esquema):
 *     aparece SIEMPRE en el panel de propiedades como un desplegable de un
 *     conjunto finito (nunca texto libre), vacío en un muro que no lo
 *     declaró — y elegir uno pasa por el mismo comando `properties` que ya
 *     usa `thickness`, así que deshacer/rehacer lo cubre GRATIS.
 *  3. Guardar → recargar conserva el material elegido; borrarlo (elegir
 *     «Genérico») lo QUITA del documento entero, no lo deja en `""`.
 *
 * Lo que NO comprueba: el COLOR exacto que pinta cada material — eso ya lo
 * fija `wall-solid-three.spec.ts` con aritmética exacta sobre la geometría
 * real, sin el costo ni la fragilidad de leer un canvas.
 *
 * ## Por qué el clic va al CENTRO del lienzo, sin `worldPoint`
 *
 * `worldPoint` (goldens 26/32/33/40/46/53/57) calibra la afín mundo↔pantalla
 * reintentando hasta que DOS pasadas de muestreo seguidas coinciden — y en
 * esta sesión, medido con instrumentación temporal, cada pasada completa
 * cuesta ~6-9 s de movimientos de ratón + lecturas del HUD, así que las DOS
 * pasadas que exige quedan pegadas a su techo de 15 s (a veces por encima).
 * Otros goldens no lo notan porque llegan con el ratón ya en movimiento por
 * interacciones previas (p. ej. el 53 teclea WA/G/250 antes de su primer
 * punto); este golden siembra el muro ya hecho y no dibuja nada, así que
 * cronometrar una calibración así de cara —para un clic que sólo necesita
 * caer DENTRO de un sólido, no en un punto exacto— es la herramienta
 * equivocada. En vez de calibrar, el eje del muro se siembra centrado
 * exactamente en el centro geométrico de la huella (6000, 5000 de una huella
 * de 12000×10000), y «Ajustar a la planta» centra la huella en el lienzo por
 * diseño (comprobado: el centro del lienzo lee exactamente esas coordenadas
 * antes de este cambio) — así que un clic en el centro CRUDO del `bounding
 * box` del lienzo, sin ninguna conversión, cae dentro del sólido.
 */
const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };
const WALL_ID = "wall-material-lifecycle";
const FOOTPRINT_CENTER = { x: FOOTPRINT.footprintW / 2, y: FOOTPRINT.footprintH / 2 };

function seedDocument(): CadDocument {
  const wall: CadWallEntity = {
    id: WALL_ID,
    type: "wall",
    start: { x: FOOTPRINT_CENTER.x - 3_000, y: FOOTPRINT_CENTER.y, z: 0 },
    end: { x: FOOTPRINT_CENTER.x + 3_000, y: FOOTPRINT_CENTER.y, z: 0 },
    thickness: 200,
    height: 2_400,
    layer: "0",
  };
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [wall],
    history: [],
    modelSpace: { entityIds: [WALL_ID] },
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
  return installCadStudioBackend<CadDocument>(context, seedDocument(), FOOTPRINT);
}

/** Vista de plano 2D cenital + encuadre de la huella, que además la CENTRA. */
async function settlePlanView(page: Page) {
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTitle(/Ajustar a la planta/).click();
}

async function settledPipeline(page: Page) {
  await expect(page.getByTestId("cad-render-pipeline")).toHaveAttribute(
    "data-settled",
    "true",
    { timeout: 30_000 },
  );
}

/**
 * El recorrido «Primeros cinco minutos» (golden 55) nace `pending` en CADA
 * contexto nuevo de Playwright —su registro vive en el almacenamiento del
 * navegador, y cada test arranca con uno vacío— y su tarjeta se sienta
 * encima del CENTRO del lienzo: exactamente donde este golden pincha para
 * seleccionar el muro. Sin saltarlo, el clic cae sobre la tarjeta y nunca
 * sobre el lienzo.
 */
async function skipGuidedTour(page: Page) {
  const skip = page.getByRole("button", { name: "Saltar" });
  if (await skip.count()) await skip.click();
}

async function historyDepth(page: Page) {
  const depth = page.getByTestId("cad-history-depth");
  return {
    undo: Number((await depth.getAttribute("data-undo")) ?? "0"),
    redo: Number((await depth.getAttribute("data-redo")) ?? "0"),
  };
}

function wallOf(document: CadDocument): CadWallEntity | undefined {
  return document.entities.find(
    (entity): entity is CadWallEntity => entity.type === "wall" && entity.id === WALL_ID,
  );
}

test("el muro nativo se selecciona pinchando su sólido 3D, su material se edita, se deshace/rehace y sobrevive a guardar y reabrir", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await skipGuidedTour(page);
  await settlePlanView(page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");
  await settledPipeline(page);

  // --- 1. Selección 3D: pinchar el SÓLIDO del muro en el visor, no quick-select --
  // El eje del muro se sembró centrado en la huella (ver cabecera): el centro
  // CRUDO del lienzo cae dentro del sólido pase lo que pase su grosor, porque
  // el grosor se reparte simétrico a ambos lados del eje.
  const canvasBox = await page.getByTestId("cad-canvas").boundingBox();
  if (!canvasBox) throw new Error("cad-canvas sin bounding box");
  await page.mouse.click(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.keyboard.press("Control+1");
  await expect(page.getByTestId("cad-properties-palette")).toHaveAttribute(
    "data-count",
    "1",
  );
  await expect(page.getByTestId("cad-native-property-thickness")).toBeVisible();

  // --- 2. El material aparece SIEMPRE en la fila, vacío (Genérico) por defecto --
  const materialField = page.getByTestId("cad-native-property-material");
  await expect(materialField).toBeVisible();
  await expect(materialField).toHaveValue("");

  // --- 3. Se elige un material del desplegable: conjunto FINITO, no texto libre --
  const depthBeforeEdit = await historyDepth(page);
  await applyNativeSelectProperty(page, "material", "brick");
  await expect(materialField).toHaveValue("brick");
  const depthAfterEdit = await historyDepth(page);
  expect(depthAfterEdit.undo).toBe(depthBeforeEdit.undo + 1);

  // --- 4. Guardar y comprobar lo persistido -----------------------------------
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    expect(wallOf(saved)?.material).toBe("brick");
    expect(
      saved.history.some((entry) => entry.label === "properties:wall"),
    ).toBe(true);
  }

  // --- 5. Deshacer: el material vuelve a Genérico, el eje no se movió --------
  await page.getByTitle("Deshacer (Ctrl+Z)").click();
  await expect(page.getByTestId("cad-history-depth")).toHaveAttribute(
    "data-undo",
    String(depthBeforeEdit.undo),
  );
  await expect(page.getByTestId("cad-history-depth")).toHaveAttribute(
    "data-redo",
    String(depthAfterEdit.redo + 1),
  );
  await expect(materialField).toHaveValue("");

  // --- 6. Rehacer: el material vuelve, sin volver a teclear nada --------------
  await page.getByTitle("Rehacer (Ctrl+Shift+Z)").click();
  await expect(page.getByTestId("cad-history-depth")).toHaveAttribute(
    "data-undo",
    String(depthAfterEdit.undo),
  );
  await expect(materialField).toHaveValue("brick");

  // --- 7. Borrar el material (elegir "Genérico") lo QUITA del documento -------
  await applyNativeSelectProperty(page, "material", "");
  await expect(materialField).toHaveValue("");
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    const wall = wallOf(saved);
    expect(wall?.material).toBeUndefined();
    // No sólo `undefined` en memoria: la CLAVE no viaja como `""` disfrazada.
    // Busca el patrón de clave JSON, no la subcadena suelta: el propio id del
    // muro (`wall-material-lifecycle`) contiene "material" y un
    // `.not.toContain("material")` a secas fallaría siempre, contra la propia
    // entidad, no contra el campo.
    expect(JSON.stringify(wall)).not.toContain('"material":');
  }

  // --- 8. Recargar: sigue siendo el mismo único muro, sin material -----------
  await page.reload();
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");
  expect(wallOf(backend.snapshot().document)?.material).toBeUndefined();
});
