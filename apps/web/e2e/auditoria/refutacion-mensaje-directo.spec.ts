/**
 * ESCÉPTICO — «no hay por dónde escribirle sólo a mi socia».
 *
 * Dos comprobaciones independientes del inventario del compañero:
 *
 *  A) EL MANDO: con la socia PRESENTE (presencia por servidor) y la
 *     mensajería viva, se inventaría TODA la página —no sólo el panel— en
 *     busca de cualquier control que abra una conversación con una persona.
 *
 *  B) EL CONTROL POSITIVO: si el servidor YA devuelve un canal `direct`, el
 *     panel lo pinta con el nombre de la otra persona y deja escribir. Eso
 *     descarta que el doble o el localizador estén mal montados: lo que
 *     falta es el mando para CREARLO, no el soporte del canal.
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
const SOCIA_USER_ID = "70000000-0000-4000-8000-000000000001";
const FOOTPRINT = { footprintW: 12_000, footprintH: 9_000, unit: "mm", gridSize: 100 };

function planta(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      { id: "muro-sur", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 9_000, y: 1_000, z: 0 }, layer: "0" },
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
  fila.projectId = PROJECT_ID;
  return backend;
}

interface CanalStub {
  id: string;
  kind: "project" | "direct";
  projectId: string | null;
  name: string | null;
  otherMember: { userId: string; email: string; displayName: string | null } | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

class MensajeriaStub {
  readonly canales: CanalStub[] = [];
  readonly mensajes: Record<string, unknown>[] = [];
  /** Todo POST /v1/messaging/channels con su cuerpo, para ver si alguna vez se pide `direct`. */
  readonly creaciones: Record<string, unknown>[] = [];
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

    if (path === "/v1/messaging/events")
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": abierto\n\n" });
    if (path === "/v1/messaging/channels" && method === "GET") return json({ items: this.canales });
    if (path === "/v1/messaging/channels" && method === "POST") {
      const dto = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      this.creaciones.push(dto);
      const canal: CanalStub = {
        id: `30000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`,
        kind: (dto.kind as "project" | "direct") ?? "project",
        projectId: (dto.projectId as string) ?? null,
        name: (dto.name as string) ?? null,
        otherMember:
          dto.kind === "direct"
            ? { userId: dto.memberUserId as string, email: "marta@estudio.example", displayName: "Marta Ruiz" }
            : null,
        unreadCount: 0,
        lastMessageAt: null,
        createdAt: new Date().toISOString(),
      };
      this.canales.push(canal);
      return json(canal, 201);
    }
    const mensajes = path.match(/^\/v1\/messaging\/channels\/([^/]+)\/messages$/);
    if (mensajes && method === "GET")
      return json({ items: this.mensajes.filter((m) => m.channelId === mensajes[1]), nextCursor: null });
    if (mensajes && method === "POST") {
      const dto = JSON.parse(route.request().postData() ?? "{}") as { body: string; anchor?: unknown };
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
    return json({ code: "not_found", message: `${method} ${path}` }, 404);
  }
}

class PresenciaServidorStub {
  readonly otro = { peerId: "60000000-0000-4000-8000-000000000001", name: "Marta Ruiz" };
  async install(context: BrowserContext) {
    await context.route(`${API_ORIGIN}/v1/cad/documents/*/presence*`, (route) => this.handle(route));
    await context.route(`${API_ORIGIN}/v1/cad/documents/*/presence/stream*`, (route) => this.handle(route));
  }
  private async handle(route: Route) {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/presence/stream")) {
      const beat = {
        peerId: this.otro.peerId,
        documentId: DOCUMENT_ID,
        name: this.otro.name,
        at: Date.now(),
        cursor: { x: 4_200, y: 3_100 },
        viewport: { minX: 0, minY: 0, maxX: 12_000, maxY: 9_000 },
        guest: false,
      };
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify(beat)}\n\n` });
    }
    if (route.request().method().toUpperCase() === "POST")
      return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
}

async function abrirEstudio(
  context: BrowserContext,
  backend: CadV1Backend,
  extras?: { mensajeria?: MensajeriaStub; presencia?: PresenciaServidorStub },
): Promise<Page> {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  if (extras?.mensajeria) await extras.mensajeria.install(context);
  if (extras?.presencia) await extras.presencia.install(context);
  const page = await context.newPage();
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  return page;
}

async function abrirMuelleEquipo(page: Page) {
  const abrir = page.getByTestId("team-messaging-toggle");
  await expect(abrir).toBeVisible({ timeout: 60_000 });
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  await expect(page.getByTestId("team-messaging-panel")).toBeVisible();
}

/* A) ¿Existe el mando en ALGUNA parte del estudio, con la socia presente? */
test("escéptico: con la socia presente, ¿algún control de TODO el estudio abre una conversación con ELLA?", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const mensajeria = new MensajeriaStub();
  const presencia = new PresenciaServidorStub();
  const page = await abrirEstudio(context, backendConProyecto(), { mensajeria, presencia });

  // El muelle de colaboración nace plegado: se abre como haría una persona
  // (misma fixture que usa el compañero) y ENTONCES aparece la insignia.
  await openCollabDock(page);
  const insignia = page.getByTestId(`cad-collab-peer-${presencia.otro.peerId}`);
  await expect(insignia).toBeVisible({ timeout: 30_000 });

  await abrirMuelleEquipo(page);
  await expect(page.getByTestId("team-messaging-draft")).toBeVisible({ timeout: 30_000 });

  // Inventario de TODA la página, no sólo del panel. Se guarda entero a
  // disco para revisarlo a mano: el catálogo de mobiliario mete ruido
  // («Persona», descripciones de plantillas) y un regex ciego lo confundiría
  // con un mando de mensajería.
  const inventario = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"], [role="menuitem"], [role="option"], select, summary',
      ),
    ).map((el) => ({
      testid: el.getAttribute("data-testid") ?? "",
      titulo: (el.getAttribute("title") ?? "").slice(0, 80),
      aria: el.getAttribute("aria-label") ?? "",
      texto: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
      dentroDeMuelle: !!el.closest('[data-testid="team-messaging-dock"], [data-testid="cad-collab-dock"]'),
    })),
  );
  const fs = await import("node:fs");
  fs.writeFileSync(
    "/tmp/claude-0/-home-user-valle-design/2f4c06e1-2089-56de-9db7-cb15aabde438/scratchpad/inventario.json",
    JSON.stringify(inventario, null, 2),
  );
  console.log(`[esceptico] controles totales en la página: ${inventario.length}`);
  const enMuelles = inventario.filter((c) => c.dentroDeMuelle);
  console.log(`[esceptico] controles DENTRO de los dos muelles de colaboración: ${JSON.stringify(enMuelles, null, 2)}`);

  // ¿Y la insignia de la socia? ¿Se puede pulsar para escribirle?
  const insigniaEsBoton = await insignia.evaluate(
    (el) =>
      el.tagName.toLowerCase() === "button" ||
      el.getAttribute("role") === "button" ||
      !!el.querySelector("button, a[href]"),
  );
  console.log(`[esceptico] la insignia de la socia es pulsable: ${insigniaEsBoton}`);

  await page.waitForTimeout(2_000);
  const directos = mensajeria.creaciones.filter((c) => c.kind === "direct");
  console.log(`[esceptico] canales pedidos al servidor: ${JSON.stringify(mensajeria.creaciones)}`);
  expect(
    enMuelles.map((c) => c.texto),
    "los DOS muelles de colaboración juntos, con la socia dentro, no ofrecen ningún mando para hablar con ELLA",
  ).toEqual(["Ocultar", "Anclar en el plano", "Comentar", "Crear enlace", "Ocultar", "General", "Enviar"]);
  expect(insigniaEsBoton, "la insignia de la socia tampoco es pulsable").toBe(false);
  expect(directos, "el estudio nunca llega a pedir un canal `direct`").toEqual([]);
});

/* B) Control positivo: un canal `direct` YA existente sí se pinta y sí deja escribir. */
test("escéptico: si el servidor YA devuelve un canal directo, el panel lo pinta y deja escribir", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const mensajeria = new MensajeriaStub();
  mensajeria.canales.push({
    id: "30000000-0000-4000-8000-0000000000aa",
    kind: "direct",
    projectId: null,
    name: null,
    otherMember: { userId: SOCIA_USER_ID, email: "marta@estudio.example", displayName: "Marta Ruiz" },
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: new Date().toISOString(),
  });
  const page = await abrirEstudio(context, backendConProyecto(), { mensajeria });
  await abrirMuelleEquipo(page);

  const panel = page.getByTestId("team-messaging-panel");
  const canalDirecto = page.getByTestId("team-messaging-channel-30000000-0000-4000-8000-0000000000aa");
  await expect(canalDirecto, "el panel SÍ sabe pintar un canal directo").toBeVisible({ timeout: 30_000 });
  await expect(canalDirecto).toContainText("Marta Ruiz");
  await canalDirecto.click();
  await page.getByTestId("team-messaging-draft").fill("Marta, mira el muro sur.");
  await page.getByTestId("team-messaging-send").click();
  await expect
    .poll(() => mensajeria.mensajes.length, { timeout: 30_000 })
    .toBe(1);

  const rotulos = (await panel.getByRole("button").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  console.log(`[esceptico] rótulos con canal directo preexistente: ${JSON.stringify(rotulos)}`);
});
