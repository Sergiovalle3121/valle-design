import { expect, test } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * T-12·5 (campaña «El lunes de un arquitecto», 2026-09-06): la paleta Ctrl+K
 * ofrecía cuarenta entradas «Frase» que prometían «Preview listo en el
 * Copiloto CAD» — un panel retirado con la IA y sin «Aplicar» en el editor.
 * Fix-or-hide: se OCULTAN. Este golden defiende que no vuelvan: se buscan las
 * dos frases más obvias del registro y ninguna fila de la paleta es de la
 * familia COMMAND ni anuncia «Frase ·».
 */
function documentoSemilla() {
  return {
    schema: CAD_DOCUMENT_SCHEMA,
    units: { base: "mm", precision: 2 },
    layers: [
      {
        id: "architecture",
        name: "architecture",
        color: "#64748b",
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
        layer: "architecture",
      },
      {
        id: "muro-este",
        type: "line",
        start: { x: 7_000, y: 1_000, z: 0 },
        end: { x: 7_000, y: 6_000, z: 0 },
        layer: "architecture",
      },
    ] as CadEntity[],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "muro-este"] },
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

test("Ctrl+K no ofrece entradas «Frase» que prometan un panel que no existe", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadV1Backend(context, {
    document: documentoSemilla() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: "mm",
      gridSize: 100,
    },
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  await page.getByTestId("cad-canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+k");
  const buscador = page.getByPlaceholder(
    "Buscar comando, herramienta o símbolo...",
  );
  await expect(buscador).toBeVisible({ timeout: 15_000 });
  const caja = buscador.locator("xpath=ancestor::div[2]");

  for (const consulta of ["ayuda", "medir", "puerta"]) {
    await buscador.fill(consulta);
    await page.waitForTimeout(400);
    const filas = await caja.getByRole("button").allInnerTexts();
    const tipos = filas.map((t) => t.trim().split("\n").pop()?.trim() ?? "");
    expect(
      tipos,
      `«${consulta}»: una fila de la familia COMMAND (frase)`,
    ).not.toContain("COMMAND");
    for (const fila of filas)
      expect(fila, `«${consulta}»: una fila anuncia «Frase ·»`).not.toContain(
        "Frase ·",
      );
  }
  // Y lo que sí debe seguir: el motor y las herramientas.
  await buscador.fill("TRIM");
  await page.waitForTimeout(400);
  const filas = await caja.getByRole("button").allInnerTexts();
  expect(
    filas.some((t) => t.split("\n")[0]?.trim() === "TRIM"),
    "TRIM sigue en la paleta",
  ).toBe(true);
});
