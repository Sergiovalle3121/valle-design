#!/usr/bin/env tsx
/**
 * Instrumentos de la sonda táctil: cómo se inyecta un dedo y cómo se lee lo que
 * el editor hace con él.
 *
 * Vive aparte de `touch-support-probe.mts` por una razón de forma —ningún
 * archivo del repositorio pasa de 800 líneas— y por una de fondo: aquí no hay
 * ningún veredicto. Esto es el aparato de medida; los juicios están en la
 * sonda, y separarlos deja ver de un vistazo que ninguna medida se apaña a sí
 * misma.
 *
 * Los gestos se inyectan por CDP (`Input.dispatchTouchEvent`), único camino con
 * MÁS DE UN PUNTO DE CONTACTO: la API de Playwright sólo sabe dar un toque.
 * Cada contacto declara 12 px de radio, la huella de un dedo adulto sobre una
 * tableta de 10" — lo que el dedo TAPA es la mitad del problema de precisión.
 */
import type { CDPSession, Page } from "@playwright/test";

export interface TouchCheck {
  id: string;
  gesto: string;
  esperado: string;
  observado: string;
  veredicto: "funciona" | "roto" | "parcial";
  medida?: Record<string, unknown>;
}

export interface Affine {
  origin: { x: number; y: number };
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface Contact {
  x: number;
  y: number;
  id: number;
}

export async function touch(
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
export const release = (cdp: CDPSession) => touch(cdp, "touchEnd", []);

/**
 * Posar el dedo, deslizar por un camino y levantarlo, TODO DE GOLPE.
 *
 * De golpe porque el orden lo fija el envío y no la espera, y porque encadenar
 * idas y vueltas al navegador estira el contacto por encima del medio segundo:
 * el producto lo leería como pulsación larga —con razón— y lo que se mediría
 * sería la máquina, no el gesto.
 */
export async function stroke(
  cdp: CDPSession,
  path: ReadonlyArray<{ x: number; y: number }>,
  lift = true,
): Promise<void> {
  const [first, ...rest] = path;
  const sent: Array<Promise<void>> = [touch(cdp, "touchStart", [{ ...first!, id: 1 }])];
  for (const point of rest) sent.push(touch(cdp, "touchMove", [{ ...point, id: 1 }]));
  if (lift) sent.push(release(cdp));
  await Promise.all(sent);
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** ¿Hay algún menú contextual abierto ahora mismo? Una sola ida y vuelta. */
export const contextMenuOpen = (page: Page) =>
  page.evaluate(
    () =>
      !!document.querySelector('[data-testid="cad-context-menu"]') ||
      !!document.querySelector('[data-testid="cad-pointer-menu"]:not([hidden])'),
  );

/**
 * Toque simple con un temblor declarado entre pulsar y soltar.
 *
 * Y una comprobación del propio arnés. Desde que mantener pulsado vale por
 * botón derecho, un toque LENTO deja de ser un toque, y en una máquina cargada
 * el hilo del navegador se bloquea el tiempo suficiente para que lo sea. No se
 * mide con un reloj —el reloj mediría la máquina—: se mira el EFECTO. Si tras
 * el toque hay un menú contextual abierto, el producto entendió otra cosa y el
 * veredicto que saliera de ahí no diría nada de él. Fallo CERRADO.
 */
export async function tap(
  cdp: CDPSession,
  page: Page,
  point: { x: number; y: number },
  jitterPx = 0,
): Promise<void> {
  // Los contactos se EMITEN de golpe y se esperan juntos, como hace el propio
  // Playwright con `touchscreen.tap`. Esperar cada uno por separado encadena
  // idas y vueltas al navegador, y con el hilo ocupado eso estira el contacto
  // por encima del medio segundo: el producto lo lee como pulsación larga con
  // toda la razón, y lo que se mediría entonces sería la máquina.
  // El orden importa y lo fija el ORDEN DE ENVÍO, no el de espera: los mensajes
  // de una misma sesión CDP se procesan como se mandaron.
  const sent: Array<Promise<void>> = [touch(cdp, "touchStart", [{ ...point, id: 1 }])];
  if (jitterPx > 0)
    for (let step = 1; step <= 3; step += 1)
      sent.push(
        touch(cdp, "touchMove", [
          { x: point.x + (jitterPx * step) / 3, y: point.y + (jitterPx * step) / 6, id: 1 },
        ]),
      );
  sent.push(release(cdp));
  await Promise.all(sent);
  if (await contextMenuOpen(page))
    throw new Error(
      "el arnés dio un toque y el producto abrió un menú contextual: el hilo del navegador se " +
        "bloqueó lo bastante para que el contacto cruzara el umbral de pulsación larga. La máquina " +
        "no da ahora mismo para distinguir los dos gestos, y publicar el veredicto sería inventarlo",
    );
}

/**
 * Coordenada de dibujo bajo un punto de pantalla, leída del HUD del editor.
 *
 * Se mueve el ratón a un vecino primero para que la lectura del destino DIFIERA
 * de la anterior: el HUD se actualiza asíncrono y un sondeo de «no vacío»
 * aceptaría el valor de la posición previa. Es el método del golden 33.
 */
export async function worldAt(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
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
export async function affine(page: Page): Promise<Affine> {
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
export const unitsPerPixel = (view: Affine) => Math.hypot(view.a, view.c);

export function screenFor(
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
export const EVENT_RECORDER = `
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

export const eventLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __valleTouchLog: Array<Record<string, unknown>> }).__valleTouchLog);

export const clearEventLog = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __valleTouchLog: unknown[] }).__valleTouchLog.length = 0;
  });

/** Entidades del documento canónico, leídas del contador de la barra. */
export async function documentEntities(page: Page): Promise<number> {
  const text = (await page.getByTestId("cad-native-document-count").textContent()) ?? "";
  return Number(text.replace(/[^0-9]/g, ""));
}

export const selectionCount = async (page: Page): Promise<string> =>
  ((await page.getByTestId("cad-selection-status-count").textContent()) ?? "").trim();

/**
 * Qué elemento recibe de verdad un toque en ese punto de pantalla.
 *
 * Es la diferencia entre «el gesto no funciona» y «el gesto nunca llegó al
 * lienzo porque una barra flotante se lo comió», y son dos arreglos distintos.
 */
export const topElementAt = (page: Page, x: number, y: number) =>
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
export const occlusion = (page: Page) =>
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
export const smallTargets = (page: Page) =>
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
