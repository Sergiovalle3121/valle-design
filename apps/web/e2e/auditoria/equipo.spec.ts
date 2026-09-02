/**
 * AUDITORÍA DE CLIENTE FINAL — TRABAJAR EN EQUIPO.
 *
 * Somos dos socios en un despacho. Abrimos el mismo plano y queremos tres
 * cosas, en este orden de importancia:
 *
 *   1. Ver quién más está en el plano (presencia), y que si no hay nadie el
 *      programa lo DIGA en vez de callarse.
 *   2. Dejarle a la otra persona un mensaje clavado en un punto del dibujo,
 *      no una nota suelta al final de un correo.
 *   3. Poder hablar: mensajería de equipo y videollamada desde el estudio.
 *
 * Esto no audita código: audita lo que se ve y lo que responde. Cuando hace
 * falta un servidor (mensajería y llamada hablan con `/v1/messaging/*` y
 * `/v1/calls/*`), se le pone uno que contesta EXACTAMENTE lo que el contrato
 * publicado dice — ni más ni menos — para que lo que falle sea la interfaz y
 * no el doble.
 */
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { openCollabDock } from "../fixtures/collab-dock";
import { API_ORIGIN, OWNER_EMAIL, OWNER_USER_ID } from "../fixtures/constants";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "20000000-0000-4000-8000-000000000009";
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: "mm", gridSize: 100 };

function planta(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 9_000, y: 1_000, z: 0 },
        layer: "0",
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
  } as unknown as CadDocument;
}

function backendConProyecto(): CadV1Backend {
  const backend = new CadV1Backend([]);
  const fila = backend.register({
    model: "AXOS-CAD-STUDIO",
    revision: "UNIVERSAL",
    document: planta() as unknown as Record<string, unknown>,
    version: 1,
    footprint: FOOTPRINT,
  });
  // Sin proyecto, la mensajería no aprovisiona su canal «General». Un plano de
  // despacho SIEMPRE pertenece a un proyecto, así que se le pone uno.
  fila.projectId = PROJECT_ID;
  return backend;
}

/* ── Un servidor de mensajería que contesta el contrato publicado ────────── */

interface CanalStub {
  id: string;
  kind: "project" | "direct";
  projectId: string | null;
  name: string | null;
  otherMember: null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

class MensajeriaStub {
  readonly canales: CanalStub[] = [];
  readonly mensajes: Record<string, unknown>[] = [];
  /** Cuántas veces el navegador ha abierto el stream en vivo. */
  aperturasSse = 0;
  private seq = 0;

  async install(context: BrowserContext) {
    await context.route(`${API_ORIGIN}/v1/messaging/**`, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method().toUpperCase();
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (path === "/v1/messaging/events") {
      // LÍMITE DEL DOBLE, NO DEL PRODUCTO: `route.fulfill` de Playwright NO
      // sostiene una respuesta abierta, así que este stream se cierra en
      // cuanto se entrega. El navegador reconecta solo (por eso se cuentan
      // las aperturas) y el indicador de la interfaz oscila. No se puede
      // afirmar «En vivo» con este doble; lo que SÍ se puede comprobar es que
      // el cable existe y que el rótulo dice la verdad cuando el stream cae.
      this.aperturasSse += 1;
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: ": abierto\n\n",
      });
    }
    if (path === "/v1/messaging/channels" && method === "GET") {
      return json({ items: this.canales });
    }
    if (path === "/v1/messaging/channels" && method === "POST") {
      const dto = JSON.parse(route.request().postData() ?? "{}") as {
        kind: "project" | "direct";
        projectId?: string;
        name?: string;
      };
      const canal: CanalStub = {
        id: `30000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`,
        kind: dto.kind,
        projectId: dto.projectId ?? null,
        name: dto.name ?? null,
        otherMember: null,
        unreadCount: 0,
        lastMessageAt: null,
        createdAt: new Date().toISOString(),
      };
      this.canales.push(canal);
      return json(canal, 201);
    }
    const mensajes = path.match(/^\/v1\/messaging\/channels\/([^/]+)\/messages$/);
    if (mensajes && method === "GET") {
      return json({
        items: this.mensajes.filter((m) => m.channelId === mensajes[1]),
        nextCursor: null,
      });
    }
    if (mensajes && method === "POST") {
      const dto = JSON.parse(route.request().postData() ?? "{}") as {
        body: string;
        anchor?: unknown;
      };
      const mensaje = {
        id: `40000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`,
        channelId: mensajes[1],
        author: { userId: OWNER_USER_ID, email: OWNER_EMAIL, displayName: null },
        body: dto.body,
        parentMessageId: null,
        anchor: dto.anchor ?? null,
        createdAt: new Date().toISOString(),
      };
      this.mensajes.push(mensaje);
      return json(mensaje, 201);
    }
    if (/^\/v1\/messaging\/channels\/[^/]+\/read$/.test(path)) return json({ read: true });
    return json({ code: "not_found", message: `Ruta de mensajería no contemplada: ${method} ${path}` }, 404);
  }
}

/* ── Un servidor de llamadas que contesta el contrato publicado ──────────── */

class LlamadasStub {
  salas = 0;
  señales: unknown[] = [];
  /** Cuando es false, `POST /v1/calls/rooms` contesta 404: el despliegue no lo tiene. */
  disponible = true;

  async install(context: BrowserContext) {
    await context.route(`${API_ORIGIN}/v1/calls/**`, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method().toUpperCase();
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (path === "/v1/calls/rooms" && method === "POST") {
      if (!this.disponible)
        return json({ code: "not_found", message: "Sin salas." }, 404);
      this.salas += 1;
      return json({
        roomId: "50000000-0000-4000-8000-000000000001",
        documentId: DOCUMENT_ID,
        participantId: "50000000-0000-4000-8000-000000000002",
        participants: [
          {
            id: "50000000-0000-4000-8000-000000000002",
            userId: OWNER_USER_ID,
            name: OWNER_EMAIL,
            joinedAt: new Date().toISOString(),
          },
        ],
        iceServers: [{ urls: ["stun:stun.example.org:3478"] }],
        turnConfigured: false,
        maxParticipants: 4,
      }, 201);
    }
    if (/\/events$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: ": abierto\n\n",
      });
    }
    if (/\/signals$/.test(path)) {
      this.señales.push(JSON.parse(route.request().postData() ?? "{}"));
      return json({ queued: true });
    }
    if (/\/leave$/.test(path)) return json({ left: true });
    return json({ code: "not_found", message: `Ruta de llamadas no contemplada: ${method} ${path}` }, 404);
  }
}

/* ── Abrir el estudio como lo abre una persona ───────────────────────────── */

async function abrirEstudio(
  context: BrowserContext,
  backend: CadV1Backend,
  extras?: { mensajeria?: MensajeriaStub; llamadas?: LlamadasStub },
): Promise<Page> {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  // Se instalan DESPUÉS: en Playwright gana la ruta registrada más tarde.
  if (extras?.mensajeria) await extras.mensajeria.install(context);
  if (extras?.llamadas) await extras.llamadas.install(context);
  const page = await context.newPage();
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  return page;
}

/* ══════════════════════════════════════════════════════════════════════════
   1. PRESENCIA — ¿quién está en mi plano?
   ══════════════════════════════════════════════════════════════════════════ */

test("presencia: solo dice que estoy solo, y cuando entra mi socia la nombra", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const arquitecta = await abrirEstudio(context, backend);
  await openCollabDock(arquitecta);

  const presencia = arquitecta.getByTestId("cad-collab-presence");
  await expect(presencia).toBeVisible();

  // «Nadie más» sólo se puede AFIRMAR si hay canal. Sin canal el producto tiene
  // que decir que no sabe, no inventarse un cero.
  await expect(
    presencia,
    "sin transporte no se puede afirmar que no haya nadie: el atributo es el que decide si el mensaje es cierto",
  ).toHaveAttribute("data-connected", "true");
  await expect(presencia).toContainText("Nadie más en este documento ahora mismo.");

  // Entra la socia: otra pestaña del mismo despacho, mismo documento.
  const socia = await context.newPage();
  await socia.goto(`/studio/${DOCUMENT_ID}`);
  await expect(socia.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await socia.getByTestId("cad-guided-tour-skip").count())
    await socia.getByTestId("cad-guided-tour-skip").click();

  const insignia = arquitecta.locator('[data-testid^="cad-collab-peer-"]');
  await expect(
    insignia,
    "la socia tiene el mismo plano abierto: si no aparece, la presencia es decorado",
  ).toHaveCount(1, { timeout: 30_000 });
  await expect(insignia.first()).toContainText(OWNER_EMAIL);

  // Se va: la lista tiene que VACIARSE sola, sin recargar.
  await socia.close();
  await expect(
    insignia,
    "si el que se fue se queda para siempre en la lista, la presencia miente en la dirección peligrosa",
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(presencia).toContainText("Nadie más en este documento ahora mismo.");
});

/* ══════════════════════════════════════════════════════════════════════════
   2. UN MENSAJE CLAVADO EN UN PUNTO DEL PLANO
   ══════════════════════════════════════════════════════════════════════════ */

test("anclar: dejo una nota en un punto del dibujo y sigue ahí al recargar", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const page = await abrirEstudio(context, backend);
  await openCollabDock(page);

  await page.getByTestId("cad-collab-place").click();
  await expect(page.getByTestId("cad-collab-place-hint")).toBeVisible();
  const overlay = page.getByTestId("cad-collab-overlay");
  const caja = await overlay.boundingBox();
  expect(caja).not.toBeNull();
  const clic = { x: Math.round(caja!.width * 0.4), y: Math.round(caja!.height * 0.45) };
  await overlay.click({ position: clic });

  await expect(page.getByTestId("cad-collab-pending-anchor")).toBeVisible();
  await page.getByTestId("cad-collab-draft").fill("Aquí el muro se come el paso de 90.");
  await page.getByTestId("cad-collab-submit").click();

  await expect.poll(() => backend.comments.rows.length, { timeout: 20_000 }).toBe(1);
  const guardado = backend.comments.rows[0];
  expect(
    guardado.anchor,
    "un ancla sin forma declarada es la que ningún visor sabe pintar",
  ).toMatchObject({ kind: "point", version: 1, space: "model" });

  // La chincheta cae DONDE PINCHÉ, no en una esquina cualquiera.
  const chincheta = page.getByTestId(`cad-collab-pin-${guardado.id}`);
  await expect(chincheta).toBeVisible();
  const cajaPin = await chincheta.boundingBox();
  expect(cajaPin).not.toBeNull();
  const centroPin = {
    x: cajaPin!.x + cajaPin!.width / 2 - caja!.x,
    y: cajaPin!.y + cajaPin!.height / 2 - caja!.y,
  };
  expect(
    Math.hypot(centroPin.x - clic.x, centroPin.y - clic.y),
    `la chincheta debería caer donde pinché (${clic.x},${clic.y}) y cayó en (${Math.round(centroPin.x)},${Math.round(centroPin.y)})`,
  ).toBeLessThan(24);

  // Y el hilo dice EN TEXTO dónde está anclado: sin eso, un comentario sin
  // chincheta visible sería imposible de encontrar en el plano.
  await expect(page.getByTestId(`cad-collab-thread-${guardado.id}`)).toContainText(
    "Anclado en",
  );

  // Recargo, que es lo que hace cualquiera al volver al día siguiente.
  await page.reload();
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  await openCollabDock(page);
  await expect(
    page.getByTestId(`cad-collab-thread-${guardado.id}`),
    "una nota que no sobrevive a recargar la página no sirve para hablar con un socio",
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`cad-collab-pin-${guardado.id}`)).toBeVisible();
});

/* ══════════════════════════════════════════════════════════════════════════
   3. MENSAJERÍA DE EQUIPO
   ══════════════════════════════════════════════════════════════════════════ */

test("mensajería: el estudio abre el canal del proyecto y mando un mensaje", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const mensajeria = new MensajeriaStub();
  const page = await abrirEstudio(context, backend, { mensajeria });

  const muelle = page.getByTestId("team-messaging-dock");
  await expect(muelle, "sin muelle no hay mensajería que auditar").toBeVisible({
    timeout: 60_000,
  });
  const abrir = page.getByTestId("team-messaging-toggle");
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  await expect(abrir).toHaveAttribute("aria-expanded", "true");

  const panel = page.getByTestId("team-messaging-panel");
  await expect(panel).toBeVisible();
  // El cable en vivo EXISTE: el navegador abre `/v1/messaging/events` y lo
  // reintenta cuando se cae. (Este doble no puede sostener un SSE abierto —
  // ver la nota en `MensajeriaStub` —, así que aquí se mide el cable, no el
  // rótulo «En vivo».)
  await expect
    .poll(() => mensajeria.aperturasSse, {
      timeout: 30_000,
      message: "si nadie abre el stream de eventos, la mensajería no es en vivo: es un formulario",
    })
    .toBeGreaterThan(0);
  // Y con el stream caído el rótulo NO miente: dice que está reconectando.
  await expect(page.getByTestId("team-messaging-connection")).toHaveAttribute(
    "data-connected",
    "false",
  );
  await expect(page.getByTestId("team-messaging-connection")).toContainText(
    "Reconectando",
  );

  // El canal del proyecto lo crea el producto solo: nadie debería tener que
  // entender qué es un «canal» antes de escribirle a su socia.
  await expect
    .poll(() => mensajeria.canales.length, {
      timeout: 30_000,
      message: "el estudio debería aprovisionar el canal «General» del proyecto",
    })
    .toBe(1);
  expect(mensajeria.canales[0]).toMatchObject({
    kind: "project",
    projectId: PROJECT_ID,
    name: "General",
  });
  const canalId = mensajeria.canales[0].id;
  await expect(page.getByTestId(`team-messaging-channel-${canalId}`)).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId("team-messaging-messages-empty")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("team-messaging-draft").fill("Subo la revisión C esta tarde.");
  await page.getByTestId("team-messaging-send").click();

  await expect.poll(() => mensajeria.mensajes.length, { timeout: 20_000 }).toBe(1);
  const enviado = mensajeria.mensajes[0] as { id: string; body: string };
  expect(enviado.body).toBe("Subo la revisión C esta tarde.");
  await expect(page.getByTestId(`team-messaging-message-${enviado.id}`)).toContainText(
    "Subo la revisión C esta tarde.",
  );
  await expect(page.getByTestId("team-messaging-error")).toHaveCount(0);
});

test("mensajería: ¿se puede anclar un MENSAJE a un punto del plano?", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const mensajeria = new MensajeriaStub();
  const page = await abrirEstudio(context, backend, { mensajeria });

  const abrir = page.getByTestId("team-messaging-toggle");
  await expect(abrir).toBeVisible({ timeout: 60_000 });
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  await expect(page.getByTestId("team-messaging-panel")).toBeVisible();
  await expect.poll(() => mensajeria.canales.length, { timeout: 30_000 }).toBe(1);
  await expect(page.getByTestId("team-messaging-draft")).toBeVisible({ timeout: 30_000 });

  // El contrato del mensaje LLEVA `anchor`. La pregunta del cliente es si hay
  // forma de rellenarlo sin escribir código: un botón, algo.
  const panel = page.getByTestId("team-messaging-panel");
  const anclas = panel.getByRole("button", { name: /anclar|ancla|plano|punto/i });
  const cuantas = await anclas.count();
  await page.getByTestId("team-messaging-draft").fill("Mira el encuentro del pilar.");
  await page.getByTestId("team-messaging-send").click();
  await expect.poll(() => mensajeria.mensajes.length, { timeout: 20_000 }).toBe(1);
  const enviado = mensajeria.mensajes[0] as { anchor: unknown };

  expect(
    { botonesDeAncla: cuantas, anclaDelMensaje: enviado.anchor },
    "el mensaje viaja con `anchor: null` y no hay ningún control para ponerle un punto: anclar sólo existe en los COMENTARIOS de revisión",
  ).toEqual({ botonesDeAncla: 0, anclaDelMensaje: null });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. VIDEOLLAMADA
   ══════════════════════════════════════════════════════════════════════════ */

test("videollamada: entro en la sala del plano, veo los mandos y cuelgo", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const llamadas = new LlamadasStub();
  const page = await abrirEstudio(context, backend, { llamadas });

  const empezar = page.getByTestId("call-start-button");
  await expect(empezar, "el botón de videollamada tiene que estar a la vista en el estudio").toBeVisible({
    timeout: 60_000,
  });
  await expect(empezar).toContainText("Videollamada");
  await empezar.click();

  await expect.poll(() => llamadas.salas, { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId("call-hangup-button")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("call-mic-toggle")).toBeVisible();
  await expect(page.getByTestId("call-camera-toggle")).toBeVisible();
  await expect(page.getByTestId("call-screenshare-toggle")).toBeVisible();
  // Estoy yo solo: el recuento tiene que decirlo, y mi propia baldosa de vídeo
  // tiene que llevar mi nombre para que se sepa quién es quién.
  const barra = page.getByTestId("call-hangup-button").locator("xpath=ancestor::*[3]");
  await expect(barra).toContainText("1 participante");
  await expect(barra).toContainText(`${OWNER_EMAIL} (tú)`);
  await expect(barra).toContainText("Llamando…");

  // Colgar no salta directo al principio: confirma que la llamada terminó y
  // espera un «Aceptar». Es un paso de más, pero es honesto — dice qué pasó.
  await page.getByTestId("call-hangup-button").click();
  await expect(page.getByText("Llamada terminada.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(
    page.getByTestId("call-start-button"),
    "colgar tiene que devolverme al estado inicial, no dejarme en una pantalla muerta",
  ).toBeVisible({ timeout: 30_000 });
});

test("videollamada: si el despliegue no tiene salas, lo dice en vez de girar", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const llamadas = new LlamadasStub();
  llamadas.disponible = false;
  const page = await abrirEstudio(context, backend, { llamadas });

  const empezar = page.getByTestId("call-start-button");
  await expect(empezar).toBeVisible({ timeout: 60_000 });
  await empezar.click();

  await expect(
    page.getByText("No tienes acceso a este documento para llamar."),
    "un 404 de la sala tiene que llegar al usuario como una frase, no como un spinner eterno",
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByTestId("call-start-button")).toBeVisible({ timeout: 30_000 });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. PRESENCIA ENTRE MÁQUINAS
   La prueba 1 demuestra la presencia entre PESTAÑAS (BroadcastChannel, mismo
   navegador). Un despacho de dos personas son dos ORDENADORES, y eso viaja
   por otro cable: `GET /v1/cad/documents/:id/presence/stream` (SSE) para
   recibir y `POST .../presence` para emitir. Aquí se le pone ese cable.
   ══════════════════════════════════════════════════════════════════════════ */

class PresenciaServidorStub {
  publicados: unknown[] = [];
  aperturasStream = 0;
  /** El compañero que está en la OTRA máquina. */
  readonly otro = {
    peerId: "60000000-0000-4000-8000-000000000001",
    name: "Marta (portátil de obra)",
  };

  async install(context: BrowserContext) {
    await context.route(
      `${API_ORIGIN}/v1/cad/documents/*/presence*`,
      (route) => this.handle(route),
    );
    await context.route(
      `${API_ORIGIN}/v1/cad/documents/*/presence/stream*`,
      (route) => this.handle(route),
    );
  }

  private async handle(route: Route) {
    const url = new URL(route.request().url());
    const method = route.request().method().toUpperCase();
    if (url.pathname.endsWith("/presence/stream")) {
      this.aperturasStream += 1;
      // Playwright no sostiene un SSE abierto: se entrega UN latido y el
      // navegador reconecta. Como el latido se regenera con la hora actual en
      // cada reconexión, el compañero se mantiene vivo dentro del TTL.
      const beat = {
        peerId: this.otro.peerId,
        documentId: DOCUMENT_ID,
        name: this.otro.name,
        at: Date.now(),
        cursor: { x: 4_200, y: 3_100 },
        viewport: { minX: 0, minY: 0, maxX: 12_000, maxY: 9_000 },
        guest: false,
      };
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify(beat)}\n\n`,
      });
    }
    if (method === "POST") {
      this.publicados.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  }
}

test("presencia entre máquinas: veo a quien está en OTRO ordenador, no sólo en otra pestaña", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const presenciaServidor = new PresenciaServidorStub();
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  await presenciaServidor.install(context);
  const page = await context.newPage();
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  await openCollabDock(page);

  // a) Mi latido SALE de esta máquina.
  await expect
    .poll(() => presenciaServidor.publicados.length, {
      timeout: 30_000,
      message:
        "si el navegador no publica el latido, mi socia jamás sabrá que estoy en el plano",
    })
    .toBeGreaterThan(0);
  expect(presenciaServidor.publicados[0]).toMatchObject({
    peerId: expect.any(String),
  });

  // b) El de la otra máquina ENTRA.
  await expect
    .poll(() => presenciaServidor.aperturasStream, { timeout: 30_000 })
    .toBeGreaterThan(0);
  const insignia = page.getByTestId(
    `cad-collab-peer-${presenciaServidor.otro.peerId}`,
  );
  await expect(
    insignia,
    "el latido llega por el stream del servidor: si no aparece, la presencia sólo funciona entre pestañas del MISMO navegador",
  ).toBeVisible({ timeout: 30_000 });
  await expect(insignia).toContainText("Marta (portátil de obra)");

  // c) Y sé DÓNDE está mirando: el latido trae el cursor.
  await expect(insignia).toHaveAttribute("title", /Cursor en 4200, 3100/);
});

/* ══════════════════════════════════════════════════════════════════════════
   6. ¿PUEDO ESCRIBIRLE SÓLO A MI SOCIA?
   Somos dos. A veces una nota es para ella y no para el canal del proyecto.
   ══════════════════════════════════════════════════════════════════════════ */

test("mensajería: qué mandos me ofrece de verdad el panel de equipo", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = backendConProyecto();
  const mensajeria = new MensajeriaStub();
  const page = await abrirEstudio(context, backend, { mensajeria });

  const abrir = page.getByTestId("team-messaging-toggle");
  await expect(abrir).toBeVisible({ timeout: 60_000 });
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  const panel = page.getByTestId("team-messaging-panel");
  await expect(panel).toBeVisible();
  await expect.poll(() => mensajeria.canales.length, { timeout: 30_000 }).toBe(1);
  await expect(page.getByTestId("team-messaging-draft")).toBeVisible({ timeout: 30_000 });

  // El inventario completo de lo que puedo pulsar aquí dentro.
  const rotulos = (await panel.getByRole("button").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  expect(
    rotulos,
    "el panel de equipo sólo ofrece el canal del proyecto y «Enviar»: no hay ningún control para abrir una conversación privada con una persona concreta, aunque el contrato de la API sí tiene canales `direct`",
  ).toEqual(["General", "Enviar"]);
});

/**
 * Y SI EL PLANO NO CUELGA DE NINGÚN PROYECTO, ¿qué me queda?
 * El canal «General» se aprovisiona a partir del proyecto del documento. Un
 * documento suelto no tiene proyecto: esta prueba mide en qué estado deja eso
 * al panel de equipo.
 */
test("mensajería: un plano sin proyecto deja el panel de equipo sin salida", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = new CadV1Backend([
    {
      model: "AXOS-CAD-STUDIO",
      revision: "UNIVERSAL",
      document: planta() as unknown as Record<string, unknown>,
      version: 1,
      footprint: FOOTPRINT,
    },
  ]); // sin projectId: el documento no cuelga de ningún proyecto
  const mensajeria = new MensajeriaStub();
  const page = await abrirEstudio(context, backend, { mensajeria });

  const abrir = page.getByTestId("team-messaging-toggle");
  await expect(abrir).toBeVisible({ timeout: 60_000 });
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  const panel = page.getByTestId("team-messaging-panel");
  await expect(panel).toBeVisible();

  await expect(page.getByTestId("team-messaging-channels-empty")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("team-messaging-no-selection")).toBeVisible();
  expect(mensajeria.canales.length).toBe(0);

  // Y no hay NADA que pulsar para salir de ahí.
  const rotulos = (await panel.getByRole("button").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  expect(
    rotulos,
    "«Sin canales todavía» + «Elige un canal» y cero botones: el panel de equipo es un callejón sin salida para un plano que no cuelga de un proyecto",
  ).toEqual([]);
});
