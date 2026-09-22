/**
 * DWG sintético admitido → picker → API real → edición → nueva sesión.
 * Sin interceptores, escritor Valle ni copias del corpus en el producto.
 * El consumidor verifica commit, manifiestos y hashes antes de entregar bytes.
 * Requiere una build con la beta base ya habilitada y un espejo del corpus;
 * este spec no activa banderas. Su origen es tool-converted-original, no cliente.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import { E2E_PASSWORD, apiGet, capturedToken, latestCapturedEmail } from "../fixtures/first-party";
import { abrirPanelDerecho } from "../fixtures/docks";
import type { CadDocument } from "../../src/lib/cad/cad-document";

test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_REAL_API !== "1", "Requiere API real y PostgreSQL aislado.");

type OracleEntity = { kind: string; layer: string; fields: { start: number[]; end: number[]; center: number[]; radius: number } };
type Sample = { bytes: Buffer; source: OracleEntity[]; sha256: string; commit: string };
let readSample: (version: string, stem: string) => Sample;
const versions = [
  "AC1015",
  ...(process.env.NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA === "true" ? ["AC1018"] : []),
  ...(process.env.NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA === "true" ? ["AC1024", "AC1027", "AC1032"] : []),
];

async function readDocument(context: BrowserContext, id: string) {
  const result = await apiGet<{ cadDocument: CadDocument; cadDocumentVersion: number }>(context, `/v1/cad/documents/${id}`);
  expect(result.status).toBe(200);
  return result.body;
}

async function login(page: Page, email: string) {
  await page.goto("/login?returnTo=/dashboard");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/dashboard"),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
}

test.describe("DWG de entrega con persistencia real y rechazo honesto", () => {
  let context: BrowserContext;
  let page: Page;
  let email: string;
  let run: string;

  test.beforeAll(async ({ browser, browserName }, info) => {
    info.setTimeout(180_000);
    expect(process.env.NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA, "la build bajo prueba debe llevar la beta base; no se activa desde el spec").toBe("true");
    expect(process.env.VALLE_DWG_CORPUS_MIRROR, "se requiere el espejo admitido, no un fixture del writer").toBeTruthy();
    // Node ejecuta los módulos ESM del gate sin el transformador CJS de
    // Playwright. Sólo pasan por stdout las muestras ya verificadas, en memoria.
    const verified = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { loadCorpusPin, resolveCorpusSource, fetchAdmittedCorpus } from './scripts/dwg/corpus-consumer.mjs';
      import { parseOracleDxf, expectedFromOracle } from './scripts/dwg/dxf-oracle.mjs';
      const pin = loadCorpusPin();
      const { transport } = resolveCorpusSource({ pin });
      if (!transport) throw new Error('Corpus admitido no disponible');
      const corpus = fetchAdmittedCorpus({ pin, transport });
      const samples = {};
      for (const bundle of corpus.bundles) for (const stem of ['04-capas', '01-vacio']) {
        const fixture = bundle.artifacts.find(a => a.path.endsWith('/fixtures/' + stem + '.dwg'));
        if (!fixture) continue;
        const oracle = bundle.artifacts.find(a => a.path.endsWith('/oracles/dxf/' + stem + '.dxf'));
        if (!oracle) throw new Error('Falta DXF fuente independiente');
        samples[bundle.dwgVersion + '/' + stem] = {
          bytes: transport.readFile(pin.commit, fixture.path).toString('base64'),
          source: parseOracleDxf(transport.readFile(pin.commit, oracle.path).toString('utf8')).topEntities.map(expectedFromOracle),
          sha256: fixture.sha256, commit: pin.commit
        };
      }
      process.stdout.write(JSON.stringify(samples));
    `], { cwd: resolve(__dirname, "../../../.."), encoding: "utf8", maxBuffer: 2 * 1024 * 1024 })) as Record<string, Omit<Sample, "bytes"> & { bytes: string }>;
    readSample = (version, stem) => {
      const sample = verified[`${version}/${stem}`];
      if (!sample) throw new Error(`No existe muestra admitida ${version}/${stem}`);
      return { ...sample, bytes: Buffer.from(sample.bytes, "base64") };
    };

    run = `${browserName}-${Date.now().toString(36)}-${info.workerIndex}`;
    email = `release-dwg-${run}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Prueba sintética DWG");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await page.getByText(/^Acepto los/).click();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);
    const verification = await latestCapturedEmail(context.request, email);
    await page.goto(`/verify-email?token=${encodeURIComponent(capturedToken(verification))}`);
    await expect(page.getByRole("status")).toContainText(/correo qued.* verificado/iu);
    await login(page, email);
    await page.getByLabel("Nombre del despacho").fill(`DWG sintético ${run}`);
    await page.getByRole("button", { name: "Crear organización" }).click();
    await expect(page.getByLabel("Nombre del proyecto")).toBeVisible();
    await page.getByLabel("Nombre del proyecto").fill("Corpus admitido sin validez constructiva");
    await page.getByLabel("Crear proyecto").click();
    await expect(page.getByLabel("Nombre del documento")).toBeVisible();
  });

  test.afterAll(async () => { await context?.close(); });

  test.afterEach(async ({}, info) => {
    await writeFile(info.outputPath("medicion.json"), JSON.stringify({
      task: info.title, browser: info.project.name, status: info.status,
      durationMs: info.duration, retry: info.retry,
      scope: "Ejecución sintética automatizada hasta afterEach; corpus tool-converted-original.",
    }, null, 2));
  });

  for (const version of versions) {
    test(`${version}: importa capas, edita LINE, guarda y reabre con pérdidas conservadas`, async ({}, info) => {
      test.setTimeout(240_000);
      const sample = readSample(version, "04-capas");
      const source = sample.source;
      expect(source).toHaveLength(6);
      const name = `capas-${version}-${run}`;
      await page.goto("/dashboard");
      const picker = page.getByTestId("dashboard-import-input");
      await expect(picker).toHaveAttribute("accept", /\.dwg/u);
      await picker.setInputFiles({ name: `${name}.dwg`, mimeType: "application/octet-stream", buffer: sample.bytes });
      await expect(page.getByRole("status").filter({ hasText: "Importado:" })).toContainText("Importado: 6 entidades y 0 bloques", { timeout: 90_000 });
      const warnings = page.locator("summary").filter({ hasText: "advertencias de interoperabilidad" });
      await expect(warnings).toBeVisible();
      await warnings.click();
      const listed = await apiGet<{ items: Array<{ id: string; name: string }> }>(context, `/v1/cad/documents?q=${encodeURIComponent(name)}&limit=20`);
      const imported = listed.body.items.find((item) => item.name === name);
      expect(imported).toBeDefined();
      const id = imported!.id;
      const initial = await readDocument(context, id);
      expect(initial.cadDocument.entities).toHaveLength(source.length);
      expect(initial.cadDocument.blocks).toHaveLength(0);
      expect(initial.cadDocument.lossManifest.some((loss) => loss.code === "dwg_unit_assumed")).toBe(true);
      // El oráculo lee DXF; no comparte decodificación ni puente con el DWG.
      for (const expected of source) {
        const actual = initial.cadDocument.entities.find((entity) => entity.type === expected.kind && entity.layer === expected.layer);
        expect(actual, `${expected.kind} en ${expected.layer}`).toBeDefined();
        if (actual?.type === "line") {
          for (const point of ["start", "end"] as const) {
            for (const [index, axis] of (["x", "y", "z"] as const).entries()) expect(Math.abs(actual[point][axis] - expected.fields[point][index])).toBeLessThanOrEqual(1e-6);
          }
        } else if (actual?.type === "circle") {
          expect(Math.abs(actual.radius - expected.fields.radius)).toBeLessThanOrEqual(1e-6);
          for (const [index, axis] of (["x", "y", "z"] as const).entries()) expect(Math.abs(actual.center[axis] - expected.fields.center[index])).toBeLessThanOrEqual(1e-6);
        }
      }
      const line = initial.cadDocument.entities.find((entity) => entity.type === "line" && entity.layer === "MUROS");
      if (!line || line.type !== "line") throw new Error("La línea de MUROS falta");
      const targetEndX = String(line.end.x + 3);
      await page.getByRole("button", { name: "Abrir documento importado" }).click();
      await expect(page.getByTestId("cad-command-input")).toBeVisible({ timeout: 90_000 });
      const tour = page.getByTestId("cad-guided-tour-skip");
      if (await tour.isVisible()) await tour.click();
      await abrirPanelDerecho(page);
      await page.getByTestId(`cad-native-entity-${line.id}`).click();
      const endX = page.getByTestId("cad-native-property-endX");
      await expect(endX).toBeVisible();
      await endX.fill(targetEndX);
      await endX.blur();
      await page.getByTestId("cad-save").click();
      await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", { timeout: 30_000 });
      await expect.poll(async () => (await readDocument(context, id)).cadDocumentVersion).toBeGreaterThan(initial.cadDocumentVersion);
      const saved = await readDocument(context, id);
      const savedLine = saved.cadDocument.entities.find((entity) => entity.id === line.id);
      expect(savedLine?.type === "line" && savedLine.end.x === Number(targetEndX)).toBe(true);
      expect(saved.cadDocument.lossManifest).toEqual(initial.cadDocument.lossManifest);
      await info.attach(`procedencia-${version}`, { contentType: "application/json", body: JSON.stringify({ commit: sample.commit, sha256: sample.sha256, origin: "tool-converted-original", lossManifest: saved.cadDocument.lossManifest }) });
      // Una nueva sesión elimina el documento en memoria del navegador.
      await page.goto("/dashboard");
      await page.getByRole("button", { name: /Cerrar sesi/iu }).click();
      await expect.poll(async () => (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status()).toBe(401);
      await login(page, email);
      // La nueva sesión empieza sin despacho activo. El usuario elige su
      // organización antes de abrir un documento protegido por su entitlement.
      const organization = page.getByTestId(/^organization-open-/u);
      await expect(organization).toHaveCount(1);
      await organization.click();
      await expect(page.getByLabel("Nombre del proyecto")).toBeVisible();
      await page.goto(`/studio/${id}`);
      await abrirPanelDerecho(page);
      await page.getByTestId(`cad-native-entity-${line.id}`).click();
      await expect(page.getByTestId("cad-native-property-endX")).toHaveValue(targetEndX);
      const reopened = await readDocument(context, id);
      expect(reopened.cadDocument.entities).toEqual(saved.cadDocument.entities);
      expect(reopened.cadDocument.lossManifest).toEqual(saved.cadDocument.lossManifest);
      await writeFile(info.outputPath(`procedencia-${version}.json`), JSON.stringify({
        commit: sample.commit, sha256: sample.sha256, origin: "tool-converted-original",
        lossManifest: reopened.cadDocument.lossManifest,
        cadDocument: reopened.cadDocument,
      }, null, 2));
      await page.screenshot({ path: info.outputPath(`dwg-${version}-reabierto.png`) });
    });
  }

  test("DWG vacío y archivo truncado no crean documento ni anuncian éxito", async () => {
    test.setTimeout(120_000);
    const empty = readSample("AC1015", "01-vacio");
    for (const [label, bytes] of [["vacio", empty.bytes], ["truncado", Buffer.from("AC1015", "ascii")]] as const) {
      await page.goto("/dashboard");
      const name = `rechazo-${label}-${run}`;
      await page.getByTestId("dashboard-import-input").setInputFiles({ name: `${name}.dwg`, mimeType: "application/octet-stream", buffer: bytes });
      await expect(page.getByRole("alert").filter({ hasText: label === "vacio" ? /ninguna.*importable/iu : /AC1015.*dañado.*estructura interna/iu })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("status").filter({ hasText: "Importado:" })).toHaveCount(0);
      const listed = await apiGet<{ items: Array<{ name: string }> }>(context, `/v1/cad/documents?q=${encodeURIComponent(name)}&limit=20`);
      expect(listed.status).toBe(200);
      expect(listed.body.items).toHaveLength(0);
    }
  });
});
