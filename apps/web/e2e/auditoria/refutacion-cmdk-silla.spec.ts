import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * ESCÉPTICO — «la caja de buscar (Ctrl+K) no ofrece el bloque de la biblioteca,
 * ofrece un símbolo homónimo». Recorrido mínimo e independiente del spec del
 * compañero: documento limpio (cuatro muros), UN bloque en la biblioteca del
 * inquilino, y nada de redefinir.
 */

const SILLA = {
  id: "valle:arq:silla-comedor",
  name: "Silla",
  basePoint: { x: 0, y: 0, z: 0 },
  description:
    "Silla de 0.45 m de asiento y 0.50 m con respaldo. Se inserta por el centro del asiento.",
  keywords: ["silla", "comedor", "mobiliario", "asiento"],
  version: 1,
  attributes: {},
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

function documentoSemilla() {
  return {
    schema: CAD_DOCUMENT_SCHEMA,
    units: { base: "mm", precision: 2 },
    layers: [
      { id: "architecture", name: "architecture", color: "#64748b", visible: true, locked: false },
      { id: "equipment", name: "equipment", color: "#a78bfa", visible: true, locked: false },
    ],
    entities: [
      { id: "muro-sur", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 7_000, y: 1_000, z: 0 }, layer: "architecture" },
      { id: "muro-este", type: "line", start: { x: 7_000, y: 1_000, z: 0 }, end: { x: 7_000, y: 6_000, z: 0 }, layer: "architecture" },
      { id: "muro-norte", type: "line", start: { x: 7_000, y: 6_000, z: 0 }, end: { x: 1_000, y: 6_000, z: 0 }, layer: "architecture" },
      { id: "muro-oeste", type: "line", start: { x: 1_000, y: 6_000, z: 0 }, end: { x: 1_000, y: 1_000, z: 0 }, layer: "architecture" },
    ] as CadEntity[],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "muro-este", "muro-norte", "muro-oeste"] },
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

async function instalarBackend(context: BrowserContext) {
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: documentoSemilla() as unknown as Record<string, unknown>,
    footprint: { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 },
  });
  backend.seedLibraryBlock({
    name: SILLA.name,
    definition: SILLA as unknown as Record<string, unknown>,
  });
  return { snapshot: () => snapshot().document as unknown as CadDocument };
}

test("Ctrl+K con «silla»: qué ofrece y qué deja en el documento", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await instalarBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  const botonBloques = page.getByTitle(/^BLOCK\/INSERT:/);

  // 1. El bloque SÍ está en el producto: la biblioteca del inquilino lo lista y
  //    su propio buscador lo encuentra por «silla».
  await test.step("1. el bloque existe y el buscador de la biblioteca lo encuentra", async () => {
    await botonBloques.click();
    const palette = page.getByTestId("cad-block-palette");
    await expect(palette).toBeVisible();
    await expect(page.getByTestId(`cad-block-row-${SILLA.name}`)).toBeVisible();
    const buscar = palette.getByLabel("Buscar bloques");
    await buscar.fill("silla");
    await expect(page.getByTestId(`cad-block-row-${SILLA.name}`)).toBeVisible();
    await buscar.fill("");
    await botonBloques.click();
    await expect(page.getByTestId("cad-block-palette")).toHaveCount(0);
  });

  // 2. La caja de buscar del estudio, abierta por TECLADO (no por el botón),
  //    para no depender del localizador del compañero.
  const antes = backend.snapshot();
  await test.step("2. Ctrl+K, «silla»: inventario completo de lo que ofrece", async () => {
    await page.getByTestId("cad-canvas").click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("Control+k");
    const buscador = page.getByPlaceholder("Buscar comando, herramienta o símbolo...");
    await expect(buscador).toBeVisible({ timeout: 15_000 });
    await buscador.fill("silla");
    await page.waitForTimeout(500);

    const caja = buscador.locator("xpath=ancestor::div[2]");
    const rotulos = await caja.getByRole("button").allInnerTexts();
    console.log(
      `[escéptico] Ctrl+K «silla» ofrece ${rotulos.length}: ${JSON.stringify(rotulos)}`,
    );

    // ¿Hay ALGUNA entrada que sea el bloque de la biblioteca? El tipo va a la
    // derecha de cada fila: ENGINE, COMMAND, TOOL, SYMBOL…
    const tipos = rotulos.map((t) => t.trim().split("\n").pop()?.trim() ?? "");
    console.log(`[escéptico] tipos ofrecidos: ${JSON.stringify([...new Set(tipos)])}`);

    const llamadasSilla = rotulos.filter((t) => t.split("\n")[0]?.trim() === "Silla");
    console.log(`[escéptico] filas tituladas exactamente «Silla»: ${JSON.stringify(llamadasSilla)}`);
  });

  // 3. Colocar la que se llama «Silla» y ver qué nace en el documento.
  await test.step("3. pulsar «Silla» y mirar el documento", async () => {
    const buscador = page.getByPlaceholder("Buscar comando, herramienta o símbolo...");
    const caja = buscador.locator("xpath=ancestor::div[2]");
    const entradas = caja.getByRole("button");
    const rotulos = await entradas.allInnerTexts();
    const cual = rotulos.findIndex((t) => t.split("\n")[0]?.trim() === "Silla");
    expect(cual, "no hay ninguna fila «Silla» en la caja de buscar").toBeGreaterThanOrEqual(0);
    await entradas.nth(cual).click();
    await page.waitForTimeout(1_500);

    const guardar = page.getByTestId("cad-save");
    if ((await guardar.count()) && (await guardar.isEnabled())) {
      await guardar.click();
      await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", {
        timeout: 30_000,
      });
    }
    const despues = backend.snapshot();
    const nuevos = despues.entities.filter(
      (e) => !antes.entities.some((v) => v.id === e.id),
    );
    console.log(
      `[escéptico] entidades nuevas: ${JSON.stringify(nuevos.map((e) => e.type))}`,
    );
    const inserts = (d: CadDocument) => d.entities.filter((e) => e.type === "insert").length;
    console.log(
      `[escéptico] inserts antes=${inserts(antes)} después=${inserts(despues)}`,
    );
    console.log(
      `[escéptico] bloques definidos en el documento: ${JSON.stringify(
        (despues.blocks ?? []).map((b: { name?: string }) => b.name),
      )}`,
    );
  });
});
