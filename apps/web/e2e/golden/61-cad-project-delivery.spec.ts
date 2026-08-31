import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * Entrega del proyecto: ETRANSMIT y DATAEXTRACTION, tecleados contra el
 * producto real, con el dibujo REAL que Layout3DEditor.tsx ya sostiene — sin
 * tocar ese archivo, que está en su techo exacto (19.002/19.002 líneas).
 *
 * PUBLISH y SHEETSET también se teclean aquí, y también son reales — llegan
 * hasta `plot-host.ts`, que sí sabe publicar y renumerar cuando recibe un
 * conjunto. Lo que este golden fija es la respuesta de HOY: el estudio no le
 * pasa ningún conjunto cargado (BACKLOG P1-8, bloqueado por el mismo techo de
 * `Layout3DEditor.tsx`), así que responden con su límite declarado — nunca un
 * «hecho» vacío. El día que P1-8 se resuelva, este golden es el que hay que
 * reescribir para afirmar el PDF de verdad.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#0000ff", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "wall",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 4000, y: 0, z: 0 },
        thickness: 200,
        height: 2600,
        layer: "MUROS",
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
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 5_000,
    footprintH: 5_000,
    unit: "mm",
    gridSize: 100,
  });
}

async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

test("PUBLISH/SHEETSET declaran su límite; ETRANSMIT y DATAEXTRACTION entregan archivos reales", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  const commandLine = page.getByTestId("cad-command-line");
  await expect(commandLine).toBeVisible();
  const prompt = page.getByTestId("cad-command-prompt");

  /* ── PUBLISH: sin conjunto cargado, declara su límite ────────────────── */
  await type(page, "PUBLISH");
  await expect(prompt).toBeVisible();
  await type(page, "set:nave");
  await expect(prompt).toContainText("Hojas a publicar");
  await type(page, ""); // Intro: todas las hojas
  await expect(prompt).toBeHidden();
  await expect(commandLine).toContainText("set:nave no está cargado en este estudio");

  /* ── SHEETSET Índice: mismo límite, mismo motivo ────────────────────── */
  await type(page, "SHEETSET");
  await type(page, "set:nave");
  await type(page, "I");
  await expect(commandLine).toContainText("set:nave no está cargado en este estudio");

  /* ── DATAEXTRACTION Tabla: inserta una TABLE real con el muro contado ─── */
  await type(page, "DATAEXTRACTION");
  await type(page, "T");
  await type(page, "500,-500");
  await expect(prompt).toBeHidden();
  await saveAndSettle(page, backend);

  {
    const { entities } = backend.snapshot().document;
    const table = entities.find((entity: { type: string }) => entity.type === "table") as
      | { type: "table"; cells: Array<{ text: string }> }
      | undefined;
    expect(table, `el documento guardado tiene que llevar la tabla: ${JSON.stringify(entities)}`).toBeTruthy();
    expect(table!.cells.some((cell) => cell.text === "4.000")).toBe(true);
  }

  /* ── DATAEXTRACTION CSV: un archivo real con las tres tablas ──────────── */
  const csvDownload = page.waitForEvent("download", { timeout: 30_000 });
  await type(page, "DATAEXTRACTION");
  await type(page, "CSV");
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe("cuadro-de-cantidades.csv");
  const csvPath = await csv.path();
  const csvBytes = await readFile(csvPath!);
  const csvText = csvBytes.subarray(3).toString("utf8"); // el BOM va primero
  expect(csvText).toContain("MUROS");
  expect(csvText).toContain("4.000");

  /* ── ETRANSMIT: un ZIP real con el documento y su manifiesto ──────────── */
  const zipDownload = page.waitForEvent("download", { timeout: 30_000 });
  await type(page, "ETRANSMIT");
  await type(page, "entrega-de-obra");
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toBe("entrega-de-obra.zip");
  const zipPath = await zip.path();
  expect(zipPath).toBeTruthy();
  const zipBytes = await readFile(zipPath!);
  expect(zipBytes.byteLength).toBeGreaterThan(100);
  expect(zipBytes[0]).toBe(0x50); // «PK»
  expect(zipBytes[1]).toBe(0x4b);

  // Oráculo externo, best-effort: el `unzip` del sistema, si está instalado.
  const listing = spawnSync("unzip", ["-l", zipPath!], { encoding: "utf8" });
  if (!listing.error && listing.status === 0) {
    expect(listing.stdout).toContain("entrega-de-obra.json");
    expect(listing.stdout).toContain("manifiesto.json");
  }

  await expect(commandLine).toContainText("activo(s) incluido(s)");
});
