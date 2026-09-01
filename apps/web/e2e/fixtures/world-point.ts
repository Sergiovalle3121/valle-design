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
  const box = await page.getByTestId("cad-canvas").boundingBox();
  if (!box) throw new Error("CAD canvas has no bounding box");
  const coordinate = page.getByTestId("cad-cursor-coordinate");
  const read = async () =>
    `${await coordinate.getAttribute("data-x")}|${await coordinate.getAttribute("data-y")}`;
  // FRESCURA garantizada por cambio, no por espera: el HUD se actualiza
  // asíncrono y un poll de «no vacío» acepta el valor de la posición ANTERIOR.
  // Moverse primero a un vecino diagonal (±4 px ≈ decenas de unidades de
  // mundo, muy por encima del redondeo del HUD) fuerza que la lectura del
  // destino DIFIERA de la del vecino: si difiere, es del destino.
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x - 4, y - 4);
    await expect.poll(read).not.toBe("|");
    const neighbor = await read();
    await page.mouse.move(x, y);
    await expect.poll(read).not.toBe(neighbor);
    const [rawX, rawY] = (await read()).split("|");
    return { x: Number(rawX), y: Number(rawY) };
  };
  const screen = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // «Vista superior» ANIMA la cámara. Muestrear durante la transición invierte
  // una afín que ya no existe al hacer clic: la designación cae al vacío y el
  // fallo ni siquiera menciona la cámara. En planta ortográfica los términos
  // cruzados (b, c) son ~0 respecto de la diagonal; se espera a que la
  // transformación lo cumpla y a que sea ESTABLE entre dos muestreos.
  let affine = { origin: { x: 0, y: 0 }, a: 1, b: 0, c: 0, d: 1 };
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
          diagonal > 1e-9 &&
          cross < diagonal * 0.02 &&
          Math.abs(a - affine.a) < Math.abs(a) * 0.01 + 1e-9;
        affine = { origin, a, b, c, d };
        return settled;
      },
      { message: "la vista no se asentó en planta ortográfica", timeout: 15_000 },
    )
    .toBe(true);
  const { origin, a, b, c, d } = affine;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) throw new Error("CAD world/screen transform is singular");
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
    if (bestError <= acceptable) {
      await exigirLienzoAlcanzable(page, position, target);
      return position;
    }
    position = {
      x: Math.round(position.x + (d * errorX - b * errorY) / determinant),
      y: Math.round(position.y + (-c * errorX + a * errorY) / determinant),
    };
  }
  throw new Error(
    `worldPoint no convergió: error ${bestError.toFixed(2)} unidades con ${pixel.toFixed(2)} unidades/px`,
  );
}

/**
 * El punto CONVERGIÓ, pero ¿responde el lienzo ahí?
 *
 * Convertir mundo→pantalla y hacer clic son dos cosas distintas, y esta fixture
 * sólo garantizaba la primera. Si una capa flotante se monta encima —y en este
 * producto ya pasó tres veces: la barra de videollamada sobre «Guardar», el
 * dock de mensajería sobre «Algo salió mal», la cinta sobre la banda alta del
 * lienzo—, el clic se lo come la capa y el `worldPoint` sigue devolviendo un
 * número perfectamente correcto.
 *
 * El coste de no comprobarlo se paga entero al diagnosticar: el golden 46 falla
 * dos aserciones más abajo con «Native 1 ≠ Native 2», que no menciona ni el
 * ratón, ni el lienzo, ni la capa culpable. Averiguar eso costó horas.
 *
 * `document.elementFromPoint` devuelve lo que el navegador le daría al usuario
 * en ese píxel: si no es el lienzo ni algo suyo, el clic no va a llegar y esta
 * fixture lo dice AQUÍ, nombrando a quien estorba, en vez de dejar que el
 * síntoma aparezca lejos de su causa.
 */
async function exigirLienzoAlcanzable(
  page: Page,
  position: { x: number; y: number },
  target: { x: number; y: number },
): Promise<void> {
  const estorbo = await page.evaluate(
    ([x, y]) => {
      const arriba = document.elementFromPoint(x, y);
      if (!arriba) return "nada (el punto cae fuera de la ventana)";
      const lienzo = document.querySelector('[data-testid="cad-canvas"]');
      if (lienzo && (arriba === lienzo || lienzo.contains(arriba))) return null;
      const conId = arriba.closest("[data-testid]") as HTMLElement | null;
      if (conId) return `[data-testid="${conId.dataset.testid}"]`;
      const titulado = arriba.closest("[title]") as HTMLElement | null;
      if (titulado) return `${arriba.tagName.toLowerCase()}[title="${titulado.title}"]`;
      return arriba.tagName.toLowerCase();
    },
    [position.x, position.y],
  );
  if (estorbo === null) return;
  throw new Error(
    `worldPoint(${target.x}, ${target.y}) cae en la pantalla (${position.x}, ${position.y}), ` +
      `pero ahí NO responde el lienzo: responde ${estorbo}. ` +
      "Un clic en ese punto se lo come esa capa, así que el comando no recibirá " +
      "su punto y el fallo aparecería mucho más abajo, sin mencionar la causa. " +
      "Mueva la capa que tapa, o elija un punto del dibujo que no quede debajo de ella.",
  );
}
