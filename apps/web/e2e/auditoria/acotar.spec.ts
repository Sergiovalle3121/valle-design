import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applyNativeProperty } from "../fixtures/dynamic-input";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";
import { fitFootprint } from "../fixtures/camera-preset";

/**
 * AUDITORÍA — ACOTAR UN PLANO PARA OBRA.
 *
 * Quien firma un plano responde de sus cotas. Una cota que miente no se
 * descubre en pantalla: se descubre en obra, con el hormigón puesto. Así que
 * este recorrido no pregunta «¿aparece una cota?», pregunta las dos cosas por
 * las que un arquitecto pagaría:
 *
 *   1. ¿La cota DICE la medida real del objeto que acota?
 *   2. Cuando el objeto se mueve o cambia de largo, ¿la cota se entera?
 *
 * Se acotan tres cosas distintas sobre un plano sembrado a mano:
 *
 *   · muro-sur  línea horizontal de 4.000 mm     → DIMLINEAR
 *   · faldón    línea 3-4-5, largo REAL 5.000 mm → DIMALIGNED (y su contraste
 *                                                  con DIMLINEAR, que mide la
 *                                                  proyección: 3.000)
 *   · pilar     círculo de radio 750 mm          → DIMRADIUS
 *
 * El faldón es un 3-4-5 a propósito: su largo real (5.000) y sus dos
 * proyecciones (3.000 y 4.000) son números redondos y DISTINTOS, así que una
 * cota alineada que en realidad midiera la proyección se ve a simple vista.
 *
 * TODO por teclado, que es como se acota de verdad cuando importa el número:
 * el punto TECLEADO también se engancha al anclaje del objeto si cae encima
 * (`dimension-support.ts`), así que la cota nace asociativa sin ratón. Se evita
 * a propósito `e2e/fixtures/world-point.ts`: en esta máquina no cabe en su
 * propio plazo (medido en `e2e/auditoria/precision.spec.ts`).
 *
 * CÓMO SE CORRE (el puerto NO es opcional; ver e2e/auditoria/00-arranque.spec.ts):
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/acotar.spec.ts --project=chromium --reporter=line
 */

/** Muro sur: 4.000 mm en horizontal. */
const MURO = { a: { x: 2_000, y: 2_000 }, b: { x: 6_000, y: 2_000 } };
/** Faldón: 3.000 en X, 4.000 en Y, 5.000 de largo REAL. */
const FALDON = { a: { x: 2_000, y: 6_000 }, b: { x: 5_000, y: 10_000 } };
/** Pilar redondo. */
const PILAR = { centro: { x: 9_000, y: 4_000 }, radio: 750 };
/** Tabique dibujado como POLILÍNEA, que es como sale de RECT y de PLINE. */
const TABIQUE = { a: { x: 7_000, y: 8_000 }, b: { x: 11_000, y: 8_000 } };

/** Cuántas entidades trae el plano de partida. */
const SEMILLA = 4;

function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "cotas", name: "Cotas", color: "#34d399", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        start: { ...MURO.a, z: 0 },
        end: { ...MURO.b, z: 0 },
        layer: "0",
      },
      {
        id: "faldon",
        type: "line",
        start: { ...FALDON.a, z: 0 },
        end: { ...FALDON.b, z: 0 },
        layer: "0",
      },
      {
        id: "pilar",
        type: "circle",
        center: { ...PILAR.centro, z: 0 },
        radius: PILAR.radio,
        layer: "0",
      },
      {
        id: "tabique",
        type: "polyline",
        vertices: [
          { ...TABIQUE.a, z: 0 },
          { ...TABIQUE.b, z: 0 },
        ],
        closed: false,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "faldon", "pilar", "tabique"] },
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
    footprintH: 12_000,
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

async function esperarEntidades(page: Page, total: number) {
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(`Native ${total}`);
}

const propiedades = (page: Page) => page.getByTestId("cad-native-properties");

/**
 * Los identificadores de TODAS las entidades que hay AHORA en el plano.
 *
 * No se filtra por prefijo de id a propósito: las cotas que crea el motor NO se
 * llaman `dim_*` —ese prefijo es el de la paleta de dimensiones asociativas, el
 * del golden 16—, así que buscar por prefijo devolvía cero con la cota ya
 * dibujada en la lista («Cota 1»). Lo que sí es estable es que la entidad nueva
 * es la que no estaba antes.
 */
async function entidadesDelPlano(page: Page): Promise<string[]> {
  return page
    .getByTestId("cad-native-entity-list")
    .locator('button[data-testid^="cad-native-entity-"]')
    .evaluateAll((nodos) =>
      nodos.map((n) => (n as HTMLElement).dataset.testid!.slice("cad-native-entity-".length)),
    );
}

/** La entidad recién nacida: la que no estaba antes. */
async function cotaNueva(page: Page, previas: readonly string[]): Promise<string> {
  const ahora = await entidadesDelPlano(page);
  const nuevas = ahora.filter((id) => !previas.includes(id));
  expect(nuevas, `antes: [${previas.join(", ")}] · ahora: [${ahora.join(", ")}]`).toHaveLength(1);
  return nuevas[0];
}

/** Designa una entidad desde la lista, como quien la pincha en el plano. */
async function designar(page: Page, id: string) {
  await page.getByTestId(`cad-native-entity-${id}`).click();
  await expect(propiedades(page)).toBeVisible();
}

async function deseleccionar(page: Page) {
  await propiedades(page).getByRole("button", { name: "Deseleccionar" }).click();
}

/**
 * Suelta la selección SI la hay.
 *
 * Hace falta porque la lista de entidades y el panel de propiedades comparten
 * hueco: con algo designado, la lista NO está en el DOM. Un comando que se
 * lanza sobre la selección (DIMRADIUS, MOVE) deja al usuario mirando las
 * propiedades del objeto de partida, así que hay que soltar antes de volver a
 * mirar la lista. No es un fallo: es que el panel es uno solo.
 */
async function soltarSeleccion(page: Page) {
  const boton = propiedades(page).getByRole("button", { name: "Deseleccionar" });
  if (await boton.count()) await boton.click();
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible();
}

/** Lo que el arquitecto LEE de una cota: su medida y el rótulo del plano. */
async function leerCota(page: Page, id: string, medida: string, rotulo: string) {
  await designar(page, id);
  await expect(page.getByTestId("cad-native-property-measurement")).toHaveValue(medida);
  await expect(page.getByTestId("cad-native-property-label")).toHaveValue(rotulo);
  await deseleccionar(page);
}

/**
 * Coordenada de dibujo → píxel, muestreando el visor de coordenadas que lee el
 * usuario en la barra inferior.
 *
 * Copiado tal cual de `e2e/auditoria/precision.spec.ts`, donde está medido por
 * qué NO se usa `e2e/fixtures/world-point.ts` en esta máquina: la fixture
 * encadena seis `expect.poll` anidados y no cabe en su propio plazo de 15 s
 * (falla ~50 % de las veces, y por eso el golden 61 está rojo). Este muestreo
 * hace lo mismo con espera activa de 50 ms y tarda ~1 s.
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

type Cota = Extract<CadEntity, { type: "dimension" }>;

test("acotar para obra: la cota dice la medida real y sigue al objeto cuando se mueve", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await esperarEntidades(page, SEMILLA);

  const prompt = page.getByTestId("cad-command-prompt");
  let vistas: string[] = [];
  let cotaMuro = "";
  let cotaFaldon = "";
  let cotaPilar = "";

  await test.step("1. DIMLINEAR sobre el muro sur: 4.000 mm", async () => {
    vistas = await entidadesDelPlano(page);
    await teclear(page, "DIMLINEAR");
    await expect(prompt).toContainText("línea de referencia");
    await teclear(page, `${MURO.a.x},${MURO.a.y}`);
    await teclear(page, `${MURO.b.x},${MURO.b.y}`);
    await expect(prompt).toContainText("línea de cota");
    // Se suelta POR DEBAJO del muro: el gesto decide que la cota es horizontal.
    await teclear(page, "4000,1000");
    await expect(prompt).toBeHidden();
    await esperarEntidades(page, SEMILLA + 1);
    cotaMuro = await cotaNueva(page, vistas);
    await leerCota(page, cotaMuro, "4000", "4000.00 mm");
  });

  await test.step("2. DIMALIGNED sobre el faldón: 5.000 mm de largo REAL", async () => {
    vistas = await entidadesDelPlano(page);
    await teclear(page, "DIMALIGNED");
    await expect(prompt).toContainText("línea de referencia");
    await teclear(page, `${FALDON.a.x},${FALDON.a.y}`);
    await teclear(page, `${FALDON.b.x},${FALDON.b.y}`);
    await teclear(page, "1000,8000");
    await expect(prompt).toBeHidden();
    await esperarEntidades(page, SEMILLA + 2);
    cotaFaldon = await cotaNueva(page, vistas);
    // 3-4-5: si midiera la proyección diría 3.000 o 4.000, no 5.000.
    await leerCota(page, cotaFaldon, "5000", "5000.00 mm");
  });

  await test.step("3. DIMRADIUS sobre el pilar: designar y acotar", async () => {
    vistas = await entidadesDelPlano(page);
    await designar(page, "pilar");
    await teclear(page, "DIMRADIUS");
    await esperarEntidades(page, SEMILLA + 3);
    await soltarSeleccion(page);
    cotaPilar = await cotaNueva(page, vistas);
    await leerCota(page, cotaPilar, "750", "R750.00 mm");
  });

  await test.step("4. Las tres cotas nacen asociadas al objeto que acotan", async () => {
    await saveAndSettle(page, backend);
    const guardado = backend.snapshot().document;
    const cota = (id: string) =>
      guardado.entities.find((e): e is Cota => e.id === id && e.type === "dimension");

    const lineal = cota(cotaMuro);
    expect(lineal?.dimensionKind).toBe("linear");
    expect(lineal?.axis).toBe("x");
    expect(lineal?.associationStatus).toBe("associated");
    expect(lineal?.references).toEqual([
      { entityId: "muro-sur", anchor: "start" },
      { entityId: "muro-sur", anchor: "end" },
    ]);

    const alineada = cota(cotaFaldon);
    expect(alineada?.dimensionKind).toBe("aligned");
    expect(alineada?.associationStatus).toBe("associated");
    expect(alineada?.references).toEqual([
      { entityId: "faldon", anchor: "start" },
      { entityId: "faldon", anchor: "end" },
    ]);

    const radial = cota(cotaPilar);
    expect(radial?.dimensionKind).toBe("radius");
    expect(radial?.radius).toBe(PILAR.radio);
    expect(radial?.associationStatus).toBe("associated");
    expect(radial?.references?.[0]).toEqual({ entityId: "pilar", anchor: "center" });
  });

  await test.step("5. MOVE el muro 1.000 mm al norte: la cota lo sigue", async () => {
    await designar(page, "muro-sur");
    await teclear(page, "MOVE");
    await expect(prompt).toContainText("punto base");
    await teclear(page, `${MURO.a.x},${MURO.a.y}`);
    await teclear(page, `${MURO.a.x},${MURO.a.y + 1_000}`);
    await expect(prompt).toBeHidden();
    // Mover no cambia el largo: la cota sigue diciendo 4.000, pero AHORA sobre
    // el muro en su sitio nuevo. Si se hubiera quedado atrás, acotaría el aire.
    await soltarSeleccion(page);
    await leerCota(page, cotaMuro, "4000", "4000.00 mm");
    await saveAndSettle(page, backend);
    const guardado = backend.snapshot().document;
    const muro = guardado.entities.find(
      (e): e is Extract<CadEntity, { type: "line" }> => e.id === "muro-sur" && e.type === "line",
    );
    expect(muro?.start).toMatchObject({ x: 2_000, y: 3_000 });
    expect(muro?.end).toMatchObject({ x: 6_000, y: 3_000 });
    const lineal = guardado.entities.find((e): e is Cota => e.id === cotaMuro);
    expect(lineal?.a).toMatchObject({ x: 2_000, y: 3_000 });
    expect(lineal?.b).toMatchObject({ x: 6_000, y: 3_000 });
    expect(lineal?.associationStatus).toBe("associated");
  });

  await test.step("6. Alargar el muro a 4.500: el NÚMERO cambia solo", async () => {
    await designar(page, "muro-sur");
    await applyNativeProperty(page, "endX", "6500");
    await soltarSeleccion(page);
    await leerCota(page, cotaMuro, "4500", "4500.00 mm");
  });

  await test.step("7. Ensanchar el pilar a R900: la cota de radio cambia sola", async () => {
    await designar(page, "pilar");
    await applyNativeProperty(page, "radius", "900");
    await soltarSeleccion(page);
    await leerCota(page, cotaPilar, "900", "R900.00 mm");
  });

  await test.step("8. Lo acotado es lo que se guarda", async () => {
    await saveAndSettle(page, backend);
    const guardado = backend.snapshot().document;
    const cotas = guardado.entities.filter((e): e is Cota => e.type === "dimension");
    expect(cotas).toHaveLength(3);
    expect(cotas.every((c) => c.associationStatus === "associated")).toBe(true);
    const lineal = cotas.find((c) => c.id === cotaMuro);
    expect(Math.abs(lineal!.b.x - lineal!.a.x)).toBe(4_500);
    const radial = cotas.find((c) => c.id === cotaPilar);
    expect(radial?.radius).toBe(900);
  });

  await test.step("9. Contraste: DIMLINEAR sobre el faldón mide la PROYECCIÓN", async () => {
    vistas = await entidadesDelPlano(page);
    await teclear(page, "DIMLINEAR");
    await teclear(page, `${FALDON.a.x},${FALDON.a.y}`);
    await teclear(page, `${FALDON.b.x},${FALDON.b.y}`);
    // Se suelta muy por debajo del faldón: eje X, o sea la proyección horizontal.
    await teclear(page, "3500,4000");
    await expect(prompt).toBeHidden();
    await esperarEntidades(page, SEMILLA + 4);
    const proyeccion = await cotaNueva(page, vistas);
    await leerCota(page, proyeccion, "3000", "3000.00 mm");
  });
});


/**
 * EL GESTO NATURAL: acotar SEÑALANDO el objeto.
 *
 * Los nueve pasos de arriba tecleaban los dos orígenes. Nadie acota así un
 * plano entero: se pulsa la orden, se señala el muro y se suelta la cota. En
 * AutoCAD ese camino es Intro (u «Objeto») y un clic; el prompt de este
 * producto lo ofrece igual, y la opción es un BOTÓN, no una letra que haya que
 * saberse.
 *
 * Este test mide justamente eso: que la ruta de ratón existe, que el clic sobre
 * el muro lo DESIGNA (y no cae como punto libre), y que la cota que sale de ahí
 * dice el mismo 4.000 que la tecleada y nace igual de asociada.
 */
test("acotar señalando el muro con el ratón: la opción Objeto y un clic", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const backend = await abrirEstudio(context, page);
  await esperarEntidades(page, SEMILLA);
  // El estudio abre en 2D (ya es cenital); sólo hay que encuadrar la huella
  // para que las coordenadas del dibujo caigan dentro del lienzo.
  await fitFootprint(page);

  const prompt = page.getByTestId("cad-command-prompt");
  const vistas = await entidadesDelPlano(page);

  await teclear(page, "DIMLINEAR");
  // La opción se OFRECE como botón: quien no se sepa la orden de memoria puede
  // llegar igual. Es la diferencia entre un producto y un manual.
  const objeto = page.getByTestId("cad-command-keyword-Objeto");
  await expect(objeto).toBeVisible();
  await objeto.click();
  await expect(prompt).toContainText("Designe el objeto");

  // Un clic EN MEDIO del muro. Si el pickbox no lo cazara, este punto caería
  // como punto libre y la orden pediría un segundo origen en vez de saltar a
  // la ubicación de la línea de cota — que es lo que se afirma justo debajo.
  const medio = await pixelDe(page, { x: 4_000, y: 2_000 });
  await page.mouse.click(medio.x, medio.y);
  await expect(prompt).toContainText("línea de cota");

  const donde = await pixelDe(page, { x: 4_000, y: 900 });
  await page.mouse.click(donde.x, donde.y);
  await expect(prompt).toBeHidden();
  await esperarEntidades(page, SEMILLA + 1);

  await soltarSeleccion(page);
  const cota = await cotaNueva(page, vistas);
  await leerCota(page, cota, "4000", "4000.00 mm");

  await saveAndSettle(page, backend);
  const guardada = backend
    .snapshot()
    .document.entities.find((e): e is Cota => e.id === cota && e.type === "dimension");
  expect(guardada?.dimensionKind).toBe("linear");
  expect(guardada?.axis).toBe("x");
  // Señalar el objeto es lo que la hace asociativa sin pedir nada más.
  expect(guardada?.associationStatus).toBe("associated");
  expect(guardada?.references).toEqual([
    { entityId: "muro-sur", anchor: "start" },
    { entityId: "muro-sur", anchor: "end" },
  ]);
});

/**
 * LA COTA QUE SE QUEDA ATRÁS.
 *
 * Este es el caso que un arquitecto se encuentra sin buscarlo: un tabique
 * dibujado con PLINE —o cualquier lado de un rectángulo, porque RECT escribe
 * una POLILÍNEA cerrada, no cuatro líneas— se acota igual de fácil que un muro
 * de una sola línea. La pregunta es si esa cota vive igual de bien.
 *
 * No se afirma un desenlace concreto por decreto: se mide. Se acota el
 * tabique, se lee lo que dice, se MUEVE el tabique 1.000 mm y se vuelve a leer
 * el estado de la cota y sus coordenadas. Lo que salga es lo que hay.
 */
test("acotar un tabique dibujado como polilínea, y moverlo", async ({ context, page }) => {
  test.setTimeout(240_000);
  /**
   * MEDIDO HOY, Y ES UN DEFECTO: la cota se queda atrás.
   *
   *   Y de los puntos de definición de la cota tras mover el tabique a Y=9000
   *   Expected: { a: 9000, b: 9000 }
   *   Received: { a: 8000, b: 8000 }
   *
   * El tabique se va a Y=9000 y la cota se queda en Y=8000, acotando el aire, y
   * SIGUE diciendo «4000.00 mm» con el mismo aspecto que las cotas buenas. Lo
   * que se afirma abajo es lo que el producto DEBE hacer —la misma asociación
   * que sí funciona sobre una línea, comprobada en el primer test de este
   * archivo—, así que la prueba se declara fallida a sabiendas: el día que se
   * arregle, Playwright avisará de que ya no falla y esta anotación se quita.
   *
   * Por qué importa más de lo que parece: RECT escribe una POLILÍNEA cerrada
   * (golden 32), así que CUALQUIER lado de un rectángulo acotado así nace
   * suelto. Y el producto no lo dice en ningún momento — ver el paso B.
   */
  test.fail();
  const backend = await abrirEstudio(context, page);
  await esperarEntidades(page, SEMILLA);
  const prompt = page.getByTestId("cad-command-prompt");
  const vistas = await entidadesDelPlano(page);

  await test.step("A. la cota sale, y dice 4.000", async () => {
    await teclear(page, "DIMLINEAR");
    await teclear(page, `${TABIQUE.a.x},${TABIQUE.a.y}`);
    await teclear(page, `${TABIQUE.b.x},${TABIQUE.b.y}`);
    await teclear(page, "9000,7000");
    await expect(prompt).toBeHidden();
    await esperarEntidades(page, SEMILLA + 1);
  });

  const cota = await cotaNueva(page, vistas);
  await leerCota(page, cota, "4000", "4000.00 mm");

  await test.step("B. ¿qué dice el producto sobre su asociación?", async () => {
    await designar(page, cota);
    const estado = await page.getByTestId("cad-native-property-associationStatus").inputValue();
    const refs = await page.getByTestId("cad-native-property-referenceCount").inputValue();
    await deseleccionar(page);
    // Y AQUÍ ESTÁ LO CARO: en el diálogo de la línea de comandos no hay ni una
    // palabra sobre que esta cota no queda enganchada. La orden termina igual
    // que sobre un muro de una línea. Quien acota no tiene forma de enterarse
    // salvo designar la cota y leer un campo de sólo lectura llamado
    // «associationStatus» que dice «detached», en inglés, en un panel lateral.
    await expect(page.getByTestId("cad-command-line-log")).not.toContainText(/asociat/i);
    // Se DECLARA lo medido en el propio informe del fallo, para que quien lo lea
    // no tenga que abrir la traza.
    expect(
      { estado, refs },
      "estado de asociación de una cota puesta sobre una POLILÍNEA",
    ).toEqual({ estado: "detached", refs: "0" });
  });

  await test.step("C. se mueve el tabique 1.000 mm al norte", async () => {
    await designar(page, "tabique");
    await teclear(page, "MOVE");
    await teclear(page, `${TABIQUE.a.x},${TABIQUE.a.y}`);
    await teclear(page, `${TABIQUE.a.x},${TABIQUE.a.y + 1_000}`);
    await expect(prompt).toBeHidden();
    await soltarSeleccion(page);
    await saveAndSettle(page, backend);

    const guardado = backend.snapshot().document;
    const tabique = guardado.entities.find(
      (e): e is Extract<CadEntity, { type: "polyline" }> =>
        e.id === "tabique" && e.type === "polyline",
    );
    expect(tabique?.vertices[0]).toMatchObject({ x: TABIQUE.a.x, y: TABIQUE.a.y + 1_000 });

    const acotacion = guardado.entities.find((e): e is Cota => e.id === cota);
    // AQUÍ SE VE SI LA COTA MIENTE: si sus puntos de definición siguen en la
    // Y vieja, la cota se quedó donde estaba el tabique y ahora acota el aire.
    expect(
      { a: acotacion?.a.y, b: acotacion?.b.y },
      "Y de los puntos de definición de la cota tras mover el tabique a Y=9000",
    ).toEqual({ a: TABIQUE.a.y + 1_000, b: TABIQUE.b.y + 1_000 });
  });
});
