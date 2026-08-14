import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applyNativeProperty } from "../fixtures/dynamic-input";
import { worldPoint } from "../fixtures/world-point";
import type { CadDocument, CadWallEntity } from "../../src/lib/cad/cad-document";

/**
 * EL MURO PARAMÉTRICO de punta a punta — la primera entidad BIM del producto.
 *
 * La forma del golden es la de los sólidos (47): se TECLEA, se GUARDA, se
 * REABRE y se comprueba lo persistido. Lo que este viaje demuestra y ningún
 * spec unitario puede demostrar:
 *
 *   1. `WA` se teclea en la línea de comandos real —resuelve por la tabla
 *      `acad.pgp`, no por los alias del descriptor— y el grosor se cambia con
 *      su palabra clave ANTES de pinchar un solo punto.
 *   2. Los puntos del eje entran con el RATÓN sobre el lienzo, con la vista 2D
 *      asentada, y el lote se cierra con Enter: un tramo, un paso de deshacer.
 *   3. Lo que viaja al servidor es la RECETA (eje, grosor, altura) — no las
 *      esquinas del contorno, que se derivan al dibujar.
 *   4. Tras cerrar y reabrir, editar el grosor por la paleta de propiedades
 *      REDERIVA la geometría: el eje no se mueve y el documento persiste el
 *      número nuevo.
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

/**
 * Vista de plano 2D + encuadre de la huella. Es la variante ESTABLE para
 * `worldPoint`: el preset 3D «Vista superior» se destempla al abrir paneles a
 * mitad de test y la inversión de la cámara deja de ser cenital.
 */
async function settlePlanView(page: Page) {
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTitle(/Ajustar a la planta/).click();
}

/** Designa por el panel profesional, sin depender del lienzo. */
async function select(page: Page, id: string) {
  await page.getByTitle(/Selección profesional/).click();
  await page.getByTestId("cad-selection-operation-replace").click();
  await page.getByTestId("cad-quick-select-text").fill(id);
  await page.getByTestId("cad-quick-select-apply").click();
  await expect(page.getByTestId("cad-selection-count")).toHaveText("1 seleccionados");
  await page.getByLabel("Cerrar panel profesional").click();
}

function wallsOf(document: CadDocument): CadWallEntity[] {
  return document.entities.filter(
    (entity): entity is CadWallEntity => entity.type === "wall",
  );
}

test("un muro tecleado con ratón y teclado sobrevive a guardar y reabrir, y su grosor se reedita por la paleta", async ({
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

  // --- 1. WALL por su alias, con el grosor cambiado por palabra clave --------
  await type(page, "WA");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(
    "Precise el punto inicial del muro",
  );
  await type(page, "G");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(
    "Precise el grosor del muro",
  );
  await type(page, "250");

  // --- 2. El eje entra con el RATÓN; Enter cierra el lote --------------------
  const start = await worldPoint(page, { x: 2_000, y: 2_000 });
  await page.mouse.click(start.x, start.y);
  const end = await worldPoint(page, { x: 8_000, y: 2_000 });
  await page.mouse.click(end.x, end.y);
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");

  // --- 3. Lo que viaja es la RECETA, no el contorno --------------------------
  await saveAndSettle(page, backend);
  let wallId = "";
  let savedAxis = { startX: 0, startY: 0, endX: 0, endY: 0 };
  {
    const saved = backend.snapshot().document;
    expect(saved.meta.schema).toBe(6);
    const walls = wallsOf(saved);
    expect(walls).toHaveLength(1);
    const [wall] = walls;
    wallId = wall.id;
    savedAxis = {
      startX: wall.start.x,
      startY: wall.start.y,
      endX: wall.end.x,
      endY: wall.end.y,
    };
    expect(wall.thickness).toBe(250);
    expect(wall.height).toBe(2_400);
    // La tolerancia es la RESOLUCIÓN DE ENTRADA del clic, no un capricho: sin
    // OSNAP cerca, el punto confirmado cae al snap de rejilla del editor
    // (media retícula ≈ 7,46 unidades en este encuadre — medido determinista
    // e idéntico en Chromium y Firefox con el fixture de lazo cerrado). Pedir
    // 5 era pedirle al clic más precisión de la que el producto comete.
    expect(Math.abs(wall.start.x - 2_000)).toBeLessThanOrEqual(10);
    expect(Math.abs(wall.start.y - 2_000)).toBeLessThanOrEqual(10);
    expect(Math.abs(wall.end.x - 8_000)).toBeLessThanOrEqual(10);
    expect(Math.abs(wall.end.y - 2_000)).toBeLessThanOrEqual(10);
    // El contorno con el grosor repartido (y = eje ± 125) NO está en el
    // documento: se deriva al dibujar. Si apareciera, la entidad habría
    // persistido geometría expandida y dejado de ser reeditable.
    const text = JSON.stringify(saved);
    expect(text).not.toContain("2125");
    expect(text).not.toContain("1875");
    // Un solo paso de historia para el muro entero: la etiqueta la deriva la
    // puerta única de mutación del tipo de comando (`insert:wall`).
    expect(saved.history.filter((entry) => entry.label === "insert:wall")).toHaveLength(1);
  }

  // --- 4. Cerrar, reabrir y REEDITAR el grosor por la paleta -----------------
  await page.reload();
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");

  await select(page, wallId);
  await page.keyboard.press("Control+1");
  await expect(page.getByTestId("cad-properties-palette")).toBeVisible();
  // Grosor y altura son filas EDITABLES; la longitud es derivada y no.
  await expect(page.getByTestId("cad-native-property-thickness")).toBeVisible();
  await expect(page.getByTestId("cad-native-property-height")).toBeVisible();

  await applyNativeProperty(page, "thickness", "400");
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    const [wall] = wallsOf(saved);
    expect(wall.thickness).toBe(400);
    expect(wall.height).toBe(2_400);
    // El eje NO se movió: editar el grosor rederiva el contorno, no deforma
    // la entidad. Es la recompensa de persistir la receta. Igualdad EXACTA
    // contra lo primero guardado — más fuerte que una tolerancia y ajena a la
    // resolución de entrada del clic.
    expect(wall.start.x).toBe(savedAxis.startX);
    expect(wall.start.y).toBe(savedAxis.startY);
    expect(wall.end.x).toBe(savedAxis.endX);
    expect(wall.end.y).toBe(savedAxis.endY);
    // La edición por paleta fue UN lote y UN paso de historia.
    expect(
      saved.history.filter((entry) => entry.label === "properties:wall"),
    ).toHaveLength(1);
  }
});
