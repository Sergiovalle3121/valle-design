import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { fitFootprint } from "../fixtures/camera-preset";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
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

interface Foto {
  entidades: unknown[];
  orden: string[];
}

/** Sólo el DIBUJO: entidades (ordenadas por id) y orden de dibujo. */
function foto(documento: CadDocument): Foto {
  const entidades = [...documento.entities]
    .map((entidad) => JSON.parse(JSON.stringify(entidad)) as CadEntity)
    .sort((izq, der) => String(izq.id).localeCompare(String(der.id)));
  return { entidades, orden: [...documento.modelSpace.entityIds] };
}

const linea = (documento: CadDocument, id: string) => {
  const entidad = documento.entities.find((candidata) => candidata.id === id);
  if (!entidad || entidad.type !== "line") throw new Error(`${id} no es una línea en el documento`);
  return entidad;
};

const circulos = (documento: CadDocument) =>
  documento.entities.filter(
    (entidad): entidad is Extract<CadEntity, { type: "circle" }> => entidad.type === "circle",
  );

test("mover, copiar, desfasar, recortar, alargar — y un deshacer fiel paso a paso", async ({
  context,
  page,
}) => {
  test.setTimeout(300_000);
  const erroresDePagina: string[] = [];
  page.on("pageerror", (error) => erroresDePagina.push(String(error)));

  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");

  // El plano de partida, tal y como queda persistido. Es la referencia contra la
  // que se mide el deshacer.
  const inicial = foto(await guardar(page, backend));
  expect(inicial.orden).toEqual([...SEMILLA_IDS]);

  // Encuadre cenital y calibración del ratón ANTES de abrir ningún comando: con
  // un comando vivo, barrer el lienzo dejaría rastro (banda elástica, capturas).
  await fitFootprint(page);
  const afin = await calibrar(page);
  const pxEje = await pixelDe(page, afin, { x: 5_000, y: 7_000 });
  const pxMuroSobrante = await pixelDe(page, afin, { x: 7_500, y: 1_000 });
  const pxVigaFinal = await pixelDe(page, afin, { x: 3_500, y: 4_000 });

  const fotos: Foto[] = [inicial];
  const prompt = page.getByTestId("cad-command-prompt");

  /* ── 1. MOVE ─────────────────────────────────────────────────────────── */
  await test.step("1. MOVER la columna 1500 mm a la derecha", async () => {
    await designar(page, "columna");
    await teclear(page, "MOVE");
    await expect(prompt).toContainText("punto base");
    await teclear(page, "0,0");
    await expect(prompt).toContainText("segundo punto");
    await teclear(page, "1500,0");
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    const columna = circulos(documento).find((circulo) => circulo.id === "columna")!;
    expect(columna.center).toMatchObject({ x: 4_000, y: 9_000 });
    expect(columna.radius).toBe(400);
    expect(documento.entities).toHaveLength(6);
    fotos.push(foto(documento));
  });

  /* ── 2. COPY ─────────────────────────────────────────────────────────── */
  await test.step("2. COPIAR la columna 3000 mm más allá", async () => {
    await designar(page, "columna");
    await teclear(page, "COPY");
    await expect(prompt).toContainText("punto base");
    await teclear(page, "0,0");
    await teclear(page, "3000,0");
    // COPY es múltiple: sigue pidiendo destinos hasta que se acepta.
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    const centros = circulos(documento)
      .map((circulo) => circulo.center.x)
      .sort((izq, der) => izq - der);
    expect(centros).toEqual([4_000, 7_000]);
    expect(documento.entities).toHaveLength(7);
    fotos.push(foto(documento));
  });

  /* ── 3. OFFSET ───────────────────────────────────────────────────────── */
  await test.step("3. DESFASAR el eje 600 mm", async () => {
    await soltarSeleccion(page);
    await teclear(page, "OFFSET");
    await expect(prompt).toContainText("desfase");
    await teclear(page, "600");
    await expect(prompt).toContainText("Designe");
    await page.mouse.click(pxEje.x, pxEje.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    expect(documento.entities).toHaveLength(8);
    const eje = linea(documento, "eje");
    expect(eje.start).toMatchObject({ x: 1_000, y: 7_000 });
    expect(eje.end).toMatchObject({ x: 9_000, y: 7_000 });
    const paralela = documento.entities.filter(
      (entidad): entidad is Extract<CadEntity, { type: "line" }> =>
        entidad.type === "line" &&
        entidad.id !== "eje" &&
        Math.abs(entidad.start.y - entidad.end.y) < 1e-9 &&
        Math.abs(Math.abs(entidad.start.y - 7_000) - 600) < 1e-9,
    );
    expect(paralela, "el desfase tiene que haber creado UNA paralela a 600 mm").toHaveLength(1);
    expect(paralela[0].start.x).toBeCloseTo(1_000, 6);
    expect(paralela[0].end.x).toBeCloseTo(9_000, 6);
    fotos.push(foto(documento));
  });

  /* ── 4. TRIM ─────────────────────────────────────────────────────────── */
  await test.step("4. RECORTAR el muro contra el tabique", async () => {
    await teclear(page, "TRIM");
    await expect(prompt).toContainText("bordes de corte");
    // Intro sin designar = todos los bordes del dibujo, como en cualquier CAD.
    await terminar(page);
    await expect(prompt).toContainText("recortar");
    await page.mouse.click(pxMuroSobrante.x, pxMuroSobrante.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    const muro = linea(documento, "muro-largo");
    expect(muro.start).toMatchObject({ x: 1_000, y: 1_000 });
    expect(muro.end.x).toBeCloseTo(6_000, 6);
    expect(muro.end.y).toBeCloseTo(1_000, 6);
    expect(documento.entities).toHaveLength(8);
    fotos.push(foto(documento));
  });

  /* ── 5. EXTEND ───────────────────────────────────────────────────────── */
  await test.step("5. ALARGAR la viga hasta el pilar", async () => {
    await teclear(page, "EXTEND");
    await expect(prompt).toContainText("bordes de contorno");
    await terminar(page);
    await expect(prompt).toContainText("alargar");
    await page.mouse.click(pxVigaFinal.x, pxVigaFinal.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    const viga = linea(documento, "viga");
    expect(viga.start).toMatchObject({ x: 1_000, y: 4_000 });
    expect(viga.end.x).toBeCloseTo(7_000, 6);
    expect(viga.end.y).toBeCloseTo(4_000, 6);
    fotos.push(foto(documento));
  });

  const finalDelRecorrido = fotos[fotos.length - 1];

  /* ── 6. DESHACER paso a paso ─────────────────────────────────────────── */
  const deshacer = page.getByTestId("cad-toolbar").getByRole("button", { name: "Deshacer", exact: true });
  const rehacer = page.getByTestId("cad-toolbar").getByRole("button", { name: "Rehacer", exact: true });

  const ordenes = ["ALARGAR", "RECORTAR", "DESFASAR", "COPIAR", "MOVER"];
  for (let paso = 0; paso < ordenes.length; paso += 1) {
    await test.step(`6.${paso + 1} Deshacer ${ordenes[paso]}`, async () => {
      await soltarSeleccion(page);
      await deshacer.click();
      const documento = await guardar(page, backend);
      const esperada = fotos[fotos.length - 2 - paso];
      expect(
        foto(documento),
        `tras deshacer ${ordenes[paso]} el dibujo tiene que ser EXACTAMENTE el de antes de esa orden`,
      ).toEqual(esperada);
    });
  }

  await test.step("6.6 El plano ha vuelto a como estaba", async () => {
    const documento = backend.snapshot().document;
    expect(foto(documento)).toEqual(inicial);
  });

  /* ── 7. REHACER paso a paso ──────────────────────────────────────────── */
  for (let paso = 0; paso < ordenes.length; paso += 1) {
    await test.step(`7.${paso + 1} Rehacer ${ordenes[ordenes.length - 1 - paso]}`, async () => {
      await soltarSeleccion(page);
      await rehacer.click();
      const documento = await guardar(page, backend);
      expect(
        foto(documento),
        `tras rehacer ${ordenes[ordenes.length - 1 - paso]} el dibujo tiene que volver a su estado`,
      ).toEqual(fotos[paso + 1]);
    });
  }

  await test.step("7.6 El plano vuelve a estar como al final del recorrido", async () => {
    expect(foto(backend.snapshot().document)).toEqual(finalDelRecorrido);
  });

  expect(erroresDePagina, "el estudio no debe soltar errores de consola en este recorrido").toEqual([]);
});

/**
 * SEGUNDA PARTE — EL CLIC QUE SE PIERDE.
 *
 * Sale de intentar lo más normal del mundo: desfasar un eje 600 mm y, al ver
 * que iba al lado que no, desfasarlo otra vez al otro lado. Se teclea OFFSET,
 * se teclea la distancia, se pincha el eje… y no pasa NADA. Ni geometría, ni
 * aviso, ni una línea en el registro de órdenes. El comando se queda pidiendo
 * el objeto como si no se hubiera pinchado.
 *
 * Lo que lo provoca, aislado con seis recorridos (A, B, F, G, H, J, K):
 *
 *   · Cuando un comando designa un objeto con el ratón, el objeto queda
 *     SELECCIONADO al terminar (comprobado: el panel de propiedades se abre).
 *   · Un objeto seleccionado muestra sus PINZAMIENTOS (extremos y punto medio).
 *   · A partir de ahí, un clic que caiga sobre un pinzamiento NO llega al
 *     comando: se lo come el gestor de pinzamientos, en silencio.
 *
 * Y el punto medio de una línea es justamente donde uno pincha: es el sitio
 * más cómodo y el más lejos de cualquier otra cosa. Por eso el fallo parece
 * aleatorio —«a veces el desfase no hace nada»— cuando es perfectamente
 * reproducible.
 *
 * Descartadas por medición, no por opinión:
 *   · «la distancia negativa no vale»  -> [A] -600 a la primera SÍ crea la
 *     paralela en y=6400.
 *   · «OFFSET sólo funciona una vez»   -> [D] desfasar la paralela recién
 *     creada SÍ funciona (y=8200).
 *   · «no deja duplicar geometría»     -> [H] con distancia 800, geometría
 *     nueva, en el punto medio: tampoco hace nada.
 *   · «hay que mover el ratón entre clics» -> [G] irse y volver no arregla nada.
 *   · Lo único que cambia el resultado es DÓNDE se pincha: sobre el mismo eje,
 *     a 2000 mm del punto medio, el mismo comando funciona ([F], [J]).
 *
 * Y no es cosa de OFFSET. RECORTAR se come el clic igual (pasos 3 y 4): el
 * mismo clic en el mismo punto —el extremo del muro sobrante— no hace nada con
 * el muro seleccionado y recorta correctamente hasta x=6000 sin nada
 * seleccionado. Única variable que cambia: si hay pinzamientos en pantalla.
 */
test("el clic con el que se designa se PIERDE si cae sobre un pinzamiento", async ({
  context,
  page,
}) => {
  test.setTimeout(300_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");

  await fitFootprint(page);
  const afin = await calibrar(page);
  // El eje va de (1000,7000) a (9000,7000): su PUNTO MEDIO es (5000,7000).
  const pxPuntoMedio = await pixelDe(page, afin, { x: 5_000, y: 7_000 });
  const pxSinPinzamiento = await pixelDe(page, afin, { x: 3_000, y: 7_000 });
  const prompt = page.getByTestId("cad-command-prompt");

  // Se selecciona el eje primero, que es lo que hace cualquiera antes de tocar
  // algo. (Da igual: designarlo con el propio comando lo deja seleccionado
  // exactamente igual — es lo que convierte esto en una trampa.)
  await designar(page, "eje");

  const paralelasA = (documento: CadDocument, distancia: number) =>
    documento.entities.filter(
      (entidad): entidad is Extract<CadEntity, { type: "line" }> =>
        entidad.type === "line" &&
        entidad.id !== "eje" &&
        Math.abs(entidad.start.y - entidad.end.y) < 1e-9 &&
        Math.abs(entidad.start.y - 7_000 - distancia) < 1e-9,
    );

  await test.step("1. Pinchando el eje LEJOS del punto medio: el desfase funciona", async () => {
    await teclear(page, "OFFSET");
    await expect(prompt).toContainText("desfase");
    await teclear(page, "600");
    await expect(prompt).toContainText("Designe");
    await page.mouse.click(pxSinPinzamiento.x, pxSinPinzamiento.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    expect(
      paralelasA(documento, 600),
      "desfasar 600 pinchando el eje a 2000 mm de su centro tiene que crear la paralela",
    ).toHaveLength(1);
  });

  await test.step("2. El MISMO comando, pinchando el MISMO eje en su punto medio", async () => {
    await teclear(page, "OFFSET");
    await expect(prompt).toContainText("desfase");
    await teclear(page, "-600");
    await expect(prompt).toContainText("Designe");
    await page.mouse.click(pxPuntoMedio.x, pxPuntoMedio.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    expect.soft(
      paralelasA(documento, -600),
      "MISMO comando, MISMO objeto, sólo cambia el píxel: el clic sobre el " +
        "pinzamiento del punto medio no llega al comando y no se crea nada, " +
        "sin ningún aviso al usuario",
    ).toHaveLength(1);
  });

  await test.step("3. Lo mismo con RECORTAR: el pinzamiento del extremo", async () => {
    // El muro va de (1000,1000) a (9000,1000) y el tabique lo cruza en x=6000.
    // Se pincha el sobrante EN SU EXTREMO, que es donde está el pinzamiento.
    const pxExtremoMuro = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
    await designar(page, "muro-largo");
    await teclear(page, "TRIM");
    await expect(prompt).toContainText("bordes de corte");
    await terminar(page);
    await expect(prompt).toContainText("recortar");
    await page.mouse.click(pxExtremoMuro.x, pxExtremoMuro.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    const muro = documento.entities.find((entidad) => entidad.id === "muro-largo");
    const extremo = muro && muro.type === "line" ? muro.end.x : Number.NaN;
    console.log(`[auditoría] tras RECORTAR pinchando el extremo, el muro acaba en x=${extremo}`);
    expect.soft(
      extremo,
      "recortar pinchando el sobrante EN SU EXTREMO (donde está el pinzamiento) " +
        "tiene que dejar el muro en x=6000, que es donde lo cruza el tabique",
    ).toBeCloseTo(6_000, 6);
  });

  await test.step("4. CONTROL: el MISMO clic, con el muro SIN seleccionar", async () => {
    // Única variable que cambia respecto del paso 3: la selección. Si aquí el
    // recorte sale, el culpable es el pinzamiento y no el punto elegido.
    const pxExtremoMuro = await pixelDe(page, afin, { x: 9_000, y: 1_000 });
    await soltarSeleccion(page);
    await teclear(page, "TRIM");
    await terminar(page);
    await expect(prompt).toContainText("recortar");
    await page.mouse.click(pxExtremoMuro.x, pxExtremoMuro.y);
    await terminar(page);
    await expect(prompt).toBeHidden();

    const documento = await guardar(page, backend);
    const muro = documento.entities.find((entidad) => entidad.id === "muro-largo");
    const extremo = muro && muro.type === "line" ? muro.end.x : Number.NaN;
    console.log(`[auditoría] CONTROL sin selección: el muro acaba en x=${extremo}`);
    expect(
      extremo,
      "sin nada seleccionado no hay pinzamientos, y el MISMO clic en el MISMO " +
        "punto sí recorta: lo que se come el clic es el pinzamiento",
    ).toBeCloseTo(6_000, 6);
  });
});

/**
 * TERCERA PARTE — Ctrl+Z. Nadie va al botón de la barra para deshacer.
 */
test("Ctrl+Z deshace y Ctrl+Y rehace, con el ratón sobre el dibujo", async ({ context, page }) => {
  test.setTimeout(300_000);
  const backend = await abrirEstudio(context, page);
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 6");

  const centroDe = (documento: CadDocument) => {
    const columna = documento.entities.find((entidad) => entidad.id === "columna");
    if (!columna || columna.type !== "circle") throw new Error("la columna dejó de ser un círculo");
    return columna.center.x;
  };
  expect(centroDe(await guardar(page, backend))).toBe(2_500);

  await designar(page, "columna");
  await teclear(page, "MOVE");
  await teclear(page, "0,0");
  await teclear(page, "1500,0");
  await expect(page.getByTestId("cad-command-prompt")).toBeHidden();
  expect(centroDe(await guardar(page, backend))).toBe(4_000);

  // Foco fuera de la caja de órdenes: si no, Ctrl+Z deshace el TEXTO tecleado.
  const caja = (await page.getByTestId("cad-canvas").boundingBox())!;
  await page.mouse.click(Math.round(caja.x + 40), Math.round(caja.y + 40));

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => centroDe(await guardar(page, backend)), { timeout: 20_000 })
    .toBe(2_500);

  await page.keyboard.press("Control+y");
  await expect
    .poll(async () => centroDe(await guardar(page, backend)), { timeout: 20_000 })
    .toBe(4_000);
});
