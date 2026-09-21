/**
 * Golden 215 — la barra superior cabe en el viewport.
 *
 * Guardar, el selector de estado y el cierre del editor deben ser visibles
 * y estar enteramente dentro del viewport en tres tamaños representativos.
 * La banda de iconos sigue desplazándose horizontalmente.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

/** Plano vacío: la barra superior no depende de lo que haya dibujado. */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

/**
 * Abre el estudio por la ruta HERMÉTICA de los goldens: `/legacy/studio`,
 * stubbeada en la frontera de red, resuelve el documento sembrado y redirige
 * a `/studio/<uuid>`. Ir directo a `/studio/mock-doc` no abre el editor:
 * `mock-doc` no es un UUID, la página se queda en «El identificador del
 * documento no es válido» y la barra superior nunca llega a montarse.
 */
async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

for (const vp of VIEWPORTS) {
  test(`barra superior dentro del viewport a ${vp.width}x${vp.height}`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize(vp);
    await openStudio(context, page);

    // Esperar a que la barra superior exista
    const toolbar = page.getByTestId("cad-top-toolbar");
    await expect(toolbar).toBeVisible();

    // Los tres controles deben estar visibles y dentro del viewport
    const controls = [
      page.getByTestId("cad-save"),
      page.getByLabel("Estado de aprobación del plano"),
      page.getByTestId("cad-close-editor"),
    ];

    const barra = await toolbar.boundingBox();
    for (const control of controls) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      // El mensaje lleva la medida: un «-0.5 no es >= 0» sin contexto no dice
      // QUÉ control ni contra qué barra, y este golden se ha diagnosticado ya
      // tres veces a ciegas.
      const donde =
        `caja ${JSON.stringify(box)} · barra ${JSON.stringify(barra)} · ventana ${vp.width}x${vp.height}`;
      expect(box!.x, `x negativo — ${donde}`).toBeGreaterThanOrEqual(0);
      expect(box!.y, `y negativo — ${donde}`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `se sale por la derecha — ${donde}`).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height, `se sale por abajo — ${donde}`).toBeLessThanOrEqual(vp.height);
    }
  });
}

/**
 * LA BARRA CABE EN LA VENTANA, Y A LO QUE NO CABE SE LLEGA.
 *
 * Esta prueba medía otra cosa: exigía que «la banda de iconos (primer hijo del
 * toolbar)» fuera desplazable. Eso describía el diseño ANTERIOR —una franja con
 * scroll dentro de una barra que sí cabía— y con el armazón nuevo el primer
 * hijo son los accesos rápidos, que no ceden: medir su scroll no dice nada de
 * lo que le pasa a quien usa el programa.
 *
 * Lo que sí le pasa, medido el 2026-09-20 a 1280 px: la barra pedía 2292 px de
 * contenido en 1280 de hueco y trece de sus cuarenta y cinco botones quedaban
 * FUERA de la pantalla, sin ninguna barra que avisara de que estaban ahí. En
 * producción el numero era peor todavía —veintitrés de cuarenta y cuatro—.
 *
 * Así que se afirman las dos cosas que protegen al usuario, y son más estrictas
 * que la de antes: la barra no se sale de su ventana, y ningún control queda
 * escondido detrás de un borde sin manera de alcanzarlo.
 */
test("la barra superior cabe en la ventana y no esconde ningún control", async ({ context, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(context, page);

  const toolbar = page.getByTestId("cad-top-toolbar");
  await expect(toolbar).toBeVisible();
  // La cola fija completa (el selector de estado llega con el documento): se
  // mide la barra en reposo, no a medio montar.
  await expect(page.getByLabel("Estado de aprobación del plano")).toBeVisible();

  const medida = await toolbar.evaluate((barra) => {
    const nombre = (el: Element): string =>
      el.getAttribute("data-testid") ??
      el.getAttribute("aria-label") ??
      el.getAttribute("title") ??
      (el.textContent ?? "").trim().slice(0, 30) ??
      "(sin nombre)";
    // Un control es ALCANZABLE si su caja ya está dentro de la ventana, o si
    // alguno de sus contenedores dentro de la barra puede desplazarse hasta
    // él. Lo que no cumpla ninguna de las dos está escondido.
    const escondidos: string[] = [];
    for (const control of barra.querySelectorAll("button, select, a[href]")) {
      const r = control.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left >= -1 && r.right <= window.innerWidth + 1) continue;
      let desplazable = false;
      for (let p = control.parentElement; p && p !== barra.parentElement; p = p.parentElement) {
        if (p.scrollWidth > p.clientWidth + 1) {
          desplazable = true;
          break;
        }
      }
      if (!desplazable) escondidos.push(nombre(control));
    }
    return { sw: barra.scrollWidth, cw: barra.clientWidth, escondidos };
  });

  expect(
    medida.sw,
    `la barra superior pide ${medida.sw}px de contenido en ${medida.cw}px de ventana`,
  ).toBeLessThanOrEqual(medida.cw + 1);

  expect(
    medida.escondidos,
    `controles fuera de la ventana y sin banda que se desplace hasta ellos:\n  · ${medida.escondidos.join("\n  · ")}`,
  ).toEqual([]);
});
