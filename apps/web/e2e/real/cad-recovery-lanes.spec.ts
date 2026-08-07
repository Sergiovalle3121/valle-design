/**
 * Recuperación local con DOS PESTAÑAS, contra la API real y PostgreSQL.
 *
 * Lo que se mide aquí no se puede medir en un unit test: el journal vive en
 * IndexedDB, los carriles se derivan de `sessionStorage` (uno por pestaña) y el
 * borrado lo dispara un guardado real que cambia la versión CAS en el servidor.
 *
 * Los dos defectos que cubre:
 *
 *   1. Guardar en la pestaña A borraba el ÁMBITO entero del journal, así que se
 *      llevaba por delante los checkpoints de la pestaña B — que ni había
 *      guardado y cuyo trabajo sólo existía ahí.
 *
 *   2. Al abrir, un borrador cuya versión base no coincidía con la del servidor
 *      se BORRABA. Bastaba con que otra sesión guardase para destruir trabajo
 *      local. Eso es una rama, no basura.
 *
 * Dos páginas del MISMO contexto comparten IndexedDB (mismo origen) pero tienen
 * `sessionStorage` propio, que es exactamente la topología del defecto: mismo
 * journal, carriles distintos.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import { E2E_PASSWORD, apiGet, apiPost, apiPut, csrfHeaders } from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/**
 * Espera holgada para el primer checkpoint, que el editor programa a 3 s.
 *
 * Para que exista un checkpoint tiene que haber trabajo que NO llegue al
 * servidor: con autosave sano (2 s) el editor limpia `dirty` antes de los 3 s y
 * el journal se queda vacío, que es justo lo que debe pasar. Aquí el trabajo se
 * queda local porque un TERCER escritor mueve la versión por debajo y el
 * autosave recibe un 409 real — sin interceptar nada.
 */
const FIRST_CHECKPOINT_MS = 3_000;

interface JournalRow {
  key: string;
  scopeKey: string;
  lane?: string;
  savedAtMs: number;
  editGeneration?: number;
  baseCadDocumentVersion: number;
}

function canonicalDocument(radius = 120) {
  return {
    meta: { version: 1, schema: 3, unit: "mm", footprintW: 12_000, footprintH: 10_000, gridSize: 100 },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "REAL", name: "REAL", color: "#60a5fa", visible: true, locked: false },
    ],
    entities: [
      {
        id: "real-arc",
        type: "arc",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius,
        startAngle: 0,
        endAngle: 180,
        layer: "REAL",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["real-arc"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** Lee el journal de recuperación DIRECTAMENTE de IndexedDB en esa pestaña. */
async function readJournal(page: Page): Promise<JournalRow[]> {
  return page.evaluate(
    () =>
      new Promise<JournalRow[]>((resolve) => {
        const request = indexedDB.open("cad-recovery");
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("journal")) {
            database.close();
            resolve([]);
            return;
          }
          const all = database
            .transaction("journal", "readonly")
            .objectStore("journal")
            .getAll();
          all.onerror = () => {
            database.close();
            resolve([]);
          };
          all.onsuccess = () => {
            const rows = (all.result as Record<string, unknown>[]).map((row) => ({
              key: String(row.key),
              scopeKey: String(row.scopeKey),
              lane: row.lane === undefined ? undefined : String(row.lane),
              savedAtMs: Number(row.savedAtMs),
              editGeneration:
                row.editGeneration === undefined ? undefined : Number(row.editGeneration),
              baseCadDocumentVersion: Number(row.baseCadDocumentVersion),
            }));
            database.close();
            resolve(rows);
          };
        };
      }),
  );
}

/** Un TERCER escritor mueve la versión del servidor por debajo de las pestañas. */
async function thirdWriterAdvances(
  context: BrowserContext,
  documentId: string,
  radius: number,
): Promise<number> {
  const current = await apiGet<{ cadDocumentVersion: number }>(
    context,
    `/v1/cad/documents/${documentId}`,
  );
  const written = await apiPut<Record<string, unknown>>(
    context,
    `/v1/cad/documents/${documentId}/content`,
    {
      cadDocument: canonicalDocument(radius),
      expectedCadDocumentVersion: current.body.cadDocumentVersion,
    },
  );
  expect(written.status).toBe(200);
  return (
    await apiGet<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}`,
    )
  ).body.cadDocumentVersion;
}

/**
 * El invariante que estas pruebas miden: NADA se destruyó en ese carril.
 *
 * Comparar las listas por igualdad exacta era frágil y no era lo que se quiere
 * afirmar. Un carril vivo sigue escribiendo mientras esté sucio —temporizador
 * de 15 s, y el checkpoint de `beforeunload` al recargar, que PR #24 añadió a
 * propósito—, así que un checkpoint DE MÁS es comportamiento correcto. El
 * defecto sería que desapareciera el que ya estaba.
 *
 * Se comprueba contra el más reciente porque la poda por carril puede retirar
 * los más viejos, y esa poda es legítima y no la provoca la otra pestaña.
 */
function expectLanePreserved(
  before: readonly string[],
  after: readonly string[],
  message: string,
): void {
  expect(before.length, "el carril tenía que tener algo que preservar").toBeGreaterThan(0);
  expect(after, message).toContain(before[before.length - 1]);
  expect(after.length, message).toBeGreaterThan(0);
}

/** Carril de ESTA pestaña, tal como lo guarda el editor en sessionStorage. */
async function laneOf(page: Page): Promise<string | null> {
  return page.evaluate(() => sessionStorage.getItem("valle_cad_recovery_lane"));
}

/** Dibuja algo real y espera a que el primer checkpoint quede escrito. */
async function editAndCheckpoint(page: Page, radius: string): Promise<void> {
  await page.getByTestId("cad-native-entity-real-arc").click();
  const field = page.getByTestId("cad-native-property-radius");
  await expect(field).toBeVisible();
  await field.fill(radius);
  await field.blur();
  const lane = await laneOf(page);
  await expect
    .poll(
      async () =>
        (await readJournal(page)).filter((row) => (row.lane ?? "-") === (lane ?? "-")).length,
      { timeout: FIRST_CHECKPOINT_MS * 4, message: "el checkpoint de esta pestaña no llegó a escribirse" },
    )
    .toBeGreaterThan(0);
}

test.describe("recuperación local por carril contra PostgreSQL", () => {
  let context: BrowserContext;
  let tabA: Page;
  let tabB: Page;
  let email: string;
  let runId: string;
  let organizationId: string;
  let documentId: string;

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(180_000);
    runId = `${browserName}-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    email = `valle.recovery.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });

    // Alta por el harness seguro: mismo camino que el recorrido comercial.
    const registered = await context.request.post(`${API_ORIGIN}/v1/auth/register`, {
      data: { email, password: E2E_PASSWORD, displayName: "Valle Recovery" },
    });
    expect(registered.status()).toBe(202);
    const message = await context.request.get(
      `${API_ORIGIN}/_development/email-outbox?recipient=${encodeURIComponent(email)}`,
      {
        headers: {
          "x-valle-test-harness":
            process.env.E2E_IDENTITY_HARNESS_KEY ??
            "valle-design-e2e-harness-key-32-characters-minimum",
        },
      },
    );
    const token = ((await message.json()) as { payload: { token: string } }).payload.token;
    const verified = await context.request.post(`${API_ORIGIN}/v1/auth/verify-email`, {
      data: { token },
    });
    expect([200, 201]).toContain(verified.status());
    const login = await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
      data: { email, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);

    const organization = await apiPost<{ id: string }>(context, "/v1/organizations", {
      name: `Valle Recovery ${runId}`,
      slug: `valle-recovery-${runId}`.toLowerCase(),
    });
    expect(organization.status).toBe(201);
    organizationId = organization.body.id;
    const activated = await apiPost<{ tenantId: string }>(
      context,
      "/v1/organizations/active",
      { organizationId },
    );
    expect([200, 201]).toContain(activated.status);

    const created = await apiPost<{ id: string }>(context, "/v1/cad/documents", {
      name: `Recovery ${runId}`,
    });
    expect(created.status).toBe(201);
    documentId = created.body.id;
    const seeded = await apiPut<Record<string, unknown>>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      { cadDocument: canonicalDocument(), expectedCadDocumentVersion: 0 },
    );
    expect(seeded.status).toBe(200);

    tabA = await context.newPage();
    tabB = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1: dos pestañas del mismo dibujo escriben en carriles distintos", async () => {
    test.setTimeout(180_000);
    for (const page of [tabA, tabB]) {
      await page.goto(`/studio/${documentId}`);
      await expect(page.getByTestId("cad-native-entity-real-arc")).toBeVisible({
        timeout: 120_000,
      });
    }

    // Con autosave sano no hay checkpoint que mirar, y así debe ser. El trabajo
    // se queda local porque el servidor avanza por debajo y el autosave de las
    // dos pestañas recibe un 409 REAL.
    await thirdWriterAdvances(context, documentId, 321);

    await editAndCheckpoint(tabA, "140");
    await editAndCheckpoint(tabB, "160");

    const laneA = await laneOf(tabA);
    const laneB = await laneOf(tabB);
    expect(laneA).toBeTruthy();
    expect(laneB).toBeTruthy();
    expect(
      laneA,
      "cada pestaña necesita su propio carril: con uno compartido no hay nada que aislar",
    ).not.toBe(laneB);

    const journal = await readJournal(tabA);
    expect(journal.filter((row) => row.lane === laneA).length).toBeGreaterThan(0);
    expect(journal.filter((row) => row.lane === laneB).length).toBeGreaterThan(0);
    // La generación es lo que después distingue un checkpoint confirmado de uno
    // que capturó una edición posterior.
    for (const row of journal)
      expect(
        row.editGeneration,
        "el registro tiene que llevar la generación que capturó",
      ).toBeGreaterThan(0);
  });

  test("2: guardar en la pestaña A no borra el borrador de la pestaña B", async () => {
    test.setTimeout(180_000);
    const laneB = await laneOf(tabB);
    const bBefore = (await readJournal(tabA))
      .filter((row) => row.lane === laneB)
      .map((row) => row.key)
      .sort();
    expect(bBefore.length, "la pestaña B tenía checkpoints antes del guardado").toBeGreaterThan(0);

    // La pestaña A se pone al día con el servidor —descartando su propio
    // borrador, que es una decisión suya— y guarda de verdad.
    await tabA.reload();
    await expect(tabA.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });
    // Su propio borrador SÍ se le ofrece —el servidor avanzó mientras editaba—
    // y lo descarta explícitamente. `isVisible()` a secas no vale: el panel
    // aparece cuando `loadCadRecovery` resuelve, no en el primer frame.
    const laneA = await laneOf(tabA);
    await expect(tabA.getByTestId("cad-recovery-panel")).toBeVisible({ timeout: 60_000 });
    await tabA.getByTestId("cad-recovery-discard").click();
    await expect
      .poll(
        async () => (await readJournal(tabA)).filter((row) => row.lane === laneA).length,
        { timeout: 30_000, message: "descartar tenía que vaciar SU carril" },
      )
      .toBe(0);
    const saved = tabA.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === `${API_ORIGIN}/v1/cad/documents/${documentId}/content` &&
        response.ok(),
      { timeout: 90_000 },
    );
    await tabA.getByTestId("cad-native-entity-real-arc").click();
    const radius = tabA.getByTestId("cad-native-property-radius");
    await expect(radius).toBeVisible();
    await radius.fill("188");
    await radius.blur();
    await tabA.getByTestId("cad-save").click();
    expect((await saved).status()).toBe(200);

    await expect
      .poll(
        async () => (await readJournal(tabA)).filter((row) => row.lane === laneA).length,
        { timeout: 30_000, message: "el guardado tenía que confirmar y limpiar SU carril" },
      )
      .toBe(0);

    const bAfter = (await readJournal(tabA))
      .filter((row) => row.lane === laneB)
      .map((row) => row.key)
      .sort();
    expectLanePreserved(
      bBefore,
      bAfter,
      "guardar en una pestaña NUNCA puede borrar el borrador de otra",
    );
  });

  test("3: el borrador de B sobrevive a que el servidor avance, y se ofrece como rama divergente", async () => {
    test.setTimeout(180_000);
    const laneB = await laneOf(tabB);
    const keysBefore = (await readJournal(tabB))
      .filter((row) => row.lane === laneB)
      .map((row) => row.key)
      .sort();
    expect(keysBefore.length).toBeGreaterThan(0);

    const serverVersion = await thirdWriterAdvances(context, documentId, 999);

    // Al reabrir, el borrador local parte de una versión que el servidor ya
    // superó. ANTES esto lo borraba sin preguntar.
    await tabB.reload();
    await expect(tabB.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });

    const panel = tabB.getByTestId("cad-recovery-panel");
    await expect(
      panel,
      "un borrador sobre una versión superada sigue siendo trabajo: hay que ofrecerlo",
    ).toBeVisible({ timeout: 60_000 });
    await expect(panel).toHaveAttribute("data-divergent", "true");
    const baseVersion = Number(await panel.getAttribute("data-base-version"));
    expect(baseVersion).toBeLessThan(serverVersion);

    const keysAfter = (await readJournal(tabB))
      .filter((row) => row.lane === laneB)
      .map((row) => row.key)
      .sort();
    // Igualdad EXACTA era demasiado estricta y hacía la prueba frágil: recargar
    // dispara el checkpoint de `beforeunload`, que es justo lo que PR #24
    // arregló para no perder el estado al cerrar. Un checkpoint DE MÁS no es el
    // defecto; el defecto sería que desapareciese el que ya había.
    //
    // Lo que se afirma es eso: el borrador que existía antes sigue existiendo.
    // Se comprueba contra el más reciente porque la poda por carril puede
    // retirar los más viejos, y esa poda es correcta y no la provoca la otra
    // sesión.
    expectLanePreserved(
      keysBefore,
      keysAfter,
      "que otra sesión guarde no puede destruir el borrador local",
    );
  });

  test("4: descartar borra ese carril y sólo ese", async () => {
    test.setTimeout(180_000);
    const laneA = await laneOf(tabA);
    const laneB = await laneOf(tabB);

    // La pestaña A vuelve a dejar un checkpoint, para comprobar que el descarte
    // de B no lo toca.
    await tabA.reload();
    await expect(tabA.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });
    await thirdWriterAdvances(context, documentId, 555);
    await editAndCheckpoint(tabA, "175");
    const aBefore = (await readJournal(tabA))
      .filter((row) => row.lane === laneA)
      .map((row) => row.key)
      .sort();
    expect(aBefore.length).toBeGreaterThan(0);

    await tabB.getByTestId("cad-recovery-discard").click();
    await expect(tabB.getByTestId("cad-recovery-panel")).toBeHidden();
    await expect
      .poll(
        async () => (await readJournal(tabB)).filter((row) => row.lane === laneB).length,
        { timeout: 30_000 },
      )
      .toBe(0);

    const aAfter = (await readJournal(tabA))
      .filter((row) => row.lane === laneA)
      .map((row) => row.key)
      .sort();
    expectLanePreserved(
      aBefore,
      aAfter,
      "descartar en una pestaña no toca el carril de otra",
    );
  });

  test("5: ninguna de las pestañas registró un error de página", async () => {
    const errors: string[] = [];
    for (const page of [tabA, tabB]) page.on("pageerror", (error) => errors.push(error.message));
    await tabA.reload();
    await expect(tabA.getByTestId("cad-native-entity-real-arc")).toBeVisible({
      timeout: 120_000,
    });
    expect(errors).toEqual([]);
    // Y la sesión sigue sin colocar credenciales donde no deben estar.
    expect(await tabA.evaluate(() => localStorage.getItem("axos_access_token"))).toBeNull();
    await csrfHeaders(context);
  });
});
