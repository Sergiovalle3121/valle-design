import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { fitFootprint } from "../fixtures/camera-preset";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * AUDITORÍA — EL DÍA A DÍA DE QUIEN EDITA UN PLANO QUE YA EXISTE.
 *
 * No se dibuja casi nunca desde cero. Se abre lo que hay y se MUEVE, se COPIA,
 * se DESFASA, se RECORTA y se ALARGA. Y cuando algo sale mal se DESHACE. Ese
 * último es el que decide si el programa se puede usar: un deshacer que
 * devuelve «casi» el dibujo anterior es peor que no tener deshacer, porque el
 * error se firma sin verlo.
 *
 * Recorrido, en el orden en que lo haría un ingeniero:
 *   1. MOVE   la columna 1500 mm a la derecha
 *   2. COPY   la columna 3000 mm más allá
 *   3. OFFSET el eje a 600 mm
 *   4. TRIM   el muro contra el tabique
 *   5. EXTEND la viga hasta el pilar
 *   6. DESHACER cinco veces, comprobando PASO A PASO que cada estado
 *      intermedio es EXACTAMENTE el que había antes de esa orden
 *   7. REHACER cinco veces y volver al final, también paso a paso
 *
 * La comparación es de igualdad estructural profunda sobre las entidades y
 * sobre el orden de dibujo, no «tiene el mismo número de objetos».
 *
 * CÓMO SE CORRE (el puerto no es opcional):
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/modificar.spec.ts --project=chromium --reporter=line
 */

/* ─────────────────── el plano que ya está sobre la mesa ─────────────────── */

const SEMILLA_IDS = [
  "muro-largo",
  "tabique",
  "viga",
  "pilar-tope",
  "eje",
  "columna",
] as const;

function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      // Muro corrido que sobresale del tabique: hay que recortarlo.
      { id: "muro-largo", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 9_000, y: 1_000, z: 0 }, layer: "0" },
      { id: "tabique", type: "line", start: { x: 6_000, y: 200, z: 0 }, end: { x: 6_000, y: 1_800, z: 0 }, layer: "0" },
      // Viga que se queda corta: hay que alargarla hasta el pilar.
      { id: "viga", type: "line", start: { x: 1_000, y: 4_000, z: 0 }, end: { x: 4_000, y: 4_000, z: 0 }, layer: "0" },
      { id: "pilar-tope", type: "line", start: { x: 7_000, y: 3_200, z: 0 }, end: { x: 7_000, y: 4_800, z: 0 }, layer: "0" },
      // Eje de replanteo que hay que desfasar.
      { id: "eje", type: "line", start: { x: 1_000, y: 7_000, z: 0 }, end: { x: 9_000, y: 7_000, z: 0 }, layer: "0" },
      // Columna que hay que mover y repetir.
      { id: "columna", type: "circle", center: { x: 2_500, y: 9_000, z: 0 }, radius: 400, layer: "0" },
    ],
    history: [],
    modelSpace: { entityIds: [...SEMILLA_IDS] },
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

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documentoSemilla(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  // El cacheo del visor es de módulo: cada prueba abre una página nueva.
  estado.pixel = null;
  estado.lectura = null;
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

/* ───────────────────────── teclado: la línea de órdenes ─────────────────── */

async function teclear(page: Page, valor: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(valor);
  await input.press("Enter");
}

/** Intro en vacío: así se cierra un comando que sigue pidiendo más. */
async function terminar(page: Page) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill("");
  await input.press("Enter");
}

/* ─────────────────────── ratón: coordenada de dibujo → píxel ─────────────
 * Se calibra la afín mundo↔pantalla UNA vez muestreando el visor de
 * coordenadas de la barra de estado (lo mismo que lee el usuario) y después
 * cada punto sale de una multiplicación. `e2e/fixtures/world-point.ts` hace lo
 * mismo, pero en esta máquina no cabe en su propio plazo de 15 s (medido en
 * e2e/auditoria/precision.spec.ts); esto tarda ~1 s y se comprueba contra el
 * propio visor antes de usarse.
 */

interface Afin {
  centro: { x: number; y: number };
  origen: { x: number; y: number };
  a: number; b: number; c: number; d: number; det: number;
  paso: number;
}

const estado: { pixel: { x: number; y: number } | null; lectura: { x: number; y: number } | null } = {
  pixel: null,
  lectura: null,
};

async function leerVisor(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const hud = document.querySelector('[data-testid="cad-cursor-coordinate"]');
    return { x: Number(hud?.getAttribute("data-x")), y: Number(hud?.getAttribute("data-y")) };
  });
}

async function muestrear(page: Page, px: number, py: number): Promise<{ x: number; y: number }> {
  if (estado.pixel && estado.pixel.x === px && estado.pixel.y === py && estado.lectura)
    return estado.lectura;
  const previo = estado.lectura;
  await page.mouse.move(px, py);
  const limite = Date.now() + 3_000;
  let lectura = await leerVisor(page);
  while (previo && lectura.x === previo.x && lectura.y === previo.y && Date.now() < limite) {
    await page.waitForTimeout(50);
    lectura = await leerVisor(page);
  }
  if (!Number.isFinite(lectura.x) || !Number.isFinite(lectura.y))
    throw new Error(`El visor de coordenadas no publica nada en el píxel (${px}, ${py})`);
  estado.pixel = { x: px, y: py };
  estado.lectura = lectura;
  return lectura;
}

async function calibrar(page: Page): Promise<Afin> {
  const caja = await page.getByTestId("cad-canvas").boundingBox();
  if (!caja) throw new Error("El lienzo no tiene caja");
  const centro = { x: Math.round(caja.x + caja.width / 2), y: Math.round(caja.y + caja.height / 2) };
  const origen = await muestrear(page, centro.x, centro.y);
  const horizontal = await muestrear(page, centro.x + 80, centro.y);
  const vertical = await muestrear(page, centro.x, centro.y + 80);
  const a = (horizontal.x - origen.x) / 80;
  const b = (vertical.x - origen.x) / 80;
  const c = (horizontal.y - origen.y) / 80;
  const d = (vertical.y - origen.y) / 80;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) throw new Error("La afín mundo↔pantalla es singular");
  const diagonal = Math.max(Math.abs(a), Math.abs(d));
  if (Math.max(Math.abs(b), Math.abs(c)) > diagonal * 0.02)
    throw new Error("La vista no está en planta ortográfica");
  return { centro, origen, a, b, c, d, det, paso: diagonal };
}

/** Píxel de una coordenada de dibujo, cerrado en lazo contra el visor. */
async function pixelDe(page: Page, afin: Afin, destino: { x: number; y: number }) {
  let posicion = {
    x: Math.round(afin.centro.x + (afin.d * (destino.x - afin.origen.x) - afin.b * (destino.y - afin.origen.y)) / afin.det),
    y: Math.round(afin.centro.y + (-afin.c * (destino.x - afin.origen.x) + afin.a * (destino.y - afin.origen.y)) / afin.det),
  };
  for (let intento = 0; intento < 6; intento += 1) {
    const medido = await muestrear(page, posicion.x, posicion.y);
    const ex = destino.x - medido.x;
    const ey = destino.y - medido.y;
    if (Math.max(Math.abs(ex), Math.abs(ey)) <= afin.paso * 0.6) return posicion;
    posicion = {
      x: Math.round(posicion.x + (afin.d * ex - afin.b * ey) / afin.det),
      y: Math.round(posicion.y + (-afin.c * ex + afin.a * ey) / afin.det),
    };
  }
  throw new Error(`No convergí al píxel de (${destino.x}, ${destino.y})`);
}

/* ─────────────────────────── selección y guardado ───────────────────────── */

const propiedades = (page: Page) => page.getByTestId("cad-native-properties");

/** Designa un objeto pinchándolo en la lista del editor, como haría cualquiera. */
async function designar(page: Page, id: string) {
  const soltar = propiedades(page).getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
  await page.getByTestId(`cad-native-entity-${id}`).click();
  await expect(propiedades(page)).toBeVisible();
}

async function soltarSeleccion(page: Page) {
  const soltar = propiedades(page).getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
}

/** Guarda y devuelve el documento persistido. Tolera «no hay nada que guardar». */
async function guardar(
  page: Page,
  backend: { snapshot(): { document: CadDocument; version: number } },
): Promise<CadDocument> {
  const boton = page.getByTestId("cad-save");
  if (await boton.count()) {
    if (await boton.isEnabled()) {
      await boton.click();
      await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", { timeout: 20_000 });
    }
  }
  return backend.snapshot().document;
}

/* ────────────────────── la foto del dibujo que se compara ───────────────── */

/* ══════════════════════════════════════════════════════════════════════════
 * CONTROLES DEL ESCÉPTICO.
 *
 * El informe dice: «con el muro SELECCIONADO el recorte no ocurre; sin nada
 * seleccionado, el MISMO píxel recorta». Su control cambia UNA cosa —la
 * selección— pero eso deja DOS explicaciones vivas:
 *   (a) el pinzamiento que dibuja la selección, justo bajo el clic, se come el
 *       clic;
 *   (b) tener algo seleccionado rompe TRIM sea donde sea el clic.
 * Se separan con dos experimentos más.
 * ══════════════════════════════════════════════════════════════════════════ */

async function recortarPinchando(
  page: Page,
  backend: { snapshot(): { document: CadDocument; version: number } },
  pixel: { x: number; y: number },
): Promise<number> {
  const prompt = page.getByTestId("cad-command-prompt");
  await teclear(page, "TRIM");
  await expect(prompt).toContainText("bordes de corte");
  await terminar(page);
  await expect(prompt).toContainText("recortar");
  await page.mouse.click(pixel.x, pixel.y);
  await terminar(page);
  await expect(prompt).toBeHidden();
  const documento = await guardar(page, backend);
  const muro = documento.entities.find((entidad) => entidad.id === "muro-largo");
  return muro && muro.type === "line" ? muro.end.x : Number.NaN;
}

test("A — muro SELECCIONADO, clic en el sobrante DONDE NO HAY PINZAMIENTO (7500)", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");
  await fitFootprint(page);
  const afin = await calibrar(page);
  // Pinzamientos del muro: (1000,1000) inicio, (5000,1000) medio, (9000,1000) fin.
  // 7500 no es ninguno de los tres.
  const px = await pixelDe(page, afin, { x: 7_500, y: 1_000 });
  await designar(page, "muro-largo");
  const extremo = await recortarPinchando(page, backend, px);
  console.log(`[escéptico A] muro SELECCIONADO, clic sin pinzamiento: x=${extremo}`);
  expect(extremo).toBeCloseTo(6_000, 6);
});

test("B — OTRA entidad seleccionada (eje, lejos), clic en el EXTREMO del muro (9000)", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const px = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
  // El eje vive en y=7000: sus pinzamientos están a 6000 mm del clic.
  await designar(page, "eje");
  const extremo = await recortarPinchando(page, backend, px);
  console.log(`[escéptico B] EJE seleccionado, clic en el extremo del muro: x=${extremo}`);
  expect(extremo).toBeCloseTo(6_000, 6);
});

test("C — muro SELECCIONADO, clic en su EXTREMO (9000): el caso del informe", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const px = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
  await designar(page, "muro-largo");
  const extremo = await recortarPinchando(page, backend, px);
  console.log(`[escéptico C] muro SELECCIONADO, clic en su extremo: x=${extremo}`);
  expect(extremo).toBeCloseTo(6_000, 6);
});

test("D — NADA seleccionado, clic en el EXTREMO (9000): el control del informe", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const px = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
  await soltarSeleccion(page);
  const extremo = await recortarPinchando(page, backend, px);
  console.log(`[escéptico D] NADA seleccionado, clic en el extremo: x=${extremo}`);
  expect(extremo).toBeCloseTo(6_000, 6);
});

test("E — ¿qué se come el clic? Arrastrar en ese píxel DURANTE el TRIM", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const px = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
  await designar(page, "muro-largo");

  const prompt = page.getByTestId("cad-command-prompt");
  await teclear(page, "TRIM");
  await expect(prompt).toContainText("bordes de corte");
  await terminar(page);
  await expect(prompt).toContainText("recortar");

  // En vez de un clic, un ARRASTRE de 60 px hacia abajo desde el mismo píxel.
  // Si el motor tuviera el puntero, esto no movería geometría: el paso sólo
  // designa. Si el que lo tiene es el gestor de pinzamientos, el extremo del
  // muro se estira y el dibujo cambia MIENTRAS el comando pedía un objeto.
  await page.mouse.move(px.x, px.y);
  await page.mouse.down();
  await page.mouse.move(px.x, px.y + 60, { steps: 12 });
  await page.mouse.up();
  await terminar(page);

  const documento = await guardar(page, backend);
  const muro = documento.entities.find((entidad) => entidad.id === "muro-largo");
  const fin = muro && muro.type === "line" ? muro.end : null;
  console.log(`[escéptico E] extremo del muro tras arrastrar durante el TRIM: ${JSON.stringify(fin)}`);
  expect(fin, "el extremo NO debería haberse movido: el paso activo sólo designaba").toMatchObject({
    x: 9_000,
    y: 1_000,
  });
});

test("F — línea base: arrastrar ese MISMO píxel SIN ningún comando abierto", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const px = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
  await designar(page, "muro-largo");
  await page.mouse.move(px.x, px.y);
  await page.mouse.down();
  await page.mouse.move(px.x, px.y + 60, { steps: 12 });
  await page.mouse.up();
  const documento = await guardar(page, backend);
  const muro = documento.entities.find((entidad) => entidad.id === "muro-largo");
  const fin = muro && muro.type === "line" ? muro.end : null;
  console.log(`[escéptico F] extremo tras arrastrar SIN comando: ${JSON.stringify(fin)}`);
});
