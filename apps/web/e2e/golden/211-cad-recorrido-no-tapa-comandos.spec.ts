import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * ESCÉPTICO — el recorrido guiado y la línea de comandos, medidos.
 *
 * Un arquitecto probando el editor real vio el panel «Primeros cinco minutos»
 * pegado a la línea de comandos: el rectángulo del acompañante no llegaba a
 * tocar el rectángulo del diálogo, pero el hueco medía 4 px en 1.280×720 (ver
 * la nota en `CadCommandLineDock.tsx`) — invisible al ojo, así que a efectos
 * prácticos SÍ tapaba justo donde el usuario debe mirar para ver qué le pide
 * el programa. Este golden mide el hueco de verdad, no sólo si es negativo, y
 * defiende el pliegue (`cad-guided-tour-toggle`) que lo resuelve cuando ni el
 * aire de la escala alcanza.
 *
 * Se abre el estudio SIN saltar el recorrido a propósito: es el único estado
 * donde el defecto existe. El resto de los goldens lo saltan por diseño (ver
 * el golden 67) y por eso nadie lo había medido.
 */

function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
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
  } as unknown as CadDocument;
}

async function openStudioConRecorrido(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  // El acompañante es de PRIMERA VEZ: en esta suite, sin nada guardado antes,
  // sale solo. Si algún día no saliera, el resto del test lo diría con un
  // mensaje claro en vez de saltarse en silencio.
  await expect(page.getByTestId("cad-guided-tour")).toBeVisible();
}

/** Ningún punto del rectángulo A cae dentro del rectángulo B, en el eje Y. */
function sinSolapeVertical(
  a: { y: number; height: number },
  b: { y: number; height: number },
): boolean {
  return a.y + a.height <= b.y || b.y + b.height <= a.y;
}

function hueco(
  arriba: { y: number; height: number },
  abajo: { y: number; height: number },
): number {
  return abajo.y - (arriba.y + arriba.height);
}

test("el recorrido guiado y la línea de comandos nunca se solapan, y dejan aire de verdad", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudioConRecorrido(context, page);

  const tour = page.getByTestId("cad-guided-tour");
  const cmd = page.getByTestId("cad-command-line");

  const tourBox = (await tour.boundingBox())!;
  const cmdBox = (await cmd.boundingBox())!;

  expect(sinSolapeVertical(tourBox, cmdBox), "el recorrido no debe solaparse con la línea de comandos").toBe(true);
  // No basta con "no negativo": un hueco de 3-4 px no se distingue de estar
  // pegados. Se exige el mínimo real de la escala (`gap-2` = 8 px) menos un
  // margen de redondeo del navegador.
  const separacion = hueco(tourBox, cmdBox);
  expect(separacion, `hueco medido: ${separacion}px`).toBeGreaterThanOrEqual(7);

  /* ── El pliegue: existe, y de verdad libera espacio ──────────────────── */
  const toggle = page.getByTestId("cad-guided-tour-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const alturaAbierta = tourBox.height;
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("cad-guided-tour-progress")).toBeHidden();

  const tourPlegado = (await tour.boundingBox())!;
  expect(
    tourPlegado.height,
    `plegado (${tourPlegado.height}px) debe ser bastante menor que desplegado (${alturaAbierta}px)`,
  ).toBeLessThan(alturaAbierta * 0.5);

  // El hueco INMEDIATO entre el recorrido y la línea de comandos es el mismo
  // `gap-2` (8 px) plegado o desplegado — es un espacio fijo entre hermanos
  // de un `flex`, no crece con el contenido. Lo que el pliegue libera es la
  // ALTURA del panel entero (ya probado arriba): con el paso "Sigue
  // dibujando" desplegado, esa altura completa es exactamente lo que antes
  // dejaba sólo 4 px sobre la línea de comandos.
  const cmdTrasPlegar = (await cmd.boundingBox())!;
  expect(sinSolapeVertical(tourPlegado, cmdTrasPlegar)).toBe(true);
  const separacionPlegada = hueco(tourPlegado, cmdTrasPlegar);
  expect(separacionPlegada).toBeGreaterThanOrEqual(separacion);

  /* ── Se puede volver a abrir ──────────────────────────────────────────── */
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("cad-guided-tour-progress")).toBeVisible();
});

test("el hueco tampoco se cierra en una ventana baja (tableta apaisada)", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  // 820 px es el punto donde otras superficies del estudio ya cambian de
  // layout (golden 67); por debajo de eso el acompañante recorta con su
  // propio `max-h-[32vh]`.
  await page.setViewportSize({ width: 1024, height: 700 });
  await openStudioConRecorrido(context, page);

  const tourBox = (await page.getByTestId("cad-guided-tour").boundingBox())!;
  const cmdBox = (await page.getByTestId("cad-command-line").boundingBox())!;
  expect(sinSolapeVertical(tourBox, cmdBox)).toBe(true);
  expect(hueco(tourBox, cmdBox)).toBeGreaterThanOrEqual(7);
});
