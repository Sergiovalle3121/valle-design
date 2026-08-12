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
  const sample = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await expect.poll(async () => coordinate.getAttribute("data-x")).not.toBe("");
    return {
      x: Number(await coordinate.getAttribute("data-x")),
      y: Number(await coordinate.getAttribute("data-y")),
    };
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
  return {
    x: screen.x + (d * wx - b * wy) / determinant,
    y: screen.y + (-c * wx + a * wy) / determinant,
  };
}
