import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * ESCÉPTICO — ¿de verdad la escala nace apagada y sin explicación?
 * Reproducción independiente del hallazgo de imprimir.spec.ts, paso 3.
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
    modelSpace: { entityIds: entities.map((e) => e.id) },
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
  await installCadStudioBackend<CadDocument>(context, documentoSemilla(), FOOTPRINT);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

test("escéptico: hoja recién creada, ¿escala apagada y candado mudo?", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await abrirEstudio(context, page);

  await page.getByTitle(/Paquete de entrega/).click();
  await expect(page.getByTestId("cad-sheet-package")).toBeVisible();
  await page.getByRole("button", { name: "+ Hoja" }).click();
  const manager = page.getByTestId("cad-layout-manager");
  await expect(manager).toContainText("Viewports · 1");

  // Se deja asentar la vista: nada de medir un render a medias.
  await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("50");
  await page.waitForTimeout(1_500);

  const select = page.getByTestId("cad-viewport-scale");
  const custom = page.getByTestId("cad-viewport-custom-scale");
  const candado = page.getByTestId("cad-viewport-lock");

  const estado = {
    selectDisabled: await select.isDisabled(),
    customDisabled: await custom.isDisabled(),
    candadoTitle: await candado.getAttribute("title"),
    candadoAriaLabel: await candado.getAttribute("aria-label"),
    candadoAriaDescribedBy: await candado.getAttribute("aria-describedby"),
    candadoInnerText: (await candado.innerText()).trim(),
    // El nombre accesible REAL, tal como lo calcula el navegador (incluye
    // texto alternativo de SVG y aria-labelledby).
    candadoNombreAccesible: await candado.evaluate((nodo) => {
      const el = nodo as HTMLElement;
      return {
        textContent: (el.textContent ?? "").trim(),
        htmlInterior: el.innerHTML.slice(0, 400),
        cajaPx: (() => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        })(),
      };
    }),
    // ¿Hay ALGO escrito en el panel que explique el apagado?
    textoPanel: (await manager.innerText()).replace(/\n+/g, " | "),
    // ¿Hay algún title/aria-label en cualquier ancestro del candado?
    ancestrosConPista: await candado.evaluate((nodo) => {
      const pistas: string[] = [];
      let actual: HTMLElement | null = nodo as HTMLElement;
      let saltos = 0;
      while (actual && saltos < 6) {
        const t = actual.getAttribute("title");
        const a = actual.getAttribute("aria-label");
        if (t) pistas.push(`title@${actual.tagName}=${t}`);
        if (a) pistas.push(`aria-label@${actual.tagName}=${a}`);
        actual = actual.parentElement;
        saltos += 1;
      }
      return pistas;
    }),
  };
  console.log("[escéptico·escala] " + JSON.stringify(estado, null, 2));

  // ¿Hay tooltip nativo si se pasa el ratón por encima?
  await candado.hover();
  await page.waitForTimeout(1_200);
  const trasHover = await candado.getAttribute("title");
  console.log("[escéptico·escala] title tras hover: " + JSON.stringify(trasHover));

  // La cadena causal: destrabar la ventana enciende la escala.
  await candado.click();
  await expect(select).toBeEnabled();
  await expect(custom).toBeEnabled();
  console.log("[escéptico·escala] tras clicar el candado la escala se enciende: OK");

  // Y el estado del panel una vez desbloqueado, para comparar.
  console.log(
    "[escéptico·escala] panel desbloqueado: " +
      (await manager.innerText()).replace(/\n+/g, " | "),
  );

  // Aserciones duras del hallazgo.
  expect(estado.selectDisabled, "el selector de escala NO nace apagado").toBe(true);
  expect(estado.candadoTitle).toBeNull();
  expect(estado.candadoAriaLabel).toBeNull();
  expect(estado.candadoInnerText).toBe("");
});
