/**
 * ESCÉPTICO — ¿de verdad no hay forma de REDEFINIR un bloque tecleando?
 *
 * El hallazgo que se pone a prueba: teclear BLOCK con el nombre de un bloque
 * que ya existe no redefine, sino que termina el comando con «El bloque X ya
 * existe. Use otro nombre o redefínalo.», y no hay ningún otro comando con el
 * que redefinir — mientras el propio producto, en el buscador Ctrl+K, anuncia
 * que BLOCK «crea o redefine».
 *
 * Aquí no se insertan sillas ni se mueve nada: el documento LLEGA con la
 * definición «Silla» dentro y con un recambio dibujado. Es el estado mínimo en
 * el que un delineante teclea B para redefinir.
 *
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/zz-esceptico-block-redefine.spec.ts \
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

const dialogo = (page: Page) => page.getByTestId("cad-command-line-log");

test("teclear BLOCK con el nombre de un bloque que ya existe", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await instalarBackend(context);
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

  await test.step("B. dar el nombre que YA existe: qué contesta el producto", async () => {
    await teclear(page, "Silla");
    // Se ESPERA a que el diálogo hable, en vez de leerlo al vuelo: leer el
    // innerText justo después de Enter devuelve el renglón anterior.
    await expect(dialogo(page)).toContainText("ya existe", { timeout: 15_000 });
    console.log(`[escéptico] el diálogo dice:\n${await dialogo(page).innerText()}`);

    // El comando TERMINÓ: no queda pregunta en pie, así que no hay ni punto
    // base ni designación que dar. Eso es lo que hace del aviso un callejón.
    await expect(
      page.getByTestId("cad-command-prompt"),
      "si BLOCK siguiera vivo pediría el punto base",
    ).toHaveCount(0);
  });

  await test.step("C. insistir: teclear B y el mismo nombre otra vez", async () => {
    await teclear(page, "B");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("nombre del bloque");
    await teclear(page, "Silla");
    await expect(dialogo(page)).toContainText("ya existe");
    await expect(page.getByTestId("cad-command-prompt")).toHaveCount(0);
  });

  await test.step("D. control: con un nombre libre el mismo gesto SÍ avanza", async () => {
    await teclear(page, "B");
    await teclear(page, "SillaNueva");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("punto base");
    await page.getByTestId("cad-command-input").press("Escape");
  });

  await test.step("E. lo que el buscador Ctrl+K promete de BLOCK y de BEDIT", async () => {
    await page.getByTitle(/^Paleta de comandos/).click();
    const buscador = page.getByPlaceholder("Buscar comando, herramienta o símbolo...");
    await expect(buscador).toBeVisible();
    const caja = buscador.locator("xpath=ancestor::div[2]");

    const rotulo = async (termino: string) => {
      await buscador.fill(termino);
      const entrada = caja.getByRole("button").filter({ hasText: termino }).first();
      await expect(entrada).toBeVisible();
      const texto = (await caja.getByRole("button").allInnerTexts()).find((t) =>
        t.startsWith(`${termino}\n`),
      );
      console.log(`[escéptico] Ctrl+K «${termino}» ofrece: ${JSON.stringify(texto)}`);
      return texto ?? "";
    };

    // Ésta es la contradicción, en el sitio más visible que tiene el estudio:
    // el buscador anuncia que BLOCK redefine, y BLOCK acaba de negarse.
    expect(
      await rotulo("BLOCK"),
      "el buscador promete que BLOCK redefine, y BLOCK se ha negado arriba",
    ).toContain("redefine");
    expect(
      await rotulo("BEDIT"),
      "y BEDIT remite a BLOCK para redefinir",
    ).toContain("BLOCK redefine");
  });
});
