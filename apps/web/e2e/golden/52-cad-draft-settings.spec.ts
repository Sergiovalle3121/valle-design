/**
 * DSETTINGS: la configuración por modo llega de verdad al motor de captura.
 *
 * Un cuadro de ajustes es fácil de fingir: catorce casillas que se marcan y no
 * hacen nada pasarían cualquier prueba que sólo mire el DOM. Por eso lo que se
 * afirma aquí es el COMPORTAMIENTO del puntero, con la misma técnica del golden
 * 28: se apunta a un punto medio con el modo encendido y el HUD dice «medio»;
 * se apaga el modo en DSETTINGS y el mismo punto deja de capturar ahí.
 *
 * La parte de DOM que sí se comprueba es la que el DOM es: que el interruptor
 * del cuadro y el de la barra de estado son el MISMO estado.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { enter3DView } from '../fixtures/view-mode';

const cadDocument = {
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [
    { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    {
      id: "SNAP",
      name: "SNAP",
      color: "#60a5fa",
      visible: true,
      locked: false,
    },
  ],
  entities: [
    {
      id: "snap-horizontal",
      type: "line",
      start: { x: 3_000, y: 3_000, z: 0 },
      end: { x: 5_000, y: 3_000, z: 0 },
      layer: "SNAP",
    },
  ],
  history: [],
  modelSpace: { entityIds: ["snap-horizontal"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

async function installCadBackend(context: BrowserContext) {
  await installCadV1Backend(context, {
    document: cadDocument,
    footprint: {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: "mm",
      gridSize: 100,
    },
  });
}

/**
 * Pantalla ↔ mundo por muestreo, igual que en el golden 28: la cámara depende
 * del ajuste a la planta y no hay una constante que valga.
 */
async function worldPoint(page: Page, target: { x: number; y: number }) {
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("CAD canvas has no bounding box");
  const coordinate = page.getByTestId("cad-cursor-coordinate");
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await expect
      .poll(async () => coordinate.getAttribute("data-x"))
      .not.toBe("");
    return {
      x: Number(await coordinate.getAttribute("data-x")),
      y: Number(await coordinate.getAttribute("data-y")),
    };
  };
  const screen = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const origin = await sample(screen.x, screen.y);
  const horizontal = await sample(screen.x + 80, screen.y);
  const vertical = await sample(screen.x, screen.y + 80);
  const a = (horizontal.x - origin.x) / 80;
  const b = (vertical.x - origin.x) / 80;
  const c = (horizontal.y - origin.y) / 80;
  const d = (vertical.y - origin.y) / 80;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9)
    throw new Error("CAD world/screen transform is singular");
  const wx = target.x - origin.x;
  const wy = target.y - origin.y;
  return {
    x: screen.x + (d * wx - b * wy) / determinant,
    y: screen.y + (-c * wx + a * wy) / determinant,
  };
}

test("apagar un modo OSNAP en DSETTINGS deja de capturar por él", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible();
  await enter3DView(page);
  await page.getByTitle(/Vista superior/).click();
  await page.getByTitle(/Ajustar a la planta/).click();

  /** Apunta al punto medio de la línea horizontal y devuelve lo que dice el HUD. */
  const probeMidpoint = async () => {
    await page.getByRole("button", { name: "Línea", exact: true }).click();
    const anchor = await worldPoint(page, { x: 1_000, y: 1_000 });
    await page.mouse.click(anchor.x, anchor.y);
    const target = await worldPoint(page, { x: 4_000, y: 3_000 });
    await page.mouse.move(target.x, target.y);
    const prompt = page.getByTestId("cad-live-prompt");
    await expect(prompt).toBeVisible();
    const text = (await prompt.textContent()) ?? "";
    await page.keyboard.press("Escape");
    return text;
  };

  // De fábrica los trece modos de geometría están encendidos, que es
  // exactamente lo que el editor tenía cableado antes de existir DSETTINGS.
  expect(await probeMidpoint()).toContain("medio");

  await page.getByTestId("cad-draft-status-settings").click();
  await expect(page.getByTestId("cad-draft-settings")).toBeVisible();
  await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText(
    "13/14",
  );
  await expect(page.getByTestId("cad-osnap-mode-grid")).not.toBeChecked();
  await page.getByTestId("cad-osnap-mode-midpoint").uncheck();
  await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText(
    "12/14",
  );
  await page
    .getByTestId("cad-draft-settings")
    .screenshot({
      path: testInfo.outputPath("draft-settings.png"),
      scale: "css",
    });
  await page.getByTestId("cad-draft-settings-close").click();

  // El mismo punto, el mismo cursor: sin el modo, no hay captura a punto medio.
  expect(await probeMidpoint()).not.toContain("medio");

  await test.step("el cuadro y la barra de estado son el mismo estado", async () => {
    await expect(page.getByTestId("cad-draft-status-osnap")).toHaveAttribute(
      "data-active",
      "true",
    );
    await page.getByTestId("cad-draft-status-settings").click();
    await page.getByTestId("cad-draft-settings-osnap").click();
    await page.getByTestId("cad-draft-settings-close").click();
    await expect(page.getByTestId("cad-draft-status-osnap")).toHaveAttribute(
      "data-active",
      "false",
    );
    // Y F3 lo devuelve, porque el atajo toca ese mismo estado y no otro.
    await page.keyboard.press("F3");
    await expect(page.getByTestId("cad-draft-status-osnap")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  await test.step("«ninguno» y «por defecto» actúan sobre los catorce", async () => {
    await page.getByTestId("cad-draft-status-settings").click();
    await page.getByTestId("cad-osnap-none").click();
    await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText(
      "0/14",
    );
    await page.getByTestId("cad-osnap-all").click();
    await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText(
      "14/14",
    );
    await page.getByTestId("cad-osnap-reset").click();
    await expect(page.getByTestId("cad-draft-settings-mode-count")).toHaveText(
      "13/14",
    );
    await expect(page.getByTestId("cad-osnap-mode-grid")).not.toBeChecked();
    await page.getByTestId("cad-draft-settings-close").click();
  });

  // Restaurado el reparto de fábrica, el punto medio vuelve a capturar.
  expect(await probeMidpoint()).toContain("medio");
});
