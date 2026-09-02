/**
 * ESCEPTICISMO — «un plano sin proyecto deja el panel de equipo sin salida».
 *
 * Dos medidas sobre EL MISMO documento sin `projectId`:
 *
 *  A) Con el servidor de mensajería recién estrenado (cero canales en toda la
 *     organización): ¿sale «Sin canales todavía» y cero botones?
 *  B) Con el servidor de mensajería tal y como lo tiene un despacho que ya
 *     trabaja (UN canal de proyecto ya existente — el contrato dice que
 *     `GET /v1/messaging/channels` lista los canales de proyecto de TODA la
 *     organización, no los del proyecto del documento abierto): ¿sigue siendo
 *     un callejón sin salida, o puedo elegir el canal y escribirle a mi socia
 *     desde ese mismo plano suelto?
 */
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { API_ORIGIN, OWNER_EMAIL, OWNER_USER_ID } from "../fixtures/constants";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const OTRO_PROYECTO = "20000000-0000-4000-8000-000000000009";
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

/** Documento SIN projectId — igual que el del compañero. */
function backendSinProyecto(): CadV1Backend {
  return new CadV1Backend([
    {
      model: "AXOS-CAD-STUDIO",
      revision: "UNIVERSAL",
      document: planta() as unknown as Record<string, unknown>,
      version: 1,
      footprint: FOOTPRINT,
    },
  ]);
}

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
  private seq = 0;

  /** Un canal que YA existe en la organización antes de abrir nada. */
  sembrarCanalDeProyecto(projectId: string, name: string): CanalStub {
    const canal: CanalStub = {
      id: `30000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`,
      kind: "project",
      projectId,
      name,
      otherMember: null,
      unreadCount: 0,
      lastMessageAt: null,
      createdAt: new Date(0).toISOString(),
    };
    this.canales.push(canal);
    return canal;
  }

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

async function abrirEstudio(
  context: BrowserContext,
  backend: CadV1Backend,
  mensajeria: MensajeriaStub,
): Promise<Page> {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  await mensajeria.install(context);
  const page = await context.newPage();
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  return page;
}

async function abrirPanel(page: Page) {
  const abrir = page.getByTestId("team-messaging-toggle");
  await expect(abrir).toBeVisible({ timeout: 60_000 });
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  const panel = page.getByTestId("team-messaging-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test("A) reproducción: plano sin proyecto + organización sin ningún canal", async ({ context }) => {
  test.setTimeout(180_000);
  const mensajeria = new MensajeriaStub();
  const page = await abrirEstudio(context, backendSinProyecto(), mensajeria);
  const panel = await abrirPanel(page);

  await expect(page.getByTestId("team-messaging-channels-empty")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("team-messaging-no-selection")).toBeVisible();
  expect(mensajeria.canales.length).toBe(0);
  const botones = await panel.getByRole("button").count();
  // Inventario más ancho que el del compañero: cualquier cosa pulsable o
  // escribible, no sólo <button>.
  const controles = await panel.locator("button, a, input, select, textarea, [role=button]").count();
  console.log(`[A] botones=${botones} controles=${controles}`);
  expect(botones).toBe(0);
});

test("B) refutación: el mismo plano sin proyecto en un despacho que YA tiene un canal", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const mensajeria = new MensajeriaStub();
  // El despacho ya trabaja: existe el canal «General» del proyecto de la
  // reforma. El documento que abro NO cuelga de ese proyecto (ni de ninguno).
  const yaExiste = mensajeria.sembrarCanalDeProyecto(OTRO_PROYECTO, "General");
  const page = await abrirEstudio(context, backendSinProyecto(), mensajeria);
  const panel = await abrirPanel(page);

  // ¿Aparece el canal, aunque el documento abierto no tenga proyecto?
  await expect(page.getByTestId(`team-messaging-channel-${yaExiste.id}`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("team-messaging-channels-empty")).toHaveCount(0);

  const rotulos = (await panel.getByRole("button").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  console.log(`[B] inventario inicial = ${JSON.stringify(rotulos)}`);

  // ¿Puedo elegirlo y escribirle a mi socia desde este plano suelto?
  await page.getByTestId(`team-messaging-channel-${yaExiste.id}`).click();
  await page.getByTestId("team-messaging-draft").fill("Te dejo el plano suelto revisado.");
  await page.getByTestId("team-messaging-send").click();
  await expect.poll(() => mensajeria.mensajes.length, { timeout: 20_000 }).toBe(1);
  expect((mensajeria.mensajes[0] as { body: string }).body).toBe(
    "Te dejo el plano suelto revisado.",
  );
  await expect(page.getByTestId("team-messaging-error")).toHaveCount(0);
  // Y no se ha inventado ningún canal nuevo: sigue habiendo uno.
  expect(mensajeria.canales.length).toBe(1);
});
