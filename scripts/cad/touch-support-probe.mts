#!/usr/bin/env tsx
/**
 * Sonda TÁCTIL: qué hace de verdad el visor CAD cuando lo maneja un dedo.
 *
 * ## Por qué existe
 *
 * Un arquitecto no vive en su escritorio. Va a la obra con una tableta, abre el
 * plano delante del maestro de obra y mide. AutoCAD cobra una aplicación móvil
 * aparte para eso; nosotros somos una aplicación web y en una tableta
 * deberíamos funcionar sin instalar nada. Esa ventaja no vale nada mientras
 * nadie haya COMPROBADO que los gestos funcionan, y hasta esta sonda nadie lo
 * había hecho: el visor escucha `pointerdown`/`pointermove`/`click`, que en
 * teoría cubren el táctil, pero «en teoría» no es una medida.
 *
 * ## Cómo mide, y por qué así
 *
 * Los gestos se inyectan por CDP (`Input.dispatchTouchEvent`), único camino con
 * MÁS DE UN PUNTO DE CONTACTO: la API de Playwright sólo sabe dar un toque.
 * Cada gesto se juzga por su EFECTO sobre el documento o sobre la cámara, nunca
 * por «se disparó el evento»:
 *
 *  · el paneo y el zoom, invirtiendo la transformación mundo↔pantalla que el
 *    propio editor publica bajo el cursor, antes y después del gesto;
 *  · la designación, en el contador de selección del editor;
 *  · el dibujo, en el número de entidades del documento canónico.
 *
 * El instrumento que lee la transformación mueve un RATÓN sintético. Un dedo no
 * tiene HUD de coordenadas porque no hay hover, así que sin ratón no hay forma
 * de leer la cámara sin añadir una sonda al producto. El ratón es aquí un
 * aparato de medida, no parte del gesto que se juzga: ningún veredicto depende
 * de que exista un ratón.
 *
 * ## El límite grande, dicho antes de que nadie lo suponga
 *
 * Chromium EMULADO no es un iPad. No reproduce la latencia del dedo, ni la
 * huella real del contacto, ni la heurística de gestos del sistema operativo,
 * ni el menú contextual por pulsación larga que sintetiza un navegador de
 * verdad. Lo que esta sonda demuestra es lo que el PRODUCTO hace con una
 * secuencia de puntos de contacto; lo que un iPad hace con un dedo sólo lo
 * demuestra un iPad.
 */
import { chromium, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { installMockBackend } from "../../apps/web/e2e/fixtures/mock-backend";
import { installCadStudioBackend } from "../../apps/web/e2e/fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../../apps/web/e2e/fixtures/standalone-identity";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Perfiles de pantalla: tabletas de obra, apaisadas y verticales. */
const PROFILES = [
  { id: "tableta-apaisada", label: 'Tableta 10" apaisada', width: 1024, height: 768 },
  { id: "tableta-vertical", label: 'Tableta 10" vertical', width: 768, height: 1024 },
  { id: "tableta-grande", label: 'Tableta 13" apaisada', width: 1366, height: 1024 },
] as const;

/** Plano sembrado: un rectángulo de 6×4 m. Números redondos a propósito. */
const SEED_LINES = [
  { id: "muro-sur", start: { x: 1_000, y: 1_000 }, end: { x: 7_000, y: 1_000 } },
  { id: "muro-este", start: { x: 7_000, y: 1_000 }, end: { x: 7_000, y: 5_000 } },
  { id: "muro-norte", start: { x: 7_000, y: 5_000 }, end: { x: 1_000, y: 5_000 } },
  { id: "muro-oeste", start: { x: 1_000, y: 5_000 }, end: { x: 1_000, y: 1_000 } },
];

function seedDocument() {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: SEED_LINES.map((line) => ({
      id: line.id,
      type: "line",
      start: { ...line.start, z: 0 },
      end: { ...line.end, z: 0 },
      layer: "0",
    })),
    history: [],
    modelSpace: { entityIds: SEED_LINES.map((line) => line.id) },
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

export interface TouchCheck {
  id: string;
  gesto: string;
  esperado: string;
  observado: string;
  veredicto: "funciona" | "roto" | "parcial";
  medida?: Record<string, unknown>;
}

interface Affine {
  origin: { x: number; y: number };
  a: number;
  b: number;
  c: number;
  d: number;
}

interface Contact {
  x: number;
  y: number;
  id: number;
}

async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  contacts: readonly Contact[],
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: contacts.map((contact) => ({
      x: contact.x,
      y: contact.y,
      id: contact.id,
      // 12 px de radio es la huella de un dedo adulto en una tableta de 10":
      // lo que el dedo TAPA es la mitad del problema de precisión.
      radiusX: 12,
      radiusY: 12,
      force: 1,
    })),
  });
}

/** Suelta TODOS los contactos. Chromium interpreta así la lista vacía. */
const release = (cdp: CDPSession) => touch(cdp, "touchEnd", []);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Toque simple con un temblor declarado entre pulsar y soltar. */
async function tap(
  cdp: CDPSession,
  point: { x: number; y: number },
  jitterPx = 0,
  holdMs = 90,
): Promise<void> {
  await touch(cdp, "touchStart", [{ ...point, id: 1 }]);
  if (jitterPx > 0) {
    const steps = 3;
    for (let step = 1; step <= steps; step += 1) {
      await touch(cdp, "touchMove", [
        { x: point.x + (jitterPx * step) / steps, y: point.y + (jitterPx * step) / steps / 2, id: 1 },
      ]);
      await wait(12);
    }
  }
  await wait(holdMs);
  await release(cdp);
}

/**
 * Coordenada de dibujo bajo un punto de pantalla, leída del HUD del editor.
 *
 * Se mueve el ratón a un vecino primero para que la lectura del destino DIFIERA
 * de la anterior: el HUD se actualiza asíncrono y un sondeo de «no vacío»
 * aceptaría el valor de la posición previa. Es el método del golden 33.
 */
async function worldAt(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const node = page.getByTestId("cad-cursor-coordinate");
  const read = async () => `${await node.getAttribute("data-x")}|${await node.getAttribute("data-y")}`;
  await page.mouse.move(x - 5, y - 5);
  const neighbour = await read();
  await page.mouse.move(x, y);
  let last = neighbour;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    last = await read();
    if (last !== neighbour && !last.startsWith("|") && !last.includes("null")) {
      const [rawX, rawY] = last.split("|");
      return { x: Number(rawX), y: Number(rawY) };
    }
    await wait(50);
  }
  // Fallo CERRADO: sin transformación mundo↔pantalla ningún veredicto de esta
  // sonda significa nada, y un valor inventado contaminaría paneo y zoom.
  const diagnosis = await page.evaluate(
    ([px, py]: number[]) =>
      document
        .elementsFromPoint(px!, py!)
        .slice(0, 5)
        .map((element) => {
          const testId = (element as HTMLElement).dataset?.testid ?? "";
          return `${element.tagName.toLowerCase()}${testId ? `[${testId}]` : ""}`;
        }),
    [x, y],
  );
  throw new Error(
    `el HUD del cursor no publicó coordenada en (${x}, ${y}); última lectura «${last}», ` +
      `pila bajo el punto ${JSON.stringify(diagnosis)}`,
  );
}

/** Transformación pantalla→dibujo, muestreada en tres puntos del lienzo. */
async function affine(page: Page): Promise<Affine> {
  const box = (await page.getByTestId("cad-canvas").boundingBox())!;
  const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const origin = await worldAt(page, center.x, center.y);
  const horizontal = await worldAt(page, center.x + 80, center.y);
  const vertical = await worldAt(page, center.x, center.y + 80);
  return {
    origin,
    a: (horizontal.x - origin.x) / 80,
    b: (vertical.x - origin.x) / 80,
    c: (horizontal.y - origin.y) / 80,
    d: (vertical.y - origin.y) / 80,
  };
}

/** Unidades de dibujo por píxel: el número que cambia al hacer zoom. */
const unitsPerPixel = (view: Affine) => Math.hypot(view.a, view.c);

function screenFor(
  view: Affine,
  box: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number },
): { x: number; y: number } {
  const determinant = view.a * view.d - view.b * view.c;
  if (Math.abs(determinant) < 1e-12) throw new Error("transformación mundo/pantalla singular");
  const wx = target.x - view.origin.x;
  const wy = target.y - view.origin.y;
  return {
    x: Math.round(box.x + box.width / 2 + (view.d * wx - view.b * wy) / determinant),
    y: Math.round(box.y + box.height / 2 + (-view.c * wx + view.a * wy) / determinant),
  };
}

/** Registro de eventos crudos, en captura sobre `window`: nada se pierde. */
const EVENT_RECORDER = `
window.__valleTouchLog = [];
for (const type of ["pointerdown","pointermove","pointerup","pointercancel","click","dblclick","contextmenu","touchstart","touchend"]) {
  window.addEventListener(type, (event) => {
    const last = window.__valleTouchLog[window.__valleTouchLog.length - 1];
    if (type === "pointermove" && last && last.type === type) { last.count += 1; return; }
    window.__valleTouchLog.push({
      type, count: 1,
      pointerType: event.pointerType ?? null,
      button: typeof event.button === "number" ? event.button : null,
      at: Math.round(performance.now()),
    });
  }, true);
}
`;

const eventLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __valleTouchLog: Array<Record<string, unknown>> }).__valleTouchLog);

const clearEventLog = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __valleTouchLog: unknown[] }).__valleTouchLog.length = 0;
  });

/** Entidades del documento canónico, leídas del contador de la barra. */
async function documentEntities(page: Page): Promise<number> {
  const text = (await page.getByTestId("cad-native-document-count").textContent()) ?? "";
  return Number(text.replace(/[^0-9]/g, ""));
}

const selectionCount = async (page: Page): Promise<string> =>
  ((await page.getByTestId("cad-selection-status-count").textContent()) ?? "").trim();

/**
 * Qué elemento recibe de verdad un toque en ese punto de pantalla.
 *
 * Es la diferencia entre «el gesto no funciona» y «el gesto nunca llegó al
 * lienzo porque una barra flotante se lo comió», y son dos arreglos distintos.
 */
const topElementAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]: number[]) => {
      const element = document.elementFromPoint(px!, py!);
      if (!element) return "ninguno";
      for (let node: Element | null = element; node; node = node.parentElement) {
        const testId = (node as HTMLElement).dataset?.testid;
        if (testId) return testId;
      }
      return element.tagName.toLowerCase();
    },
    [x, y],
  );

/**
 * Cuánto del lienzo tapan los paneles flotantes, en porcentaje de su área.
 * En una tableta el lienzo ES el producto: un panel que se lleva un tercio de
 * la pantalla se lleva un tercio del plano.
 */
const occlusion = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="cad-canvas"]');
    if (!canvas) return {};
    const area = canvas.getBoundingClientRect();
    const total = Math.max(1, area.width * area.height);
    const result: Record<string, number> = {};
    for (const testId of ["cad-guided-tour", "cad-command-line", "cad-toolbar", "cad-left-dock", "cad-right-dock"]) {
      const node = document.querySelector(`[data-testid="${testId}"]`);
      if (!node) continue;
      const box = node.getBoundingClientRect();
      const overlapW = Math.max(0, Math.min(area.right, box.right) - Math.max(area.left, box.left));
      const overlapH = Math.max(0, Math.min(area.bottom, box.bottom) - Math.max(area.top, box.top));
      result[testId] = Number((((overlapW * overlapH) / total) * 100).toFixed(1));
    }
    return result;
  });

/**
 * Controles visibles con menos de 44 px de lado. 44 px es el mínimo que
 * publican tanto Apple como Google para un objetivo táctil; por debajo, el
 * dedo falla y el usuario culpa al programa.
 */
const smallTargets = (page: Page) =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll("button, [role='button'], select, input")];
    let visible = 0;
    let small = 0;
    let smallest = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") continue;
      visible += 1;
      const side = Math.min(box.width, box.height);
      if (side < smallest) smallest = side;
      if (side < 44) small += 1;
    }
    return {
      controlesVisibles: visible,
      pordebajoDe44px: small,
      ladoMenorPx: Number.isFinite(smallest) ? Number(smallest.toFixed(1)) : null,
    };
  });

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend(context, seedDocument(), {
    footprintW: 8_000,
    footprintH: 6_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.addInitScript(EVENT_RECORDER);
  await page.goto(`${BASE_URL}/legacy/studio`);
  await page.getByTestId("cad-canvas").waitFor({ state: "visible", timeout: 90_000 });
  await page.getByTestId("cad-native-entity-list").waitFor({ state: "visible", timeout: 90_000 });
}

/** Modo 2D — el que usa quien dibuja: planta bloqueada, paneo y zoom. */
async function enterPlanMode(page: Page): Promise<void> {
  await page.getByTitle(/Vista de plano 2D/).click();
  await page.getByTitle(/Ajustar a la planta/).click();
  await wait(1_200);
}

export interface ProfileReport {
  id: string;
  label: string;
  viewport: { width: number; height: number };
  layout: Record<string, unknown>;
  checks: TouchCheck[];
}

async function probeProfile(profile: (typeof PROFILES)[number]): Promise<ProfileReport> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    hasTouch: true,
    isMobile: false,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const checks: TouchCheck[] = [];
  try {
    await openStudio(context, page);
    const cdp = await context.newCDPSession(page);

    // ---- QUE QUEPA EN LA PANTALLA ----------------------------------------
    // Se mide ANTES de tocar nada: así lo ve quien abre el plano en la obra.
    const firstBox = (await page.getByTestId("cad-canvas").boundingBox())!;
    const layout = {
      lienzo: { ancho: Math.round(firstBox.width), alto: Math.round(firstBox.height) },
      fraccionDeVentanaQueEsLienzo: Number(
        ((firstBox.width * firstBox.height) / (profile.width * profile.height)).toFixed(2),
      ),
      lineaDeComandosVisible: await page.getByTestId("cad-command-line").isVisible(),
      barraSuperiorVisible: await page.getByTestId("cad-top-toolbar").isVisible().catch(() => false),
      barraHerramientasVisible: await page.getByTestId("cad-toolbar").isVisible().catch(() => false),
      desbordeHorizontal: await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
      oclusionDelLienzoPorcentaje: await occlusion(page),
      objetivosTactiles: await smallTargets(page),
    };
    const tourSkip = page.getByTestId("cad-guided-tour-skip");
    if (await tourSkip.isVisible().catch(() => false)) await tourSkip.click();
    await wait(300);
    await enterPlanMode(page);

    const box = (await page.getByTestId("cad-canvas").boundingBox())!;
    const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    const view = await affine(page);
    const wall = screenFor(view, box, { x: 4_000, y: 1_000 });

    // ---- 1. UN DEDO DESIGNA ----------------------------------------------
    await clearEventLog(page);
    await tap(cdp, wall);
    await wait(500);
    const tapped = await selectionCount(page);
    checks.push({
      id: "un-dedo-designa",
      gesto: "Un toque limpio sobre un muro",
      esperado: "el muro queda designado",
      observado: `contador de selección «${tapped}»`,
      veredicto: tapped === "1 sel" ? "funciona" : "roto",
      medida: { seleccion: tapped, eventos: (await eventLog(page)).map((e) => `${e.type}:${e.pointerType ?? "-"}`) },
    });

    // ---- 2. EL TEMBLOR DEL DEDO ------------------------------------------
    // Un dedo no se queda quieto. El editor sólo acepta un toque como CLIC si
    // se movió menos de 5 px entre pulsar y soltar — una tolerancia de ratón.
    const jitterResults: Record<string, string> = {};
    for (const jitter of [4, 8, 16]) {
      await page.keyboard.press("Escape");
      // Un toque al vacío limpia la selección anterior: cada temblor se juzga
      // desde cero, no sobre lo que dejó el anterior.
      await tap(cdp, { x: center.x, y: center.y });
      await wait(250);
      await tap(cdp, wall, jitter);
      await wait(400);
      jitterResults[`${jitter}px`] = await selectionCount(page);
    }
    const jitterBreaks = Object.entries(jitterResults).filter(([, value]) => value !== "1 sel");
    checks.push({
      id: "temblor-del-dedo",
      gesto: "Toque sobre el mismo muro con 4, 8 y 16 px de temblor",
      esperado: "designa en los tres casos: un dedo nunca se queda quieto",
      observado:
        jitterBreaks.length === 0
          ? "designa con los tres temblores"
          : `deja de designar a partir de ${jitterBreaks[0]![0]} de temblor`,
      veredicto: jitterBreaks.length === 0 ? "funciona" : "roto",
      medida: jitterResults,
    });

    // ---- 3. UN DEDO EN EL FONDO: ¿DESIGNA O PANEA? -----------------------
    await enterPlanMode(page);
    const beforeDrag = await affine(page);
    await touch(cdp, "touchStart", [{ x: center.x, y: center.y, id: 1 }]);
    for (let step = 1; step <= 8; step += 1) {
      await touch(cdp, "touchMove", [{ x: center.x + step * 12, y: center.y, id: 1 }]);
      await wait(16);
    }
    await release(cdp);
    await wait(600);
    const afterDrag = await affine(page);
    const dragPx =
      Math.hypot(afterDrag.origin.x - beforeDrag.origin.x, afterDrag.origin.y - beforeDrag.origin.y) /
      unitsPerPixel(beforeDrag);
    checks.push({
      id: "un-dedo-en-el-fondo",
      gesto: "Arrastre de un dedo sobre el fondo, 96 px",
      esperado: "el dedo designa o arrastra; el paneo es de DOS dedos",
      observado:
        dragPx > 20
          ? `la cámara paneó ${dragPx.toFixed(0)} px: el dedo mueve la vista, no designa`
          : "la cámara no se movió",
      veredicto: dragPx > 20 ? "roto" : "funciona",
      medida: { paneoPx: Number(dragPx.toFixed(1)) },
    });

    // ---- 4. DOS DEDOS: PANEO ---------------------------------------------
    await enterPlanMode(page);
    const beforePan = await affine(page);
    const panA = { x: center.x - 60, y: center.y, id: 1 };
    const panB = { x: center.x + 60, y: center.y, id: 2 };
    await touch(cdp, "touchStart", [panA, panB]);
    for (let step = 1; step <= 10; step += 1) {
      await touch(cdp, "touchMove", [
        { ...panA, x: panA.x + step * 10 },
        { ...panB, x: panB.x + step * 10 },
      ]);
      await wait(16);
    }
    await release(cdp);
    await wait(700);
    const afterPan = await affine(page);
    const panPx =
      Math.hypot(afterPan.origin.x - beforePan.origin.x, afterPan.origin.y - beforePan.origin.y) /
      unitsPerPixel(beforePan);
    const panZoomDrift = unitsPerPixel(afterPan) / unitsPerPixel(beforePan);
    checks.push({
      id: "dos-dedos-panean",
      gesto: "Dos dedos desplazándose juntos 100 px",
      esperado: "la vista se desplaza ~100 px sin cambiar de escala",
      observado: `desplazamiento ${panPx.toFixed(1)} px, escala ×${panZoomDrift.toFixed(3)}`,
      veredicto: panPx > 40 && Math.abs(panZoomDrift - 1) < 0.25 ? "funciona" : panPx > 10 ? "parcial" : "roto",
      medida: { desplazamientoPx: Number(panPx.toFixed(1)), factorEscala: Number(panZoomDrift.toFixed(3)) },
    });

    // ---- 5. DOS DEDOS: PELLIZCO ------------------------------------------
    await enterPlanMode(page);
    const beforePinch = await affine(page);
    const pinchA = { x: center.x - 40, y: center.y, id: 1 };
    const pinchB = { x: center.x + 40, y: center.y, id: 2 };
    await touch(cdp, "touchStart", [pinchA, pinchB]);
    for (let step = 1; step <= 12; step += 1) {
      await touch(cdp, "touchMove", [
        { ...pinchA, x: pinchA.x - step * 10 },
        { ...pinchB, x: pinchB.x + step * 10 },
      ]);
      await wait(16);
    }
    await release(cdp);
    await wait(700);
    const afterPinch = await affine(page);
    const pinchFactor = unitsPerPixel(beforePinch) / unitsPerPixel(afterPinch);
    checks.push({
      id: "pellizco-hace-zoom",
      gesto: "Pellizco de apertura (80 px → 320 px de separación)",
      esperado: "acercar: menos unidades de dibujo por píxel",
      observado: `factor de acercamiento ×${pinchFactor.toFixed(2)}`,
      veredicto: pinchFactor > 1.25 ? "funciona" : pinchFactor > 1.02 ? "parcial" : "roto",
      medida: {
        factorAcercamiento: Number(pinchFactor.toFixed(3)),
        unidadesPorPixelAntes: Number(unitsPerPixel(beforePinch).toFixed(3)),
        unidadesPorPixelDespues: Number(unitsPerPixel(afterPinch).toFixed(3)),
      },
    });

    // ---- 6. DIBUJAR CON EL DEDO ------------------------------------------
    await enterPlanMode(page);
    const drawView = await affine(page);
    const entitiesBefore = await documentEntities(page);
    const from = screenFor(drawView, box, { x: 2_000, y: 2_000 });
    const to = screenFor(drawView, box, { x: 6_000, y: 4_000 });
    const commandInput = page.getByTestId("cad-command-input");
    await commandInput.click();
    await commandInput.fill("LINE");
    await commandInput.press("Enter");
    await wait(400);
    await tap(cdp, from);
    await wait(300);
    await tap(cdp, to);
    await wait(300);
    await page.keyboard.press("Enter");
    await wait(600);
    const entitiesAfterTaps = await documentEntities(page);
    checks.push({
      id: "dibujar-a-toques",
      gesto: "LINE y dos toques limpios",
      esperado: "el documento gana una línea",
      observado: `entidades ${entitiesBefore} → ${entitiesAfterTaps}`,
      veredicto: entitiesAfterTaps === entitiesBefore + 1 ? "funciona" : "roto",
      medida: {
        antes: entitiesBefore,
        despues: entitiesAfterTaps,
        quienRecibeElPrimerToque: await topElementAt(page, from.x, from.y),
        quienRecibeElSegundoToque: await topElementAt(page, to.x, to.y),
      },
    });

    // ---- 7. APUNTAR Y SOLTAR ---------------------------------------------
    // El dedo no tiene hover: la ÚNICA forma de ver a dónde engancha un punto
    // antes de fijarlo es posar el dedo y deslizar. Si ese deslizamiento
    // descalifica el toque, apuntar y dibujar son incompatibles.
    await page.keyboard.press("Escape");
    await wait(200);
    const aimBefore = await documentEntities(page);
    await commandInput.click();
    await commandInput.fill("LINE");
    await commandInput.press("Enter");
    await wait(400);
    const aimStart = screenFor(drawView, box, { x: 2_000, y: 4_500 });
    await touch(cdp, "touchStart", [{ ...aimStart, id: 1 }]);
    for (let step = 1; step <= 8; step += 1) {
      await touch(cdp, "touchMove", [{ x: aimStart.x + step * 5, y: aimStart.y + step * 3, id: 1 }]);
      await wait(20);
    }
    const snapBadge = ((await page.getByTestId("cad-live-snap-label").textContent().catch(() => "")) ?? "").trim();
    await release(cdp);
    await wait(400);
    const aimSecond = screenFor(drawView, box, { x: 6_000, y: 4_500 });
    await touch(cdp, "touchStart", [{ ...aimSecond, id: 1 }]);
    for (let step = 1; step <= 8; step += 1) {
      await touch(cdp, "touchMove", [{ x: aimSecond.x + step * 5, y: aimSecond.y + step * 3, id: 1 }]);
      await wait(20);
    }
    await release(cdp);
    await wait(300);
    await page.keyboard.press("Enter");
    await wait(600);
    const aimAfter = await documentEntities(page);
    await page.keyboard.press("Escape");
    checks.push({
      id: "apuntar-y-soltar",
      gesto: "Posar el dedo, deslizar 47 px para apuntar y soltar (dos veces)",
      esperado: "cada gesto fija un punto donde quedó el dedo: se apunta mirando",
      observado:
        aimAfter === aimBefore + 1
          ? "el gesto fija el punto donde se soltó"
          : `el gesto NO fija ningún punto (entidades ${aimBefore} → ${aimAfter}): deslizar descalifica el toque`,
      veredicto: aimAfter === aimBefore + 1 ? "funciona" : "roto",
      medida: { antes: aimBefore, despues: aimAfter, insigniaDeCapturaDuranteElGesto: snapBadge },
    });

    // ---- 8. PULSACIÓN LARGA = BOTÓN DERECHO ------------------------------
    await enterPlanMode(page);
    const holdView = await affine(page);
    await commandInput.click();
    await commandInput.fill("LINE");
    await commandInput.press("Enter");
    await wait(400);
    const promptVisible = await page.getByTestId("cad-command-prompt").isVisible().catch(() => false);
    await tap(cdp, screenFor(holdView, box, { x: 2_000, y: 2_000 }));
    await wait(400);
    await clearEventLog(page);
    const holdPoint = screenFor(holdView, box, { x: 4_000, y: 3_000 });
    await touch(cdp, "touchStart", [{ ...holdPoint, id: 1 }]);
    await wait(900);
    const menuDuringHold = await page.getByTestId("cad-pointer-menu").isVisible().catch(() => false);
    await release(cdp);
    await wait(400);
    const menuAfterHold = await page.getByTestId("cad-pointer-menu").isVisible().catch(() => false);
    const holdLog = await eventLog(page);
    checks.push({
      id: "pulsacion-larga-abre-menu",
      gesto: "Mantener pulsado 900 ms con un comando abierto",
      esperado: "menú contextual con las palabras clave del paso, como el botón derecho",
      observado:
        menuDuringHold || menuAfterHold
          ? "el menú de palabras clave aparece"
          : `no aparece ningún menú; el navegador no emite «contextmenu»: ${
              holdLog.some((event) => event.type === "contextmenu") ? "sí lo emite" : "NO lo emite"
            }`,
      veredicto: menuDuringHold || menuAfterHold ? "funciona" : "roto",
      medida: {
        promptDelMotorVisible: promptVisible,
        menuDuranteLaPulsacion: menuDuringHold,
        menuTrasSoltar: menuAfterHold,
        contextmenuNativo: holdLog.some((event) => event.type === "contextmenu"),
        eventos: holdLog.map((event) => `${event.type}:${event.pointerType ?? "-"}`),
      },
    });
    await page.keyboard.press("Escape");
    await wait(300);

    // ---- 9. PRECISIÓN: EL DEDO TAPA EL PUNTO -----------------------------
    await enterPlanMode(page);
    const precisionView = await affine(page);
    await commandInput.click();
    await commandInput.fill("LINE");
    await commandInput.press("Enter");
    await wait(400);
    const corner = screenFor(precisionView, box, { x: 7_000, y: 1_000 });
    // A qué DISTANCIA del extremo deja el dedo de enganchar. La apertura de
    // captura está en píxeles y hoy vale lo mismo para un ratón que para un
    // dedo, cuya incertidumbre es un orden de magnitud mayor.
    const snapByDistance: Record<string, string> = {};
    for (const offset of [0, 6, 12, 20]) {
      await touch(cdp, "touchStart", [{ x: corner.x + offset, y: corner.y + offset, id: 1 }]);
      await wait(100);
      await touch(cdp, "touchMove", [{ x: corner.x + offset + 1, y: corner.y + offset, id: 1 }]);
      await wait(220);
      snapByDistance[`${offset}px`] =
        ((await page.getByTestId("cad-live-snap").textContent().catch(() => "")) ?? "").trim() || "sin captura";
      await release(cdp);
      await wait(150);
    }
    const cursorOffsetPx = await page.evaluate(
      ([cx, cy]: number[]) => {
        const cursor = document.querySelector('[data-testid="cad-live-cursor"]') as HTMLElement | null;
        if (!cursor) return null;
        const rect = cursor.getBoundingClientRect();
        return Math.round(Math.hypot(rect.x - cx!, rect.y - cy!));
      },
      [corner.x + 20, corner.y + 20],
    );
    await page.keyboard.press("Escape");
    const snapAtFingerWidth = snapByDistance["12px"] !== "sin captura";
    checks.push({
      id: "precision-bajo-el-dedo",
      gesto: "Dedo posado a 0, 6, 12 y 20 px de un extremo conocido",
      esperado: "engancha al extremo dentro de la huella del dedo (≈12 px) y lo enseña fuera de ella (≥24 px)",
      observado: snapAtFingerWidth
        ? `engancha hasta ${Object.entries(snapByDistance).filter(([, v]) => v !== "sin captura").pop()?.[0]}, ` +
          `insignia a ${cursorOffsetPx ?? "?"} px del contacto`
        : `deja de enganchar más allá de ${
            Object.entries(snapByDistance).find(([, v]) => v === "sin captura")?.[0] ?? "0px"
          }: el dedo no alcanza el extremo que tapa`,
      veredicto: !snapAtFingerWidth ? "roto" : (cursorOffsetPx ?? 0) >= 24 ? "funciona" : "parcial",
      medida: { capturaPorDistancia: snapByDistance, desplazamientoDeLaInsigniaPx: cursorOffsetPx },
    });

    // ---- 10. DOS DEDOS NO ENSUCIAN EL DIBUJO -----------------------------
    // Encuadrar mientras se dibuja es normal en CAD. Si al soltar los dedos el
    // motor recibe un punto, cada encuadre deja basura en el plano.
    await enterPlanMode(page);
    const dirtBefore = await documentEntities(page);
    await commandInput.click();
    await commandInput.fill("LINE");
    await commandInput.press("Enter");
    await wait(400);
    const promptBefore = ((await page.getByTestId("cad-command-prompt").textContent()) ?? "").trim();
    const dirtA = { x: center.x - 50, y: center.y - 30, id: 1 };
    const dirtB = { x: center.x + 50, y: center.y + 30, id: 2 };
    await touch(cdp, "touchStart", [dirtA, dirtB]);
    for (let step = 1; step <= 8; step += 1) {
      await touch(cdp, "touchMove", [
        { ...dirtA, x: dirtA.x + step * 8 },
        { ...dirtB, x: dirtB.x + step * 8 },
      ]);
      await wait(16);
    }
    await release(cdp);
    await wait(600);
    const promptAfter = ((await page.getByTestId("cad-command-prompt").textContent()) ?? "").trim();
    await page.keyboard.press("Escape");
    await wait(300);
    const dirtAfter = await documentEntities(page);
    checks.push({
      id: "dos-dedos-no-ensucian",
      gesto: "Encuadrar con dos dedos con LINE abierto y sin punto fijado",
      esperado: "el comando sigue pidiendo el MISMO paso; no se fija ningún punto",
      observado:
        promptAfter === promptBefore && dirtAfter === dirtBefore
          ? "el comando queda intacto tras encuadrar"
          : `el encuadre alteró el comando: «${promptBefore}» → «${promptAfter}», entidades ${dirtBefore} → ${dirtAfter}`,
      veredicto: promptAfter === promptBefore && dirtAfter === dirtBefore ? "funciona" : "roto",
      medida: { pasoAntes: promptBefore, pasoDespues: promptAfter, entidadesAntes: dirtBefore, entidadesDespues: dirtAfter },
    });

    return { id: profile.id, label: profile.label, viewport: { width: profile.width, height: profile.height }, layout, checks };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const profiles: ProfileReport[] = [];
  for (const profile of PROFILES) profiles.push(await probeProfile(profile));
  process.stdout.write(`${JSON.stringify({ baseUrl: BASE_URL, profiles }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
