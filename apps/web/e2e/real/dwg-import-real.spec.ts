/**
 * Importación DWG AC1015 contra la API real y PostgreSQL — no circular.
 *
 * Diferencia deliberada con `apps/web/e2e/dashboard-dwg-import-beta.spec.ts`
 * (que sigue viviendo en modo GOLDENS, hermético): ese spec usa un `.dwg`
 * generado por el propio `writeDwg` del laboratorio, congelado en base64 —
 * circular por diseño (escritor Valle → lector Valle) — e intercepta TODO
 * `/v1/cad/**`, así que nunca demuestra render, edición ni persistencia
 * real. Este spec:
 *
 *  - Usa DOS `.dwg` REALES del corpus de conformidad admitido
 *    (`valle.fundacional.ac1015.001`, bundle `tool-converted-original`: DXF
 *    de autoría propia convertido a DWG con ODA File Converter 27.1 — NO
 *    generado por `writeDwg`, NO un archivo donado por un tercero. Se
 *    declara así, sin llamarlo "independiente de cliente": ver
 *    `docs/execution/CAMPANA_DWG_PRODUCTO_MAIN_9H.md`).
 *  - No intercepta ninguna ruta: habla con la API NestJS real y PostgreSQL,
 *    exactamente como `e2e/real/studio-real-api.spec.ts`.
 *  - Verifica los tipos/conteos de entidad contra un oráculo DXF independiente
 *    del lector DWG bajo prueba (parseado aquí mismo con una lectura de
 *    grupos de código minimalista, no con el importador DXF del producto).
 *  - Abre Studio, selecciona una entidad importada, edita una propiedad,
 *    guarda, cierra sesión, inicia una nueva sesión y confirma que la edición
 *    persistió en PostgreSQL — no sólo que cambió la URL.
 *
 * Por qué DOS fixtures y no uno: `08-plano-mini.dwg` es el más rico (8
 * entidades de 4 tipos, incluye dos TEXT) y se usa para la verificación de
 * import/decodificación (test 2) — incluido el contenido de sus dos TEXT,
 * verificado contra la API. Pero un documento con una entidad `type:"text"`
 * NUNCA puede completar el ciclo seleccionar→editar→guardar en Studio hoy:
 * es un hallazgo real de esta campaña, no un bug de esta prueba ni de DWG
 * (`type:"text"` nunca se registró como `CadNativeEntity` para NINGÚN
 * formato, y el intento de guardado dispara además una corrupción de capa
 * separada al pasar por el snapshot del editor legado — los dos hallazgos
 * están documentados en detalle en
 * `docs/execution/CAMPANA_DWG_PRODUCTO_MAIN_9H.md`, sección 5.6). Así que la
 * prueba de selección/edición/guardado/recarga (tests 3-5) usa
 * `04-capas.dwg` — igual de real, igual de verificado contra su propio
 * oráculo DXF, del mismo bundle admitido — que no tiene ningún TEXT y por
 * tanto no pisa ese hallazgo separado.
 *
 * Requiere `E2E_REAL_API=1`, la API real, PostgreSQL 16, el servidor de Next
 * con `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true`, y `VALLE_DWG_CORPUS_MIRROR`
 * apuntando a un clon local de `valle-design-dwg-conformance` — sin él el
 * spec se salta (nunca se copia el fixture al árbol de `valle-design`: sus
 * términos de redistribución lo restringen a ese repositorio privado).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });

const corpusMirror = process.env.VALLE_DWG_CORPUS_MIRROR;
const bundleDir = corpusMirror
  ? join(corpusMirror, "bundles", "valle.fundacional.ac1015.001")
  : undefined;
const fixturePath = bundleDir ? join(bundleDir, "fixtures", "08-plano-mini.dwg") : undefined;
const oraclePath = bundleDir ? join(bundleDir, "oracles", "dxf", "08-plano-mini.dxf") : undefined;
// Sin TEXT (ver docblock arriba): 5 LINE + 1 CIRCLE reales en 6 capas.
const fixturePath2 = bundleDir ? join(bundleDir, "fixtures", "04-capas.dwg") : undefined;
const oraclePath2 = bundleDir ? join(bundleDir, "oracles", "dxf", "04-capas.dxf") : undefined;

test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);
test.skip(
  process.env.NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA !== "true",
  "Requiere NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true en el servidor de Next.",
);
test.skip(
  !corpusMirror ||
    !fixturePath ||
    !existsSync(fixturePath) ||
    !oraclePath ||
    !existsSync(oraclePath) ||
    !fixturePath2 ||
    !existsSync(fixturePath2) ||
    !oraclePath2 ||
    !existsSync(oraclePath2),
  "Requiere VALLE_DWG_CORPUS_MIRROR apuntando a un clon local de " +
    "valle-design-dwg-conformance con el bundle valle.fundacional.ac1015.001 " +
    "(fixtures 08-plano-mini y 04-capas).",
);

/**
 * Oráculo independiente: cuenta entidades de MODEL SPACE por tipo leyendo
 * pares de código de grupo DXF a mano. Deliberadamente NO usa
 * `apps/web/src/lib/cad/dxf-import.ts` (el importador DXF del producto) —
 * si el oráculo y el lector bajo prueba compartieran código, una entidad mal
 * contada en los dos a la vez pasaría desapercibida.
 */
function countModelSpaceEntitiesByType(dxfText: string): Record<string, number> {
  const lines = dxfText.split(/\r?\n/).map((line) => line.trim());
  const counts: Record<string, number> = {};
  let inEntities = false;
  let currentSection = "";
  for (let index = 0; index < lines.length - 1; index += 1) {
    const code = lines[index];
    const value = lines[index + 1];
    if (code === "2" && (value === "ENTITIES" || value === "BLOCKS" || value === "TABLES")) {
      currentSection = value;
    }
    if (code === "0" && value === "ENDSEC") currentSection = "";
    inEntities = currentSection === "ENTITIES";
    if (inEntities && code === "0" && value !== "ENDSEC" && value !== "SEQEND" && value !== "VERTEX") {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

test.describe("importación DWG AC1015 real contra PostgreSQL (no circular)", () => {
  let context: BrowserContext;
  let page: Page;
  let email: string;
  let runId: string;
  let organizationId: string;
  let projectId: string;
  let importedDocumentId: string;
  let importedDocumentId2: string;
  let savedEndX = "";

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(120_000);
    runId = `${browserName}-dwg-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.e2e.dwg.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
    page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.stack ?? err.message}`));
    page.on("requestfailed", (req) =>
      console.log(`[requestfailed] ${req.method()} ${req.url()} ${req.failure()?.errorText}`),
    );
    page.on("request", (req) => {
      if (req.url().includes("/v1/cad/")) console.log(`[request] ${req.method()} ${req.url()}`);
    });
    page.on("response", (res) => {
      if (res.url().includes("/v1/cad/")) {
        console.log(`[response] ${res.status()} ${res.request().method()} ${res.url()}`);
        if (res.status() >= 400) {
          res
            .text()
            .then((body) => console.log(`[response body ${res.status()}] ${body.slice(0, 2000)}`))
            .catch(() => {});
        }
      }
    });
    // `Worker` (a diferencia de `Page`) sólo expone el evento "close" en
    // Playwright 1.56 — no hay forma soportada de capturar su consola desde
    // aquí. Esta línea sólo confirma que el chunk del worker de import
    // llegó a crearse, no lo que imprime dentro.
    page.on("worker", (worker) => {
      console.log(`[worker created] ${worker.url()}`);
    });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1: registra, verifica e inicia sesión por el harness real; crea organización", async () => {
    test.setTimeout(120_000);
    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Valle E2E DWG");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);

    const verification = await latestCapturedEmail(context.request, email);
    expect(verification.template).toBe("identity.verify-email");
    const verificationToken = capturedToken(verification);
    // La verificación se envía sola al montar con un token válido en la URL
    // (sin botón que pulsar): verificado empíricamente contra el servidor
    // real antes de fijar esta aserción.
    await page.goto(`/verify-email?token=${encodeURIComponent(verificationToken)}`);
    await expect(page.getByRole("status")).toContainText(/correo qued.* verificado/iu, {
      timeout: 30_000,
    });

    await page.goto("/login?returnTo=/dashboard");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);

    const organizationName = `Valle E2E DWG ${runId}`;
    // El slug se genera solo a partir del nombre en la UI actual (verificado
    // empíricamente: ya no hay campo de slug separado).
    await page.getByLabel("Nombre del despacho").fill(organizationName);
    const creation = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/organizations` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Crear organización" }).click();
    const created = await (await creation).json();
    organizationId = created.id;
    expect(organizationId).toBeTruthy();
  });

  test("2: crea proyecto e importa el .dwg real por el picker del dashboard", async () => {
    test.setTimeout(300_000);
    const projectName = `Proyecto DWG ${runId}`;
    await page.getByLabel("Nombre del proyecto").fill(projectName);
    await page.getByLabel("Crear proyecto").click();
    await expect
      .poll(async () => {
        const response = await apiGet<{ items: Array<{ id: string; name: string }> }>(
          context,
          `/v1/cad/projects?q=${encodeURIComponent(projectName)}&limit=20`,
        );
        return response.body.items.filter((item) => item.name === projectName);
      })
      .toHaveLength(1);
    const projectPage = await apiGet<{ items: Array<{ id: string; name: string }> }>(
      context,
      `/v1/cad/projects?q=${encodeURIComponent(projectName)}&limit=20`,
    );
    projectId = projectPage.body.items.find((item) => item.name === projectName)!.id;
    await expect(page.getByLabel("Proyecto", { exact: true })).toHaveValue(projectId);

    const dwgBytes = readFileSync(fixturePath!);
    const dwgInput = page.locator('input[type="file"][accept*=".dwg"]');
    await expect(dwgInput).toBeAttached();
    await dwgInput.setInputFiles({
      name: `plano-mini-${runId}.dwg`,
      mimeType: "application/octet-stream",
      buffer: dwgBytes,
    });
    // Oráculo independiente: cuántas entidades de model space declara el DXF
    // fuente, sin pasar por el lector DWG ni por el importador DXF del
    // producto.
    const oracleCounts = countModelSpaceEntitiesByType(readFileSync(oraclePath!, "utf8"));
    const oracleModelSpaceCount = Object.values(oracleCounts).reduce((a, b) => a + b, 0);
    expect(oracleModelSpaceCount).toBeGreaterThan(0);

    // Primera compilación bajo demanda (Turbopack, modo dev) del chunk del
    // worker + códec DWG puede tardar bastante más que un import ya
    // calentado: margen amplio deliberado, no un límite de producto.
    await expect(page.getByRole("status")).toContainText(
      new RegExp(`Importado: ${oracleModelSpaceCount} entidades`, "iu"),
      { timeout: 45_000 },
    );

    const importedPage = await apiGet<{
      items: Array<{ id: string; name: string; cadDocumentVersion: number }>;
    }>(context, `/v1/cad/documents?q=${encodeURIComponent(`plano-mini-${runId}`)}&limit=20`);
    const imported = importedPage.body.items[0];
    expect(imported).toBeTruthy();
    importedDocumentId = imported.id;

    // El manifiesto de pérdidas persiste con el documento (Fase 3): la
    // unidad asumida se declara SIEMPRE, y las banderas de estado crudas de
    // cada capa (valor 1008 en este fixture real, verificado empíricamente
    // antes de escribir esta prueba) también.
    const opened = await apiGet<{
      cadDocument: {
        lossManifest: Array<{ code: string; detail: string }>;
        entities: Array<{ id: string; type: string; text?: string }>;
      } | null;
    }>(context, `/v1/cad/documents/${importedDocumentId}`);
    const lossManifest = opened.body.cadDocument?.lossManifest ?? [];
    expect(lossManifest.some((entry) => entry.code === "dwg_unit_assumed")).toBe(true);
    expect(lossManifest.some((entry) => entry.code === "dwg_layer_state_flags_unmapped")).toBe(
      true,
    );

    // Los dos TEXT del fixture ("SALA", "COCINA") se verifican aquí, contra la
    // API/PostgreSQL, y NO seleccionándolos en el lienzo de Studio: `type:
    // "text"` (a diferencia de `"mtext"`) nunca fue registrado como
    // `CadNativeEntity` (`entity-runtime.ts`, arreglo de adaptadores) — no
    // tiene renderer/hitTester/grips/properties, así que NINGÚN formato lo
    // hace seleccionable hoy (`dxf-import.ts` colapsa TEXT y MTEXT al mismo
    // `kind:"text"`, así que un DXF con un TEXT plano cae en el mismo hueco).
    // No es un bug de DWG ni de esta importación: es un hueco general y
    // previo del producto, hallado por esta prueba real por ser la primera
    // en intentar seleccionar una entidad `text` en un Studio realmente
    // renderizado. Registrado en `docs/execution/CAMPANA_DWG_PRODUCTO_MAIN_9H.md`;
    // implementar el adaptador que faltaría es una función nueva de alcance
    // general, no un fix quirúrgico de esta campaña de DWG.
    const textEntities = (opened.body.cadDocument?.entities ?? []).filter(
      (entity) => entity.type === "text",
    );
    expect(textEntities.map((entity) => entity.text).sort()).toEqual(["COCINA", "SALA"]);
  });

  test("2b: importa un segundo .dwg real (04-capas, sin TEXT) para la prueba de edición", async () => {
    test.setTimeout(300_000);
    // Mismo proyecto que el test 2: sólo cambia el archivo. Nombre distinto
    // ("capas-…") para que el filtro por nombre de la consulta siguiente no
    // pueda confundirlo con el import de "plano-mini-…".
    const dwgBytes = readFileSync(fixturePath2!);
    const dwgInput = page.locator('input[type="file"][accept*=".dwg"]');
    await expect(dwgInput).toBeAttached();
    await dwgInput.setInputFiles({
      name: `capas-${runId}.dwg`,
      mimeType: "application/octet-stream",
      buffer: dwgBytes,
    });
    const oracleCounts = countModelSpaceEntitiesByType(readFileSync(oraclePath2!, "utf8"));
    const oracleModelSpaceCount = Object.values(oracleCounts).reduce((a, b) => a + b, 0);
    expect(oracleModelSpaceCount).toBeGreaterThan(0);
    expect(oracleCounts.TEXT ?? 0).toBe(0);

    await expect(page.getByRole("status")).toContainText(
      new RegExp(`Importado: ${oracleModelSpaceCount} entidades`, "iu"),
      { timeout: 45_000 },
    );

    const importedPage = await apiGet<{
      items: Array<{ id: string; name: string }>;
    }>(context, `/v1/cad/documents?q=${encodeURIComponent(`capas-${runId}`)}&limit=20`);
    const imported = importedPage.body.items[0];
    expect(imported).toBeTruthy();
    importedDocumentId2 = imported.id;
  });

  test("3: abre en Studio, renderiza geometría concreta y selecciona una entidad importada", async () => {
    test.setTimeout(120_000);
    await page.getByRole("button", { name: "Abrir documento importado" }).click();
    await expect(page).toHaveURL(new RegExp(`/studio/${importedDocumentId2}$`, "u"));

    const dwgEntities = page.locator('[data-testid^="cad-native-entity-dwg:"]');
    await expect(dwgEntities.first()).toBeVisible({ timeout: 120_000 });
    const entityCount = await dwgEntities.count();
    expect(entityCount).toBeGreaterThanOrEqual(6);

    // Selecciona una LINE real por su id nativo: `dwg:entity:000000` es la
    // LINE de la capa MUROS ((0,0)→(50,0)) de este fixture, verificado
    // empíricamente antes de fijar esta aserción.
    const line = page.getByTestId("cad-native-entity-dwg:entity:000000");
    await expect(line).toBeVisible({ timeout: 30_000 });
    await line.click();
  });

  test("4: edita una propiedad geométrica real y la guarda por CAS", async () => {
    test.setTimeout(120_000);
    const endXField = page.getByTestId("cad-native-property-endX");
    await expect(endXField).toBeVisible({ timeout: 15_000 });
    const before = await endXField.inputValue();
    savedEndX = String(Number(before) + 3);

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === `${API_ORIGIN}/v1/cad/documents/${importedDocumentId2}/content` &&
        response.ok(),
      { timeout: 60_000 },
    );
    await endXField.fill(savedEndX);
    await endXField.blur();
    await page.getByTestId("cad-save").click();
    await saveResponse;

    await expect
      .poll(
        async () => {
          const reopened = await apiGet<{
            cadDocument: { entities: Array<{ type: string; end?: { x: number } }> } | null;
          }>(context, `/v1/cad/documents/${importedDocumentId2}`);
          return reopened.body.cadDocument?.entities.some(
            (entity) => entity.type === "line" && String(entity.end?.x) === savedEndX,
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  test("5: cierra sesión, abre una NUEVA sesión y confirma que la edición persistió en PostgreSQL", async () => {
    test.setTimeout(120_000);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Cerrar sesi.*n/iu }).click();
    await expect
      .poll(async () => (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status())
      .toBe(401);

    await page.goto("/login?returnTo=/dashboard");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/Contrase.*a/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId },
      headers: { "x-csrf-token": (await context.cookies(API_ORIGIN)).find((c) => c.name === "valle_csrf")!.value },
    });

    await page.goto(`/studio/${importedDocumentId2}`);
    const line = page.getByTestId("cad-native-entity-dwg:entity:000000");
    await expect(line).toBeVisible({ timeout: 60_000 });
    await line.click();
    await expect(page.getByTestId("cad-native-property-endX")).toHaveValue(savedEndX, {
      timeout: 15_000,
    });

    // No "cambió la URL": lectura directa a la API real, que a su vez lee
    // PostgreSQL — sin caché de navegador de por medio.
    const persisted = await apiGet<{
      cadDocument: { entities: Array<{ type: string; end?: { x: number } }> } | null;
    }>(context, `/v1/cad/documents/${importedDocumentId2}`);
    expect(
      persisted.body.cadDocument?.entities.some(
        (entity) => entity.type === "line" && String(entity.end?.x) === savedEndX,
      ),
    ).toBe(true);
  });
});
