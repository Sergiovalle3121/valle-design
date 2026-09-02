/**
 * BLOCK CON EL NOMBRE DE UN BLOQUE QUE YA EXISTE — graduada de
 * `e2e/auditoria/refutacion-block-redefine.spec.ts`.
 *
 * La auditoría del 2026-09-01 tecleó B y «Silla» y el producto contestó «El
 * bloque Silla ya existe. Use otro nombre o redefínalo» sin ninguna orden con
 * la que redefinir, mientras el buscador Ctrl+K anunciaba que BLOCK «crea o
 * redefine». Ahora es la pregunta de `-BLOCK` de AutoCAD: «¿Redefinirlo?
 * [Sí/No] <No>» → punto base de la nueva definición → objetos. El documento
 * LLEGA con la definición «Silla» dentro, una inserción en (3000,2000) y un
 * recambio de 700 × 700 dibujado alrededor del origen.
 *
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/golden/70-cad-block-nombre-existente-redefine.spec.ts \
 *     --project=chromium --reporter=line
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";

const SILLA = {
  id: "block:silla",
  name: "Silla",
  basePoint: { x: 0, y: 0, z: 0 },
  version: 1,
  entities: [
    {
      id: "block:silla/e0",
      type: "polyline",
      layer: "0",
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

function documentoSemilla() {
  return {
    schema: "valle.cad.v1",
    id: "doc-esceptico-bloques",
    unit: "mm",
    layers: [{ id: "0", name: "0", color: "#94a3b8", visible: true, locked: false }],
    entities: [
      {
        id: "puesta",
        type: "insert",
        block: SILLA.id,
        insertion: { x: 3_000, y: 2_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
      {
        id: "recambio",
        type: "polyline",
        layer: "0",
        closed: true,
        vertices: [
          { x: -350, y: -350, z: 0 },
          { x: 350, y: -350, z: 0 },
          { x: 350, y: 350, z: 0 },
          { x: -350, y: 350, z: 0 },
        ],
      },
    ],
    history: [],
    modelSpace: { entityIds: ["puesta", "recambio"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [SILLA],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function instalarBackend(context: BrowserContext) {
  return installCadV1Backend(context, {
    document: documentoSemilla() as unknown as Record<string, unknown>,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 },
  });
}

async function teclear(page: Page, valor: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(valor);
  await input.press("Enter");
}


type Documento = {
  blocks: { id: string; version?: number; basePoint: { x: number; y: number }; entities: unknown[] }[];
  entities: { id: string; type: string; insertion?: { x: number; y: number } }[];
};

/**
 * Designa un objeto pinchándolo en la lista del editor. La lista vive en el
 * panel de propiedades y SÓLO se muestra sin nada designado, así que primero se
 * suelta lo que hubiera (mismo gesto que el golden 69).
 */
async function designar(page: Page, id: string) {
  const propiedades = page.getByTestId("cad-native-properties");
  const soltar = propiedades.getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
  await page.getByTestId(`cad-native-entity-${id}`).click();
  await expect(propiedades).toBeVisible();
}

async function guardar(page: Page, snapshot: () => { document: unknown; version: number }) {
  const boton = page.getByTestId("cad-save");
  if ((await boton.count()) && (await boton.isEnabled())) {
    await boton.click();
    await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", { timeout: 30_000 });
  }
  return snapshot().document as Documento;
}

test("teclear BLOCK con el nombre de un bloque que ya existe pregunta, redefine y deja la inserción en su sitio", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const { snapshot } = await instalarBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  await test.step("A. designar el recambio y teclear B", async () => {
    await page.getByTestId("cad-native-entity-recambio").click();
    await expect(page.getByTestId("cad-native-properties")).toBeVisible();
    await teclear(page, "B");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("nombre del bloque");
  });

  await test.step("B. el nombre que YA existe: el producto pregunta, y Enter es No", async () => {
    await teclear(page, "Silla");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("ya existe");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("Redefinirlo");
    await page.getByTestId("cad-command-input").click();
    await page.getByTestId("cad-command-input").press("Enter");
    // No por defecto: vuelve a pedir el nombre sin haber escrito nada.
    await expect(page.getByTestId("cad-command-prompt")).toContainText("nombre del bloque");
    await page.getByTestId("cad-command-input").press("Escape");
    const documento = await guardar(page, snapshot);
    expect(documento.blocks[0].version ?? 1).toBe(1);
  });

  await test.step("C. Sí: punto base, objetos, y la inserción sigue donde estaba con el dibujo nuevo", async () => {
    await designar(page, "recambio");
    await teclear(page, "B");
    await teclear(page, "Silla");
    await teclear(page, "S");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "punto base de la nueva definición de Silla",
    );
    await teclear(page, "0,0");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("Designe objetos");
    await page.getByTestId("cad-command-input").click();
    await page.getByTestId("cad-command-input").press("Enter");
    await expect(page.getByTestId("cad-command-prompt")).toHaveCount(0);

    const documento = await guardar(page, snapshot);
    const silla = documento.blocks.find((b) => b.id === SILLA.id)!;
    expect(silla.version, "redefinir sube la versión").toBe(2);
    expect(silla.entities, "la definición es ahora el recambio").toHaveLength(1);
    expect(silla.basePoint).toMatchObject({ x: 0, y: 0 });
    // El recambio pasó a SER el bloque: se consumió del plano.
    expect(documento.entities.some((e) => e.id === "recambio")).toBe(false);
    // La inserción no se movió ni se duplicó.
    const puestas = documento.entities.filter((e) => e.type === "insert");
    expect(puestas).toHaveLength(1);
    expect(puestas[0].insertion).toMatchObject({ x: 3_000, y: 2_000 });
  });

  await test.step("D. control: con un nombre libre el mismo gesto crea, no pregunta", async () => {
    await designar(page, "puesta");
    await teclear(page, "B");
    await teclear(page, "SillaNueva");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("punto base de inserción");
    await page.getByTestId("cad-command-input").press("Escape");
  });
});
