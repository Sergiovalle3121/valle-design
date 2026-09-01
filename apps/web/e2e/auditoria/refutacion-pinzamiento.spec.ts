import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { fitFootprint } from "../fixtures/camera-preset";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * CONTRAPRUEBA DEL ESCÉPTICO.
 *
 * El informe original comparaba +600 (verde) contra -600 (rojo) y medía «no se
 * creó nada» con un FILTRO por la y esperada. Eso deja abiertas dos salidas:
 * que el signo importe, y que sí se creara geometría pero en el otro lado.
 *
 * Aquí las dos ramas usan la MISMA distancia (+600), el MISMO píxel (el punto
 * medio exacto del eje) y se cuenta el TOTAL de entidades, no un filtro. Lo
 * único que cambia entre una y otra es si el eje está designado.
 */

function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      { id: "eje", type: "line", start: { x: 1_000, y: 7_000, z: 0 }, end: { x: 9_000, y: 7_000, z: 0 }, layer: "0" },
      { id: "columna", type: "circle", center: { x: 2_500, y: 2_000, z: 0 }, radius: 400, layer: "0" },
    ],
    history: [],
    modelSpace: { entityIds: ["eje", "columna"] },
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

const estado: { pixel: { x: number; y: number } | null; lectura: { x: number; y: number } | null } = {
  pixel: null,
  lectura: null,
};

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
  estado.pixel = null;
  estado.lectura = null;
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

async function teclear(page: Page, valor: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(valor);
  await input.press("Enter");
}

async function terminar(page: Page) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill("");
  await input.press("Enter");
}

interface Afin {
  centro: { x: number; y: number };
  origen: { x: number; y: number };
  a: number; b: number; c: number; d: number; det: number;
  paso: number;
}

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

const propiedades = (page: Page) => page.getByTestId("cad-native-properties");

async function soltarSeleccion(page: Page) {
  const soltar = propiedades(page).getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
}

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

/** Todas las horizontales del documento, por su y. Sin filtrar por lo esperado. */
const horizontales = (documento: CadDocument) =>
  documento.entities
    .filter(
      (entidad): entidad is Extract<CadDocument["entities"][number], { type: "line" }> =>
        entidad.type === "line",
    )
    .map((entidad) => entidad.start.y)
    .sort((izq, der) => izq - der);

async function desfasarEnElPuntoMedio(
  page: Page,
  backend: { snapshot(): { document: CadDocument; version: number } },
  pxPuntoMedio: { x: number; y: number },
  etiqueta: string,
) {
  const prompt = page.getByTestId("cad-command-prompt");
  await teclear(page, "OFFSET");
  await expect(prompt).toContainText("desfase");
  await teclear(page, "600");
  await expect(prompt).toContainText("Designe");
  await page.mouse.click(pxPuntoMedio.x, pxPuntoMedio.y);
  // Lo que el editor cree tener ANTES de cerrar el comando y de guardar.
  const enVivo = await page.getByTestId("cad-native-document-count").textContent();
  await terminar(page);
  await expect(prompt).toBeHidden();
  const documento = await guardar(page, backend);
  console.log(
    `[escéptico] ${etiqueta}: en vivo «${enVivo}», guardadas ${documento.entities.length}, ` +
      `horizontales en y=${JSON.stringify(horizontales(documento))}`,
  );
  return documento;
}

test("A — SIN designar: OFFSET 600 pinchando el PUNTO MEDIO del eje SÍ crea la paralela", async ({
  context,
  page,
}) => {
  test.setTimeout(300_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 2");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const pxPuntoMedio = await pixelDe(page, afin, { x: 5_000, y: 7_000 });
  await soltarSeleccion(page);

  const documento = await desfasarEnElPuntoMedio(page, backend, pxPuntoMedio, "A sin designar");
  expect(documento.entities).toHaveLength(3);
  expect(horizontales(documento)).toHaveLength(2);
});

test("B — CON el eje designado: MISMO píxel, MISMA distancia, y no se crea NADA", async ({
  context,
  page,
}) => {
  test.setTimeout(300_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 2");
  await fitFootprint(page);
  const afin = await calibrar(page);
  const pxPuntoMedio = await pixelDe(page, afin, { x: 5_000, y: 7_000 });

  // Única variable respecto de A: el eje queda designado (y enseña pinzamientos).
  await page.getByTestId("cad-native-entity-eje").click();
  await expect(propiedades(page)).toBeVisible();

  const documento = await desfasarEnElPuntoMedio(page, backend, pxPuntoMedio, "B designado");
  expect(
    documento.entities,
    "si esto son 2, el clic no llegó al comando: mismo píxel y misma distancia que A",
  ).toHaveLength(3);
});
