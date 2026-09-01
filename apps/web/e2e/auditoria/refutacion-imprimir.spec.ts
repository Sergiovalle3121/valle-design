import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * CONTRAPRUEBA DEL ESCÉPTICO — «después de imprimir, el dibujo no se guarda».
 *
 * El informe original cambia la ESCALA de la ventana entre las dos
 * publicaciones, así que deja abierta una salida: que el defecto sea del
 * control de escala (o de su candado) y no de publicar. Aquí la edición del
 * medio es OTRA —añadir una segunda hoja, un botón que no toca la escala— y
 * hay un CONTROL sin publicar que hace exactamente la misma edición.
 *
 * Lo único que cambia entre el control y el caso es si se publicó antes.
 *
 * LO QUE MIDIÓ ESTA CORRIDA (E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000):
 *   · CONTROL, sin publicar: dos ediciones, dos guardados → «Guardado»,
 *     PUT /content -> 200 las dos veces. El guardado NO está roto de por sí.
 *   · CASO, publicando antes: 1ª publicación PUT 200 + POST publications 201
 *     (PDF sale, servidor v2). Edición corriente + «Guardar» →
 *     PUT /content -> 409 y estado «Conflicto CAS · servidor v2 · autosave
 *     detenido». La 2ª publicación no da PDF (publicar guarda primero).
 *   · DISCRIMINADOR, publicar dos veces sin tocar nada: los DOS PDF salen.
 *
 * Los dos primeros tests afirman el comportamiento CORRECTO, así que hoy
 * FALLAN: son la reproducción del defecto, no su documentación.
 */

const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };
const NAVE = { x0: 1_000, y0: 1_000, x1: 11_000, y1: 9_000 };

function documentoSemilla(): CadDocument {
  const esquinas = [
    [NAVE.x0, NAVE.y0, NAVE.x1, NAVE.y0],
    [NAVE.x1, NAVE.y0, NAVE.x1, NAVE.y1],
    [NAVE.x1, NAVE.y1, NAVE.x0, NAVE.y1],
    [NAVE.x0, NAVE.y1, NAVE.x0, NAVE.y0],
  ];
  const entities = esquinas.map(([ax, ay, bx, by], index) => ({
    id: `muro-${index}`,
    type: "line" as const,
    start: { x: ax, y: ay, z: 0 },
    end: { x: bx, y: by, z: 0 },
    layer: "0",
  }));
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#111827", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
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

const red: string[] = [];

async function abrirEstudio(context: BrowserContext, page: Page) {
  red.length = 0;
  page.on("response", (respuesta) => {
    const url = respuesta.url();
    if (/\/v1\/cad\//.test(url) && respuesta.request().method() !== "GET")
      red.push(
        `${respuesta.request().method()} ${url.replace(/^https?:\/\/[^/]+/, "")} -> ${respuesta.status()}`,
      );
  });
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(
    context,
    documentoSemilla(),
    FOOTPRINT,
  );
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

/**
 * Crea una hoja y espera a que exista su pestaña. Se cuentan las PESTAÑAS de
 * layout: «Viewports · N» es del layout activo, no del paquete, y contarlo así
 * fue mi primer error.
 */
async function crearHoja(page: Page, total: number) {
  await page.getByRole("button", { name: "+ Hoja" }).click();
  await expect(page.locator('[data-testid^="cad-layout-tab-"]')).toHaveCount(total);
}

/** Publica y devuelve si llegó archivo (sin rendirse si no llega). */
async function publicar(page: Page) {
  const antes = red.length;
  const descarga = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /Publicar PDF/ }).click();
  const archivo = await descarga.catch(() => null);
  return { llegó: archivo !== null, red: red.slice(antes) };
}

/** El modal del paquete tapa la barra: se cierra para poder pulsar «Guardar». */
async function cerrarPaquete(page: Page) {
  await page.getByLabel("Cerrar paquete de entrega").click();
  await expect(page.getByTestId("cad-sheet-package")).toHaveCount(0);
}

async function abrirPaquete(page: Page) {
  await page.getByTitle(/Paquete de entrega/).click();
  await expect(page.getByTestId("cad-sheet-package")).toBeVisible();
}

/** Guarda a mano y devuelve lo que el producto dice del guardado. */
async function guardar(page: Page) {
  const antes = red.length;
  await cerrarPaquete(page);
  await page.getByRole("button", { name: "Guardar", exact: true }).click({ timeout: 15_000 });
  // Se espera a que el intento termine: o dice «Guardado», o aparece el aviso.
  await page.waitForTimeout(3_000);
  const estado = await page
    .getByTestId("cad-save-status")
    .innerText()
    .catch(() => "(sin estado)");
  await abrirPaquete(page);
  return { estado: estado.trim(), red: red.slice(antes) };
}

/**
 * CONTROL — la MISMA edición, sin publicar antes. Si esto también fallara, el
 * fallo sería del guardado o de la fixture, no de publicar.
 */
test("control: añadir una hoja y guardar, SIN publicar antes", async ({ context, page }) => {
  test.setTimeout(240_000);
  const { snapshot } = await abrirEstudio(context, page);

  await abrirPaquete(page);
  await crearHoja(page, 1);
  const primero = await guardar(page);
  await crearHoja(page, 2);
  const segundo = await guardar(page);

  console.log(
    `[escéptico·control] 1er guardado=${JSON.stringify(primero.estado)} red=${JSON.stringify(primero.red)} · ` +
      `2º guardado=${JSON.stringify(segundo.estado)} red=${JSON.stringify(segundo.red)} · ` +
      `versión servidor=${snapshot().version}`,
  );
  expect(segundo.estado).toBe("Guardado");
  expect(segundo.red.join(" ")).not.toContain("409");
});

/**
 * EL CASO — publicar, editar (sin tocar la escala) y guardar.
 */
test("publicar, añadir una hoja y guardar", async ({ context, page }) => {
  test.setTimeout(240_000);
  const { snapshot } = await abrirEstudio(context, page);

  await abrirPaquete(page);
  await crearHoja(page, 1);

  const primeraPublicación = await publicar(page);
  console.log(
    `[escéptico·caso] 1ª publicación pdf=${primeraPublicación.llegó ? "sí" : "NO"} ` +
      `red=${JSON.stringify(primeraPublicación.red)} · versión servidor=${snapshot().version}`,
  );
  expect(primeraPublicación.llegó, "la primera publicación no dio PDF").toBe(true);

  // Edición corriente que NO toca la escala ni su candado.
  await crearHoja(page, 2);
  const trasEditar = await guardar(page);
  console.log(
    `[escéptico·caso] guardado tras publicar=${JSON.stringify(trasEditar.estado)} ` +
      `red=${JSON.stringify(trasEditar.red)} · versión servidor=${snapshot().version}`,
  );

  const segundaPublicación = await publicar(page);
  console.log(
    `[escéptico·caso] 2ª publicación pdf=${segundaPublicación.llegó ? "sí" : "NO"} ` +
      `red=${JSON.stringify(segundaPublicación.red)} · versión servidor=${snapshot().version}`,
  );

  // Lo que se afirma: tras publicar, un guardado normal sigue funcionando.
  expect(trasEditar.estado, "el guardado quedó enclavado tras publicar").toBe("Guardado");
  expect(segundaPublicación.llegó, "la segunda publicación no dio PDF").toBe(true);
});

/**
 * DISCRIMINADOR — publicar dos veces SIN tocar nada. Según el informe esto sí
 * funciona; si fallara, «publicar» estaría roto de otra manera.
 */
test("publicar dos veces sin editar nada", async ({ context, page }) => {
  test.setTimeout(240_000);
  await abrirEstudio(context, page);

  await abrirPaquete(page);
  await crearHoja(page, 1);

  const primera = await publicar(page);
  const segunda = await publicar(page);
  console.log(
    `[escéptico·sin-editar] 1ª pdf=${primera.llegó ? "sí" : "NO"} · 2ª pdf=${segunda.llegó ? "sí" : "NO"} ` +
      `· red 2ª=${JSON.stringify(segunda.red)}`,
  );
  expect(primera.llegó).toBe(true);
  expect(segunda.llegó).toBe(true);
});
