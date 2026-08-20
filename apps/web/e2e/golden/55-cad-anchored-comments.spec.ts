/**
 * DOS SESIONES CONCURRENTES COMENTANDO EL MISMO DOCUMENTO.
 *
 * Es el golden que define la ola. Hasta ahora la revisión existía entera en el
 * servidor —sesiones, comentarios con ancla, aislamiento por token— y en el
 * navegador no se veía por ninguna parte: los hilos que el editor enseñaba
 * vivían DENTRO del documento guardado, en una paleta lateral, y no viajaban a
 * `cad_comments`. Es decir, dos arquitectos con el mismo plano abierto no se
 * leían.
 *
 * Aquí hay dos CONTEXTOS de navegador de verdad —cookies distintas,
 * almacenamiento distinto— contra UN backend compartido, que es la única forma
 * de que este spec pueda fallar por lo que dice probar. Con una sola pestaña,
 * un comentario guardado en memoria pasaría igual.
 *
 * Lo que se afirma, en orden:
 *   1. Anclar es elegir un PUNTO del plano, no rellenar un campo.
 *   2. Lo que se guarda es el contrato de ancla, no un objeto cualquiera.
 *   3. La otra sesión lo ve, con su número y su chincheta sobre el dibujo.
 *   4. La chincheta se mueve con la cámara: está pegada al dibujo, no al vidrio.
 *   5. Resolver en una sesión llega a la otra.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { CadV1Backend, seedFootprint } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { openCollabDock } from "../fixtures/collab-dock";
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
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 9_000, y: 1_000, z: 0 },
        layer: "0",
      },
      {
        id: "pilar",
        type: "circle",
        center: { x: 5_000, y: 4_000, z: 0 },
        radius: 250,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "pilar"] },
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

/**
 * UN backend, dos contextos. `install` sólo registra el interceptor en el
 * contexto que se le pase, así que la MISMA instancia sirve a las dos sesiones
 * — que es lo que convierte esto en concurrencia y no en dos copias.
 */
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

async function openStudio(
  context: BrowserContext,
  backend: CadV1Backend,
): Promise<Page> {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await backend.install(context);
  const page = await context.newPage();
  await page.goto(`/studio/${DOCUMENT_ID}`);
  await openCollabDock(page);
  return page;
}

/** Ancla un comentario haciendo clic EN el plano, como haría una persona. */
async function comment(page: Page, offset: { x: number; y: number }, body: string) {
  await page.getByTestId("cad-collab-place").click();
  const overlay = page.getByTestId("cad-collab-overlay");
  await expect(page.getByTestId("cad-collab-place-hint")).toBeVisible();
  await overlay.click({ position: offset });
  await expect(page.getByTestId("cad-collab-pending-anchor")).toBeVisible();
  await page.getByTestId("cad-collab-draft").fill(body);
  await page.getByTestId("cad-collab-submit").click();
}

test("dos sesiones concurrentes comentan el mismo plano y se ven los anclajes", async ({
  browser,
  context,
}) => {
  test.setTimeout(240_000);
  const backend = sharedBackend();
  const arquitecta = await openStudio(context, backend);

  // ── 1. Anclar es elegir un punto del dibujo ───────────────────────────────
  await comment(arquitecta, { x: 300, y: 220 }, "Este pilar choca con la ventana.");
  await expect
    .poll(() => backend.comments.rows.length, { timeout: 20_000 })
    .toBe(1);

  // ── 2. Lo guardado es el CONTRATO de ancla ────────────────────────────────
  const primero = backend.comments.rows[0];
  expect(primero.documentId).toBe(DOCUMENT_ID);
  expect(primero.body).toBe("Este pilar choca con la ventana.");
  expect(
    primero.anchor,
    "un ancla sin forma declarada es la que ningún visor sabe pintar",
  ).toMatchObject({ kind: "point", version: 1, space: "model", entityId: null });
  const anchor = primero.anchor as { x: number; y: number };
  expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true);

  // La chincheta aparece sobre el dibujo, no sólo en la lista.
  const chincheta = arquitecta.getByTestId(`cad-collab-pin-${primero.id}`);
  await expect(chincheta).toBeVisible();
  await expect(chincheta).toHaveText("1");

  // ── 3. La OTRA sesión lo ve ───────────────────────────────────────────────
  const segundoContexto = await browser.newContext();
  const socio = await openStudio(segundoContexto, backend);
  await expect(
    socio.getByTestId(`cad-collab-thread-${primero.id}`),
    "el sondeo del servidor es lo que hace que el compañero se entere: antes el comentario ni salía del navegador",
  ).toBeVisible({ timeout: 20_000 });
  await expect(socio.getByTestId(`cad-collab-pin-${primero.id}`)).toBeVisible();
  await expect(socio.getByTestId(`cad-collab-pin-${primero.id}`)).toHaveText("1");

  // El socio ancla el suyo en OTRO punto del plano.
  await comment(socio, { x: 520, y: 380 }, "Aquí falta la cota de la puerta.");
  await expect
    .poll(() => backend.comments.rows.length, { timeout: 20_000 })
    .toBe(2);
  const segundo = backend.comments.rows[1];
  const anclaSegunda = segundo.anchor as { x: number; y: number };
  expect(
    anclaSegunda.x !== anchor.x || anclaSegunda.y !== anchor.y,
    "dos clics en sitios distintos tienen que dar coordenadas distintas: si no, el ancla no viene del plano",
  ).toBe(true);

  // Y vuelve a la primera sesión, numerado por orden de llegada.
  await expect(
    arquitecta.getByTestId(`cad-collab-thread-${segundo.id}`),
  ).toBeVisible({ timeout: 20_000 });
  await expect(arquitecta.getByTestId(`cad-collab-pin-${segundo.id}`)).toHaveText("2");
  await expect(arquitecta.getByTestId("cad-collab-count")).toContainText("2 en total");

  // ── 4. La chincheta va pegada al DIBUJO, no al vidrio ─────────────────────
  const antes = await chincheta.boundingBox();
  expect(antes).not.toBeNull();
  const lienzo = arquitecta.getByTestId("cad-canvas");
  const caja = await lienzo.boundingBox();
  expect(caja).not.toBeNull();
  await arquitecta.mouse.move(caja!.x + caja!.width / 2, caja!.y + caja!.height / 2);
  await arquitecta.mouse.wheel(0, -600);
  await expect
    .poll(
      async () => {
        const ahora = await chincheta.boundingBox();
        if (!ahora || !antes) return 0;
        return Math.hypot(ahora.x - antes.x, ahora.y - antes.y);
      },
      {
        timeout: 15_000,
        message:
          "al hacer zoom la chincheta tiene que MOVERSE con el plano; si no se mueve, está pegada a la pantalla y no señala nada",
      },
    )
    .toBeGreaterThan(4);
  // Y el ancla guardada no se ha tocado: mirar no es editar.
  expect(backend.comments.rows[0].anchor).toMatchObject({
    x: anchor.x,
    y: anchor.y,
  });

  // ── 5. Resolver viaja al otro lado ────────────────────────────────────────
  await socio.getByTestId(`cad-collab-resolve-${primero.id}`).click();
  await expect
    .poll(() => backend.comments.rows[0].resolved, { timeout: 20_000 })
    .toBe(true);
  await expect(
    arquitecta.getByTestId(`cad-collab-thread-${primero.id}`),
  ).toHaveAttribute("data-resolved", "true", { timeout: 20_000 });
  await expect(arquitecta.getByTestId("cad-collab-count")).toContainText(
    "1 sin resolver",
  );

  // El dibujo NO se tocó en todo el proceso: comentar no es editar, así que el
  // documento canónico sigue en la versión con la que se abrió.
  expect(backend.snapshotFor("AXOS-CAD-STUDIO", "UNIVERSAL").version).toBe(1);

  await socio.close();
  await segundoContexto.close();
});

test("un comentario con ancla ilegible se lista MARCADO y no se pinta en el plano", async ({
  context,
}) => {
  test.setTimeout(180_000);
  const backend = sharedBackend();
  // Ancla de una versión que este visor no entiende. Es el caso que decide si
  // el fallo es cerrado: la tentación es pintarla «donde se entienda».
  backend.comments.rows.push({
    id: "00000000-0000-4000-a000-000000000099",
    documentId: DOCUMENT_ID,
    reviewSessionId: null,
    author: "futuro@valle",
    body: "Comentario de una versión posterior del formato.",
    anchor: { kind: "point", version: 99, space: "model", x: 5_000, y: 4_000 },
    resolved: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  const page = await openStudio(context, backend);
  const hilo = page.getByTestId("cad-collab-thread-00000000-0000-4000-a000-000000000099");
  await expect(hilo).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("cad-collab-anchor-unreadable-00000000-0000-4000-a000-000000000099"),
    "el motivo se le enseña a la persona: un comentario que no se puede situar tiene que decir por qué",
  ).toBeVisible();
  await expect(
    page.getByTestId("cad-collab-pin-00000000-0000-4000-a000-000000000099"),
    "y NO se planta una chincheta en un punto que nadie eligió",
  ).toHaveCount(0);
});
