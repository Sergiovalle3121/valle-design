import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { enter3DView } from "../fixtures/view-mode";
import { fitFootprint, topView } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import {
  DENTRO,
  HOLGURA_PERIMETRO,
  HOLGURA_SUPERFICIE,
  PERIMETRO,
  SOBRE_UN_TRAMO,
  SUPERFICIE,
  TRAMOS,
  lineasMalEmpatadas,
  shoelace,
} from "../../src/lib/cad/verification/planta-mal-empatada";

/**
 * OLA D — LA PRUEBA DE DESPACHO del área 2 del listón, contra el producto.
 *
 * «Recibir un DWG, unir 34 líneas mal empatadas y obtener perímetro y
 * superficie.» Medido el 2026-09-01 (distancia-autocad-completo-20260901.md,
 * FRENTE 3): fallaba en el PRIMER paso, porque no existía HPGAPTOL y JOIN no
 * rellenaba huecos. La planta, sus huecos (0,2–0,92 mm) y el oráculo en papel
 * (92.840.000 mm², 46.297,06 mm) son los de `planta-mal-empatada.ts`, los
 * mismos que mide `prueba-de-despacho.spec.ts` sin navegador.
 *
 * Dos recorridos, TECLEADOS con el lienzo enfocado como en el golden 73:
 *
 *   A. HATCH ⏎ 6000,4000 ⏎ → «no está dentro de ningún contorno cerrado»
 *      (la verdad). SETVAR ⏎ HPGAPTOL ⏎ 2 ⏎. HATCH ⏎ → el prompt avisa de la
 *      tolerancia y de que el sombreado no será asociativo; 6000,4000 ⏎ → el
 *      sombreado de la planta. BOUNDARY ⏎ 6000,4000 ⏎ → UNA polilínea cerrada.
 *   B. Ctrl+A, JOIN ⏎ T ⏎ 2 ⏎ ⏎ → las 34 líneas son UNA polilínea cerrada.
 *      AREA ⏎ O ⏎ y un clic sobre ella → «Área = …, Perímetro = …» en el
 *      diálogo, con los números del papel.
 *
 * Lo que se afirma es lo que el SERVIDOR recibió y lo que el diálogo DIJO.
 */
type CadHatch = Extract<CadEntity, { type: "hatch" }>;
type CadPolyline = Extract<CadEntity, { type: "polyline" }>;

function seedDocument(): CadDocument {
  const entities = lineasMalEmpatadas("MUROS");
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#f59e0b", visible: true, locked: false },
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
  } as unknown as CadDocument;
}

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 14_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(`Native ${TRAMOS}`);
  return backend;
}

/** Teclea con el lienzo enfocado: la primera tecla enfoca la caja, Intro devuelve el foco. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await expect(input).not.toBeFocused();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(input).not.toBeFocused();
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const log = (page: Page) => page.getByTestId("cad-command-line-log");
const dentro = `${DENTRO.x},${DENTRO.y}`;

/**
 * Pantalla ↔ dibujo, deducido del propio editor (mismo método que los goldens
 * 33 y 46): se muestrea la coordenada que el editor publica bajo el cursor en
 * tres puntos y se invierte la afín resultante.
 */
async function screenPointFor(page: Page, target: { x: number; y: number }) {
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("El lienzo CAD no tiene caja");
  const coordinate = page.getByTestId("cad-cursor-coordinate");
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await expect.poll(async () => coordinate.getAttribute("data-x")).not.toBe("");
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
  if (Math.abs(determinant) < 1e-9) throw new Error("La transformada mundo/pantalla es singular");
  const wx = target.x - origin.x;
  const wy = target.y - origin.y;
  return {
    x: screen.x + (d * wx - b * wy) / determinant,
    y: screen.y + (a * wy - c * wx) / determinant,
  };
}

test("A · HPGAPTOL: el contorno que no cerraba se sombrea y BOUNDARY lo dibuja", async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);

  // --- 1. Sin tolerancia, la verdad: no hay contorno cerrado -----------------
  await type(page, "HATCH");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).not.toContainText("Tolerancia de hueco");
  await type(page, dentro);
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("no está dentro de ningún contorno cerrado");

  // --- 2. HPGAPTOL = 2, como en AutoCAD: por SETVAR ---------------------------
  await type(page, "SETVAR");
  await expect(prompt(page)).toContainText("variable de sistema");
  await type(page, "HPGAPTOL");
  await expect(prompt(page)).toContainText("Nuevo valor de HPGAPTOL");
  await type(page, "2");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("HPGAPTOL = 2");

  // --- 3. Ahora cierra, y el prompt dijo antes lo que iba a pasar ------------
  await type(page, "HATCH");
  await expect(prompt(page)).toContainText("Tolerancia de hueco 2");
  await expect(prompt(page)).toContainText("no será asociativo");
  await type(page, dentro);
  await expect(prompt(page)).toBeHidden();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(`Native ${TRAMOS + 1}`);

  // --- 4. BOUNDARY: la planta como una polilínea cerrada ----------------------
  await type(page, "BOUNDARY");
  await expect(prompt(page)).toContainText("Tolerancia de hueco 2");
  await expect(prompt(page)).not.toContainText("asociativo");
  await type(page, dentro);
  await expect(prompt(page)).toBeHidden();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(`Native ${TRAMOS + 2}`);

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved.filter((entity) => entity.type === "line")).toHaveLength(TRAMOS);

  const hatches = saved.filter((entity): entity is CadHatch => entity.type === "hatch");
  expect(hatches).toHaveLength(1);
  const [hatch] = hatches;
  expect(hatch.boundaries).toHaveLength(1);
  expect(hatch.boundaries[0]).toHaveLength(TRAMOS);
  expect(Math.abs(shoelace(hatch.boundaries[0]) - SUPERFICIE)).toBeLessThanOrEqual(HOLGURA_SUPERFICIE);
  // Nace NO asociativo: el regenerador cose con la tolerancia de fábrica y lo
  // marcaría roto al primer movimiento. Fingir lo contrario sería peor.
  expect(hatch.associative).toBeUndefined();
  expect(hatch.boundaryRefs).toBeUndefined();

  const polylines = saved.filter((entity): entity is CadPolyline => entity.type === "polyline");
  expect(polylines).toHaveLength(1);
  expect(polylines[0].closed).toBe(true);
  expect(polylines[0].vertices).toHaveLength(TRAMOS);
  expect(Math.abs(shoelace(polylines[0].vertices) - SUPERFICIE)).toBeLessThanOrEqual(HOLGURA_SUPERFICIE);
});

test("B · JOIN Tolerancia une las 34 líneas y AREA Objeto da superficie y perímetro", async ({ context, page }) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);
  // AREA Objeto se designa con el RATÓN: hace falta la inversión mundo↔pantalla
  // del visor 3D en planta, como en los goldens 33 y 46.
  await enter3DView(page);
  await topView(page);
  await fitFootprint(page);

  // --- 1. Ctrl+A designa las 34; JOIN con Tolerancia 2 las une --------------
  await page.keyboard.press("Control+a");
  await type(page, "JOIN");
  await expect(prompt(page)).toContainText("Designe los objetos a unir");
  await type(page, "T");
  await expect(prompt(page)).toContainText("distancia de aproximación");
  await type(page, "2");
  await expect(prompt(page)).toContainText("Distancia de aproximación 2");
  await page.keyboard.press("Enter");
  await expect(prompt(page)).toBeHidden();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");

  // --- 2. AREA Objeto: un clic sobre la polilínea ----------------------------
  await type(page, "AREA");
  await expect(prompt(page)).toBeVisible();
  await type(page, "O");
  await expect(prompt(page)).toContainText("objeto");
  const onEdge = await screenPointFor(page, SOBRE_UN_TRAMO);
  await page.mouse.click(onEdge.x, onEdge.y);
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("Área = ");
  const dialogue = (await log(page).textContent()) ?? "";
  const report = /Área = ([\d.]+)[^\d]*?Perímetro = ([\d.]+)/.exec(dialogue);
  expect(report, `el diálogo debía informar área y perímetro: «${dialogue}»`).not.toBeNull();
  if (!report) throw new Error("inalcanzable");
  expect(Math.abs(Number(report[1]) - SUPERFICIE)).toBeLessThanOrEqual(HOLGURA_SUPERFICIE);
  expect(Math.abs(Number(report[2]) - PERIMETRO)).toBeLessThanOrEqual(HOLGURA_PERIMETRO);
  expect(dialogue).not.toContain("está abierto");

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  expect(saved).toHaveLength(1);
  const [polyline] = saved;
  expect(polyline.type).toBe("polyline");
  if (polyline.type !== "polyline") throw new Error("inalcanzable");
  expect(polyline.closed).toBe(true);
  expect(polyline.vertices).toHaveLength(TRAMOS);
  expect(polyline.layer).toBe("MUROS");
  expect(Math.abs(shoelace(polyline.vertices) - SUPERFICIE)).toBeLessThanOrEqual(HOLGURA_SUPERFICIE);
});
