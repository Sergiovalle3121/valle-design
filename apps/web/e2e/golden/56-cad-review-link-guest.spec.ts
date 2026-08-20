/**
 * EL ENLACE DE REVISIÓN ABIERTO POR UN TERCERO SIN SESIÓN.
 *
 * Es la demo que vende el producto: el arquitecto manda un enlace, su cliente
 * lo abre en el móvil, ve el plano y comenta sobre un punto concreto. Sin
 * instalar nada, sin crear cuenta, sin licencia. AutoCAD Web no lo hace: allí
 * el invitado necesita una cuenta de Autodesk.
 *
 * Lo que hacía falta para que fuese verdad y no lo era:
 *
 *  · El invitado llegaba al ESTUDIO (`/studio/:id#cadReview=`), y esa página
 *    exige sesión: sin cookie respondía «Tu sesión ha expirado». Funcionaba en
 *    el golden 22 sólo porque el invitado era otra pestaña del MISMO contexto,
 *    con las cookies del autor. Un tercero de verdad nunca pasaba de ahí.
 *  · Y aunque hubiera entrado, no podía escribir: el botón de comentar estaba
 *    deshabilitado en review, y los comentarios no llegaban a `cad_comments`.
 *
 * Aquí el invitado es un CONTEXTO NUEVO SIN LOGIN, así que todo lo de primera
 * parte le responde 401. Si algo de esta página necesitara sesión, este spec
 * lo caza.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend, seedFootprint } from "../fixtures/cad-v1-backend";
import {
  installStandaloneIdentity,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const FOOTPRINT = {
  footprintW: 12_000,
  footprintH: 9_000,
  unit: "mm",
  gridSize: 100,
};

function canonicalDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "OCULTA", name: "OCULTA", color: "#ff00ff", visible: false, locked: false },
    ],
    entities: [
      {
        id: "fachada",
        type: "polyline",
        vertices: [
          { x: 1_000, y: 1_000, z: 0 },
          { x: 9_000, y: 1_000, z: 0 },
          { x: 9_000, y: 6_000, z: 0 },
          { x: 1_000, y: 6_000, z: 0 },
        ],
        closed: true,
        layer: "0",
      },
      {
        id: "replanteo",
        type: "line",
        start: { x: 0, y: 20_000, z: 0 },
        end: { x: 10_000, y: 20_000, z: 0 },
        layer: "OCULTA",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["fachada", "replanteo"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

function sharedBackend(): CadV1Backend {
  return new CadV1Backend([
    {
      model: "AXOS-CAD-STUDIO",
      revision: "UNIVERSAL",
      document: seedFootprint(
        canonicalDocument() as unknown as Record<string, unknown>,
        FOOTPRINT,
      ),
      version: 1,
      footprint: FOOTPRINT,
    },
  ]);
}

/**
 * El invitado: contexto limpio, SIN login. La frontera de identidad se instala
 * igualmente para que TODO lo de primera parte le responda 401 — es lo que
 * convierte este spec en una prueba de que la página del enlace no necesita
 * sesión, en vez de una en la que las llamadas de sesión simplemente no se ven.
 */
async function installGuest(context: BrowserContext, backend: CadV1Backend) {
  await installMockBackend(context);
  await installStandaloneIdentity(context);
  await backend.install(context);
}

async function openReview(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId("cad-review-banner")).toBeVisible({
    timeout: 60_000,
  });
}

test("un tercero sin cuenta abre el enlace, ve el plano y comenta sobre un punto", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const backend = sharedBackend();

  // ── El arquitecto emite el enlace desde su estudio ─────────────────────────
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await expect(page.getByTestId("cad-collab-dock")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("cad-review-link-new").click();
  await expect(page.getByTestId("cad-review-link-issued")).toBeVisible();

  const enlace = (await page.getByTestId("cad-review-link-url").textContent())?.trim() ?? "";
  expect(backend.reviewSessions).toHaveLength(1);
  const sesion = backend.reviewSessions[0];
  expect(sesion.token).toMatch(/^vdrl_/);
  // El token viaja SÓLO en el fragmento: en la ruta o en la query acabaría en
  // los logs del servidor web y en la cabecera Referer.
  expect(enlace).toContain(`/revision#cadReview=${encodeURIComponent(sesion.token)}`);
  expect(new URL(enlace).search, "nada de token en la query string").toBe("");

  // Un hilo interno del autor, para poder afirmar el AISLAMIENTO más abajo.
  backend.comments.rows.push({
    id: "00000000-0000-4000-a000-000000000900",
    documentId: DOCUMENT_ID,
    reviewSessionId: null,
    author: "e2e@valle",
    body: "Nota interna del despacho: revisar honorarios.",
    anchor: null,
    resolved: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  // ── El cliente: navegador limpio, sin cuenta ──────────────────────────────
  const clienteContexto = await browser.newContext();
  await installGuest(clienteContexto, backend);
  const cliente = await clienteContexto.newPage();
  await openReview(cliente, enlace);

  await expect(cliente.getByTestId("cad-review-document-name")).toBeVisible();
  // El plano se dibuja de verdad: sin trazos, esto sería una pantalla en negro
  // con un panel al lado.
  await expect
    .poll(() => cliente.locator('[data-testid="cad-review-plan"] svg path').count())
    .toBeGreaterThan(0);
  // Y respeta lo que el autor apagó: la capa oculta no se le enseña al cliente.
  expect(
    await cliente
      .locator('[data-testid="cad-review-plan"] svg path[stroke="#ff00ff"]')
      .count(),
  ).toBe(0);
  // El token desaparece de la barra en cuanto se lee.
  expect(cliente.url()).not.toContain(sesion.token);

  // ── AISLAMIENTO: sólo el hilo de SU sesión ────────────────────────────────
  await expect(
    cliente.getByTestId("cad-collab-thread-00000000-0000-4000-a000-000000000900"),
    "el invitado no puede ver los hilos internos del despacho",
  ).toHaveCount(0);

  // ── El cliente comenta sobre un punto del plano ───────────────────────────
  await cliente.getByTestId("cad-collab-place").click();
  await cliente.getByTestId("cad-review-plan").click({ position: { x: 260, y: 200 } });
  await expect(cliente.getByTestId("cad-collab-pending-anchor")).toBeVisible();
  await cliente
    .getByTestId("cad-collab-draft")
    .fill("Esta ventana da al patio de luces, no a la calle.");
  await cliente.getByTestId("cad-collab-submit").click();

  await expect
    .poll(
      () => backend.comments.rows.filter((row) => row.reviewSessionId === sesion.id).length,
      { timeout: 20_000 },
    )
    .toBe(1);
  const delCliente = backend.comments.rows.find(
    (row) => row.reviewSessionId === sesion.id,
  )!;
  expect(delCliente.documentId).toBe(DOCUMENT_ID);
  expect(delCliente.author).toBe("anonymous");
  expect(delCliente.anchor).toMatchObject({
    kind: "point",
    version: 1,
    space: "model",
  });

  // Su propia chincheta aparece sobre el plano que está mirando.
  await expect(cliente.getByTestId(`cad-review-pin-${delCliente.id}`)).toBeVisible();
  await expect(cliente.getByTestId(`cad-review-pin-${delCliente.id}`)).toHaveText("1");
  // El invitado NO puede cerrar hilos: eso lo decide el autor del plano.
  await expect(cliente.getByTestId(`cad-collab-resolve-${delCliente.id}`)).toHaveCount(0);

  // ── Y el arquitecto lo ve en SU plano, anclado ────────────────────────────
  await expect(page.getByTestId(`cad-collab-thread-${delCliente.id}`)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId(`cad-collab-pin-${delCliente.id}`)).toBeVisible();

  // ── Revocar mata el enlace de inmediato ───────────────────────────────────
  await page.getByTestId(`cad-review-session-close-${sesion.id}`).click();
  await expect
    .poll(() => backend.reviewSessions[0].status, { timeout: 20_000 })
    .toBe("closed");
  const revocado = await clienteContexto.newPage();
  await revocado.goto(enlace);
  await expect(revocado.getByTestId("cad-review-failed")).toBeVisible({
    timeout: 60_000,
  });
  await expect(revocado.getByTestId("cad-review-surface")).toHaveCount(0);

  await revocado.close();
  await cliente.close();
  await clienteContexto.close();
});

test("sin credencial en el enlace, la página lo dice y no enseña ningún plano", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const backend = sharedBackend();
  const contexto = await browser.newContext();
  await installGuest(contexto, backend);
  const page = await contexto.newPage();
  await page.goto("/revision");
  await expect(page.getByTestId("cad-review-failed")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("cad-review-plan")).toHaveCount(0);
  await contexto.close();
});

test("un enlace con comentarios apagados deja mirar pero no escribir", async ({
  browser,
  context,
}) => {
  test.setTimeout(180_000);
  const backend = sharedBackend();
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  // La sesión se crea por la API, como haría el estudio, pero sin comentarios.
  const page = await context.newPage();
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await expect(page.getByTestId("cad-collab-dock")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("cad-review-link-new").click();
  await expect(page.getByTestId("cad-review-link-issued")).toBeVisible();
  const enlace = (await page.getByTestId("cad-review-link-url").textContent())?.trim() ?? "";
  backend.reviewSessions[0].allowComments = false;

  const contexto = await browser.newContext();
  await installGuest(contexto, backend);
  const cliente = await contexto.newPage();
  await openReview(cliente, enlace);
  await expect(cliente.getByTestId("cad-collab-disabled")).toBeVisible();
  await expect(cliente.getByTestId("cad-collab-submit")).toHaveCount(0);
  await expect(cliente.getByTestId("cad-review-plan")).toBeVisible();
  await contexto.close();
});
