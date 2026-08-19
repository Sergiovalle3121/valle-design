import type { CDPSession, Page } from "@playwright/test";

/**
 * Gestos táctiles de verdad para la suite E2E: uno y dos dedos.
 *
 * `page.touchscreen` sólo sabe dar UN toque, y el gesto que decide si un CAD
 * sirve en una tableta —pellizcar para hacer zoom, panear con dos dedos— exige
 * dos puntos de contacto simultáneos. La única puerta con más de un contacto es
 * el protocolo de Chromium (`Input.dispatchTouchEvent`), así que se usa
 * directamente y se declara la consecuencia: estos gestos son de CHROMIUM.
 *
 * Cada contacto declara 12 px de radio, que es la huella de un dedo adulto
 * sobre una tableta de 10". No es decorativo: lo que el dedo TAPA es la mitad
 * del problema de precisión que estos gestos existen para probar.
 */
export interface TouchContact {
  x: number;
  y: number;
  id: number;
}

export interface TouchPoint {
  x: number;
  y: number;
}

const RADIUS_PX = 12;

export async function touchSession(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

async function dispatch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  contacts: readonly TouchContact[],
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: contacts.map((contact) => ({
      x: contact.x,
      y: contact.y,
      id: contact.id,
      radiusX: RADIUS_PX,
      radiusY: RADIUS_PX,
      force: 1,
    })),
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Suelta TODOS los contactos: Chromium interpreta así la lista vacía. */
const releaseAll = (cdp: CDPSession) => dispatch(cdp, "touchEnd", []);

/** Un toque limpio. Es la designación: posar y levantar sin pasear. */
export async function touchTap(cdp: CDPSession, point: TouchPoint, holdMs = 90): Promise<void> {
  await dispatch(cdp, "touchStart", [{ ...point, id: 1 }]);
  await wait(holdMs);
  await releaseAll(cdp);
}

/**
 * Apuntar y soltar: el único modo que tiene un dedo de VER dónde va a caer un
 * punto antes de fijarlo, porque un dedo no tiene hover. Se posa cerca, se
 * desliza hasta el objetivo mirando la insignia de captura y se levanta.
 */
export async function touchAimAndLift(
  cdp: CDPSession,
  target: TouchPoint,
  approachPx = 24,
): Promise<void> {
  const start = { x: target.x - approachPx, y: target.y - approachPx };
  // Los contactos se EMITEN de golpe y se esperan juntos, como hace el propio
  // Playwright con `touchscreen.tap`. El orden lo fija el envío, no la espera.
  // Encadenar idas y vueltas al navegador estira el gesto hasta el umbral de
  // pulsación larga cuando el runner va cargado, y entonces la prueba mediría
  // la máquina en vez del producto.
  const sent: Array<Promise<void>> = [dispatch(cdp, "touchStart", [{ ...start, id: 1 }])];
  for (let step = 1; step <= 6; step += 1)
    sent.push(
      dispatch(cdp, "touchMove", [
        {
          x: start.x + ((target.x - start.x) * step) / 6,
          y: start.y + ((target.y - start.y) * step) / 6,
          id: 1,
        },
      ]),
    );
  sent.push(releaseAll(cdp));
  await Promise.all(sent);
}

/** Mantener pulsado: el botón derecho de quien no tiene botones. */
export async function touchLongPress(
  cdp: CDPSession,
  point: TouchPoint,
  holdMs = 900,
): Promise<void> {
  await dispatch(cdp, "touchStart", [{ ...point, id: 1 }]);
  await wait(holdMs);
  await releaseAll(cdp);
}

/** Paneo con dos dedos: los dos contactos se mueven juntos. */
export async function touchTwoFingerPan(
  cdp: CDPSession,
  center: TouchPoint,
  delta: TouchPoint,
  steps = 10,
): Promise<void> {
  const first = { x: center.x - 60, y: center.y, id: 1 };
  const second = { x: center.x + 60, y: center.y, id: 2 };
  await dispatch(cdp, "touchStart", [first, second]);
  for (let step = 1; step <= steps; step += 1) {
    const dx = (delta.x * step) / steps;
    const dy = (delta.y * step) / steps;
    await dispatch(cdp, "touchMove", [
      { ...first, x: first.x + dx, y: first.y + dy },
      { ...second, x: second.x + dx, y: second.y + dy },
    ]);
    await wait(16);
  }
  await releaseAll(cdp);
}

/**
 * Pellizco: los dos contactos se separan (acercar) o se juntan (alejar). Se
 * expresa por la separación inicial y final en píxeles, que es lo que la mano
 * hace de verdad, y no por un «factor de zoom» que ya presupone la respuesta.
 */
export async function touchPinch(
  cdp: CDPSession,
  center: TouchPoint,
  fromSeparationPx: number,
  toSeparationPx: number,
  steps = 12,
): Promise<void> {
  const halfFrom = fromSeparationPx / 2;
  const halfTo = toSeparationPx / 2;
  const first = { x: center.x - halfFrom, y: center.y, id: 1 };
  const second = { x: center.x + halfFrom, y: center.y, id: 2 };
  await dispatch(cdp, "touchStart", [first, second]);
  for (let step = 1; step <= steps; step += 1) {
    const half = halfFrom + ((halfTo - halfFrom) * step) / steps;
    await dispatch(cdp, "touchMove", [
      { ...first, x: center.x - half },
      { ...second, x: center.x + half },
    ]);
    await wait(16);
  }
  await releaseAll(cdp);
}
