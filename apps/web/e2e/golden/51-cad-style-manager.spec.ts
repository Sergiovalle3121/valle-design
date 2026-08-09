/**
 * Gestor de estilos.
 *
 * Se afirma el DOCUMENTO: los estilos creados y editados llegan a
 * `document.styles`, con las cinco familias separadas, y sólo con los campos
 * que el usuario fijó —un estilo nace vacío y hereda el resto—.
 *
 * También se afirma la NEGATIVA: un estilo que una entidad usa no se puede
 * borrar. Una funcionalidad que se rinde sin decirlo es peor que no tenerla.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument } from "../../src/lib/cad/cad-document";

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      {
        id: "0",
        name: "0",
        color: "#ffffff",
        visible: true,
        locked: false,
        linetype: "CONTINUOUS",
        lineweight: -1,
        plot: true,
      },
    ],
    entities: [
      {
        id: "style-line",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 6_000, y: 1_000, z: 0 },
        layer: "0",
      },
      {
        id: "style-note",
        type: "mtext",
        text: "Nota de proceso",
        insertion: { x: 2_000, y: 3_000, z: 0 },
        height: 120,
        width: 3_000,
        rotation: 0,
        style: "Titulos",
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["style-line", "style-note"] },
    paperSpaces: [],
    styles: {
      text: { Titulos: {} },
      dimension: {},
      mleader: {},
      table: {},
      plot: {},
    },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000,
    footprintH: 8_000,
    unit: "mm",
    gridSize: 100,
  });
}

/** Rellena un campo del gestor y espera a que lo sostenga antes de seguir. */
async function applyStyleField(
  page: import("@playwright/test").Page,
  testId: string,
  value: string,
) {
  const field = page.getByTestId(testId);
  await expect(async () => {
    await expect(field).toBeVisible({ timeout: 1_000 });
    await field.fill(value);
    await field.blur();
    await expect(field).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("el gestor define estilos de texto, cota y ploteo, y se niega a borrar uno en uso", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-entity-style-line")).toBeVisible();

  await page.getByTestId("cad-draft-status-styles").click();
  const manager = page.getByTestId("cad-style-manager");
  await expect(manager).toHaveAttribute("data-family", "text");

  await test.step("un estilo en uso no se borra", async () => {
    // `style-note` apunta a «Titulos» por su NOMBRE: borrarlo la dejaría
    // apuntando a algo que ya no existe.
    await expect(page.getByTestId("cad-style-usage-Titulos")).toHaveText(
      "1 uso(s)",
    );
    await expect(page.getByTestId("cad-style-delete-Titulos")).toBeDisabled();
  });

  await test.step("editar el estilo de texto que ya existe", async () => {
    // Nace vacío, así que la interfaz enseña los valores de fábrica.
    await expect(
      page.getByTestId("cad-style-field-Titulos-height"),
    ).toHaveValue("120");
    await applyStyleField(page, "cad-style-field-Titulos-height", "250");
    await applyStyleField(page, "cad-style-field-Titulos-fontFamily", "Inter");
  });

  await test.step("crear un estilo de cota", async () => {
    await page.getByTestId("cad-style-family-dimension").click();
    await expect(manager).toHaveAttribute("data-family", "dimension");
    await page.getByTestId("cad-style-new-name").fill("Arquitectura");
    await page.getByTestId("cad-style-create").click();
    await expect(page.getByTestId("cad-style-row-Arquitectura")).toBeVisible();
    await expect(page.getByTestId("cad-style-usage-Arquitectura")).toHaveText(
      "0 uso(s)",
    );
    await applyStyleField(page, "cad-style-field-Arquitectura-precision", "0");
    // Sin referencias sí se puede borrar; se comprueba que el botón está vivo
    // aunque no se pulse.
    await expect(
      page.getByTestId("cad-style-delete-Arquitectura"),
    ).toBeEnabled();
  });

  await test.step("el enum de ploteo", async () => {
    await page.getByTestId("cad-style-family-plot").click();
    await page.getByTestId("cad-style-new-name").fill("Blanco y negro");
    await page.getByTestId("cad-style-create").click();
    await page
      .getByTestId("cad-style-field-Blanco y negro-colorMode")
      .selectOption("monochrome");
    await expect(
      page.getByTestId("cad-style-field-Blanco y negro-colorMode"),
    ).toHaveValue("monochrome");
  });

  await page.getByTestId("cad-style-close").click();
  await saveAndSettle(page, backend);
  const stored = backend.snapshot().document;
  expect(stored.styles.text.Titulos).toEqual({
    height: 250,
    fontFamily: "Inter",
  });
  expect(stored.styles.dimension.Arquitectura).toEqual({ precision: 0 });
  expect(stored.styles.plot["Blanco y negro"]).toEqual({
    colorMode: "monochrome",
  });
  // Las familias que nadie tocó siguen vacías: el gestor no materializa
  // valores por defecto en el documento.
  expect(stored.styles.mleader ?? {}).toEqual({});
  expect(stored.styles.table).toEqual({});
  expect(
    stored.history.some(
      (entry) => entry.label === "style:create:dimension:Arquitectura",
    ),
  ).toBe(true);
  expect(
    stored.history.some((entry) => entry.label === "style:update:text:Titulos"),
  ).toBe(true);

  await page.reload();
  await expect(page.getByTestId("cad-native-entity-style-line")).toBeVisible();
  await page.getByTestId("cad-draft-status-styles").click();
  await expect(page.getByTestId("cad-style-field-Titulos-height")).toHaveValue(
    "250",
  );
  await page
    .getByTestId("cad-style-manager")
    .screenshot({
      path: testInfo.outputPath("style-manager.png"),
      scale: "css",
    });
});
