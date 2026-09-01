import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { worldPoint } from "../fixtures/world-point";
import {
  touchAimAndLift,
  touchLongPress,
  touchPinch,
  touchSession,
  touchTap,
  touchTwoFingerPan,
} from "../fixtures/touch";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { fitFootprint } from "../fixtures/camera-preset";

/**
 * LA TABLETA EN LA OBRA — el recorrido que sólo se puede hacer con los dedos.
 *
 * Un arquitecto no vive en su escritorio: va a la obra, abre el plano delante
 * del maestro de obra y mide. AutoCAD cobra una aplicación móvil aparte para
 * eso. Nosotros somos una aplicación web, y en una tableta deberíamos funcionar
 * sin instalar nada — pero esa ventaja no vale nada mientras nadie compruebe
 * que los gestos funcionan. Antes de este golden nadie lo había hecho, y
 * `docs/cad/evidence/touch-support.json` publica lo que salió al mirar.
 *
 * El recorrido entero se conduce con CONTACTOS, no con el ratón:
 *
 *   encuadrar con dos dedos · pellizcar para acercar · designar un muro de un
 *   toque · dibujar apuntando y soltando · abrir el menú de palabras clave
 *   manteniendo pulsado · acotar
 *
 * Y se afirma sobre el DOCUMENTO que recibe el servidor, no sobre la interfaz:
 * una insignia que se pinta no prueba que el punto que entró al motor sea el
 * que el dedo señalaba. Lo que prueba eso es una cota cuyos orígenes valen
 * EXACTAMENTE las coordenadas del muro.
 *
 * ## El límite, dicho aquí y no sólo en el artefacto
 *
 * Chromium con táctil emulado NO es un iPad. No hay latencia de dedo, ni
 * rechazo de palma, ni teclado en pantalla, ni la heurística de gestos de
 * iPadOS. Que este golden pase significa que el PRODUCTO responde a una
 * secuencia de contactos; no significa «funciona en tableta».
 */

/** Tableta de 10" apaisada: la que cabe en una mano y va a la obra. */
test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "los contactos múltiples sólo se pueden inyectar por el protocolo de Chromium",
);

/** Rectángulo de 6×4 m. Números redondos: un error de captura se ve a simple vista. */
const WALLS = [
  { id: "muro-sur", start: { x: 1_000, y: 1_000 }, end: { x: 7_000, y: 1_000 } },
  { id: "muro-este", start: { x: 7_000, y: 1_000 }, end: { x: 7_000, y: 5_000 } },
  { id: "muro-norte", start: { x: 7_000, y: 5_000 }, end: { x: 1_000, y: 5_000 } },
  { id: "muro-oeste", start: { x: 1_000, y: 5_000 }, end: { x: 1_000, y: 1_000 } },
];

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: WALLS.map((wall) => ({
      id: wall.id,
      type: "line",
      start: { ...wall.start, z: 0 },
      end: { ...wall.end, z: 0 },
      layer: "0",
    })),
    history: [],
    modelSpace: { entityIds: WALLS.map((wall) => wall.id) },
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

/**
 * Escala y encuadre de la vista, leídos del propio editor.
 *
 * El ratón se usa aquí como APARATO DE MEDIDA y en ningún otro sitio: un dedo
 * no tiene HUD de coordenadas porque no hay hover, así que sin él no habría
 * forma de saber cuánto se movió la cámara. Todo lo que se JUZGA en este golden
 * ocurre por contactos.
 *
 * Se espera a que la vista se ASIENTE. «Ajustar a la planta» anima la cámara, y
 * muestrear a mitad de la animación mide una transformación que ya no existe.
 */
async function measureView(page: Page) {
  const box = (await page.getByTestId("cad-canvas").boundingBox())!;
  const hud = page.getByTestId("cad-cursor-coordinate");
  const read = async () => `${await hud.getAttribute("data-x")}|${await hud.getAttribute("data-y")}`;
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x - 5, y - 5);
    const neighbour = await read();
    await page.mouse.move(x, y);
    await expect.poll(read, { timeout: 15_000 }).not.toBe(neighbour);
    const [rawX, rawY] = (await read()).split("|");
    return { x: Number(rawX), y: Number(rawY) };
  };
  const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  let measured = { origin: { x: 0, y: 0 }, unitsPerPixel: 0 };
  await expect
    .poll(
      async () => {
        const origin = await sample(center.x, center.y);
        const horizontal = await sample(center.x + 80, center.y);
        const a = (horizontal.x - origin.x) / 80;
        const c = (horizontal.y - origin.y) / 80;
        const unitsPerPixel = Math.hypot(a, c);
        const settled =
          unitsPerPixel > 1e-9 &&
          Math.abs(unitsPerPixel - measured.unitsPerPixel) < unitsPerPixel * 0.01 &&
          Math.abs(origin.x - measured.origin.x) < unitsPerPixel;
        measured = { origin, unitsPerPixel };
        return settled;
      },
      { message: "la vista no se asentó tras el encuadre", timeout: 30_000 },
    )
    .toBe(true);
  return { box, center, ...measured };
}

async function openPlan(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 8_000,
    footprintH: 6_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 4");
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  // Modo plano: planta bloqueada, que es como se dibuja. En 2D un dedo designa
  // y dos dedos son la cámara.
  await page.getByTitle(/Vista de plano 2D/).click();
  await fitFootprint(page);
  return backend;
}

test("un arquitecto abre el plano en la tableta, encuadra, designa, dibuja y acota sólo con los dedos", async ({
  context,
  page,
}) => {
  // Nueve gestos, sus reencuadres y seis lazos cerrados contra el HUD para
  // localizar cada punto; en una máquina cargada el reloj de serie se queda
  // corto y el fallo no diría nada del producto.
  test.setTimeout(300_000);
  const backend = await openPlan(context, page);
  const cdp = await touchSession(page);

  // ---- 1. ENCUADRAR CON DOS DEDOS -----------------------------------------
  const start = await measureView(page);
  await touchTwoFingerPan(cdp, start.center, { x: 120, y: 0 });
  const panned = await measureView(page);
  const shiftedPx =
    Math.hypot(panned.origin.x - start.origin.x, panned.origin.y - start.origin.y) /
    start.unitsPerPixel;
  expect(shiftedPx, "dos dedos arrastran la vista: es el gesto universal").toBeGreaterThan(60);

  // ---- 2. PELLIZCAR PARA ACERCAR ------------------------------------------
  await fitFootprint(page);
  const beforePinch = await measureView(page);
  await touchPinch(cdp, beforePinch.center, 80, 320);
  const afterPinch = await measureView(page);
  expect(
    beforePinch.unitsPerPixel / afterPinch.unitsPerPixel,
    "separar dos dedos ×4 acerca el plano",
  ).toBeGreaterThan(2);

  // ---- 3. DESIGNAR DE UN TOQUE --------------------------------------------
  await fitFootprint(page);
  await measureView(page);
  // Los píxeles de cada punto salen del helper compartido, que cierra el lazo
  // contra el HUD hasta que la coordenada leída ES la pedida. Extrapolar de una
  // afín muestreada deja error acumulado, y una cota que nace 800 unidades
  // fuera del muro no prueba nada sobre la captura a objeto con el dedo.
  const at = (target: { x: number; y: number }) => worldPoint(page, target);
  await touchTap(cdp, await at({ x: 4_000, y: 1_000 }));
  await expect(page.getByTestId("cad-selection-status-count")).toHaveText("1 sel");

  // ---- 4. DIBUJAR APUNTANDO Y SOLTANDO ------------------------------------
  // Un dedo no tiene hover: la única forma de ver a dónde va a caer el punto es
  // posarlo, deslizar mirando y soltar. Antes de esta ola ese deslizamiento
  // ANULABA el punto y no se dibujaba nada.
  const command = page.getByTestId("cad-command-input");
  const prompt = page.getByTestId("cad-command-prompt");
  await command.click();
  await command.fill("LINE");
  await command.press("Enter");
  await expect(prompt).toContainText("primer punto");
  for (const vertex of [
    { x: 2_000, y: 2_000 },
    { x: 6_000, y: 2_000 },
    { x: 6_000, y: 4_000 },
  ])
    await touchAimAndLift(cdp, await at(vertex));
  await expect(prompt).toContainText("punto siguiente");

  // ---- 5. MANTENER PULSADO ES EL BOTÓN DERECHO ----------------------------
  // El menú NO es nuevo: es el mismo que el botón derecho ya abría con las
  // palabras clave del paso. Lo que faltaba era el gesto que lo alcanza.
  await touchLongPress(cdp, await at({ x: 3_000, y: 3_000 }));
  const keywords = page.getByTestId("cad-pointer-menu");
  await expect(keywords, "mantener pulsado abre las palabras clave del paso").toBeVisible();
  // La palabra clave se pulsa CON EL DEDO, como todo lo demás: un menú que sólo
  // se deja elegir con ratón no resuelve nada en una tableta.
  const close = (await keywords.getByTestId("cad-pointer-keyword-Cerrar").boundingBox())!;
  await touchTap(cdp, { x: close.x + close.width / 2, y: close.y + close.height / 2 });
  await expect(prompt).toBeHidden();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 7");

  // ---- 6. ACOTAR ----------------------------------------------------------
  // Lo que hace útil una cota es que nazca ENGANCHADA. Los dos orígenes se
  // señalan con el dedo sobre los extremos del muro sur; si la captura a objeto
  // no llegara al punto que el dedo tapa, la cota saldría con coordenadas
  // aproximadas y esta prueba lo diría.
  await command.click();
  await command.fill("DIMLINEAR");
  await command.press("Enter");
  await expect(prompt).toContainText("referencia");
  await touchAimAndLift(cdp, await at({ x: 1_000, y: 1_000 }));
  await touchAimAndLift(cdp, await at({ x: 7_000, y: 1_000 }));
  await expect(prompt).toContainText("línea de cota");
  await touchAimAndLift(cdp, await at({ x: 4_000, y: 2_500 }));
  await expect(prompt).toBeHidden();

  // ---- 7. LO DIBUJADO CON LOS DEDOS LLEGA AL SERVIDOR ----------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  const dimension = saved.entities.find((entity) => entity.type === "dimension");
  expect(dimension, "la cota acotada con el dedo existe en el documento").toBeTruthy();
  if (dimension?.type !== "dimension") throw new Error("no es una cota");
  expect(dimension.a).toMatchObject({ x: 1_000, y: 1_000 });
  expect(dimension.b).toMatchObject({ x: 7_000, y: 1_000 });
  expect(
    saved.entities.filter((entity) => entity.type === "line").length,
    "las cuatro paredes sembradas más los tres tramos dibujados con el dedo",
  ).toBe(7);
});
