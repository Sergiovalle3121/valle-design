/**
 * AUDITORÍA — SOLTAR UN ARCHIVO SOBRE EL LIENZO DEL ESTUDIO (T-63f, petición F8-2).
 *
 * Arrastrar-y-soltar un DXF existía en tres sitios de la ficha: el estado
 * vacío y el tablero (golden 150, frente F8) y el LIENZO del editor, donde
 * quien ya tiene un plano abierto suelta el del cliente para calcarlo. En el
 * lienzo `onDrop` sólo servía para reordenar presentaciones: soltar un archivo
 * ahí lo abría el navegador en una pestaña nueva, con el estudio detrás.
 *
 * Lo que se afirma: (1) un DXF soltado sobre `cad-canvas` entra por la MISMA
 * puerta que el input del plano de fondo y viaja al servidor con su
 * colocación, como en el golden 38; (2) un `.dwg` soltado recibe la misma
 * frase que por el input y por el tablero (golden 192) y no viaja.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };

const DXF = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "1000", "21", "0",
  "0", "LINE", "8", "0", "10", "1000", "20", "0", "11", "1000", "21", "500",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

function planoVacio(): CadDocument {
  return {
    meta: { version: 1, schema: 3, ...FOOTPRINT },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

/** La técnica del golden 150: un `DataTransfer` con un `File` construido DENTRO del navegador. */
async function soltarSobre(
  page: Page,
  testId: string,
  file: { name: string; mimeType: string; content: string },
) {
  const dataTransfer = await page.evaluateHandle(({ name, mimeType, content }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new TextEncoder().encode(content)], name, { type: mimeType }));
    return dt;
  }, file);
  const target = page.getByTestId(testId);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend(context, planoVacio(), FOOTPRINT);
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
}

test("un DXF soltado sobre el lienzo se carga de fondo y viaja al servidor con su colocación", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await abrirEstudio(context, page);
  const subida = page.waitForRequest(
    (request) => request.method() === "PUT" && /\/dxf$/.test(new URL(request.url()).pathname),
    { timeout: 60_000 },
  );
  await soltarSobre(page, "cad-canvas", {
    name: "planta-cliente.dxf",
    mimeType: "application/dxf",
    content: DXF,
  });
  const body = (await subida).postDataJSON() as {
    name: string;
    data: string;
    placement?: { scale: number; visible: boolean };
  };
  expect(body.name).toBe("planta-cliente.dxf");
  expect(body.data).toBe(DXF);
  expect(body.placement?.visible, "la colocación viaja con la subida, como por el input").toBe(true);
  expect(body.placement?.scale).toBeGreaterThan(0);
  await expect(page.getByTestId("app-toast").filter({ hasText: "Plano DXF cargado de fondo" })).toBeVisible();
});

test("un .dwg soltado sobre el lienzo recibe la frase de la puerta compartida y no viaja", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await abrirEstudio(context, page);
  const subidas: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && /\/dxf$/.test(new URL(request.url()).pathname))
      subidas.push(request.url());
  });
  await soltarSobre(page, "cad-canvas", {
    name: "planta-cliente.dwg",
    mimeType: "application/octet-stream",
    content: `AC1015${"\0".repeat(64)}`,
  });
  await expect(
    page.getByTestId("app-toast").filter({ hasText: "DWG requiere un proveedor con licencia" }),
  ).toBeVisible();
  expect(subidas, "lo que la puerta rechaza no se sube").toEqual([]);
});
