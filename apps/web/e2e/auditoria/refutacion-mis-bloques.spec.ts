import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * ESCEPTICISMO — «Mis bloques» del muelle izquierdo no inserta el catálogo.
 *
 * Se prueba lo MÍNIMO y con TESTIGO en la misma pantalla:
 *   A) una fila del catálogo (definición canónica, `assets: []` — que es lo que
 *      escribe la migración del producto: `"assets" = '[]'::jsonb`)
 *   B) una fila de inquilino con assets (lo que guarda «+ Guardar selección
 *      como bloque»)
 * Si B inserta con el MISMO clic y A no, ni el localizador ni la fixture están
 * mal: el producto ignora la mitad de su propio panel.
 */

const SILLA = {
  id: "valle:arq:silla-comedor",
  name: "Silla",
  basePoint: { x: 0, y: 0, z: 0 },
  description: "Silla de comedor.",
  keywords: ["silla", "comedor"],
  version: 1,
  entities: [
    {
      id: "valle:arq:silla-comedor:e0",
      type: "polyline",
      layer: "equipment",
      closed: true,
      vertices: [
        { x: -225, y: -225, z: 0 },
        { x: 225, y: -225, z: 0 },
        { x: 225, y: 225, z: 0 },
        { x: -225, y: 225, z: 0 },
      ],
    },
  ],
};

function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      {
        id: "equipment",
        name: "equipment",
        color: "#a78bfa",
        visible: true,
        locked: false,
      },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 7_000, y: 1_000, z: 0 },
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur"] },
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

async function instalarBackend(context: BrowserContext) {
  const { backend } = await installCadV1Backend(context, {
    document: documentoSemilla() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: "mm",
      gridSize: 100,
    },
  });
  // (A) EXACTAMENTE como la migración del producto: definición canónica y
  // `assets` vacío.
  backend.seedLibraryBlock({
    name: SILLA.name,
    definition: SILLA as unknown as Record<string, unknown>,
  });
  // (B) TESTIGO: bloque de inquilino con assets, como lo deja «+ Guardar
  // selección como bloque».
  backend.seedLibraryBlock({
    name: "Testigo",
    definition: SILLA as unknown as Record<string, unknown>,
    assets: [
      {
        id: "a1",
        kind: "machine",
        label: "T1",
        x: 0,
        y: 0,
        w: 400,
        h: 400,
        rotation: 0,
      },
      {
        id: "a2",
        kind: "machine",
        label: "T2",
        x: 500,
        y: 0,
        w: 400,
        h: 400,
        rotation: 0,
      },
    ],
  });
  return backend;
}

test("«Mis bloques»: la fila del catálogo no inserta; la que tiene assets sí", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await instalarBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  const muelle = page.getByTestId("cad-left-dock");
  await expect(muelle).toBeVisible();
  await expect(
    muelle.getByText("Mis bloques"),
    "el panel «Mis bloques» está en el muelle izquierdo",
  ).toBeVisible();

  const contador = page.getByTestId("cad-native-document-count");
  const antes = await contador.innerText();
  console.log(`[escéptico] contador antes: ${antes}`);

  const filaCatalogo = muelle.getByRole("button", { name: "Silla 0 obj" });
  const filaTestigo = muelle.getByRole("button", { name: "Testigo 2 obj" });

  await expect(
    filaCatalogo,
    "el catálogo aparece en «Mis bloques» contado como 0 obj",
  ).toBeVisible();
  await expect(filaTestigo).toBeVisible();

  /* ── (B) el testigo, MISMO gesto ─────────────────────────────────────── */
  await filaTestigo.click();
  await expect(
    page.getByText(/insertado como grupo/i),
    "TESTIGO: la fila con assets sí inserta y sí avisa",
  ).toBeVisible({ timeout: 15_000 });
  const trasTestigo = await contador.innerText();
  console.log(`[escéptico] tras clicar el testigo: contador=${trasTestigo}`);

  /* ── (A) la fila del catálogo ────────────────────────────────────────── */
  // El aviso del testigo se va solo; se espera para no contarlo dos veces.
  await expect(page.getByText(/insertado como grupo/i)).toHaveCount(0, {
    timeout: 30_000,
  });
  await filaCatalogo.click();
  await page.waitForTimeout(2_000);
  const trasCatalogo = await contador.innerText();
  const avisoCatalogo = await page.getByText(/insertado como grupo/i).count();
  const cualquierAviso = await page
    .locator("[data-testid^='toast'], [role='status'], [role='alert']")
    .allInnerTexts();
  console.log(
    `[escéptico] tras clicar el catálogo: contador=${trasCatalogo} avisos=${JSON.stringify(cualquierAviso)}`,
  );

  // Veredicto: el testigo demuestra que el gesto y el localizador son buenos.
  expect(trasCatalogo, "el catálogo no movió el contador").toBe(antes);
  expect(avisoCatalogo, "el catálogo no dijo nada").toBe(0);
});
