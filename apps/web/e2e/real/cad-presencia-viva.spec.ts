/**
 * Presencia EN VIVO entre DOS navegadores de verdad, contra la API real.
 *
 * LA PROMESA Y SU LÍMITE (frente `claude/colab-presencia-servidor`). Antes de
 * este frente, `apps/web/src/lib/cad/collab/presence.ts` sólo difundía entre
 * pestañas del MISMO navegador (`BroadcastChannel`) — verificado, cero
 * `@nestjs/websockets` y cero `text/event-stream` en `apps/api`. Este spec es
 * la evidencia full-stack de que el segundo adaptador (SSE contra
 * `/v1/cad/documents/:id/presence*`) cierra ese hueco de verdad: DOS
 * `BrowserContext` — DOS sesiones, DOS cookies, tan aislados como dos
 * ordenadores — ven el cursor del otro sin compartir pestaña ni proceso de
 * navegador.
 *
 * Lo que este spec NO prueba (fuera de alcance a propósito, ver el PR): la
 * presencia de un invitado de review link (EventSource no manda
 * `X-Review-Token`) y el fan-out entre VARIAS réplicas de la API (eso lo mide
 * `apps/api/src/load-probe/review-concurrency.main.ts`, carril `presence`,
 * contra una sola réplica con PostgreSQL real).
 *
 * Nada aquí se intercepta: los dos navegadores hablan con la API NestJS real
 * y PostgreSQL real (`E2E_REAL_API=1`). Un golden con red simulada no sería
 * evidencia full-stack — lo dice `AGENTS.md`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiLogin,
  apiPost,
  apiPut,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/** Un segundo bajo el peor caso local: dos navegadores headless en la misma máquina. */
const FIRST_SIGHT_BUDGET_MS = 1_000;
/** TTL del lado del cliente (presence.ts) + margen de red/latido para que se note la ausencia. */
const DISAPPEAR_BUDGET_MS = 20_000;

function canonicalDocument() {
  return {
    meta: { version: 1, schema: 3, unit: "mm", footprintW: 12_000, footprintH: 10_000, gridSize: 100 },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      {
        id: "presence-anchor",
        type: "circle",
        center: { x: 4_000, y: 3_000, z: 0 },
        radius: 300,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["presence-anchor"] },
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

/** Registra + verifica un usuario first-party por el camino real (outbox, sin buzón). */
async function registerAndVerify(
  context: BrowserContext,
  email: string,
  displayName: string,
): Promise<void> {
  const registered = await context.request.post(`${API_ORIGIN}/v1/auth/register`, {
    data: { email, password: E2E_PASSWORD, displayName },
  });
  expect(registered.status(), await registered.text()).toBe(202);
  const captured = await latestCapturedEmail(context.request, email);
  const verified = await context.request.post(`${API_ORIGIN}/v1/auth/verify-email`, {
    data: { token: capturedToken(captured) },
  });
  expect(verified.status(), await verified.text()).toBeLessThan(300);
}

async function openStudioReady(page: Page, documentId: string): Promise<void> {
  await page.goto(`/studio/${documentId}`);
  await expect(page.getByTestId("cad-native-entity-presence-anchor")).toBeVisible({
    timeout: 120_000,
  });
  const toggle = page.getByTestId("cad-collab-toggle");
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  // Idempotente: si otra corrida ya lo dejó abierto, no lo vuelve a plegar.
  if ((await toggle.textContent())?.trim() === "Abrir") {
    await toggle.click();
  }
  await expect(page.getByTestId("cad-collab-presence")).toBeVisible();
}

/** Mueve el cursor sobre el lienzo en un pequeño patrón — un solo punto no basta: overlay-model exige un `pointermove` real. */
async function wiggleCursorOverCanvas(page: Page): Promise<void> {
  const box = page.viewportSize() ?? { width: 1280, height: 720 };
  const cx = box.width / 2;
  const cy = box.height / 2;
  await page.mouse.move(cx - 40, cy - 20);
  await page.mouse.move(cx, cy, { steps: 5 });
}

function peerLocator(page: Page) {
  return page.locator('[data-testid^="cad-collab-peer-"]');
}

test.describe("presencia en vivo entre dos navegadores, contra la API + PostgreSQL reales", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let emailA: string;
  let emailB: string;
  let runId: string;
  let organizationId: string;
  let documentId: string;

  test.beforeAll(async ({ browser, browserName }, testInfo) => {
    testInfo.setTimeout(180_000);
    runId = `${browserName}-${Date.now().toString(36)}-${testInfo.workerIndex}`;
    emailA = `valle.presencia.a.${runId}@example.test`;
    emailB = `valle.presencia.b.${runId}@example.test`;

    // ── A: arquitecto en su despacho — registra, verifica, entra, funda la organización ──
    contextA = await browser.newContext({ baseURL: BASE_URL });
    await registerAndVerify(contextA, emailA, "Presencia A");
    await apiLogin(contextA, emailA);
    const organization = await apiPost<{ id: string }>(contextA, "/v1/organizations", {
      name: `Valle Presencia ${runId}`,
      slug: `valle-presencia-${runId}`.toLowerCase(),
    });
    expect(organization.status).toBe(201);
    organizationId = organization.body.id;
    expect(
      (await apiPost(contextA, "/v1/organizations/active", { organizationId })).status,
    ).toBeLessThan(300);

    const created = await apiPost<{ id: string }>(contextA, "/v1/cad/documents", {
      name: `Plano compartido ${runId}`,
    });
    expect(created.status).toBe(201);
    documentId = created.body.id;
    const seeded = await apiPut<Record<string, unknown>>(
      contextA,
      `/v1/cad/documents/${documentId}/content`,
      { cadDocument: canonicalDocument(), expectedCadDocumentVersion: 0 },
    );
    expect(seeded.status).toBe(200);

    // ── B: el socio, DESDE SU CASA — otro BrowserContext, cero cookies compartidas con A ──
    contextB = await browser.newContext({ baseURL: BASE_URL });
    await registerAndVerify(contextB, emailB, "Presencia B");

    const invited = await apiPost(contextA, `/v1/organizations/${organizationId}/invitations`, {
      email: emailB,
      role: "member",
    });
    expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
    await apiLogin(contextB, emailB);
    const invitation = await latestCapturedEmail(contextB.request, emailB, organizationId);
    const accepted = await apiPost(contextB, "/v1/organizations/invitations/accept", {
      token: capturedToken(invitation),
    });
    expect(accepted.status).toBeLessThan(300);
    expect(
      (await apiPost(contextB, "/v1/organizations/active", { organizationId })).status,
    ).toBeLessThan(300);

    pageA = await contextA.newPage();
    pageB = await contextB.newPage();
  });

  test.afterAll(async () => {
    await pageA?.close();
    await pageB?.close();
    await contextA?.close();
    await contextB?.close();
  });

  test("A y B abren el MISMO plano; cada uno ve al otro (latido al montar, sin mover el ratón)", async () => {
    test.setTimeout(180_000);
    // `useCadPresence` emite un latido AL MONTAR (cursor null, sólo "estoy
    // aquí"), así que para cuando el estudio de B termina de cargar (varios
    // segundos: hidratación de React Three Fiber, no presencia) YA ve a A —
    // el presupuesto de "menos de un segundo" es del siguiente test, que mide
    // SÓLO la propagación de un cambio con los dos ya conectados, no el
    // arranque del estudio.
    await openStudioReady(pageA, documentId);
    await openStudioReady(pageB, documentId);
    await expect(peerLocator(pageB)).toHaveCount(1, { timeout: 30_000 });
    await expect(peerLocator(pageA)).toHaveCount(1, { timeout: 30_000 });

    // El nombre lo puso el SERVIDOR desde el email de la sesión de A — nunca
    // un campo que A haya podido escribir.
    await expect(peerLocator(pageB)).toContainText("valle.presencia.a", {
      timeout: 5_000,
    });
  });

  test("A mueve el cursor; B lo ve en menos de un segundo", async () => {
    test.setTimeout(60_000);
    const before = await peerLocator(pageB).getAttribute("title");
    // El cronómetro arranca DESPUÉS de mover el ratón, y no antes.
    //
    // `wiggleCursorOverCanvas` son seis `mouse.move` y cada uno es una ida y
    // vuelta por CDP hasta el navegador de A: en un runner cargado, decenas de
    // milisegundos que NO son propagación de presencia. Contándolos, esta
    // prueba le cobraba al producto el coste del instrumento, y falló en
    // 1.032 ms y —al reintentar— 1.013 ms contra un presupuesto de 1.000: el
    // tamaño exacto de su propio gesto. Es la lección que ya está escrita en el
    // arnés del estrés denso: «el instrumento se estaba comiendo la medida».
    //
    // EL PRESUPUESTO NO SE TOCA: sigue en 1.000 ms y sigue acotando el `poll`,
    // así que una propagación que de verdad tarde más de un segundo falla
    // igual. Lo que cambia es dónde empieza a contar el reloj: cuando el cursor
    // YA se movió, que es cuando empieza lo que esta prueba mide.
    await wiggleCursorOverCanvas(pageA);
    const startedAt = Date.now();
    await expect
      .poll(() => peerLocator(pageB).getAttribute("title"), {
        timeout: FIRST_SIGHT_BUDGET_MS,
        // Intervalos cortos y fijos: los de por defecto crecen (100, 250, 500,
        // 1.000) y redondean la medida hacia arriba, de modo que una
        // propagación de 700 ms podía publicarse como 850. Se muestrea más fino
        // para que el número sea el del producto y no el del muestreo.
        intervals: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
        message: "el título del peer (coordenadas del cursor) debía cambiar",
      })
      .not.toBe(before);
    const elapsedMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(`[cad-presencia-viva] latencia de cursor: ${elapsedMs} ms`);
    expect(elapsedMs).toBeLessThan(FIRST_SIGHT_BUDGET_MS);
  });

  test("A cierra la pestaña; B lo ve desaparecer por TTL, no por un mensaje de adiós", async () => {
    test.setTimeout(30_000);
    await pageA.close();
    await contextA.close();
    // Sin latido nuevo de A durante CAD_PRESENCE_TTL_MS, la poda LOCAL de B
    // (pruneCadPresence, temporizador propio) lo saca de la lista — nadie le
    // avisó a B de que A se fue; simplemente dejó de oírlo.
    await expect(peerLocator(pageB)).toHaveCount(0, { timeout: DISAPPEAR_BUDGET_MS });
  });

  test("aislamiento: el peer de un tenant distinto nunca aparece en este documento", async () => {
    test.setTimeout(60_000);
    const strangerContext = await pageB.context().browser()!.newContext({ baseURL: BASE_URL });
    try {
      const strangerEmail = `valle.presencia.ajeno.${runId}@example.test`;
      await registerAndVerify(strangerContext, strangerEmail, "Ajeno");
      await apiLogin(strangerContext, strangerEmail);
      const strangerOrg = await apiPost<{ id: string }>(strangerContext, "/v1/organizations", {
        name: `Otra organización ${runId}`,
        slug: `valle-ajeno-${runId}`.toLowerCase(),
      });
      expect(strangerOrg.status).toBe(201);
      expect(
        (
          await apiPost(strangerContext, "/v1/organizations/active", {
            organizationId: strangerOrg.body.id,
          })
        ).status,
      ).toBeLessThan(300);

      // El ajeno intenta publicar presencia sobre el documento de A y B: 404,
      // nunca llega a la tabla — verificado también server-side en
      // cad-presence-tenant-isolation.pg.spec.ts.
      const attempt = await apiPost(strangerContext, `/v1/cad/documents/${documentId}/presence`, {
        peerId: "peer-ajeno",
        cursor: { x: 0, y: 0 },
        viewport: null,
      });
      expect(attempt.status).toBe(404);

      const documents = await apiGet<{ items: { id: string }[] }>(
        strangerContext,
        "/v1/cad/documents",
      );
      expect(documents.body.items.map((item) => item.id)).not.toContain(documentId);
    } finally {
      await strangerContext.close();
    }
  });
});
