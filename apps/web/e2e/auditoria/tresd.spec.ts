import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { enter3DView } from "../fixtures/view-mode";
import { fitFootprint, isoView } from "../fixtures/camera-preset";
import { worldPoint } from "../fixtures/world-point";
import { solid3dMassProperties } from "../../src/lib/cad/solid3d-build";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * EL ARQUITECTO QUE QUIERE VER EL EDIFICIO EN TRES DIMENSIONES.
 *
 * No es una prueba de sólidos: es el recorrido que decide si alguien deja
 * SketchUp. Tres gestos, en el orden en que los hace una persona:
 *
 *   1. Levanta la planta que ya tiene dibujada — EXTRUDE.
 *   2. Mira el volumen y EMPUJA UNA FACHADA con el ratón — PRESSPULL. Sin esto
 *      no hay modelado directo: hay un visor.
 *   3. Apoya el plano de trabajo EN esa fachada y dibuja encima — UCS Cara.
 *      Es lo que convierte un alzado en algo editable en vez de en un cálculo
 *      a mano de coordenadas del mundo.
 *
 * ## Por qué la cámara isométrica y no la cenital
 *
 * En planta NO se designan caras: `cadFacePickerFor` devuelve `null` si el modo
 * no es 3D, y el visor 2D ni siquiera tiene rayo que lanzar. Un recorrido de
 * modelado directo hecho desde arriba mide otra cosa. Además, desde la cenital
 * sólo se alcanza la cara de ARRIBA, que es la única que no obliga a un SCU
 * inclinado — justo la parte interesante.
 *
 * ## Dónde cae el clic, y por qué es determinista y no suerte
 *
 * El preset isométrico coloca la cámara en `(0,6d, 0,85d, 1,0d)` de escena
 * mirando al centro de la huella (`camera-view-presets.ts`), así que el rayo que
 * sale por el CENTRO del lienzo es exactamente la dirección cámara→objetivo,
 * independiente del campo de visión y de la relación de aspecto. Con la huella
 * de 12000×10000 y la caja de este spec, ese rayo entra por la fachada +Y y por
 * ninguna otra: la comprobación aritmética está en el comentario de
 * `RAYO_DEL_CENTRO`. Un clic en el centro del lienzo es, además, lo que hace
 * cualquiera: se pone el modelo en medio y se pincha.
 */

/** Huella del documento. El preset isométrico encuadra ESTO. */
const HUELLA_W = 12_000;
const HUELLA_H = 10_000;

/** La planta: un rectángulo centrado en la huella. */
const X0 = 3_000;
const Y0 = 2_500;
const X1 = 9_000;
const Y1 = 7_500;
const ALTURA = 3_000;
const EMPUJON = 500;

/**
 * RAYO_DEL_CENTRO — la aritmética que hace determinista el clic.
 *
 * Cámara de escena `(0,6d, 0,85d, 1,0d)` con `d = max(W,H)·s = 12000·s`, y el
 * objetivo en el centro de la huella a cota 0. En coordenadas de DIBUJO
 * (`cadSceneRayToDrawing`: x→x+W/2, z→y+H/2, y→z):
 *
 *   origen    (13200, 17000, 10200)
 *   dirección (−7200, −12000, −10200)
 *
 * Contra la caja x∈[3000,9000], y∈[2500,7500], z∈[0,3000]:
 *   · cara y=7500 → t=0,7917 → (7500, 7500, 2125)   DENTRO de la cara  ✔
 *   · cara z=3000 → t=0,7059 → y=8529 > 7500        fuera              ✘
 *   · cara x=9000 → t=0,5833 → y=10000 > 7500       fuera              ✘
 * Gana la fachada +Y, que es una cara VERTICAL: el caso que obliga a un SCU
 * inclinado y el que de verdad se quiere probar.
 */
const FACHADA_Y = Y1;

function documentoConPlanta(): CadDocument {
  const planta: CadEntity = {
    id: "planta",
    type: "polyline",
    vertices: [
      { x: X0, y: Y0, z: 0 },
      { x: X1, y: Y0, z: 0 },
      { x: X1, y: Y1, z: 0 },
      { x: X0, y: Y1, z: 0 },
    ],
    closed: true,
    layer: "0",
  } as CadEntity;
  return documentoCon([planta]);
}

/** El mismo documento pero con el volumen ya levantado: una caja. */
function documentoConCaja(): CadDocument {
  const caja = {
    id: "cuerpo",
    type: "solid3d",
    layer: "0",
    root: "base",
    nodes: [
      {
        id: "base",
        op: "box",
        min: { x: X0, y: Y0, z: 0 },
        max: { x: X1, y: Y1, z: ALTURA },
      },
    ],
  } as unknown as CadEntity;
  return documentoCon([caja]);
}

function documentoCon(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((e) => e.id) },
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

/** Camino de apertura confirmado (idéntico a los goldens 32, 61 y 66). */
async function abrirEstudio(context: BrowserContext, page: Page, documento: CadDocument) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documento, {
    footprintW: HUELLA_W,
    footprintH: HUELLA_H,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

async function teclear(page: Page, texto: string) {
  const entrada = page.getByTestId("cad-command-input");
  await entrada.click();
  await entrada.fill(texto);
  await entrada.press("Enter");
}

/** El centro del lienzo: donde pincha cualquiera para tocar lo que está en medio. */
async function centroDelLienzo(page: Page) {
  const caja = await page.getByTestId("cad-canvas").boundingBox();
  expect(caja, "el lienzo tiene caja").toBeTruthy();
  return { x: caja!.x + caja!.width / 2, y: caja!.y + caja!.height / 2 };
}

function solidos(documento: CadDocument): CadSolid3dEntity[] {
  return documento.entities.filter(
    (e): e is CadSolid3dEntity => e.type === "solid3d",
  );
}

/** Pone el estudio en volumen y lo encuadra en isométrica. */
async function verEnVolumen(page: Page) {
  await enter3DView(page);
  await isoView(page);
  // El preset ya encuadra la huella; `fitFootprint` no cambia el preset y sí
  // garantiza que el contexto de escena está calculado antes del primer clic.
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
}

// ───────────────────────────────────────────────────────────────────────────
// 1. LEVANTAR LA PLANTA Y EMPUJAR UNA FACHADA
// ───────────────────────────────────────────────────────────────────────────
test("levanto la planta, la miro en isométrica y empujo una fachada con el ratón", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const backend = await abrirEstudio(context, page, documentoConPlanta());

  await test.step("EXTRUDE: designo la planta con el ratón y le doy altura", async () => {
    // Se hace EN PLANTA, que es donde está dibujada y donde se designa por
    // pickbox. `worldPoint` exige encuadre cenital: el estudio ya abre en 2D.
    await fitFootprint(page);
    // El píxel de la arista se localiza ANTES de arrancar el comando: con un
    // comando en curso la línea de comandos se despliega sobre la banda baja
    // del lienzo, y el muestreo del HUD que hace `worldPoint` roza su borde.
    // Es una limitación DEL MUESTREO, no del producto: el usuario ya sabe
    // dónde está su línea antes de teclear la orden.
    const sobreLaArista = await worldPoint(page, { x: (X0 + X1) / 2, y: Y0 });
    await teclear(page, "EXTRUDE");
    await expect(page.getByTestId("cad-command-line")).toContainText(/contornos cerrados/i);
    // Un punto SOBRE la arista inferior del rectángulo: eso designa la entidad.
    await page.mouse.click(sobreLaArista.x, sobreLaArista.y);
    await expect(page.getByTestId("cad-command-line")).toContainText(/altura de la extrusión/i);
    await teclear(page, String(ALTURA));
  });

  await saveAndSettle(page, backend);

  await test.step("el documento guardado trae un sólido con su volumen", async () => {
    const guardado = backend.snapshot().document as unknown as CadDocument;
    const piezas = solidos(guardado);
    expect(piezas, "la extrusión dejó exactamente un sólido").toHaveLength(1);
    expect(
      solid3dMassProperties(piezas[0]).volume,
      `${X1 - X0}×${Y1 - Y0}×${ALTURA} debía dar ${(X1 - X0) * (Y1 - Y0) * ALTURA}`,
    ).toBeCloseTo((X1 - X0) * (Y1 - Y0) * ALTURA, 0);
  });

  await verEnVolumen(page);

  await test.step("PRESSPULL: pincho la fachada y la empujo 500", async () => {
    await teclear(page, "PRESSPULL");
    await expect(page.getByTestId("cad-command-line")).toContainText(/cara/i);
    const centro = await centroDelLienzo(page);
    await page.mouse.click(centro.x, centro.y);
    await expect(
      page.getByTestId("cad-command-line"),
      "tras designar la cara, PRESSPULL tiene que pedir la distancia",
    ).toContainText(/distancia/i);
    await teclear(page, String(EMPUJON));
  });

  await saveAndSettle(page, backend);

  await test.step("el volumen creció, y lo hizo por un NODO reeditable", async () => {
    const guardado = backend.snapshot().document as unknown as CadDocument;
    const pieza = solidos(guardado)[0];
    const empuje = pieza.nodes.find((n) => n.op === "push");
    expect(empuje, "el árbol persistido gana un nodo `push`").toBeTruthy();
    expect(pieza.root, "y ese nodo es la nueva raíz").toBe(empuje!.id);
    expect(
      pieza.nodes.some((n) => n.op === "brep"),
      "no se horneó una malla: eso sería irreeditable",
    ).toBe(false);

    // La fachada +Y mide (X1−X0)×ALTURA; empujarla 500 añade ese prisma.
    const esperado = (X1 - X0) * (Y1 - Y0 + EMPUJON) * ALTURA;
    expect(
      solid3dMassProperties(pieza).volume,
      `empujar ${EMPUJON} la fachada de ${X1 - X0}×${ALTURA} debía dejar ${esperado}`,
    ).toBeCloseTo(esperado, 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. APOYAR EL PLANO DE TRABAJO EN LA FACHADA Y DIBUJAR ENCIMA
// ───────────────────────────────────────────────────────────────────────────
test("apoyo el SCU en una fachada y dibujo encima", async ({ context, page }) => {
  test.setTimeout(240_000);
  const backend = await abrirEstudio(context, page, documentoConCaja());
  await verEnVolumen(page);

  await test.step("UCS > Cara: pincho la fachada", async () => {
    await teclear(page, "UCS");
    await expect(page.getByTestId("cad-command-line")).toContainText(/origen del nuevo SCU/i);
    // Palabra clave del prompt: es un BOTÓN, así que se pulsa como se pulsa.
    await page.getByTestId("cad-command-keyword-Cara").click();
    await expect(page.getByTestId("cad-command-line")).toContainText(/[Dd]esigne la cara/);
    const centro = await centroDelLienzo(page);
    await page.mouse.click(centro.x, centro.y);
    await expect(
      page.getByTestId("cad-command-line"),
      "designada la cara, el comando debe ofrecer Siguiente/Voltear/Aceptar",
    ).toContainText(/cara \d+ de \d+/i);
    await page.getByTestId("cad-command-keyword-Aceptar").click();
    await expect(page.getByTestId("cad-command-line")).toContainText(/SCU/);
  });

  await test.step("LINE sobre el SCU de la fachada: el trazo cae EN la fachada", async () => {
    await teclear(page, "LINE");
    // Coordenadas del SCU: (0,0) es el centroide de la cara y (2000,0) va por
    // su arista larga. Si el producto respeta el plano de trabajo, las dos
    // caen en el plano y = FACHADA_Y, a media altura, y NO aplanadas al suelo.
    await teclear(page, "0,0");
    await teclear(page, "2000,0");
    await teclear(page, "");
  });

  await saveAndSettle(page, backend);

  await test.step("el documento guardado pone la línea en el plano de la fachada", async () => {
    const guardado = backend.snapshot().document as unknown as CadDocument;
    const linea = guardado.entities.find((e) => e.type === "line") as
      | { start: { x: number; y: number; z?: number }; end: { x: number; y: number; z?: number } }
      | undefined;
    expect(
      linea,
      "LINE dibujó sobre un SCU apoyado en una cara: tiene que existir la línea",
    ).toBeTruthy();
    const puntos = [linea!.start, linea!.end];
    for (const [i, p] of puntos.entries()) {
      expect(
        p.y,
        `el punto ${i + 1} (${p.x}, ${p.y}, ${p.z}) tiene que estar EN el plano de la fachada y=${FACHADA_Y}`,
      ).toBeCloseTo(FACHADA_Y, 3);
      expect(
        p.z ?? 0,
        `el punto ${i + 1} (${p.x}, ${p.y}, ${p.z}) NO puede estar aplanado a cota cero: la fachada va de 0 a ${ALTURA}`,
      ).toBeCloseTo(ALTURA / 2, 3);
    }
    expect(
      Math.abs(puntos[1].x - puntos[0].x),
      "la línea mide 2000 sobre el eje X del SCU de la cara",
    ).toBeCloseTo(2_000, 3);
  });

  await test.step("¿y un rectángulo, un círculo, una polilínea en esa fachada? — lo que contesta", async () => {
    for (const orden of ["RECTANG", "CIRCLE", "PLINE"]) {
      await teclear(page, orden);
      await teclear(page, "0,0");
      await page.keyboard.press("Escape");
    }
    // No se afirma un resultado: se DEJA CONSTANCIA de lo que contesta. Si
    // dibuja, el registro lo dirá; si se niega, dirá con qué palabras.
    const registro = await page.getByTestId("cad-command-line-log").innerText();
    console.log(`\n=== dibujar sobre el SCU de la cara ===\n${registro.slice(-2000)}\n`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. LO QUE HACE SKETCHUP: DIBUJAR EN LA CARA CON EL RATÓN
// ───────────────────────────────────────────────────────────────────────────
/**
 * Apoyar el SCU en una cara y TECLEAR coordenadas funciona (prueba 2). Apoyarlo
 * y DIBUJAR CON EL RATÓN encima —el gesto entero de SketchUp— no: el punto que
 * manda el lienzo es la intersección del rayo con el SUELO (`floorWorld`), sin
 * cota, y nadie lo proyecta sobre el plano de trabajo antes de dárselo al
 * comando. LINE se declara `spatial: true`, así que el fallo cerrado del motor
 * no salta: el trazo se guarda a cota cero, en el suelo, y NADIE lo dice.
 *
 * Se deja como `test.fail()` y no como una aserción de lo que hoy pasa: lo que
 * este spec afirma es lo que el producto DEBE hacer. El día que se arregle,
 * esta prueba se pondrá roja pidiendo que se le quite la anotación, que es la
 * forma de que un defecto conocido no se convierta en un contrato.
 */
test("dibujo en la fachada con el ratón y el trazo se queda en la fachada", async ({
  context,
  page,
}) => {
  test.fail();
  test.setTimeout(240_000);
  const backend = await abrirEstudio(context, page, documentoConCaja());
  await verEnVolumen(page);

  await teclear(page, "UCS");
  await page.getByTestId("cad-command-keyword-Cara").click();
  const centro = await centroDelLienzo(page);
  await page.mouse.click(centro.x, centro.y);
  await page.getByTestId("cad-command-keyword-Aceptar").click();
  await expect(page.getByTestId("cad-command-line")).toContainText(/eje Z \(0, 1, 0\)/);

  await teclear(page, "LINE");
  // Dos clics SOBRE la fachada, tal cual los daría cualquiera.
  await page.mouse.click(centro.x, centro.y);
  await page.mouse.click(centro.x - 60, centro.y + 40);
  await teclear(page, "");

  await saveAndSettle(page, backend);

  const guardado = backend.snapshot().document as unknown as CadDocument;
  const linea = guardado.entities.find((e) => e.type === "line") as
    | { start: { x: number; y: number; z?: number }; end: { x: number; y: number; z?: number } }
    | undefined;
  console.log(`\n=== LINE con el ratón sobre el SCU de la fachada ===\n${JSON.stringify(linea)}\n`);
  expect(linea, "los dos clics tienen que dejar una línea").toBeTruthy();
  for (const [i, p] of [linea!.start, linea!.end].entries()) {
    expect(
      p.y,
      `el punto ${i + 1} (${p.x}, ${p.y}, ${p.z}) debería caer EN la fachada y=${FACHADA_Y}`,
    ).toBeCloseTo(FACHADA_Y, 3);
  }
});
