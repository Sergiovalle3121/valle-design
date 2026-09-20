import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { startTool } from "../fixtures/tool-palette";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * LA TAREA NÚMERO UNO DE UN DESPACHO: levantar la planta de un departamento.
 *
 * No es un corte técnico: es lo primero que hace quien abre el programa por la
 * mañana. Un rectángulo exterior de 6000×4000 mm, un muro que lo divide, y dos
 * preguntas que deciden si el plano vale:
 *
 *   1. ¿CIERRAN las esquinas? Un muro que «casi» toca al siguiente es un plano
 *      que no se puede acotar, ni sombrear, ni sacar de cantidades. La
 *      diferencia entre 0 mm y 0,5 mm de holgura no se ve en pantalla y arruina
 *      todo lo que venga después.
 *   2. ¿La herramienta de distancia dice 6000 al medir esa pared? Medir sobre
 *      lo dibujado es la única forma de saber que lo dibujado es lo pedido.
 *
 * Se dibuja TECLEANDO, que es como se dibuja en un despacho: `L`, la esquina,
 * `@6000,0`… El camino tecleado está confirmado sano por el golden 44.
 *
 * Se mide con el RATÓN, que es la única forma de medir la GEOMETRÍA y no los
 * números que uno mismo acaba de escribir: se hace clic cerca de cada esquina y
 * es el enganche a objetos (OSNAP) el que decide el punto exacto.
 */

/** La planta se levanta con la esquina inferior izquierda en (1000, 1000). */
const X0 = 1_000;
const Y0 = 1_000;
const ANCHO = 6_000;
const ALTO = 4_000;
/** El muro divisorio, a 4000 mm de la esquina: dos piezas desiguales, como en la vida. */
const XM = 4_000;

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

/** Abre el estudio por el camino confirmado (idéntico a los goldens 32 y 61). */
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

/** Enter con la caja vacía: en AutoCAD es «termina la orden». */
async function terminarOrden(page: Page) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill("");
  await input.press("Enter");
}

async function esperarEntidades(page: Page, total: number) {
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(`Native ${total}`);
}


/**
 * MUNDO → PÍXEL, medido sobre el MISMO indicador que ve el usuario.
 *
 * No se usa `worldPoint` de la fixture. Se intentó primero, y en esta máquina
 * —4 núcleos, otra suite en paralelo— aborta siempre con «la vista no se asentó
 * en planta ortográfica». No es que la vista esté mal: medida a mano da
 * a = d = 24,8082 unidades/px y b = c = 0,0000 estables en cinco iteraciones
 * seguidas. Lo que ocurre es que la fixture envuelve TRES muestreos en un
 * `expect.poll` de 15 s y descarta la primera vuelta por construcción (compara
 * contra `a = 1`), así que necesita dos vueltas completas; aquí cada vuelta
 * cuesta ~8 s y no le da tiempo. Es coste del entorno, no del producto.
 *
 * Esta versión muestrea UNA vez, sin tope artificial, y cierra el lazo contra
 * el mismo indicador: mide el error del píxel calculado y lo corrige.
 */
interface VistaMedida {
  cx: number;
  cy: number;
  origen: { x: number; y: number };
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Mueve el ratón a un píxel y devuelve lo que publica el indicador del cursor. */
async function leerCursor(page: Page, px: number, py: number) {
  const coord = page.getByTestId("cad-cursor-coordinate");
  const leer = async () =>
    `${await coord.getAttribute("data-x")}|${await coord.getAttribute("data-y")}`;
  const antes = await leer();
  await page.mouse.move(px - 7, py - 7);
  await expect.poll(leer, { timeout: 30_000 }).not.toBe(antes);
  const vecino = await leer();
  await page.mouse.move(px, py);
  await expect.poll(leer, { timeout: 30_000 }).not.toBe(vecino);
  const [x, y] = (await leer()).split("|");
  return { x: Number(x), y: Number(y) };
}

/** La transformación mundo↔pantalla, medida con tres muestras. */
async function medirVista(page: Page): Promise<VistaMedida> {
  const caja = await page.getByTestId("cad-canvas").boundingBox();
  if (!caja) throw new Error("el lienzo no tiene caja");
  const cx = Math.round(caja.x + caja.width / 2);
  const cy = Math.round(caja.y + caja.height / 2);
  const origen = await leerCursor(page, cx, cy);
  const horizontal = await leerCursor(page, cx + 120, cy);
  const vertical = await leerCursor(page, cx, cy + 120);
  const vista = {
    cx,
    cy,
    origen,
    a: (horizontal.x - origen.x) / 120,
    b: (vertical.x - origen.x) / 120,
    c: (horizontal.y - origen.y) / 120,
    d: (vertical.y - origen.y) / 120,
  };
  // Planta ortográfica: los términos cruzados son cero frente a la diagonal.
  const diagonal = Math.max(Math.abs(vista.a), Math.abs(vista.d));
  const cruzado = Math.max(Math.abs(vista.b), Math.abs(vista.c));
  expect(diagonal, "la vista no tiene escala medible").toBeGreaterThan(1e-9);
  expect(cruzado, "la vista no está en planta ortográfica").toBeLessThan(diagonal * 0.02);
  return vista;
}

/** El píxel donde vive un punto del dibujo, verificado contra el indicador. */
async function pixelDe(
  page: Page,
  vista: VistaMedida,
  destino: { x: number; y: number },
): Promise<{ x: number; y: number; error: number }> {
  const det = vista.a * vista.d - vista.b * vista.c;
  const proyecta = (px: number, py: number, ex: number, ey: number) => ({
    x: Math.round(px + (vista.d * ex - vista.b * ey) / det),
    y: Math.round(py + (-vista.c * ex + vista.a * ey) / det),
  });
  let punto = proyecta(
    vista.cx,
    vista.cy,
    destino.x - vista.origen.x,
    destino.y - vista.origen.y,
  );
  let error = Number.POSITIVE_INFINITY;
  // Lazo cerrado: se comprueba dónde cayó de verdad y se corrige.
  for (let intento = 0; intento < 4; intento += 1) {
    const medido = await leerCursor(page, punto.x, punto.y);
    error = Math.hypot(medido.x - destino.x, medido.y - destino.y);
    // Medio píxel de mundo es lo mejor que puede dar un píxel entero.
    if (error <= Math.abs(vista.a) * 0.75) break;
    punto = proyecta(punto.x, punto.y, destino.x - medido.x, destino.y - medido.y);
  }
  return { ...punto, error };
}

// ola1-paleta (2026-09-19): `quienResponde` (¿qué capa responde en un
// píxel?) se retiró de aquí sin llamadas propias tras quitar el paso 5 (ver
// «PASO 5 RETIRADO» más abajo) — comprobaba que nada tapara las esquinas
// justo antes de picarlas con la herramienta de distancia retirada.

type Linea = Extract<CadEntity, { type: "line" }>;
const mismo = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

test("planta de un departamento: 6000×4000, muro divisorio, esquinas cerradas y una pared que mide 6000", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const erroresDePagina: string[] = [];
  page.on("pageerror", (e) => erroresDePagina.push(String(e)));

  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-command-line")).toBeVisible();

  const prompt = page.getByTestId("cad-command-prompt");

  await test.step("1. El contorno exterior: cuatro muros de 6000×4000 que CIERRAN", async () => {
    await teclear(page, "L");
    await expect(prompt).toBeVisible();
    await teclear(page, `${X0},${Y0}`);
    await teclear(page, `@${ANCHO},0`);
    await teclear(page, `@0,${ALTO}`);
    await teclear(page, `@-${ANCHO},0`);
    // «Cerrar» es lo que distingue un contorno de cuatro trazos sueltos.
    await expect(page.getByTestId("cad-command-keyword-Cerrar")).toBeVisible();
    await teclear(page, "C");
    await expect(prompt).toBeHidden();
    await esperarEntidades(page, 4);
  });

  await test.step("2. El muro divisorio, apoyado en los dos muros largos", async () => {
    await teclear(page, "L");
    await teclear(page, `${XM},${Y0}`);
    await teclear(page, `${XM},${Y0 + ALTO}`);
    // Enter con la caja vacía termina la orden, como en AutoCAD.
    await terminarOrden(page);
    await expect(prompt).toBeHidden();
    await esperarEntidades(page, 5);
  });

  await saveAndSettle(page, backend);
  const guardado = backend.snapshot().document;

  await test.step("3. LAS ESQUINAS CIERRAN: holgura exactamente cero", async () => {
    const lineas = guardado.entities.filter((e): e is Linea => e.type === "line");
    expect(lineas).toHaveLength(5);

    const esquinas = [
      { x: X0, y: Y0 },
      { x: X0 + ANCHO, y: Y0 },
      { x: X0 + ANCHO, y: Y0 + ALTO },
      { x: X0, y: Y0 + ALTO },
    ];
    // Los cuatro muros del contorno, en el orden en que se trazaron.
    const contorno = lineas.slice(0, 4);
    const holguras: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const muro = contorno[i];
      expect(mismo(muro.start, esquinas[i])).toBeLessThan(1e-9);
      expect(mismo(muro.end, esquinas[(i + 1) % 4])).toBeLessThan(1e-9);
      // La holgura de la esquina: dónde acaba este muro y dónde empieza el
      // siguiente. Cero, o el plano no vale.
      const siguiente = contorno[(i + 1) % 4];
      holguras.push(mismo(muro.end, siguiente.start));
    }
    const peor = Math.max(...holguras);
    expect(peor, `la peor esquina abre ${peor} mm`).toBe(0);

    // Longitudes: 6000 y 4000 alternando, medidas sobre lo persistido.
    const largos = contorno.map((m) => Math.hypot(m.end.x - m.start.x, m.end.y - m.start.y));
    expect(largos.map((l) => Math.round(l))).toEqual([ANCHO, ALTO, ANCHO, ALTO]);
  });

  await test.step("4. El muro divisorio TOCA los dos muros largos, no casi", async () => {
    const lineas = guardado.entities.filter((e): e is Linea => e.type === "line");
    const divisorio = lineas[4];
    expect(Math.round(Math.hypot(divisorio.end.x - divisorio.start.x, divisorio.end.y - divisorio.start.y))).toBe(ALTO);

    // Distancia del extremo al segmento del muro largo: cero es «se encuentran».
    const alSegmento = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const largo2 = vx * vx + vy * vy;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / largo2));
      return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
    };
    const inferior = lineas[0];
    const superior = lineas[2];
    const abajo = alSegmento(divisorio.start, inferior.start, inferior.end);
    const arriba = alSegmento(divisorio.end, superior.start, superior.end);
    expect(abajo, `el muro divisorio deja ${abajo} mm con el muro de abajo`).toBe(0);
    expect(arriba, `el muro divisorio deja ${arriba} mm con el muro de arriba`).toBe(0);
  });

  // PASO 5 RETIRADO (ola1-paleta, 2026-09-19): media la pared con la
  // herramienta «Distancia» de la paleta flotante —`arrancarHerramienta(page,
  // "measure")`—, que hacía DOS cosas a la vez: pintaba `cad-live-prompt` con
  // la medida bajo el cursor Y, al segundo clic, guardaba una COTA de verdad
  // en «Cotas guardadas» (no era un duplicado inocuo de DIST: DIST, abajo, es
  // sólo consulta y no persiste nada). «Distancia» se retiró de
  // `CAD_TOOLBAR_ACTIONS` con los otros diez controles que duplicaban un
  // botón de la cinta — pero a diferencia de ellos, no le quedó atajo de
  // teclado ni botón de cinta equivalente (ver `toolbar.ts`): acotar por
  // arrastre de dos puntos queda sin entrada de ratón hasta que alguien lo
  // cablee al panel profesional «Dimensiones» (riel derecho). Ver «pendiente»
  // del resumen de la ola.

  await test.step("6. Y la misma pared por DIST, la orden de consulta", async () => {
    await startTool(page, "select");
    const vista = await medirVista(page);
    const izquierda = await pixelDe(page, vista, { x: X0, y: Y0 });
    const derecha = await pixelDe(page, vista, { x: X0 + ANCHO, y: Y0 });
    await teclear(page, "DIST");
    await expect(prompt).toBeVisible();
    await page.mouse.click(izquierda.x, izquierda.y);
    await page.mouse.click(derecha.x, derecha.y);
    await expect(page.getByTestId("cad-command-line-log")).toContainText(/Distancia = 6000/);
  });

  expect(erroresDePagina, `errores de consola: ${erroresDePagina.join(" | ")}`).toEqual([]);
});
