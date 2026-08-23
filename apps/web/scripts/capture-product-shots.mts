#!/usr/bin/env tsx
/**
 * CAPTURAS REALES DEL PRODUCTO — reproducibles, no envejecidas.
 *
 * POR QUÉ EXISTE. La portada de un CAD que no enseña un dibujo es la carencia
 * número uno de este producto: hasta hoy, `public/` no tenía un solo archivo de
 * imagen y el hero pintaba una caja con degradado y una lista numerada. Un
 * arquitecto que llega a decidir si cambia de herramienta quiere ver la
 * herramienta.
 *
 * POR QUÉ ES UN SCRIPT Y NO SEIS PNG SUBIDOS A MANO. Una captura pegada en el
 * repositorio envejece en silencio: el producto cambia, la portada sigue
 * enseñando la interfaz del trimestre pasado, y nadie se entera hasta que un
 * cliente lo dice. Aquí las capturas se REGENERAN — el plano se vuelve a
 * dibujar comando a comando con la misma línea de comandos que usa una persona.
 *
 * Reutiliza los fixtures herméticos de los goldens (`e2e/fixtures/`): sin API
 * real, sin base de datos, sin red. Lo que se fotografía es el editor de verdad
 * respondiendo a órdenes de verdad.
 *
 *   npm run capture:product                # contra el servidor que ya corre
 *   npm run capture:product -- --start     # arranca `next dev` y lo apaga al salir
 *
 * En Windows hace falta `PLAYWRIGHT_BROWSERS_PATH` si los navegadores no están
 * en la ruta por defecto (ver docs/design/DESIGN_SYSTEM.md).
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installMockBackend } from "../e2e/fixtures/mock-backend";
import { installCadV1Backend } from "../e2e/fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../e2e/fixtures/standalone-identity";
import { createCadStarterDocument } from "../src/lib/cad/starter-templates";
import type { CadDocument } from "../src/lib/cad/cad-document";
import { forbiddenTextFragments } from "../../../scripts/cad/check-no-industrial-domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_ORIGIN = process.env.E2E_API_ORIGIN || "http://localhost:4010";

/** Dónde caen las capturas. `public/product/` las sirve la portada. */
const OUT_DIR = path.join(webRoot, "public", "product");
/**
 * EL PLANO DE EJEMPLO — el mismo que sale en la portada.
 *
 * Que sean el mismo dibujo no es una economía: es una promesa cumplida. Quien
 * ve la captura del hero y pulsa «Abre un plano de ejemplo» abre EXACTAMENTE lo
 * que acaba de ver. La alternativa —una captura bonita y un ejemplo distinto—
 * es la primera decepción del producto, y llega en el primer minuto.
 *
 * El fixture se GENERA dibujando con los comandos reales, no se escribe a mano:
 * el día que el esquema del documento cambie, se regenera en vez de pudrirse.
 */
const SAMPLE_PLAN = path.join(webRoot, "src", "lib", "cad", "sample-plan.json");
/** Copia de referencia para el informe de la campaña (antes/después). */
const DOC_DIR = path.resolve(webRoot, "..", "..", "docs", "design", "before-after");

/**
 * Retina. Las capturas se muestran a la mitad de su tamaño en la portada, así
 * que se toman al doble: en una pantalla densa, una captura 1× de una interfaz
 * llena de texto de 11 px se ve emborronada, y eso lee como producto barato.
 */
const SCALE = 2;
const VIEWPORT = { width: 1440, height: 900 };

type Shot = { name: string; note: string };
const taken: Shot[] = [];

/* ── Utilidades de conducción del editor ─────────────────────────────────── */

async function type(page: Page, text: string) {
  const line = page.getByTestId("cad-command-input");
  await line.click();
  await line.fill(text);
  await page.keyboard.press("Enter");
}

/**
 * Designa la primera entidad de la lista del panel derecho.
 *
 * La paleta de propiedades con nada designado es un panel vacío; lo que hay que
 * enseñar es una fila por propiedad. Se designa por la LISTA y no por el
 * lienzo porque la lista no necesita saber dónde cayó el encuadre.
 */
async function selectFirstEntity(page: Page) {
  const row = page.getByTestId("cad-native-entity-list").locator("button").first();
  await row.click();
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string, note: string, clip?: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, clip, animations: "disabled" });
  taken.push({ name, note });
  console.log(`  · ${name}.png — ${note}`);
}

/**
 * El plano de ejemplo: una planta arquitectónica de verdad.
 *
 * Se dibuja con la MISMA línea de comandos que usa una persona (WA para muro,
 * DOOR y WINDOW para los huecos, DLI para cota, H para sombreado, T para
 * rótulo) sobre la plantilla mexicana de arranque, que ya trae capas, estilo
 * de cota, escala 1:50 y cajetín. Si el producto dejara de responder a un
 * alias, este script fallaría en vez de fotografiar un lienzo vacío.
 *
 * POR QUÉ CRECIÓ. La versión anterior eran cuatro muros y dos cotas: un
 * rectángulo con dos flechas. Esa imagen es el principal argumento de venta de
 * la portada y no enseñaba ninguna de las cosas por las que un arquitecto
 * cambia de herramienta —huecos alojados en el muro, sombreado de sala,
 * rótulos, una cadena de cotas—. Un CAD se juzga por lo que dibuja.
 */
async function drawSamplePlan(page: Page) {
  /* ── 1. El perímetro: 10 × 7 m que cierran solos en las esquinas ───────── */
  const walls: Array<[string, string]> = [
    ["2000,2000", "12000,2000"],
    ["12000,2000", "12000,9000"],
    ["12000,9000", "2000,9000"],
    ["2000,9000", "2000,2000"],
    // Dos particiones interiores: recámara al poniente, baño al norte.
    ["6500,2000", "6500,6000"],
    ["6500,6000", "12000,6000"],
  ];
  for (const [from, to] of walls) {
    await type(page, "WA");
    await type(page, from);
    await type(page, to);
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(400);
}

/**
 * Traduce coordenadas de DIBUJO a píxeles de pantalla.
 *
 * POR QUÉ NO REUSA `e2e/fixtures/world-point.ts`. Ese traductor garantiza la
 * frescura de cada lectura del HUD por CAMBIO —mueve el ratón a un vecino,
 * espera a que el número difiera, y sólo entonces se fía—, que es lo correcto
 * dentro de una prueba: no admite una espera fija que un día sea corta. Aquí no
 * converge: encadenando tres muestreos seguidos, la lectura del vecino llega a
 * ser todavía la del muestreo ANTERIOR, la espera por cambio se satisface con
 * el valor equivocado y el lazo se queda dando vueltas hasta agotar su plazo.
 * Medido: quince segundos sin asentar, con la cámara ya perfectamente cenital.
 *
 * Un guion de capturas no es una prueba. Aquí sí se puede esperar un tiempo
 * fijo generoso entre muestreo y muestreo, y a cambio la transformación sale a
 * la primera. Y no se pierde rigor: la cámara se comprueba CENITAL —los
 * términos cruzados de la afín tienen que ser cero— antes de devolver nada, así
 * que si el encuadre se destempla el guion falla en vez de clicar al vacío.
 */
async function planToScreen(page: Page) {
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("el lienzo del CAD no tiene caja");
  const coordinate = page.getByTestId("cad-cursor-coordinate");
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    return {
      x: Number(await coordinate.getAttribute("data-x")),
      y: Number(await coordinate.getAttribute("data-y")),
    };
  };
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // El HUD del cursor no publica nada hasta que el puntero ha entrado en el
  // lienzo Y el motor ha corrido un cuadro. Muestrear antes devuelve `null`,
  // `Number(null)` es NaN y la escala sale «no utilizable» — que es como falló
  // la pasada en tema claro, después de que la oscura entera saliera bien.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.mouse.move(center.x + (attempt % 2), center.y);
    await page.waitForTimeout(150);
    const raw = await coordinate.getAttribute("data-x");
    if (raw !== null && raw !== "" && Number.isFinite(Number(raw))) break;
  }
  const origin = await sample(center.x, center.y);
  const horizontal = await sample(center.x + 80, center.y);
  const vertical = await sample(center.x, center.y + 80);
  const a = (horizontal.x - origin.x) / 80;
  const b = (vertical.x - origin.x) / 80;
  const c = (horizontal.y - origin.y) / 80;
  const d = (vertical.y - origin.y) / 80;
  const diagonal = Math.max(Math.abs(a), Math.abs(d));
  const cross = Math.max(Math.abs(b), Math.abs(c));
  if (!Number.isFinite(diagonal) || diagonal < 1e-9)
    throw new Error("la cámara no publica una escala utilizable");
  if (cross > diagonal * 0.02)
    throw new Error(
      `la vista no es cenital (cruzados ${cross.toFixed(3)} frente a ${diagonal.toFixed(3)}): ` +
        "el encuadre se destempló y designar con el ratón caería en otro sitio",
    );
  return (target: { x: number; y: number }) => ({
    x: Math.round(center.x + (target.x - origin.x) / a),
    y: Math.round(center.y + (target.y - origin.y) / d),
  });
}

/**
 * Huecos: puerta y ventanas ALOJADAS en su muro.
 *
 * DOOR y WINDOW no aceptan coordenadas tecleadas: exigen DESIGNAR el muro que
 * los aloja, porque un hueco sin anfitrión no es un hueco, es un agujero
 * dibujado encima. Así que aquí sí entra el ratón.
 *
 * Se hace DESPUÉS de encuadrar: la traducción sólo es invertible con la cámara
 * cenital, y `planToScreen` se niega si no lo está.
 *
 * ## Por qué se REENCUADRA y se REMIDE en cada hueco
 *
 * Porque el editor pierde el encuadre al alojar el primero. Medido paso a paso:
 * con la cámara en 14,98 unidades por píxel se coloca la puerta, y al enfocar
 * de nuevo la caja de comandos la vista salta sola a 59,02 —exactamente el
 * ajuste a la huella— sin que nadie lo haya pedido. Las tres ventanas
 * siguientes se designaban entonces contra coordenadas que ya no existían: el
 * clic caía a 30.225, muy fuera del dibujo, y el comando se quedaba esperando
 * un muro que nunca llegaba. Native se quedaba en 7 y ninguna prueba se
 * enteraba.
 *
 * Eso es un DEFECTO DEL PRODUCTO, no del guion —colocar una puerta no debería
 * mover la cámara— y está anotado como tal en la bitácora de la campaña. Aquí
 * se rodea de la única forma honesta: reencuadrar y volver a medir antes de
 * cada designación, para que la captura enseñe el plano completo mientras el
 * defecto se arregla por su cuenta.
 */
async function placeOpenings(page: Page) {
  const openings: Array<{
    command: "DOOR" | "WINDOW";
    at: { x: number; y: number };
  }> = [
    // Puerta principal en la fachada sur, hacia el lado poniente.
    { command: "DOOR", at: { x: 4000, y: 2000 } },
    // Ventana de la sala, misma fachada, al oriente de la partición.
    { command: "WINDOW", at: { x: 9500, y: 2000 } },
    // Ventana de la recámara, fachada poniente.
    { command: "WINDOW", at: { x: 2000, y: 5500 } },
    // Ventana alta del baño, fachada norte.
    { command: "WINDOW", at: { x: 9500, y: 9000 } },
  ];
  for (const opening of openings) {
    await frameThePlan(page);
    const toScreen = await planToScreen(page);
    const point = toScreen(opening.at);
    await type(page, opening.command);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(150);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
  }
}

/**
 * Sombreado, rótulos y cotas: lo que convierte un contorno en un plano.
 *
 * Todo tecleado. El sombreado nace ASOCIATIVO —se pide por punto interior y el
 * motor resuelve el contorno—, así que lo que se fotografía es la misma
 * entidad viva que se exporta a DXF, no un relleno pintado encima.
 */
async function annotateSamplePlan(page: Page) {
  /*
   * El sombreado del piso del baño, sobre su propio contorno.
   *
   * Pedirlo directamente dentro de la crujía no funciona, y no es un capricho
   * del guion: el buscador de contornos no considera cerrado un recinto
   * delimitado por MUROS —«El punto (9500, 4000) no está dentro de ningún
   * contorno cerrado»—, porque un muro es un eje con receta de grosor, no una
   * arista. Así que el contorno se dibuja: una polilínea cerrada por la cara
   * interior del local, que es exactamente lo que un arquitecto traza para
   * acotar un acabado de piso.
   */
  await type(page, "PL");
  for (const point of ["6650,6150", "11850,6150", "11850,8850", "6650,8850"])
    await type(page, point);
  await type(page, "C");
  await page.waitForTimeout(300);

  await type(page, "H");
  await type(page, "9000,7500");
  await page.waitForTimeout(400);

  // Rótulos de local. En MTEXT cada renglón tecleado es un párrafo y Enter con
  // la caja vacía remata, que es el gesto del editor en sitio. La ALTURA se
  // pide por su palabra clave: los 120 mm de fábrica son correctos a 1:50 en
  // papel y en pantalla, a la escala de la portada, son siete píxeles —el
  // rótulo existía y no se leía—.
  const labels: Array<[string, string, string]> = [
    ["2600,4200", "6200,3600", "RECÁMARA"],
    ["7000,3600", "11600,3000", "SALA · COMEDOR"],
    ["7000,7900", "11600,7300", "BAÑO"],
  ];
  for (const [corner, opposite, text] of labels) {
    await type(page, "T");
    // La altura se ofrece DESPUÉS de la primera esquina, no antes: hasta que
    // MTEXT tiene un punto de partida sólo acepta un punto. Pedirla al empezar
    // no daba error — la «A» se descartaba en silencio y el rótulo salía con
    // los 120 mm de fábrica, siete píxeles a la escala de la portada.
    await type(page, corner);
    await type(page, "A");
    await type(page, "320");
    await type(page, opposite);
    await type(page, text);
    await page.getByTestId("cad-command-input").press("Enter");
    await page.waitForTimeout(200);
  }

  // Cotas: la fachada completa, el paño de la recámara y el fondo.
  const dimensions: Array<[string, string, string]> = [
    ["2000,2000", "12000,2000", "7000,600"],
    ["2000,2000", "6500,2000", "4250,1300"],
    ["2000,2000", "2000,9000", "900,5500"],
  ];
  for (const [from, to, place] of dimensions) {
    await type(page, "DLI");
    await type(page, from);
    await type(page, to);
    await type(page, place);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
}

/* ── El guardián de identidad de la captura ──────────────────────────────── */

/**
 * UNA FOTO NO PUEDE VOLVER A ENVEJECER EN SILENCIO.
 *
 * Las capturas del 22 de agosto se tomaron a las 02:42, HORAS antes de que la
 * campaña de identidad purgara el vocabulario del planificador de plantas. El
 * producto quedó limpio; la portada siguió enseñando «AXOS-CAD-STUDIO» en letras
 * grandes, herramientas «Aisle», «Zone» y «Equipment», y un panel que hablaba de
 * estaciones. Nadie se enteró porque un PNG no falla en CI.
 *
 * Ahora sí: antes de disparar, se lee el TEXTO RENDERIZADO de la página y se
 * rechaza si contiene vocabulario del producto muerto. El script se cae, la
 * captura no se escribe, y la portada se queda con la anterior —que es lo
 * correcto: mejor una foto vieja y sabida que una foto nueva y mentirosa.
 *
 * La lista tiene dos mitades y las dos importan:
 *
 *  · `forbiddenTextFragments` viene del MISMO gate que audita el código
 *    (`scripts/cad/check-no-industrial-domain.mjs`). Importarla en vez de
 *    copiarla es lo que impide que la foto y el código midan cosas distintas:
 *    lo que se prohíba mañana en el gate queda prohibido aquí sin tocar nada.
 *
 *  · `SURFACE_ONLY` es lo que el gate del código NO puede prohibir y una
 *    captura sí. `AXOS-CAD-STUDIO` está CONGELADO —vive en la columna `model`
 *    de los documentos de clientes, ver `IDENTITY.md`— así que el gate del
 *    código tiene que dejarlo pasar. Lo que no puede pasar es que se PINTE en
 *    la portada como si fuera el nombre del programa. Y `Aisle`, `Zone` y
 *    `Equipment` son palabras inglesas corrientes que el gate del código no
 *    puede prohibir sin ahogarse en falsos positivos; en la superficie visible
 *    de un CAD universal, en cambio, son la herramienta del planificador de
 *    plantas que ya no existe.
 */

/**
 * Vocabulario que sólo se prohíbe en lo que SE VE.
 *
 * `exempt` marca los sitios donde la palabra es legítima aunque salga en
 * pantalla, con su motivo. Sin esa válvula la comprobación acabaría en el
 * cajón: un plano DE una fábrica sí lleva su banda transportadora dibujada.
 */
const SURFACE_ONLY: Array<{ term: string; why: string; exempt?: RegExp }> = [
  {
    term: "AXOS-CAD-STUDIO",
    why: "el modelo congelado de los documentos historicos, pintado como nombre del producto",
  },
  { term: "Aisle", why: "herramienta del planificador de plantas" },
  { term: "Zone", why: "herramienta del planificador de plantas" },
  {
    term: "Equipment",
    why: "herramienta del planificador de plantas",
    // La CAPA se llama `Equipment` y su nombre viaja dentro de los DXF que los
    // clientes ya exportaron: es dato persistido y sigue el estandar AIA
    // (A-EQPM). Lo que se persigue es la HERRAMIENTA, no el nombre de la capa.
    exempt: /Layer Equipment/,
  },
  { term: "estación", why: "vocabulario del planificador de plantas" },
  { term: "estaciones", why: "vocabulario del planificador de plantas" },
];

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Lee el texto que el navegador ha PINTADO y falla si lleva producto muerto.
 *
 * Se mira `innerText` y no el HTML: lo que se juzga es lo que el visitante lee,
 * no lo que hay en un atributo o en un comentario del marcado.
 */
async function assertNoDeadProductVocabulary(page: Page, shot: string) {
  const rendered = String(await page.evaluate("document.body.innerText"));
  const haystack = stripAccents(rendered).toLowerCase();
  const problems: string[] = [];

  for (const [fragment, reason] of forbiddenTextFragments as Array<
    [string, string]
  >) {
    if (haystack.includes(stripAccents(fragment).toLowerCase()))
      problems.push(`«${fragment}» — ${reason}`);
  }

  for (const { term, why, exempt } of SURFACE_ONLY) {
    const needle = stripAccents(term).toLowerCase();
    if (!haystack.includes(needle)) continue;
    const surviving = rendered
      .split(/\r?\n/)
      .filter((line) => stripAccents(line).toLowerCase().includes(needle))
      .filter((line) => !exempt?.test(line));
    if (surviving.length)
      problems.push(`«${term}» — ${why} · ${JSON.stringify(surviving.slice(0, 4))}`);
  }

  if (!problems.length) return;
  throw new Error(
    [
      `La captura «${shot}» iba a fotografiar vocabulario del producto muerto.`,
      "No se escribe ninguna imagen: una portada con una foto vieja es mejor",
      "que una portada con una foto nueva que miente. Arregla el producto y",
      "vuelve a correr la captura.",
      "",
      ...problems.map((problem) => `  · ${problem}`),
    ].join("\n"),
  );
}

/**
 * VISTA DE PLANO, NO ÓRBITA 3D.
 *
 * El editor arranca en 3D y con la cámara en su sitio de fábrica: la primera
 * captura salió con la planta como un plano inclinado en perspectiva, ilegible
 * como dibujo. Un CAD 2D que se anuncia con una órbita 3D vacía está enseñando
 * lo que NO es. Se conmuta a 2D por el mismo control que usa una persona y se
 * encuadra con ZOOM EXtensión, que es el comando de siempre.
 */
async function frameThePlan(page: Page) {
  const flat = page.getByTitle(/Vista de plano 2D/);
  if (await flat.isVisible().catch(() => false)) {
    await flat.click();
    await page.waitForTimeout(400);
  }
  // NO se pulsa «Ajustar a la planta». Ese botón vive en la mitad derecha de la
  // barra superior, que en esta ventana no cabe entera y se DESPLAZA para
  // enseñar lo que se pulsa: la captura salía con la barra corrida y el nombre
  // del documento fuera de cuadro. `ZOOM EXtensión` encuadra igual y se teclea.
  await type(page, "ZOOM");
  await type(page, "EX");
  await page.waitForTimeout(500);
  // EXtensión encaja el dibujo a ras del borde del lienzo. Un plano que toca
  // los cuatro cantos se lee como recortado; el 0,75 le devuelve el aire que
  // un arquitecto deja alrededor de una planta.
  await type(page, "ZOOM");
  await type(page, "0.75X");
  await page.waitForTimeout(700);
}

function starterDocument(): CadDocument {
  return createCadStarterDocument({
    templateId: "planta-arquitectonica",
    project: "Casa Zaragoza",
    client: "Familia Zaragoza",
    title: "Planta baja",
    drawnBy: "S. Valle",
    date: "2026-08-21",
  });
}

async function installBackends(context: BrowserContext) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  return installCadV1Backend(context, {
    // EL NOMBRE NO ES EL MODELO. El estudio pinta el nombre del documento como
    // título, y el fixture lo hacía coincidir con el `model` por comodidad: en
    // los goldens da igual, en una captura de portada pintaba «AXOS-CAD-STUDIO»
    // —el identificador congelado del ERP del que nació el producto— con letras
    // grandes en la barra superior. Un documento se llama como el proyecto.
    name: "Casa Zaragoza · Planta baja",
    document: starterDocument() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 40_550,
      footprintH: 26_200,
      unit: "mm",
      gridSize: 100,
    },
  });
}

/* ── Arranque opcional del servidor ──────────────────────────────────────── */

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function maybeStartServer(): Promise<ChildProcess | null> {
  if (await reachable(BASE_URL)) {
    console.log(`· servidor ya en pie en ${BASE_URL}`);
    return null;
  }
  if (!process.argv.includes("--start")) {
    throw new Error(
      `No hay servidor en ${BASE_URL}.\n` +
        "Arráncalo con `npm run dev` o vuelve a llamar con `-- --start`.",
    );
  }
  console.log("· arrancando next dev…");
  const child = spawn("npm", ["run", "dev"], {
    cwd: webRoot,
    env: { ...process.env, NEXT_PUBLIC_API_URL: API_ORIGIN, BROWSER: "none" },
    stdio: "ignore",
    shell: true,
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await reachable(BASE_URL)) return child;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  child.kill();
  throw new Error("el servidor no respondió en 180 s");
}

/* ── El recorrido ────────────────────────────────────────────────────────── */

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(DOC_DIR, { recursive: true });
  const server = await maybeStartServer();

  const browser = await chromium.launch();
  try {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      // El tema lo fija el mismo almacenamiento que usa el conmutador real.
      await context.addInitScript(
        (value) => window.localStorage.setItem("valle_theme", value),
        theme,
      );
      const { snapshot } = await installBackends(context);
      const page = await context.newPage();

      await page.goto(`${BASE_URL}/legacy/studio`);
      await page
        .getByTestId("cad-command-line")
        .waitFor({ state: "visible", timeout: 120_000 });

      // El acompañante se cierra: en una captura de venta estorba, y su propia
      // pantalla se fotografía aparte.
      const skip = page.getByTestId("cad-guided-tour-skip");
      if (await skip.isVisible().catch(() => false)) await skip.click();

      await drawSamplePlan(page);
      // Encuadrar ANTES de los huecos: designar un muro con el ratón exige la
      // cámara cenital asentada, y la traducción de mundo a pantalla sólo es
      // invertible ahí.
      await frameThePlan(page);
      await placeOpenings(page);
      await annotateSamplePlan(page);
      // Y otra vez después: el plano creció con los rótulos y las cotas, y un
      // encuadre hecho sobre el contorno pelado los deja fuera de cuadro.
      await frameThePlan(page);
      await assertNoDeadProductVocabulary(page, `estudio-${theme}`);

      await shoot(
        page,
        `estudio-${theme}`,
        `el estudio completo en tema ${theme === "dark" ? "oscuro" : "claro"}`,
      );

      if (theme === "dark") {
        /* El plano de ejemplo, tal y como quedó dibujado. */
        const { document: drawn } = snapshot();
        await writeFile(
          SAMPLE_PLAN,
          `${JSON.stringify(drawn, null, 2)}\n`,
          "utf8",
        );
        console.log("  · sample-plan.json — el plano que abre el tablero");

        /* Acercamiento a la línea de comandos con un comando EN CURSO. */
        await type(page, "DLI");
        await page.waitForTimeout(300);
        const dock = page.getByTestId("cad-command-line");
        const box = await dock.boundingBox();
        if (box) {
          await shoot(page, "linea-de-comandos", "un comando a medio ejecutar", {
            x: Math.max(0, box.x - 12),
            y: Math.max(0, box.y - 12),
            width: Math.min(VIEWPORT.width, box.width + 24),
            height: box.height + 24,
          });
        }
        await page.keyboard.press("Escape");

        /*
         * El gestor de capas, por su BOTÓN.
         *
         * Teclear `LAYER` contesta «El gestor de capas no está montado en este
         * espacio de trabajo. Use -LAYER…» —el gestor vive anclado y su
         * visibilidad la decide el editor, no el puente de comandos
         * (`palettes/use-palettes.ts` lo explica y lo asume)—, así que la
         * captura salía enseñando ese renglón en rojo. Que dos comandos tan
         * usados de AutoCAD no abran su paleta desde la línea es un defecto
         * abierto, anotado en la bitácora; lo que NO puede pasar es que la
         * portada lo anuncie.
         */
        await page.getByTitle(/Vista, capas y plano/).click();
        await page
          .getByTestId("cad-layer-manager")
          .waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(500);
        await shoot(page, "paleta-capas", "el gestor de capas");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        /*
         * La paleta de propiedades, por su ATAJO y con algo designado.
         *
         * `PROPERTIES` tecleado contestaba «La paleta de propiedades no está
         * montada en este espacio de trabajo. Use LIST…» y la captura salía
         * enseñando ese renglón en rojo: seis meses de portada anunciando un
         * error. Ctrl+1 es el gesto real, el mismo que ejercita el golden 49, y
         * con una entidad designada la paleta enseña lo que tiene que enseñar
         * —una fila por propiedad— en vez de un panel vacío.
         */
        await selectFirstEntity(page);
        await page.keyboard.press("Control+1");
        await page
          .getByTestId("cad-properties-palette")
          .waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(400);
        await shoot(page, "paleta-propiedades", "la paleta de propiedades");
        await page.keyboard.press("Escape");

        /*
         * Espacio papel con el cajetín.
         *
         * `LAYOUT` NO cambia de espacio: es el comando que administra las
         * presentaciones, y se quedaba pidiendo
         * «[Nueva/COpiar/Renombrar/Suprimir/PLantilla/Definir/LIstar]» sobre el
         * espacio modelo. La captura llevaba meses llamándose «espacio-papel» y
         * enseñando el modelo con un menú abierto. A la lámina se va por su
         * pestaña, que es por donde va una persona.
         */
        const tabs = page.getByTestId("cad-space-tabs").locator("button");
        await tabs.nth(1).click();
        await page.waitForTimeout(1_000);
        /*
         * Y la lámina se PIDE. El administrador enseña de entrada un esquema de
         * alambre —un rectángulo de ventana vacío y un recuadro que dice
         * literalmente «TITLE BLOCK»—, que es lo que se estaba fotografiando.
         * «Exact print preview» construye la hoja de verdad: el dibujo dentro de
         * su ventana a escala y el cajetín con el proyecto, el número y la
         * revisión del documento. Eso es lo que un arquitecto reconoce.
         */
        /*
         * La ventana se ENCUADRA sobre el dibujo antes de construir la hoja.
         * La plantilla siembra la ventana con la huella entera —40.550 × 26.200
         * mm— y a 1:50 en A1 la casa de 10 × 7 m sale del tamaño de un sello en
         * la esquina de la lámina. Un arquitecto encuadra su ventana; aquí se
         * hace por los mismos campos que él usaría, y hay que desbloquearla
         * primero porque una ventana con candado no se reencuadra (que es
         * exactamente para lo que sirve el candado).
         */
        await page.getByTestId("cad-viewport-lock").click();
        for (const [field, value] of [
          ["x", "1200"],
          ["y", "1200"],
          ["width", "11600"],
          ["height", "8600"],
        ] as const) {
          const input = page.getByTestId(`cad-viewport-model-${field}`);
          await input.fill(value);
          await input.blur();
          await page.waitForTimeout(150);
        }
        await page.getByTestId("cad-viewport-lock").click();
        await page.waitForTimeout(400);

        await page.getByTestId("cad-layout-preview-build").click();
        const sheet = page.getByTestId("cad-exact-print-preview");
        await sheet.waitFor({ state: "visible", timeout: 20_000 });
        await sheet.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        const sheetBox = await sheet.boundingBox();
        await shoot(
          page,
          "espacio-papel",
          "la lámina con su cajetín",
          sheetBox
            ? {
                x: Math.max(0, sheetBox.x - 8),
                y: Math.max(0, sheetBox.y - 8),
                width: Math.min(VIEWPORT.width, sheetBox.width + 16),
                height: Math.min(VIEWPORT.height, sheetBox.height + 16),
              }
            : undefined,
        );
      }

      await context.close();
    }

    await writeFile(
      path.join(OUT_DIR, "MANIFIESTO.md"),
      [
        "# Capturas del producto",
        "",
        "GENERADAS, no subidas a mano. Se regeneran con:",
        "",
        "```bash",
        "npm run capture:product -- --start",
        "```",
        "",
        "El plano se dibuja comando a comando con la línea de comandos real",
        "sobre la plantilla mexicana de arranque. Si el producto dejara de",
        "responder a un alias, el script fallaría en vez de fotografiar un",
        "lienzo vacío — que es la única forma de que una captura no envejezca",
        "en silencio.",
        "",
        "| Archivo | Qué muestra |",
        "| ------- | ----------- |",
        ...taken.map((s) => `| \`${s.name}.png\` | ${s.note} |`),
        "",
      ].join("\n"),
      "utf8",
    );

    console.log(`\n${taken.length} capturas en apps/web/public/product/`);
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
