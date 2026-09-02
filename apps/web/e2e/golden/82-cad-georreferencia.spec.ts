import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { buildDbfBytes, buildShapefileBytes } from "../../src/lib/geo/fixtures";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * OLA G — el dibujo sabe dónde está y el predio entra en su sitio, todo
 * TECLEADO, y todo llega al servidor.
 *
 * Medido el 2026-09-01 (distancia-autocad-completo-20260901.md, §4 3º MAP
 * 3D): ningún dibujo sabía dónde estaba y un shapefile sólo entraba como
 * documento nuevo. Aquí, con el lienzo enfocado:
 *
 *   GEO ⏎ · 0,0 ⏎ · 660000 ⏎ · 2140000 ⏎   → marcador GEO: (0,0) = E 660 000 N 2 140 000 en 14N
 *   ID ⏎ · 1000,1000 ⏎                      → «E 660,001.00 N 2,140,001.00 · 19.3477° N, 97.4767° O»
 *   MAPIMPORT ⏎ · ⏎ (selector) · ⏎          → el predio 14N del .shp cae en (10 000, 10 000) mm con su CLAVE
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: el marcador POINT en GEO
 * con su receta en metadatos, y la polilínea cerrada en PREDIO con la fila
 * del .dbf en metadatos, en las coordenadas que la georreferencia manda.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 9, unit: "mm", linetypeScale: 1000 },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
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

/** Teclea con el lienzo enfocado: la primera tecla enfoca la caja, Intro devuelve el foco. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await expect(input).not.toBeFocused();
  if (value) await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(input).not.toBeFocused();
}

const prompt = (page: Page) => page.getByTestId("cad-command-prompt");
const log = (page: Page) => page.getByTestId("cad-command-line-log");
const count = (page: Page) => page.getByTestId("cad-native-document-count");

const PRJ_UTM14_WGS84 =
  'PROJCS["WGS_1984_UTM_Zone_14N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",-99.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

/** El conjunto del predio: 40 × 30 m en 14N, anillo horario como manda ESRI, con su tabla. */
function predioFiles() {
  const shapefile = buildShapefileBytes(5, [
    { parts: [0], points: [{ x: 660_010, y: 2_140_010 }, { x: 660_010, y: 2_140_040 }, { x: 660_050, y: 2_140_040 }, { x: 660_050, y: 2_140_010 }, { x: 660_010, y: 2_140_010 }] },
  ]);
  const dbf = buildDbfBytes([{ name: "CLAVE", type: "C", length: 12 }, { name: "USO", type: "C", length: 10 }], [["14-039-001", "HABITACION"]]);
  const file = (name: string, bytes: Uint8Array) => ({ name, mimeType: "application/octet-stream", buffer: Buffer.from(bytes) });
  return [
    file("predio.shp", shapefile.shp),
    file("predio.shx", shapefile.shx),
    file("predio.dbf", dbf),
    file("predio.prj", new TextEncoder().encode(PRJ_UTM14_WGS84)),
    file("predio.cpg", new TextEncoder().encode("UTF-8")),
  ];
}

test("GEOGRAPHICLOCATION, ID y MAPIMPORT tecleados: el marcador y el predio en su sitio llegan al servidor con sus metadatos", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, seedDocument(), { footprintW: 60_000, footprintH: 50_000, unit: "mm", gridSize: 100 });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(count(page)).toHaveText("Native 0");

  // --- la georreferencia, por el alias de acad.pgp -------------------------------
  await type(page, "GEO");
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText("WGS84 / UTM zona 14N. Precise el punto del dibujo que va a georreferenciar");
  await type(page, "0,0");
  await expect(prompt(page)).toContainText("Precise el Este UTM de ese punto en metros");
  await type(page, "660000");
  await expect(prompt(page)).toContainText("Precise el Norte UTM en metros");
  await type(page, "2140000");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 1");
  await expect(log(page)).toContainText("GEOGRAPHICLOCATION: el punto (0, 0) es E 660000.00 N 2140000.00 en WGS 84 / UTM zona 14N (EPSG:32614); 19.3477° N, 97.4768° O. El marcador está en la capa GEO.");

  // --- ID dice el mundo ----------------------------------------------------------
  await type(page, "ID");
  await expect(prompt(page)).toBeVisible();
  await type(page, "1000,1000");
  await expect(prompt(page)).toBeHidden();
  await expect(log(page)).toContainText("E 660,001.00 N 2,140,001.00 · 19.3477° N, 97.4767° O (WGS 84 / UTM zona 14N, EPSG:32614)");

  // --- el predio, por el selector de archivos del navegador -----------------------
  await type(page, "MAPIMPORT");
  await expect(prompt(page)).toContainText("Elige los archivos del conjunto");
  const chooser = page.waitForEvent("filechooser");
  await type(page, "");
  await (await chooser).setFiles(predioFiles());
  await expect(prompt(page)).toContainText("«predio.shp»: 1 entidad(es) → capa PREDIO");
  await expect(prompt(page)).toContainText("WGS 84 / UTM zona 14N (EPSG:32614)");
  await expect(prompt(page)).toContainText("2 atributo(s) por entidad en metadatos: CLAVE, USO");
  await expect(prompt(page)).toContainText("¿Importar?");
  await type(page, "");
  await expect(prompt(page)).toBeHidden();
  await expect(count(page)).toHaveText("Native 2");
  await expect(log(page)).toContainText("MAPIMPORT: 1 entidad(es) de «predio.shp» en la capa PREDIO (EPSG:32614); colocadas con la georreferencia del dibujo.");

  // --- lo que el servidor recibió -------------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document;
  expect(saved.layers.map((layer) => layer.name)).toEqual(expect.arrayContaining(["GEO", "PREDIO"]));
  const marker = saved.entities.find((entity) => entity.type === "point" && entity.layer === "GEO");
  expect(marker?.context?.metadata).toEqual({ geo: "marker", crs: "EPSG:32614", east: 660_000, north: 2_140_000 });
  const predio = saved.entities.find((entity): entity is Extract<CadEntity, { type: "polyline" }> => entity.type === "polyline" && entity.layer === "PREDIO");
  expect(predio, "la polilínea del predio").toBeTruthy();
  expect(predio!.closed).toBe(true);
  expect(predio!.vertices).toEqual([{ x: 10_000, y: 10_000, z: 0 }, { x: 10_000, y: 40_000, z: 0 }, { x: 50_000, y: 40_000, z: 0 }, { x: 50_000, y: 10_000, z: 0 }]);
  expect(predio!.context?.metadata).toEqual({ CLAVE: "14-039-001", USO: "HABITACION" });
});
