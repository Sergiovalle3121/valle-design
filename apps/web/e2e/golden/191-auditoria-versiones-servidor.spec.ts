/**
 * AUDITORÍA — «VERSIONES» VUELVE A UNA VERSIÓN DEL SERVIDOR (T-12·1).
 *
 * El botón «Versiones» de la barra prometía «guardar, restaurar» y pedía
 * `layout/snapshots…`, una ruta que el adaptador declaraba «404 limpio»: la
 * lista salía siempre vacía y cada botón sacaba un error. La ficha daba dos
 * salidas —cablearlo a la historia real del servidor, que existe, o retirar el
 * botón— y aquí se comprueba la primera, por la puerta del producto:
 *
 *   1. Abro un plano que el servidor ya guardó una vez (versión 1).
 *   2. Dibujo una línea y guardo: el servidor tiene la versión 2.
 *   3. Abro «Versiones»: el historial lista la 2 y la 1, con quién y cuándo.
 *   4. Restauro la 1: el servidor guarda la versión 3 y su documento es el de
 *      la 1 (una entidad, no dos). Nada se borró: la 2 sigue en la lista.
 *
 * Lo que se afirma es lo que el SERVIDOR guardó, no lo que se ve en pantalla.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

const HUELLA_W = 12_000;
const HUELLA_H = 10_000;

function planoConUnaLinea(): CadDocument {
  const linea = {
    id: "linea-original",
    type: "line",
    layer: "0",
    start: { x: 1_000, y: 1_000 },
    end: { x: 5_000, y: 1_000 },
  } as unknown as CadEntity;
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [linea],
    history: [],
    modelSpace: { entityIds: [linea.id] },
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

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  // El servidor ya guardó este plano una vez: versión 1 en su historial.
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: planoConUnaLinea() as unknown as Record<string, unknown>,
    version: 1,
    footprint: { footprintW: HUELLA_W, footprintH: HUELLA_H, unit: "mm", gridSize: 100 },
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return { backend, snapshot };
}

async function teclear(page: Page, texto: string) {
  const entrada = page.getByTestId("cad-command-input");
  await entrada.click();
  await entrada.fill(texto);
  await entrada.press("Enter");
}

const lineas = (documento: CadDocument) =>
  documento.entities.filter((e) => e.type === "line").map((e) => e.id);

test("«Versiones» lista el historial del servidor y restaurar guarda la versión vieja como nueva", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const { backend, snapshot } = await abrirEstudio(context, page);

  await test.step("dibujo una línea y guardo: el servidor pasa a la versión 2", async () => {
    await teclear(page, "LINE");
    await teclear(page, "1000,3000");
    await teclear(page, "5000,3000");
    await teclear(page, "");
    const version = await saveAndSettle(page, { snapshot });
    expect(version, "el guardado avanza el CAS").toBe(2);
    expect(lineas(snapshot().document as unknown as CadDocument)).toHaveLength(2);
  });

  await test.step("el cuadro lista las dos versiones, de la más nueva a la más vieja", async () => {
    await page.getByTitle(/^Versiones/).click();
    const cuadro = page.getByTestId("cad-versiones-servidor");
    await expect(cuadro).toBeVisible();
    await expect(page.getByTestId("cad-version-row-2")).toBeVisible();
    await expect(page.getByTestId("cad-version-row-1")).toBeVisible();
    await expect(cuadro).toContainText("2 guardados");
    await expect(page.getByTestId("cad-version-row-1")).toContainText("arquitecta@despacho.mx");
    const filas = await cuadro.locator('[data-testid^="cad-version-row-"]').allTextContents();
    expect(filas[0], "la más nueva va primero").toContain("Versión 2");
    // El historial es inmutable: aquí no se ofrece borrar ni «guardar versión».
    await expect(cuadro.getByRole("button", { name: /borrar|eliminar/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guardar versión" })).toHaveCount(0);
  });

  await test.step("restaurar la 1 guarda la versión 3 con el documento de la 1", async () => {
    await page.getByTestId("cad-version-restore-1").click();
    await expect(page.getByText(/volvió a la versión 1/)).toBeVisible();
    await expect.poll(() => snapshot().version, {
      message: "restaurar tiene que guardar una versión NUEVA en el servidor",
    }).toBe(3);
    const guardado = snapshot().document as unknown as CadDocument;
    expect(lineas(guardado), "la versión 3 es el plano de la 1: una sola línea").toEqual([
      "linea-original",
    ]);
    // La versión 2 no se borró: sigue en el historial del servidor.
    const [documentId] = backend.versions.documents();
    expect(backend.versions.of(documentId).map((v) => v.version)).toEqual([1, 2, 3]);
  });

  await test.step("el editor recargó lo restaurado y vuelve a abrir el cuadro con las tres", async () => {
    await expect(page.getByTestId("cad-versiones-servidor")).toHaveCount(0);
    await page.getByTitle(/^Versiones/).click();
    await expect(page.getByTestId("cad-version-row-3")).toBeVisible();
    await expect(page.getByTestId("cad-versiones-servidor")).toContainText("3 guardados");
  });
});
