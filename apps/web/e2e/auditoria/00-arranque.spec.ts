import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * ARRANQUE DE LA AUDITORÍA — el esqueleto que copian los demás specs.
 *
 * No prueba producto: prueba que el TERRENO está puesto. Si este archivo se
 * pone rojo, ningún hallazgo de los specs hermanos vale nada, porque no se
 * sabrá si el fallo es del producto o del arnés.
 *
 * ## CÓMO SE CORRE (y por qué así, siempre)
 *
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/<archivo> --project=chromium --reporter=line
 *
 * `E2E_API_ORIGIN` NO es opcional. El build de producción ya hecho lleva
 * `NEXT_PUBLIC_API_URL=http://localhost:4000` INCRUSTADO (Next lo inlinea al
 * compilar), mientras que las fixtures stubbean el origen que diga
 * `E2E_API_ORIGIN`, y por defecto es `http://localhost:4010`. Sin exportarlo,
 * la app llama a :4000 y el stub escucha en :4010: ningún intercept casa, el
 * estudio no carga y la pantalla dice «No existe un documento histórico
 * compatible». Eso NO es un defecto del producto — es el puerto.
 *
 * ## LOCALIZADORES: un nombre de la interfaz no es una identidad
 *
 * Cuatro fixtures, y no son sugerencias (hay un gate, `check:e2e-localizadores`,
 * que rechaza dos de ellas escritas a mano):
 *
 *   · e2e/fixtures/camera-preset.ts  → topView(page), fitFootprint(page).
 *     Los presets están DUPLICADOS (barra superior y ViewCube): `getByTitle`
 *     a secas resuelve a dos elementos y Playwright, en estricto, se niega.
 *   · e2e/fixtures/draft-toolbar.ts  → finishDraft(page).
 *     «Terminar» resuelve a dos botones desde que la cinta añadió el suyo.
 *   · e2e/fixtures/tool-palette.ts   → startTool(page, "line" | "polyline" |
 *     "rect" | "circle" | "move" | "copy" | "offset" …). POR ID: los rótulos
 *     están en español y cambian.
 *   · e2e/fixtures/world-point.ts    → worldPoint(page, { x, y }) para pasar
 *     de coordenadas de dibujo a píxeles. Exige encuadre cenital previo
 *     (topView + fitFootprint), o la afín mundo↔pantalla no es invertible.
 */

/** Documento vacío y válido: el punto de partida neutro de cada spec. */
export function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
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
  };
}

/**
 * ABRE EL ESTUDIO. Cópiese tal cual; el orden importa.
 *
 * 1. `installMockBackend`  — la superficie general de la app.
 * 2. `loginAsStandaloneOwner` — identidad de primera parte (cookies); sin ella
 *    el estudio rebota a la pantalla de acceso.
 * 3. `installCadStudioBackend` — el documento del estudio y su huella.
 * 4. `/legacy/studio` — la ruta HERMÉTICA. NO uses `/studio/[id]`: exige el
 *    flujo de identidad real y devuelve 401 de forma intermitente bajo fixture.
 *
 * Devuelve el backend: `backend.snapshot()` da `{ document, version }` tal y
 * como lo recibió el servidor, que es donde se afirma (una captura de pantalla
 * no distingue lo dibujado de lo persistido).
 */
export async function abrirEstudio(
  context: BrowserContext,
  page: Page,
  documento: CadDocument = documentoSemilla(),
) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documento, {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  // El recorrido guiado es un estado de PRIMERA VEZ, no el estado en reposo, y
  // es modal: mientras está abierto tapa controles a propósito. Se descarta
  // igual que en el resto de la suite. `count()` y no `isVisible()` porque
  // puede no montarse en absoluto.
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

test("el estudio arranca: lienzo visible y sin recorrido guiado encima", async ({
  context,
  page,
}) => {
  // La máquina tiene 4 núcleos y puede haber otra suite corriendo; el arranque
  // del estudio (WebGL por software) no cabe en los 60 s por defecto.
  test.setTimeout(120_000);

  await abrirEstudio(context, page);

  // Mínimo y suficiente: el lienzo está montado y visible…
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  // …y el modal de primera vez ya no tapa nada.
  await expect(page.getByTestId("cad-guided-tour-skip")).toHaveCount(0);
});
