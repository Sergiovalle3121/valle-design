/**
 * Las tres formas reales de perder dos horas de trabajo, contra la API real.
 *
 * POR QUÉ EXISTE. Un arquitecto que pierde una tarde de dibujo una vez no
 * vuelve nunca, y con razón. Ahorrarle 1.980 pesos al mes frente a AutoCAD no
 * compensa perderle un solo plano. Hasta ahora el repositorio tenía specs para
 * el conflicto CAS por documento y para los carriles del journal, pero NINGUNA
 * evidencia ejecutable de las tres situaciones que de verdad rompen a una
 * persona:
 *
 *   1. Se cae la red a mitad de sesión. Sigue dibujando. Vuelve la red.
 *   2. El mismo plano abierto en DOS pestañas de la misma sesión.
 *   3. La pestaña muere sin avisar —cuelgue del renderizador, no un cierre
 *      ordenado— y al volver el trabajo tiene que estar.
 *
 * Ninguna se puede medir con un unit test: la primera necesita que el `fetch`
 * falle de verdad en la frontera de red del navegador, la segunda que el `409`
 * lo emita PostgreSQL con su contador CAS, y la tercera que IndexedDB
 * sobreviva a la muerte del proceso que escribió en él. Aquí no se intercepta
 * ninguna respuesta de la API: sólo se corta el cable.
 *
 * EL CONTRATO QUE SE AFIRMA (PRODUCT.md, «Qué significa "guardado"»): el
 * documento canónico es la fuente de verdad, guardado manual y autosave se
 * serializan con la versión CAS conocida, y un `409` NO se resuelve
 * silenciosamente — el estado queda pendiente hasta recargar, comparar o
 * resolver. Lo que estas pruebas añaden es la otra mitad, la que ningún
 * documento afirmaba todavía: que mientras tanto el trabajo no se evapora.
 */

import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import { E2E_PASSWORD, apiGet, apiPost, apiPut } from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/**
 * Ventana de cortesía para que un guardado que NO depende de ninguna acción
 * humana llegue al servidor: el debounce del autosave es de 2 s y la petición
 * viaja por localhost. Treinta segundos son holgadísimos incluso con seis
 * agentes peleándose por seis núcleos; si en treinta segundos no ha subido
 * nada, no es lentitud, es que nadie lo intentó.
 */
const RECONNECT_BUDGET_MS = 30_000;

/** El editor programa el primer checkpoint local a los 3 s de ensuciarse. */
const FIRST_CHECKPOINT_MS = 3_000;

/**
 * Silencio que hay que observar antes de dar por «quieto» al editor: tres
 * veces el debounce del autosave (2 s). Sin esta espera, restablecer la red
 * justo después de dibujar hace pasar la prueba con el guardado que YA estaba
 * programado, y entonces no demuestra nada sobre la reconexión.
 */
const QUIESCENT_MS = 6_000;

interface JournalRow {
  key: string;
  lane?: string;
  savedAtMs: number;
  editGeneration?: number;
  baseCadDocumentVersion: number;
  storedBytes?: number;
}

interface ServerDocument {
  cadDocumentVersion: number;
  cadDocument: { entities: { id: string; radius?: number }[] } | null;
}

/**
 * Tres arcos y no uno.
 *
 * Con una sola entidad «no se ha perdido nada» degenera en «el último valor es
 * el último valor», que es cierto aunque el editor haya tirado todo lo
 * anterior. Con tres, cada escenario toca un arco distinto y la afirmación
 * pasa a ser la que importa: el documento que llega al servidor lleva TODAS
 * las ediciones, no sólo la más reciente.
 */
function canonicalDocument(
  radii: { a?: number; b?: number; c?: number } = {},
): Record<string, unknown> {
  const arc = (id: string, x: number, radius: number) => ({
    id,
    type: "arc",
    center: { x, y: 3_000, z: 0 },
    radius,
    startAngle: 0,
    endAngle: 180,
    layer: "REAL",
  });
  return {
    meta: {
      version: 1,
      schema: 3,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      {
        id: "REAL",
        name: "REAL",
        color: "#60a5fa",
        visible: true,
        locked: false,
      },
    ],
    entities: [
      arc("arc-a", 2_000, radii.a ?? 100),
      arc("arc-b", 5_000, radii.b ?? 200),
      arc("arc-c", 8_000, radii.c ?? 300),
    ],
    history: [],
    modelSpace: { entityIds: ["arc-a", "arc-b", "arc-c"] },
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
            const rows = (all.result as Record<string, unknown>[]).map(
              (row) => ({
                key: String(row.key),
                lane: row.lane === undefined ? undefined : String(row.lane),
                savedAtMs: Number(row.savedAtMs),
                editGeneration:
                  row.editGeneration === undefined
                    ? undefined
                    : Number(row.editGeneration),
                baseCadDocumentVersion: Number(row.baseCadDocumentVersion),
                storedBytes:
                  row.storedBytes === undefined
                    ? undefined
                    : Number(row.storedBytes),
              }),
            );
            database.close();
            resolve(rows);
          };
        };
      }),
  );
}

/** Carril de ESTA pestaña, tal como lo guarda el editor en sessionStorage. */
async function laneOf(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    sessionStorage.getItem("valle_cad_recovery_lane"),
  );
}

/** Abre el estudio y espera a que el documento esté realmente dibujado. */
async function openStudio(page: Page, documentId: string): Promise<void> {
  await page.goto(`/studio/${documentId}`);
  await expect(page.getByTestId("cad-native-entity-arc-a")).toBeVisible({
    timeout: 120_000,
  });
}

/**
 * Dibuja de verdad: selecciona el arco y cambia su radio por el panel de
 * propiedades. Es la misma ruta que usa una persona, y la que dispara
 * `markDirty` → debounce de autosave → checkpoint local.
 *
 * Al terminar deselecciona con Escape a propósito: el dock derecho enseña la
 * LISTA de entidades o las PROPIEDADES de lo seleccionado, nunca las dos. Sin
 * deshacer la selección, el segundo arco no existe en el DOM y una prueba que
 * quiere tocar tres entidades se queda en una.
 */
async function editRadius(
  page: Page,
  entityId: string,
  radius: number,
): Promise<void> {
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId(`cad-native-entity-${entityId}`).click();
  const field = page.getByTestId("cad-native-property-radius");
  await expect(field).toBeVisible();
  await field.fill(String(radius));
  await field.blur();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible({
    timeout: 60_000,
  });
}

/**
 * Generación de edición más alta que ese carril tiene ya persistida.
 *
 * El contador lo escribe el propio checkpoint junto al documento, así que es
 * la única forma NO temporal de saber si lo último que se dibujó ya está a
 * salvo. Sin este dato la prueba tendría que dormir y confiar, que es como se
 * escriben los tests que pasan en una máquina y fallan en otra.
 */
function maxGeneration(rows: readonly JournalRow[], lane: string | null): number {
  return rows
    .filter((row) => row.lane === lane)
    .reduce((top, row) => Math.max(top, row.editGeneration ?? 0), 0);
}

/** Espera a que ESTA pestaña haya dejado su trabajo a salvo en IndexedDB. */
async function waitForCheckpoint(page: Page): Promise<JournalRow[]> {
  const lane = await laneOf(page);
  await expect
    .poll(
      async () =>
        (await readJournal(page)).filter((row) => row.lane === lane).length,
      {
        timeout: FIRST_CHECKPOINT_MS * 6,
        message: "el checkpoint local de esta pestaña no llegó a escribirse",
      },
    )
    .toBeGreaterThan(0);
  return (await readJournal(page)).filter((row) => row.lane === lane);
}

async function serverDocument(
  context: BrowserContext,
  documentId: string,
): Promise<ServerDocument> {
  return (await apiGet<ServerDocument>(context, `/v1/cad/documents/${documentId}`))
    .body;
}

function radiusOf(document: ServerDocument, entityId: string): number | undefined {
  return document.cadDocument?.entities.find((entity) => entity.id === entityId)
    ?.radius;
}

test.describe("no se pierde trabajo: offline, dos pestañas y cierre forzado", () => {
  let context: BrowserContext;
  let runId: string;
  /** Un documento por escenario: los tres se pisarían entre sí. */
  let documentOffline: string;
  let documentTabs: string;
  let documentCrash: string;

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(240_000);
    runId = `${browserName}-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    const email = `valle.offline.${runId}@example.test`;
    context = await browser.newContext({ baseURL: BASE_URL });

    // Alta por el camino comercial real, igual que el resto de e2e/real.
    const registered = await context.request.post(
      `${API_ORIGIN}/v1/auth/register`,
      { data: { email, password: E2E_PASSWORD, displayName: "Valle Offline" } },
    );
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
    const token = ((await message.json()) as { payload: { token: string } })
      .payload.token;
    expect(
      (
        await context.request.post(`${API_ORIGIN}/v1/auth/verify-email`, {
          data: { token },
        })
      ).status(),
    ).toBeLessThan(300);
    expect(
      (
        await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
          data: { email, password: E2E_PASSWORD },
        })
      ).status(),
    ).toBe(200);

    const organization = await apiPost<{ id: string }>(
      context,
      "/v1/organizations",
      {
        name: `Valle Offline ${runId}`,
        slug: `valle-offline-${runId}`.toLowerCase(),
      },
    );
    expect(organization.status).toBe(201);
    expect(
      [200, 201].includes(
        (
          await apiPost(context, "/v1/organizations/active", {
            organizationId: organization.body.id,
          })
        ).status,
      ),
    ).toBe(true);

    const seed = async (name: string): Promise<string> => {
      const created = await apiPost<{ id: string }>(
        context,
        "/v1/cad/documents",
        { name: `${name} ${runId}` },
      );
      expect(created.status).toBe(201);
      const seeded = await apiPut<Record<string, unknown>>(
        context,
        `/v1/cad/documents/${created.body.id}/content`,
        { cadDocument: canonicalDocument(), expectedCadDocumentVersion: 0 },
      );
      expect(seeded.status).toBe(200);
      return created.body.id;
    };
    documentOffline = await seed("Offline");
    documentTabs = await seed("Dos pestañas");
    documentCrash = await seed("Cierre forzado");
  });

  test.afterAll(async () => {
    await context?.setOffline(false);
    await context?.close();
  });

  // -------------------------------------------------------------------------
  // 1. OFFLINE
  // -------------------------------------------------------------------------

  test("1: se cae la red, sigue dibujando, vuelve la red y el trabajo sube solo", async () => {
    test.setTimeout(240_000);
    const page = await context.newPage();
    await openStudio(page, documentOffline);
    const before = await serverDocument(context, documentOffline);

    // Se corta el cable en la frontera de red del navegador. No hay `route`
    // ni respuesta falsa: el `fetch` del SDK falla como falla en un café con
    // el wifi caído.
    await context.setOffline(true);

    await editRadius(page, "arc-a", 141);
    await expect(
      page.getByTestId("cad-save-status"),
      "el editor tiene que DECIR que está sin conexión, no fingir que guardó",
    ).toHaveText(/sin conexión · cambios pendientes/iu, { timeout: 60_000 });

    // Lo primero que hay que demostrar: el trabajo ya está a salvo en local
    // aunque el servidor no sepa nada de él.
    const checkpoints = await waitForCheckpoint(page);
    expect(
      checkpoints.some((row) => (row.storedBytes ?? 0) > 0),
      "el checkpoint local tiene que tener cuerpo, no ser una fila vacía",
    ).toBe(true);

    // El arquitecto SIGUE DIBUJANDO sin red, que es lo que pasa de verdad.
    // Se cuentan los intentos de subida para poder afirmar después algo que
    // de otro modo sería una casualidad de cronómetro (ver más abajo).
    const contentUrl = `${API_ORIGIN}/v1/cad/documents/${documentOffline}/content`;
    const attempts: number[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && request.url() === contentUrl)
        attempts.push(Date.now());
    });
    await editRadius(page, "arc-b", 242);
    await expect(page.getByTestId("cad-save-status")).toHaveText(
      /sin conexión · cambios pendientes/iu,
      { timeout: 60_000 },
    );

    const during = await serverDocument(context, documentOffline);
    expect(
      during.cadDocumentVersion,
      "sin red el servidor no puede haberse movido",
    ).toBe(before.cadDocumentVersion);

    // AQUÍ ESTÁ EL RIGOR DE ESTA PRUEBA. El debounce del autosave es de 2 s: si
    // se restableciera la red inmediatamente después de dibujar, el guardado
    // que llega sería el que YA estaba programado, y la prueba pasaría sin
    // demostrar nada sobre la reconexión. Así que primero se espera a que el
    // editor se quede QUIETO —un intento real de subida que muere sin red, y
    // después varias veces el debounce sin que salga ninguno más— y sólo
    // entonces vuelve el cable.
    await expect
      .poll(() => attempts.length, {
        timeout: 60_000,
        message: "el autosave ni siquiera intentó subir estando sin red",
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => Date.now() - attempts[attempts.length - 1], {
        timeout: 60_000,
        message: "el editor no llegó a quedarse quieto",
      })
      .toBeGreaterThan(QUIESCENT_MS);
    const attemptsBeforeReconnect = attempts.length;

    // Vuelve la red. NADIE toca nada más: ni un clic, ni una tecla. Esto es
    // exactamente el caso que se pierde — quien deja de dibujar (se va a una
    // reunión, termina el plano) y la conexión vuelve sin él delante.
    const uploaded = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === contentUrl &&
        response.ok(),
      { timeout: RECONNECT_BUDGET_MS },
    );
    await context.setOffline(false);
    expect(
      (await uploaded).status(),
      "al volver la red el trabajo pendiente tiene que subir SOLO: si hace falta " +
        "que la persona vuelva a dibujar para que se guarde, quien cierre el " +
        "portátil pierde la tarde",
    ).toBe(200);
    expect(
      attempts.length,
      "y ese guardado tiene que ser un intento NUEVO, no el que ya estaba en cola",
    ).toBeGreaterThan(attemptsBeforeReconnect);

    await expect
      .poll(
        async () =>
          (await serverDocument(context, documentOffline)).cadDocumentVersion,
        { timeout: 60_000 },
      )
      .toBeGreaterThan(before.cadDocumentVersion);

    const after = await serverDocument(context, documentOffline);
    expect(radiusOf(after, "arc-a"), "la primera edición sin red").toBe(141);
    expect(radiusOf(after, "arc-b"), "y la segunda, no sólo la última").toBe(
      242,
    );
    expect(radiusOf(after, "arc-c"), "lo que no se tocó sigue igual").toBe(300);
    await expect(page.getByTestId("cad-save-status")).toHaveText(/guardado/iu, {
      timeout: 60_000,
    });
    await page.close();
  });

  // -------------------------------------------------------------------------
  // 2. DOS PESTAÑAS SOBRE EL MISMO DOCUMENTO
  // -------------------------------------------------------------------------

  test("2: dos pestañas del mismo plano — ninguna pisa a la otra y el 409 queda pendiente", async () => {
    test.setTimeout(240_000);
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await openStudio(tabA, documentTabs);
    await openStudio(tabB, documentTabs);
    const start = await serverDocument(context, documentTabs);
    expect(await laneOf(tabA)).not.toBe(await laneOf(tabB));

    // La pestaña A dibuja y guarda. Las dos abrieron sobre la MISMA versión.
    const savedByA = tabA.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() ===
          `${API_ORIGIN}/v1/cad/documents/${documentTabs}/content` &&
        response.ok(),
      { timeout: 90_000 },
    );
    await editRadius(tabA, "arc-a", 411);
    expect((await savedByA).status()).toBe(200);
    const afterA = await serverDocument(context, documentTabs);
    expect(afterA.cadDocumentVersion).toBeGreaterThan(start.cadDocumentVersion);

    // La pestaña B dibuja sobre su base, que ya está superada. El 409 lo emite
    // PostgreSQL, no un fixture.
    const conflict = tabB.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() ===
          `${API_ORIGIN}/v1/cad/documents/${documentTabs}/content` &&
        response.status() === 409,
      { timeout: 90_000 },
    );
    await editRadius(tabB, "arc-b", 422);
    expect((await conflict).status()).toBe(409);
    await expect(
      tabB.getByTestId("cad-save-status"),
      "el 409 se dice con todas las letras: autosave detenido",
    ).toHaveText(/conflicto cas.*autosave detenido/iu, { timeout: 60_000 });

    // LO QUE NUNCA PUEDE PASAR: que B haya pisado a A.
    const afterConflict = await serverDocument(context, documentTabs);
    expect(
      afterConflict.cadDocumentVersion,
      "un 409 no avanza la versión: nada se escribió",
    ).toBe(afterA.cadDocumentVersion);
    expect(radiusOf(afterConflict, "arc-a"), "lo de la pestaña A intacto").toBe(
      411,
    );
    expect(
      radiusOf(afterConflict, "arc-b"),
      "y lo de B NO está en el servidor: no se resolvió solo",
    ).toBe(200);

    // Y lo que tampoco puede pasar: que el trabajo de B se haya evaporado.
    const laneB = await laneOf(tabB);
    const bDrafts = await waitForCheckpoint(tabB);
    expect(
      bDrafts.length,
      "el trabajo rechazado por el servidor sigue existiendo en su carril",
    ).toBeGreaterThan(0);

    // Seguir dibujando en B no desbloquea nada por su cuenta: el estado queda
    // PENDIENTE hasta recargar, comparar o resolver. Es el contrato de
    // PRODUCT.md, y aquí se comprueba que se cumple de verdad.
    let sneaked = false;
    const watchSneak = (response: {
      request: () => { method: () => string };
      url: () => string;
      ok: () => boolean;
    }) => {
      if (
        response.request().method() === "PUT" &&
        response.url() ===
          `${API_ORIGIN}/v1/cad/documents/${documentTabs}/content` &&
        response.ok()
      )
        sneaked = true;
    };
    tabB.on("response", watchSneak);
    // Se espera a que el checkpoint capture ESTA edición y no la anterior: el
    // journal ya tenía filas, así que contar filas no distingue nada. La
    // generación sí, y es lo que además garantiza que lo que se restaure más
    // abajo lleve dentro los dos arcos y no sólo el primero.
    const generationBeforeThirdEdit = maxGeneration(
      await readJournal(tabB),
      laneB,
    );
    await editRadius(tabB, "arc-c", 433);
    await expect
      .poll(async () => maxGeneration(await readJournal(tabB), laneB), {
        timeout: 60_000,
        message: "el checkpoint no llegó a capturar la edición posterior al 409",
      })
      .toBeGreaterThan(generationBeforeThirdEdit);
    tabB.off("response", watchSneak);
    expect(
      sneaked,
      "un conflicto CAS no se resuelve en silencio sobrescribiendo al otro",
    ).toBe(false);
    expect(
      (await serverDocument(context, documentTabs)).cadDocumentVersion,
    ).toBe(afterA.cadDocumentVersion);

    // La resolución es EXPLÍCITA: la persona recarga, ve su rama y decide.
    await tabB.reload();
    await expect(tabB.getByTestId("cad-native-entity-arc-a")).toBeVisible({
      timeout: 120_000,
    });
    const panel = tabB.getByTestId("cad-recovery-panel");
    await expect(
      panel,
      "el trabajo de B se le ofrece al recargar; sin panel, se perdió",
    ).toBeVisible({ timeout: 60_000 });
    await expect(panel).toHaveAttribute("data-divergent", "true");
    expect(
      Number(await panel.getAttribute("data-base-version")),
      "la rama parte de la versión que el servidor ya superó",
    ).toBeLessThan(afterA.cadDocumentVersion);
    expect(
      (await readJournal(tabB)).filter((row) => row.lane === laneB).length,
      "recargar no destruye el carril de B",
    ).toBeGreaterThan(0);

    await tabB.getByTestId("cad-recovery-restore").click();
    const savedByB = tabB.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() ===
          `${API_ORIGIN}/v1/cad/documents/${documentTabs}/content` &&
        response.ok(),
      { timeout: 90_000 },
    );
    await tabB.getByTestId("cad-save").click();
    expect((await savedByB).status()).toBe(200);

    const resolved = await serverDocument(context, documentTabs);
    expect(resolved.cadDocumentVersion).toBeGreaterThan(
      afterA.cadDocumentVersion,
    );
    expect(radiusOf(resolved, "arc-b"), "el trabajo de B llega entero").toBe(
      422,
    );
    expect(radiusOf(resolved, "arc-c"), "incluido lo dibujado tras el 409").toBe(
      433,
    );
    await tabA.close();
    await tabB.close();
  });

  // -------------------------------------------------------------------------
  // 3. CIERRE FORZADO
  // -------------------------------------------------------------------------

  test("3: se mata la pestaña sin avisar y al volver el trabajo está", async ({
    browserName,
  }) => {
    test.setTimeout(240_000);
    const doomed = await context.newPage();
    await openStudio(doomed, documentCrash);
    const before = await serverDocument(context, documentCrash);

    // El trabajo tiene que quedarse SÓLO en local para que la prueba diga
    // algo: si el autosave llega, no hay nada que recuperar y el escenario se
    // evapora. Sin red, y sin tocar ninguna respuesta de la API.
    await context.setOffline(true);
    await editRadius(doomed, "arc-c", 333);
    await expect(doomed.getByTestId("cad-save-status")).toHaveText(
      /sin conexión · cambios pendientes/iu,
      { timeout: 60_000 },
    );
    const saved = await waitForCheckpoint(doomed);
    expect(saved.length).toBeGreaterThan(0);

    if (browserName === "chromium") {
      // Muerte de verdad: se estrella el renderizador. NO corre `beforeunload`,
      // ni `pagehide`, ni el desmontaje de React — el proceso que ejecutaba el
      // editor deja de existir. Lo único que puede salvar el trabajo es que la
      // transacción de IndexedDB ya estuviera confirmada en el proceso de
      // navegador, que es exactamente lo que se quiere demostrar.
      const crashed = doomed
        .waitForEvent("crash", { timeout: 15_000 })
        .then(() => "crash" as const)
        .catch(() => "close" as const);
      const session = await context.newCDPSession(doomed);
      // `Page.crash` no responde nunca: el destinatario muere respondiéndola.
      void session.send("Page.crash").catch(() => undefined);
      if ((await crashed) === "close") {
        // Medido en CI (runner sin GPU, dos corridas × dos intentos): ahí el
        // renderizador NO se deja estrellar por protocolo — ni Page.crash ni
        // chrome://crash producen el evento. Se cae al cierre sin
        // beforeunload — el MISMO escenario declarado del ramal de Firefox —
        // y se dice aquí en vez de dejar la suite roja por el mecanismo del
        // arnés: lo que el producto afirma (el checkpoint YA confirmado
        // sobrevive a la reapertura) se ejercita igual.
        console.log(
          "[multitab] renderizador no estrellable por protocolo en este entorno; cierre sin beforeunload",
        );
        await doomed.close({ runBeforeUnload: false }).catch(() => undefined);
      }
    } else {
      // Firefox no expone un cuelgue provocable por protocolo. El cierre sin
      // `beforeunload` es el escenario más duro disponible ahí, y se dice.
      await doomed.close({ runBeforeUnload: false });
    }
    await doomed.close().catch(() => undefined);

    // Vuelve la red y la persona reabre el plano en una pestaña NUEVA: carril
    // nuevo, `sessionStorage` nuevo, ninguna memoria de la sesión muerta.
    await context.setOffline(false);
    const reopened = await context.newPage();
    await openStudio(reopened, documentCrash);
    expect(
      await laneOf(reopened),
      "es otra pestaña: su carril no puede ser el de la que murió",
    ).not.toBe(saved[0]?.lane);

    const panel = reopened.getByTestId("cad-recovery-panel");
    await expect(
      panel,
      "el trabajo de la pestaña muerta tiene que ofrecerse al reabrir",
    ).toBeVisible({ timeout: 60_000 });
    expect(
      Number(await panel.getAttribute("data-base-version")),
      "nadie escribió mientras tanto: la rama parte de la versión del servidor",
    ).toBe(before.cadDocumentVersion);

    await reopened.getByTestId("cad-recovery-restore").click();
    const uploaded = reopened.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() ===
          `${API_ORIGIN}/v1/cad/documents/${documentCrash}/content` &&
        response.ok(),
      { timeout: 90_000 },
    );
    await reopened.getByTestId("cad-save").click();
    expect((await uploaded).status()).toBe(200);

    const after = await serverDocument(context, documentCrash);
    expect(
      radiusOf(after, "arc-c"),
      "lo dibujado antes del cuelgue llega al servidor",
    ).toBe(333);
    expect(after.cadDocumentVersion).toBeGreaterThan(before.cadDocumentVersion);
    await reopened.close();
  });

  // -------------------------------------------------------------------------
  // 4. HIGIENE
  // -------------------------------------------------------------------------

  test("4: ninguna pestaña registró errores y la sesión sigue en cookies", async () => {
    test.setTimeout(180_000);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openStudio(page, documentOffline);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => localStorage.getItem("axos_access_token")),
      "las credenciales viven en cookies first-party, nunca en localStorage",
    ).toBeNull();
    await page.close();
  });
});
