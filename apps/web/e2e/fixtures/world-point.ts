import { expect, type Page } from "@playwright/test";

/**
 * Traduce coordenadas de mundo a pantalla muestreando el HUD del cursor: el
 * único modo de dibujar CON EL RATÓN de verdad y no por la entrada dinámica.
 *
 * Nació dentro del golden 33; al migrar MOVE/COPY/OFFSET al motor lo necesitan
 * también el 26 y el 40 (OFFSET ahora DESIGNA el objeto con el pickbox), así
 * que vive aquí. Requiere un encuadre cenital previo (Vista superior + Ajustar
 * a la planta) para que la transformación mundo↔pantalla sea invertible.
 */
export async function worldPoint(page: Page, target: { x: number; y: number }) {
  // El recorrido guiado de la primera vez flota sobre el cuarto inferior
  // izquierdo del lienzo y su botón «Saltar» puede caer justo en un punto de
  // muestreo (medido en el golden 39: centro+80 px respondía ese botón y la
  // afín salía singular). El usuario lo cierra antes de dibujar; el muestreo
  // también.
  const skip = page.getByTestId("cad-guided-tour-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("CAD canvas has no bounding box");
  const coordinate = page.getByTestId("cad-cursor-coordinate");
  // Leer el par en una sola instantánea evita mezclar dos cuadros del HUD y
  // reduce viajes al navegador durante la calibración, sin ampliar plazos.
  const read = () =>
    coordinate.evaluate(
      (node) =>
        `${node.getAttribute("data-x") ?? ""}|${node.getAttribute("data-y") ?? ""}`,
    );
  // onMove publica la posición visible de la cruceta y el par del HUD en el
  // mismo evento síncrono. Después del mousemove se comprueba esa posición y
  // el par estable entre dos frames. No hay un vecino cuya lectura retrasada
  // se pueda confundir con el destino, ni polls anidados por cada muestra.
  let previousReading = "|";
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    const measured = await coordinate.evaluate(
      async (node, point) => {
        const doc = node.ownerDocument;
        const view = doc.defaultView!;
        const frame = () =>
          new Promise<void>((resolve) =>
            view.requestAnimationFrame(() => resolve()),
          );
        const pair = () =>
          `${node.getAttribute("data-x") ?? ""}|${node.getAttribute("data-y") ?? ""}`;
        await frame();
        const first = pair();
        await frame();
        const value = pair();
        const crosshair = doc.querySelector<HTMLElement>(
          '[data-testid="cad-crosshair"]',
        );
        const bounds = crosshair?.getBoundingClientRect();
        const at = doc.elementFromPoint(point.x, point.y);
        const canvas = doc.querySelector('[data-testid="cad-canvas"]');
        const fresh = Boolean(
          bounds &&
          crosshair &&
          view.getComputedStyle(crosshair).display !== "none" &&
          Math.round(bounds.x) === point.x &&
          Math.round(bounds.y) === point.y &&
          at?.tagName === "CANVAS" &&
          canvas?.contains(at) &&
          first === value,
        );
        return {
          value,
          fresh,
          first,
          cursor: bounds ? { x: bounds.x, y: bounds.y } : null,
          hit: at?.tagName ?? null,
        };
      },
      { x, y },
    );
    const [rawX, rawY] = measured.value.split("|");
    if (
      !measured.fresh ||
      rawX === "" ||
      rawY === "" ||
      !Number.isFinite(Number(rawX)) ||
      !Number.isFinite(Number(rawY))
    ) {
      throw new Error(
        `${await porQueNoSeMueveElHud(page, x, y, previousReading, await read())}` +
          `\nMuestra tras dos frames: ${JSON.stringify(measured)}`,
      );
    }
    previousReading = measured.value;
    return { x: Number(rawX), y: Number(rawY) };
  };
  const screen = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  // «Vista superior» ANIMA la cámara. Muestrear durante la transición invierte
  // una afín que ya no existe al hacer clic: la designación cae al vacío y el
  // fallo ni siquiera menciona la cámara. En planta ortográfica los términos
  // cruzados (b, c) son ~0 respecto de la diagonal; se espera a que la
  // transformación lo cumpla y a que sea ESTABLE entre dos muestreos.
  let affine = { origin: { x: 0, y: 0 }, a: 1, b: 0, c: 0, d: 1 };
  const started = Date.now();
  const samples: Array<{
    elapsedMs: number;
    a: number;
    b: number;
    c: number;
    d: number;
    diagonal: number;
    cross: number;
    settled: boolean;
  }> = [];
  let iterations = 0;
  try {
    await expect
      .poll(
        async () => {
          const origin = await sample(screen.x, screen.y);
          const horizontal = await sample(screen.x + 80, screen.y);
          const vertical = await sample(screen.x, screen.y + 80);
          const a = (horizontal.x - origin.x) / 80;
          const b = (vertical.x - origin.x) / 80;
          const c = (horizontal.y - origin.y) / 80;
          const d = (vertical.y - origin.y) / 80;
          const diagonal = Math.max(Math.abs(a), Math.abs(d));
          const cross = Math.max(Math.abs(b), Math.abs(c));
          const settled =
            iterations > 0 &&
            diagonal > 1e-9 &&
            cross < diagonal * 0.02 &&
            Math.abs(a - affine.a) < Math.abs(a) * 0.01 + 1e-9;
          affine = { origin, a, b, c, d };
          iterations += 1;
          samples.push({
            elapsedMs: Date.now() - started,
            a,
            b,
            c,
            d,
            diagonal,
            cross,
            settled,
          });
          if (samples.length > 4) samples.shift();
          return settled;
        },
        {
          message: "la vista no se asentó en planta ortográfica",
          timeout: 15_000,
        },
      )
      .toBe(true);
  } catch (cause) {
    throw new Error(
      `worldPoint: la vista no se asentó en planta ortográfica; ${JSON.stringify({ target, screen, iterations, elapsedMs: Date.now() - started, samples, affine })}\n${String(cause)}`,
    );
  }
  const { origin, a, b, c, d } = affine;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9)
    throw new Error(
      `CAD world/screen transform is singular: ${JSON.stringify(affine)}`,
    );
  const wx = target.x - origin.x;
  const wy = target.y - origin.y;
  // LAZO CERRADO, no extrapolación ciega: la posición calculada se comprueba
  // contra el MISMO HUD que ve el usuario y se corrige con la afín medida.
  // Dos razones medidas, no teóricas:
  // - el ratón sintético entrega coordenadas fraccionarias distinto en cada
  //   navegador (Firefox quedaba ~2 px sistemáticos lejos: 13,68 unidades de
  //   mundo, deterministas, en el golden 53), y
  // - una pendiente muestreada con el HUD cuantizado arrastra su error por
  //   toda la extrapolación (±3.000 unidades desde el centro).
  // Se redondea a píxel entero —un entero no se puede redondear distinto— y
  // se itera hasta que el HUD confirme el mundo pedido.
  let position = {
    x: Math.round(screen.x + (d * wx - b * wy) / determinant),
    y: Math.round(screen.y + (-c * wx + a * wy) / determinant),
  };
  // El mejor píxel ENTERO queda a ≤0,5 px del punto fraccionario ideal, así
  // que exigir 0,6 px (margen para el redondeo del HUD) siempre es alcanzable.
  const pixel = Math.max(Math.abs(a), Math.abs(d), 1e-9);
  const acceptable = pixel * 0.6;
  let bestError = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const measured = await sample(position.x, position.y);
    const errorX = target.x - measured.x;
    const errorY = target.y - measured.y;
    bestError = Math.max(Math.abs(errorX), Math.abs(errorY));
    if (bestError <= acceptable) return position;
    position = {
      x: Math.round(position.x + (d * errorX - b * errorY) / determinant),
      y: Math.round(position.y + (-c * errorX + a * errorY) / determinant),
    };
  }
  throw new Error(
    `worldPoint no convergió: error ${bestError.toFixed(2)} unidades con ${pixel.toFixed(2)} unidades/px; ${JSON.stringify({ target, position, affine, determinant, iterations })}`,
  );
}

/** Diagnóstico del píxel visible; no consulta cámara ni estado de la aplicación. */
async function porQueNoSeMueveElHud(
  page: Page,
  x: number,
  y: number,
  previous: string,
  current: string,
): Promise<string> {
  const hit = await page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px, py);
      if (!element) return "nada: el punto cae fuera de la ventana";
      const canvas = document.querySelector('[data-testid="cad-canvas"]');
      if (element.tagName === "CANVAS" && canvas?.contains(element))
        return "el canvas de dibujo";
      const testId = element
        .closest("[data-testid]")
        ?.getAttribute("data-testid");
      return `${element.tagName.toLowerCase()}${testId ? `[data-testid="${testId}"]` : ""}`;
    },
    [x, y],
  );
  return (
    `No se pudo confirmar una lectura fresca del HUD en (${x}, ${y}). ` +
    `Antes: «${previous}»; después: «${current}». En ese píxel responde ${hit}.`
  );
}
