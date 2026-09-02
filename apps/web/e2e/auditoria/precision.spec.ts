import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { importDxfPrimitives } from "../../src/lib/cad/dxf-import";
import { fitFootprint } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * AUDITORÍA — EL NÚMERO EXACTO.
 *
 * Quien firma un plano no puede permitirse que una cota de 3500 mm se guarde
 * como 3499,98. El error no se ve en pantalla, se ve en obra: dos meses después
 * y con el hormigón puesto. Este spec entra por donde entraría un delineante que
 * dibuja por coordenadas y comprueba lo que hay DENTRO del documento guardado,
 * no lo que pinta el lienzo.
 *
 * Tres preguntas, y ninguna admite «casi»:
 *
 *   1. ¿ABS, REL y POLAR escriben el número que se teclea? (LINE 0,0 → @3500,0)
 *   2. ¿La herramienta de medir (DIST) devuelve el mismo número que se dibujó?
 *   3. ¿El enganche a extremo (OSNAP) entrega la coordenada EXACTA del vértice
 *      capturado, o entrega la del ratón redondeada?
 *
 * La 3 se prueba a propósito contra un extremo de coordenada IRRACIONAL
 * (1000 + 3500·cos30°), que es el caso real: el extremo al que uno se engancha
 * casi nunca cae en número redondo. Con un extremo en 6000,4000 un snap que
 * redondease al milímetro pasaría la prueba sin merecerlo.
 *
 * CÓMO SE CORRE (el puerto NO es opcional; ver e2e/auditoria/00-arranque.spec.ts):
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/precision.spec.ts --project=chromium --reporter=line
 */

/** Tolerancia de ingeniería: cero, salvo el redondeo del propio IEEE-754. */
const CERO = 1e-9;

/** Largo de la cota que se audita, en milímetros de dibujo. */
const LARGO = 3_500;

/** Origen y ángulo de la línea polar; el extremo cae en coordenada irracional. */
const POLAR_ORIGEN = { x: 1_000, y: 5_000 };
const POLAR_ANGULO = 30;
const POLAR_EXTREMO = {
  x: POLAR_ORIGEN.x + LARGO * Math.cos((POLAR_ANGULO * Math.PI) / 180),
  y: POLAR_ORIGEN.y + LARGO * Math.sin((POLAR_ANGULO * Math.PI) / 180),
};

function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
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
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function teclear(page: Page, valor: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(valor);
  await input.press("Enter");
}

/** Intro en vacío: es como se remata LINE cuando ya no hay más vértices. */
async function terminar(page: Page) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill("");
  await input.press("Enter");
}

async function esperarEntidades(page: Page, total: number) {
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(`Native ${total}`);
}

/**
 * Coordenada de dibujo → píxel, muestreando el MISMO visor de coordenadas que
 * lee el usuario en la barra inferior.
 *
 * ── POR QUÉ NO SE USA AQUÍ `e2e/fixtures/world-point.ts` ────────────────────
 * Se intentó primero, y no es un capricho de estilo: en esta máquina la fixture
 * NO CABE EN SU PROPIO PLAZO. Medido con el reloj, llamada a llamada:
 *
 *     worldPoint recién abierto el estudio ...... OK  en 17,0 s
 *     worldPoint tras «Ajustar a la planta» ..... OK  en 13,3 s
 *     worldPoint tras dibujar una línea ......... OK  en 15,7 s
 *     worldPoint tras guardar ................... FALLO en 16,1 s
 *     worldPoint repetido ....................... FALLO en 16,0 s
 *
 * con «la vista no se asentó en planta ortográfica» y su plazo de 15 s agotado.
 * La causa NO es del producto: el visor de coordenadas está vivo y es correcto
 * —comprobado a mano en los mismos puntos, con el lienzo respondiendo bajo el
 * cursor—, pero cada iteración del asentamiento de la fixture cuesta 5-7 s
 * porque encadena seis `expect.poll` anidados, cuya escalera de reintentos
 * (100, 250, 500, 1000 ms…) domina el tiempo. Con 15 s de plazo caben dos
 * iteraciones y el asentamiento necesita la segunda: es una moneda al aire, y
 * bajo carga sale cruz. (El equipo ya tenía anotado «61 falla en worldPoint»;
 * esto es, medido, por qué.)
 *
 * Este muestreo hace lo mismo con espera activa de 50 ms y tarda ~1 s. La
 * frescura se garantiza por CAMBIO —cada lectura tiene que diferir de la del
 * punto anterior—, nunca por dormir a ciegas, y el resultado se cierra en lazo
 * contra el propio visor hasta caer dentro de medio píxel del punto pedido.
 */
async function leerVisor(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const hud = document.querySelector('[data-testid="cad-cursor-coordinate"]');
    return {
      x: Number(hud?.getAttribute("data-x")),
      y: Number(hud?.getAttribute("data-y")),
    };
  });
}

async function muestrear(
  page: Page,
  x: number,
  y: number,
  previo: { x: number; y: number } | null,
): Promise<{ x: number; y: number }> {
  await page.mouse.move(x, y);
  const limite = Date.now() + 3_000;
  let lectura = await leerVisor(page);
  while (previo && lectura.x === previo.x && lectura.y === previo.y && Date.now() < limite) {
    await page.waitForTimeout(50);
    lectura = await leerVisor(page);
  }
  if (!Number.isFinite(lectura.x) || !Number.isFinite(lectura.y))
    throw new Error(`El visor de coordenadas no publica nada en (${x}, ${y})`);
  return lectura;
}

async function pixelDe(page: Page, destino: { x: number; y: number }) {
  const caja = await page.getByTestId("cad-canvas").boundingBox();
  if (!caja) throw new Error("El lienzo no tiene caja");
  const centro = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 };
  const origen = await muestrear(page, centro.x, centro.y, null);
  const horizontal = await muestrear(page, centro.x + 80, centro.y, origen);
  const vertical = await muestrear(page, centro.x, centro.y + 80, horizontal);
  const a = (horizontal.x - origen.x) / 80;
  const b = (vertical.x - origen.x) / 80;
  const c = (horizontal.y - origen.y) / 80;
  const d = (vertical.y - origen.y) / 80;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) throw new Error("La afín mundo↔pantalla es singular");
  // Planta ortográfica: los términos cruzados son ~0 frente a la diagonal. Si no
  // lo fueran, la vista no sería cenital y apuntar a una coordenada no tendría
  // sentido; se dice en vez de devolver un píxel cualquiera.
  const diagonal = Math.max(Math.abs(a), Math.abs(d));
  if (Math.max(Math.abs(b), Math.abs(c)) > diagonal * 0.02)
    throw new Error("La vista no está en planta ortográfica");
  let posicion = {
    x: Math.round(centro.x + (d * (destino.x - origen.x) - b * (destino.y - origen.y)) / det),
    y: Math.round(centro.y + (-c * (destino.x - origen.x) + a * (destino.y - origen.y)) / det),
  };
  let previo = vertical;
  for (let intento = 0; intento < 6; intento += 1) {
    const medido = await muestrear(page, posicion.x, posicion.y, previo);
    previo = medido;
    const errorX = destino.x - medido.x;
    const errorY = destino.y - medido.y;
    // El mejor píxel ENTERO queda a ≤0,5 px del ideal fraccionario.
    if (Math.max(Math.abs(errorX), Math.abs(errorY)) <= diagonal * 0.6) return posicion;
    posicion = {
      x: Math.round(posicion.x + (d * errorX - b * errorY) / det),
      y: Math.round(posicion.y + (-c * errorX + a * errorY) / det),
    };
  }
  throw new Error("No convergí al píxel del punto pedido");
}

type Linea = Extract<CadEntity, { type: "line" }>;
const lineas = (documento: CadDocument) =>
  documento.entities.filter((entidad): entidad is Linea => entidad.type === "line");

const largoDe = (linea: Linea) => Math.hypot(linea.end.x - linea.start.x, linea.end.y - linea.start.y);

test("una cota de 3500 mm se guarda como 3500: absoluta, relativa y polar", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);

  await test.step("1. ABS + REL: LINE 0,0 → @3500,0", async () => {
    await teclear(page, "LINE");
    await expect(page.getByTestId("cad-command-prompt")).toBeVisible();
    await teclear(page, "0,0");
    await teclear(page, "@3500,0");
    await terminar(page);
    await esperarEntidades(page, 1);
  });

  await test.step("2. POLAR: LINE 1000,5000 → @3500<30", async () => {
    await teclear(page, "L");
    await teclear(page, `${POLAR_ORIGEN.x},${POLAR_ORIGEN.y}`);
    await teclear(page, `@${LARGO}<${POLAR_ANGULO}`);
    await terminar(page);
    await esperarEntidades(page, 2);
  });

  await test.step("3. DIST mide lo que se acaba de dibujar", async () => {
    await teclear(page, "DIST");
    await teclear(page, "0,0");
    await teclear(page, `${LARGO},0`);
    // Lo que el usuario LEE. El formato decimal del dibujo es `3500.0000`.
    await expect(page.getByTestId("cad-command-line-log")).toContainText(
      /Distancia = 3500(\.0+)?/,
    );
  });

  await saveAndSettle(page, backend);
  const guardado = backend.snapshot().document;
  const dibujadas = lineas(guardado);
  expect(dibujadas).toHaveLength(2);

  await test.step("4. El documento guardado dice 3500, no 3499,98", async () => {
    const recta = dibujadas.find((linea) => linea.start.x === 0 && linea.start.y === 0);
    expect(recta, "la línea absoluta tiene que arrancar en 0,0 CLAVADO").toBeTruthy();
    // Dígito a dígito: `toBe`, no `toBeCloseTo`. 3500 tiene representación
    // exacta en IEEE-754 y no hay ninguna excusa para no clavarlo.
    expect(recta!.start).toEqual({ x: 0, y: 0, z: 0 });
    expect(recta!.end).toEqual({ x: LARGO, y: 0, z: 0 });
    expect(largoDe(recta!)).toBe(LARGO);
  });

  await test.step("5. La polar mide 3500 y apunta a 30°, no a 29,999", async () => {
    const polar = dibujadas.find((linea) => linea.start.x === POLAR_ORIGEN.x);
    expect(polar, "la línea polar tiene que arrancar en 1000,5000 CLAVADO").toBeTruthy();
    expect(polar!.start).toEqual({ x: POLAR_ORIGEN.x, y: POLAR_ORIGEN.y, z: 0 });
    // El largo SÍ tiene que ser exacto: es el número que teclea el usuario.
    // Sólo se admite el error de convertir polar→cartesiano en doble precisión.
    expect(Math.abs(largoDe(polar!) - LARGO)).toBeLessThan(CERO);
    const angulo =
      (Math.atan2(polar!.end.y - polar!.start.y, polar!.end.x - polar!.start.x) * 180) / Math.PI;
    expect(Math.abs(angulo - POLAR_ANGULO)).toBeLessThan(CERO);
    // Y el extremo es el que sale de la trigonometría, no una versión redondeada
    // al milímetro: si el producto truncase a entero, esto cazaría 0,089 mm.
    expect(Math.abs(polar!.end.x - POLAR_EXTREMO.x)).toBeLessThan(CERO);
    expect(Math.abs(polar!.end.y - POLAR_EXTREMO.y)).toBeLessThan(CERO);
    expect(polar!.end.x).not.toBe(Math.round(polar!.end.x));
  });
});

test("OSNAP extremo: la segunda línea arranca en el extremo de la primera, dígito a dígito", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);

  await test.step("1. Primera línea, con extremo en coordenada irracional", async () => {
    await teclear(page, "LINE");
    await teclear(page, `${POLAR_ORIGEN.x},${POLAR_ORIGEN.y}`);
    await teclear(page, `@${LARGO}<${POLAR_ANGULO}`);
    await terminar(page);
    await esperarEntidades(page, 1);
  });

  await saveAndSettle(page, backend);
  const primera = lineas(backend.snapshot().document)[0];
  expect(primera).toBeTruthy();

  // Encuadre cenital: sin él la afín mundo↔pantalla no es invertible y no se
  // puede apuntar con el ratón a una coordenada concreta.
  await fitFootprint(page);

  // 60 unidades de dibujo al lado del vértice: dentro de la apertura de captura,
  // pero claramente fuera de él. Si entrase el punto crudo del ratón, el arranque
  // saldría desplazado ~85 mm y el hueco sería invisible en pantalla.
  //
  // Se calcula ANTES de abrir el comando: hay que barrer el lienzo con el ratón
  // para invertir la afín mundo↔pantalla, y con un comando de dibujo abierto ese
  // barrido dejaría rastro (banda elástica, capturas vivas).
  const cerca = await pixelDe(page, {
    x: primera.end.x - 60,
    y: primera.end.y - 60,
  });

  // CONTROL NEGATIVO, sin el que la aserción final no probaría nada: se lee en el
  // visor de coordenadas dónde está DE VERDAD el ratón. Si estuviera clavado en
  // el vértice, capturar sería trivial y la prueba se aprobaría a sí misma.
  const crudo = await leerVisor(page);
  const desvio = Math.hypot(crudo.x - primera.end.x, crudo.y - primera.end.y);
  expect(desvio, "el ratón tiene que estar FUERA del vértice al hacer clic").toBeGreaterThan(20);
  expect(desvio, "…pero dentro de la apertura de captura").toBeLessThan(300);

  await test.step("2. Segunda línea: se apunta CERCA del extremo, no encima", async () => {
    await teclear(page, "L");
    await expect(page.getByTestId("cad-command-prompt")).toBeVisible();
    await page.mouse.move(cerca.x, cerca.y);
    const insignia = page.getByTestId("cad-live-snap");
    await expect(insignia).toBeVisible();
    await expect(insignia).toHaveAttribute("data-snap", "endpoint");
    await page.mouse.click(cerca.x, cerca.y);
    // El segundo punto, tecleado y RELATIVO al capturado: si el enganche
    // hubiese entregado otra cosa, este extremo también saldría corrido.
    await teclear(page, "@0,-1500");
    await terminar(page);
    await esperarEntidades(page, 2);
  });

  await saveAndSettle(page, backend);
  const segunda = lineas(backend.snapshot().document).find((linea) => linea.id !== primera.id);
  expect(segunda, "el clic con el ratón tiene que haber escrito una LÍNEA").toBeTruthy();

  await test.step("3. Los dos puntos coinciden dígito a dígito", async () => {
    // LA ASERCIÓN DE LA AUDITORÍA. Igualdad ESTRICTA de dobles, no `toBeCloseTo`:
    // un CAD en el que el extremo capturado vale «casi» lo mismo deja huecos que
    // rompen sombreados, contornos y mediciones aguas abajo.
    expect(segunda!.start.x).toBe(primera.end.x);
    expect(segunda!.start.y).toBe(primera.end.y);
    expect(segunda!.start).toEqual(primera.end);
    // Y el otro extremo confirma que el relativo se apoyó en el punto capturado.
    expect(segunda!.end.x).toBe(primera.end.x);
    expect(segunda!.end.y).toBe(primera.end.y - 1_500);
  });
});

test("el DXF que sale de aquí sigue midiendo 3500, no 3499,98", async ({ context, page }) => {
  // El número exacto tiene que sobrevivir a la puerta de salida: un DXF que
  // redondea es un plano que llega al estructurista con otra medida. Se dibuja
  // la misma cota de 3500 mm, se exporta y se vuelve a leer el fichero.
  test.setTimeout(180_000);
  await abrirEstudio(context, page);

  await teclear(page, "LINE");
  await teclear(page, "0,0");
  await teclear(page, "@3500,0");
  await terminar(page);
  await esperarEntidades(page, 1);

  await page.getByTitle(/Exportar a DXF/).click();
  // El preflight declara qué se pierde ANTES de descargar; si bloquea, se acepta
  // a conciencia, que es lo que haría quien exporta de verdad.
  const aceptar = page.getByTestId("cad-dxf-loss-accept");
  if (await aceptar.count()) await aceptar.check();
  const descarga = page.waitForEvent("download");
  await page.getByTestId("cad-dxf-download").click();
  const fichero = await (await descarga).path();
  expect(fichero).not.toBeNull();
  const texto = await readFile(fichero!, "utf8");

  const { primitives } = importDxfPrimitives(texto);
  const linea = primitives.find((primitiva) => primitiva.kind === "line");
  expect(linea, "el DXF exportado tiene que traer la LÍNEA").toBeTruthy();
  if (linea?.kind !== "line") throw new Error("inalcanzable");
  const [desde, hasta] = linea.points;
  expect(Math.hypot(hasta.x - desde.x, hasta.y - desde.y)).toBe(LARGO);
  expect(desde.x).toBe(0);
  expect(desde.y).toBe(0);
  expect(hasta.x).toBe(LARGO);
  expect(hasta.y).toBe(0);
});
