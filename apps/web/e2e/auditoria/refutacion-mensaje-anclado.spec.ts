/**
 * ESCÉPTICO — «no se puede anclar un MENSAJE del chat a un punto del plano».
 *
 * No repito su localizador (`getByRole("button", {name:/anclar|ancla|.../})`):
 * un regex que no casa no prueba nada, sólo prueba que ese regex no casa. Aquí
 * se ENUMERAN todos los controles del muelle de equipo —botones, entradas,
 * selects, enlaces, cualquier cosa con aria-label o title, con o sin rótulo en
 * español— y se imprime la lista. Si existiera un afordance de anclaje bajo
 * otro nombre (chincheta, pin, «marcar en el plano», un icono sin texto), la
 * lista lo enseñaría.
 */
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
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

class MensajeriaStub {
  readonly canales: Record<string, unknown>[] = [];
  readonly mensajes: Record<string, unknown>[] = [];
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
      const canal = {
        id: `30000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`,
        kind: dto.kind, projectId: dto.projectId ?? null, name: dto.name ?? null,
        otherMember: null, unreadCount: 0, lastMessageAt: null, createdAt: new Date().toISOString(),
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
        body: dto.body, parentMessageId: null, anchor: dto.anchor ?? null,
        createdAt: new Date().toISOString(),
      };
      this.mensajes.push(mensaje);
      return json(mensaje, 201);
    }
    if (/^\/v1\/messaging\/channels\/[^/]+\/read$/.test(path)) return json({ read: true });
    return json({ code: "not_found", message: `no contemplada: ${method} ${path}` }, 404);
  }
}

async function abrirEstudio(context: BrowserContext, mensajeria: MensajeriaStub): Promise<Page> {
  const backend = new CadV1Backend([]);
  const fila = backend.register({
    model: "AXOS-CAD-STUDIO", revision: "UNIVERSAL",
    document: planta() as unknown as Record<string, unknown>, version: 1, footprint: FOOTPRINT,
  });
  fila.projectId = PROJECT_ID;
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

test("escéptico: censo COMPLETO de controles del muelle de equipo", async ({ context }) => {
  test.setTimeout(180_000);
  const mensajeria = new MensajeriaStub();
  const page = await abrirEstudio(context, mensajeria);

  const abrir = page.getByTestId("team-messaging-toggle");
  await expect(abrir).toBeVisible({ timeout: 60_000 });
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  await expect(page.getByTestId("team-messaging-panel")).toBeVisible();
  await expect.poll(() => mensajeria.canales.length, { timeout: 30_000 }).toBe(1);
  await expect(page.getByTestId("team-messaging-draft")).toBeVisible({ timeout: 30_000 });

  // Censo de TODO lo interactivo del muelle: nada de regex, la lista entera.
  const censo = await page.getByTestId("team-messaging-dock").evaluate((root) => {
    const sel = "button,[role=button],input,select,textarea,a,[aria-label],[title],[contenteditable]";
    return Array.from(root.querySelectorAll(sel)).map((el) => ({
      tag: el.tagName.toLowerCase(),
      testid: (el as HTMLElement).dataset.testid ?? null,
      texto: (el.textContent ?? "").trim().slice(0, 60),
      aria: el.getAttribute("aria-label"),
      title: el.getAttribute("title"),
    }));
  });
  console.log("CENSO_MUELLE_EQUIPO " + JSON.stringify(censo, null, 1));

  const sospechosos = censo.filter((c) =>
    /ancl|clav|chinchet|\bpin\b|punto|plano|lienzo|marcar|situar|colocar|ubicar/i.test(
      `${c.texto} ${c.aria ?? ""} ${c.title ?? ""} ${c.testid ?? ""}`,
    ),
  );
  console.log("SOSPECHOSOS " + JSON.stringify(sospechosos));

  // Y el camino largo: escribir y enviar. ¿Viaja algo en `anchor`?
  await page.getByTestId("team-messaging-draft").fill("Mira el encuentro del pilar.");
  await page.getByTestId("team-messaging-send").click();
  await expect.poll(() => mensajeria.mensajes.length, { timeout: 20_000 }).toBe(1);
  console.log("MENSAJE_ENVIADO " + JSON.stringify(mensajeria.mensajes[0]));

  // Y con un mensaje YA anclado inyectado por el servidor: ¿lo pinta el panel?
  // (esto separa «no sabe leer anclas» de «no sabe crearlas»)
  // El servidor DEVUELVE un mensaje ya anclado (lo escribió otro cliente):
  // ¿lo sabe leer el panel? ¿aparece chincheta sobre el plano?
  const canalId = mensajeria.canales[0].id as string;
  mensajeria.mensajes.push({
    id: "40000000-0000-4000-8000-000000000099",
    channelId: canalId,
    author: { userId: "10000000-0000-4000-8000-000000000002", email: "socia@example.org", displayName: "Socia" },
    body: "El pilar de aqui no cuadra.",
    parentMessageId: null,
    anchor: { kind: "point", version: 1, space: "model", x: 5000, y: 1000 },
    createdAt: new Date().toISOString(),
  });
  await page.reload();
  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();
  const abrir2 = page.getByTestId("team-messaging-toggle");
  if ((await abrir2.getAttribute("aria-expanded")) !== "true") await abrir2.click();
  await page.getByTestId(`team-messaging-channel-${canalId}`).click();
  const fila = page.getByTestId("team-messaging-message-40000000-0000-4000-8000-000000000099");
  await expect(fila).toBeVisible({ timeout: 30_000 });
  console.log("BADGE_ANCLADO " + JSON.stringify((await fila.textContent()) ?? ""));
  const chinchetas = await page.locator('[data-testid*="anchor"],[data-testid*="pin"]').count();
  console.log("CHINCHETAS_SOBRE_EL_PLANO " + chinchetas);
  expect(censo.length).toBeGreaterThan(0);
});
