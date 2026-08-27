/**
 * OLA 2.4 — LOS ERRORES HABLAN ESPAÑOL HUMANO.
 *
 * ─── Qué se comprueba y por qué a la fuerza ────────────────────────────────
 *
 * Un producto se juzga por lo que hace cuando algo sale mal. Las cinco cosas
 * que de verdad le pasan a un arquitecto —se le cae el wifi guardando, se le
 * caduca la sesión a media tarde, otra pestaña le gana el guardado, le mandan
 * un DXF roto, el DXF trae más geometría de la que cabe— no se pueden
 * comprobar leyendo código ni con un unit test: hay que PROVOCARLAS contra el
 * stack real y mirar qué queda en pantalla.
 *
 * Eso es lo que hace esta suite. La red se corta de verdad (`setOffline`), la
 * sesión se invalida de verdad (un `logout` contra la API mientras el estudio
 * sigue abierto), el conflicto lo emite PostgreSQL con su contador CAS, y los
 * dos DXF entran por el mismo `input` que usa una persona.
 *
 * ─── La vara, escrita como asersión ────────────────────────────────────────
 *
 * Para cada fallo, tres cosas:
 *
 *   1. HAY MENSAJE. Un fallo silencioso es peor que uno ruidoso: el usuario
 *      sigue dibujando creyendo que su trabajo está a salvo.
 *   2. EL MENSAJE ES HUMANO. Español, sin jerga de programador. La lista
 *      `JERGA` de abajo es lo que NUNCA debe llegar a un ojo humano: trazas,
 *      `undefined`, `[object Object]`, códigos HTTP desnudos, nombres de
 *      excepción. Se comprueba sobre el mensaje Y sobre su título, porque un
 *      título como «3D» encabezando «No se pudo guardar la versión» es
 *      exactamente la etiqueta interna que este barrido existe para quitar.
 *   3. HAY SALIDA. La pantalla no se queda en un girador eterno: el estado
 *      vuelve a algo accionable, y donde el fallo es reversible se demuestra
 *      la vuelta (la red vuelve y el trabajo sube).
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiPost,
  apiPut,
  capturedToken,
  csrfHeaders,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/**
 * Lo que jamás debe leer una persona. Cada patrón es algo que se ha colado
 * alguna vez en algún producto: la traza, el objeto sin serializar, el código
 * de estado desnudo, el nombre de la excepción, el inglés de la librería.
 */
const JERGA: ReadonlyArray<[RegExp, string]> = [
  [/\[object Object\]/u, "un objeto sin serializar"],
  [/\bundefined\b|\bnull\b|\bNaN\b/u, "un valor interno sin resolver"],
  [/\bat\s+\w+\s*\(.*:\d+:\d+\)/u, "una traza de pila"],
  [/\b(TypeError|SyntaxError|ReferenceError|AxiosError|FetchError)\b/u, "el nombre de una excepción"],
  [/^\s*(4\d\d|5\d\d)\s*$/u, "un código HTTP desnudo"],
  [/\bHTTP\s*\d{3}\b/u, "un código HTTP desnudo"],
  [/\b(Failed to fetch|Internal Server Error|Bad Request|Unauthorized|Forbidden|Not Found)\b/u, "un error en inglés de la librería"],
  [/\{|\}|<\/?[a-z]+>/u, "marcado o JSON crudo"],
];

function jergaEn(texto: string): string[] {
  return JERGA.filter(([patron]) => patron.test(texto)).map(
    ([, que]) => `${que} («${texto.trim().slice(0, 120)}»)`,
  );
}

/** Un mensaje humano tiene letras españolas y no es un identificador suelto. */
function pareceEspanol(texto: string): boolean {
  const limpio = texto.trim();
  if (limpio.length < 12) return false;
  return /\s/u.test(limpio) && /[a-záéíóúñü]/iu.test(limpio);
}

const WALL_MM = 3500;

function documentoBase() {
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#000000", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro",
        type: "line",
        start: { x: 0, y: 0, z: 0 },
        end: { x: WALL_MM, y: 0, z: 0 },
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro"] },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** Un DXF de verdad, con `n` líneas. Sirve para el caso del límite. */
function dxfConLineas(n: number): string {
  const partes = ["0\nSECTION\n2\nENTITIES\n"];
  for (let index = 0; index < n; index += 1) {
    partes.push(
      `0\nLINE\n8\n0\n10\n${index}\n20\n0\n30\n0\n11\n${index + 1}\n21\n100\n31\n0\n`,
    );
  }
  partes.push("0\nENDSEC\n0\nEOF\n");
  return partes.join("");
}

test.describe("Los errores hablan español humano", () => {
  let context: BrowserContext;
  let page: Page;
  let documentId = "";
  let organizationId = "";
  const runId = Date.now().toString(36);
  const email = `errores-${runId}@example.test`;

  /** Un cambio real y verificable: una capa nueva en el documento. */
  async function crearCapa(nombre: string): Promise<void> {
    await page.locator('[title="Vista, capas y plano"]').first().click();
    await expect(page.getByTestId("cad-layer-manager")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("cad-layer-new-name").fill(nombre);
    await page.getByTestId("cad-layer-create").click();
    await expect(page.getByTestId(`cad-layer-row-${nombre}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");
  }

  async function abrirEstudio(): Promise<void> {
    await page.goto(`/studio/${documentId}`);
    await expect(page.getByTestId("cad-command-line")).toBeVisible({
      timeout: 120_000,
    });
    const saltar = page.getByTestId("cad-guided-tour-skip");
    if (await saltar.count()) await saltar.click().catch(() => undefined);
    await page.waitForTimeout(900);
  }

  /**
   * Espera a que aparezca un aviso flotante. Dormir a ciegas no vale: el
   * primer intento de esta suite dormía cuatro segundos y leía la pantalla
   * cuando la tarjeta ya se había ido — que resultó ser un defecto de verdad
   * (los errores duraban lo mismo que un acuse) y, además, una prueba que se
   * lo habría tragado si la tarjeta hubiese durado 4,1 s.
   */
  async function esperarAviso(): Promise<void> {
    await expect(page.getByTestId("app-toast").first()).toBeVisible({
      timeout: 30_000,
    });
  }

  /** Todo lo que el usuario tiene delante: avisos flotantes y línea de estado. */
  async function loQueVeElUsuario(): Promise<string[]> {
    const avisos = await page.getByTestId("app-toast").allInnerTexts();
    const estado = await page.getByTestId("cad-save-status").allInnerTexts();
    return [...avisos, ...estado].map((texto) => texto.replace(/\s+/gu, " ").trim());
  }

  /** La vara entera aplicada a un fallo concreto. */
  function exigirMensajeHumano(textos: string[], caso: string): string {
    const utiles = textos.filter((texto) => pareceEspanol(texto));
    expect(
      utiles.length,
      `${caso}: el usuario no recibió NINGÚN mensaje legible. Un fallo silencioso ` +
        `es peor que uno ruidoso: sigue trabajando creyendo que está a salvo. Visto: ${JSON.stringify(textos)}`,
    ).toBeGreaterThan(0);
    const delatores = utiles.flatMap((texto) => jergaEn(texto));
    expect(
      delatores,
      `${caso}: el mensaje enseña jerga de programador en vez de hablarle a una persona`,
    ).toEqual([]);
    return utiles.join(" · ");
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();

    await context.request.post(`${API_ORIGIN}/v1/auth/register`, {
      data: { email, password: E2E_PASSWORD, displayName: "Errores" },
    });
    const mensaje = await latestCapturedEmail(context.request, email);
    await context.request.post(`${API_ORIGIN}/v1/auth/verify-email`, {
      data: { token: capturedToken(mensaje) },
    });
    await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
      data: { email, password: E2E_PASSWORD },
    });
    const organizacion = await apiPost<{ id: string }>(
      context,
      "/v1/organizations",
      { name: `Errores ${runId}`, slug: `errores-${runId}` },
    );
    organizationId = organizacion.body.id;
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId },
      headers: await csrfHeaders(context),
    });
    const creado = await apiPost<{ id: string; cadDocumentVersion: number }>(
      context,
      "/v1/cad/documents",
      { name: "Documento de fallos" },
    );
    documentId = creado.body.id;
    const guardado = await apiPut<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      {
        cadDocument: documentoBase(),
        expectedCadDocumentVersion: creado.body.cadDocumentVersion,
      },
    );
    expect(guardado.status).toBe(200);
  });

  test.afterAll(async () => {
    await context?.setOffline(false).catch(() => undefined);
    await context?.close();
  });

  /* ═══════════════════════════════════════════════════════════════════════
     1 · Se cae la red guardando
     ═══════════════════════════════════════════════════════════════════════ */

  test("1 · red caída al guardar: lo dice, no se queda girando y al volver sube", async () => {
    test.setTimeout(300_000);
    await abrirEstudio();
    await crearCapa(`REDCAIDA${runId}`.toUpperCase());

    await context.setOffline(true);
    await page.getByTestId("cad-save").click();

    await expect(page.getByTestId("cad-save-status")).toContainText(
      /Sin conexi.n/iu,
      { timeout: 60_000 },
    );
    await esperarAviso();
    const visto = exigirMensajeHumano(await loQueVeElUsuario(), "red caída");
    // La frase tiene que decir qué pasa con lo que el usuario acaba de hacer.
    expect(visto, "el aviso debe decir que el trabajo queda pendiente, no sólo que no hay red").toMatch(
      /pendient/iu,
    );
    // Y NO puede quedarse girando: «Guardando…» eterno es la peor pantalla.
    await expect(page.getByTestId("cad-save-status")).not.toContainText(
      /Guardando/iu,
    );

    // La salida: vuelve la red y el trabajo sube. Sin recargar, sin trucos.
    await context.setOffline(false);
    await page.getByTestId("cad-save").click();
    await expect(page.getByTestId("cad-save-status")).toContainText(/^Guardado$/u, {
      timeout: 120_000,
    });

    const releido = await apiGet<{
      cadDocument: { layers: Array<{ name: string }> } | null;
    }>(context, `/v1/cad/documents/${documentId}`);
    expect(
      (releido.body.cadDocument?.layers ?? []).map((capa) => capa.name),
      "lo dibujado durante el corte tiene que estar en PostgreSQL cuando vuelve la red",
    ).toContain(`REDCAIDA${runId}`.toUpperCase());
  });

  /* ═══════════════════════════════════════════════════════════════════════
     2 · La sesión caduca a media edición
     ═══════════════════════════════════════════════════════════════════════ */

  test("2 · sesión expirada a media edición: se entera y sabe qué hacer", async () => {
    test.setTimeout(300_000);
    await abrirEstudio();
    await crearCapa(`SESION${runId}`.toUpperCase());

    // La sesión se invalida DE VERDAD en el servidor, con el estudio abierto y
    // con trabajo sin guardar: es la situación de la tarde larga.
    const cierre = await context.request.post(`${API_ORIGIN}/v1/auth/logout`, {
      headers: await csrfHeaders(context),
    });
    expect(cierre.status()).toBe(204);

    await page.getByTestId("cad-save").click();
    await esperarAviso();

    const visto = exigirMensajeHumano(
      await loQueVeElUsuario(),
      "sesión expirada a media edición",
    );
    expect(
      visto,
      "el mensaje tiene que nombrar la sesión y decir que hay que volver a entrar: " +
        "sin eso el usuario reintenta guardar en bucle sin saber por qué falla",
    ).toMatch(/sesi.n/iu);
    await expect(page.getByTestId("cad-save-status")).not.toContainText(
      /Guardando/iu,
    );
  });

  /* ═══════════════════════════════════════════════════════════════════════
     3 · Otra sesión gana el guardado (conflicto CAS)
     ═══════════════════════════════════════════════════════════════════════ */

  test("3 · conflicto CAS: lo cuenta como un choque de versiones, no como un 409", async () => {
    test.setTimeout(300_000);

    // Volver a entrar tras el cierre de la prueba anterior: una sesión NUEVA
    // no hereda la organización activa, y sin ella el estudio no resuelve el
    // inquilino del documento.
    await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
      data: { email, password: E2E_PASSWORD },
    });
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId },
      headers: await csrfHeaders(context),
    });
    await abrirEstudio();
    await crearCapa(`CONFLICTO${runId}`.toUpperCase());

    // Otra sesión guarda primero: el contador CAS del servidor avanza.
    const actual = await apiGet<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}`,
    );
    const adelanto = await apiPut<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      {
        cadDocument: documentoBase(),
        expectedCadDocumentVersion: actual.body.cadDocumentVersion,
      },
    );
    expect(adelanto.status).toBe(200);

    await page.getByTestId("cad-save").click();
    await esperarAviso();
    await expect(page.getByTestId("cad-save-status")).not.toContainText(
      /^Guardado$/u,
      { timeout: 60_000 },
    );

    const visto = exigirMensajeHumano(await loQueVeElUsuario(), "conflicto CAS");
    expect(
      visto,
      "el aviso debe hablar de versiones/cambios, nunca del código 409",
    ).toMatch(/versi.n|versiones|cambios|conflicto/iu);
  });

  /* ═══════════════════════════════════════════════════════════════════════
     4 · Un DXF roto
     ═══════════════════════════════════════════════════════════════════════ */

  test("4 · DXF corrupto al importar: lo dice y el botón vuelve a estar vivo", async () => {
    test.setTimeout(300_000);
    await abrirEstudio();

    // Basura con extensión .dxf: lo que llega cuando alguien exporta mal o el
    // archivo viaja por un correo que lo destroza.
    await page.getByTestId("cad-dxf-input").setInputFiles({
      name: "plano-del-estructurista.dxf",
      mimeType: "application/dxf",
      buffer: Buffer.from("Esto no es un DXF, es un correo reenviado.\n".repeat(40)),
    });
    await esperarAviso();

    exigirMensajeHumano(await loQueVeElUsuario(), "DXF corrupto");

    // Y el control vuelve a estar disponible: un fallo de importación no puede
    // dejar el botón deshabilitado para siempre.
    await expect(
      page.locator('[title^="Cargar plano DXF de fondo"]').first(),
    ).toBeEnabled({ timeout: 60_000 });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     5 · Un DXF que no cabe
     ═══════════════════════════════════════════════════════════════════════ */

  test("5 · límite de entidades: avisa de que se recortó en vez de mentir", async () => {
    test.setTimeout(600_000);
    await abrirEstudio();

    // El tope de una importación son 50 000 entidades. Se pasa a propósito:
    // callarlo sería entregar un dibujo incompleto que parece completo.
    const dxf = dxfConLineas(50_050);
    await page.getByTestId("cad-dxf-input").setInputFiles({
      name: "levantamiento-topografico.dxf",
      mimeType: "application/dxf",
      buffer: Buffer.from(dxf, "utf8"),
    });
    await esperarAviso();

    const visto = exigirMensajeHumano(
      await loQueVeElUsuario(),
      "límite de entidades",
    );
    expect(
      visto,
      "el usuario tiene que saber que se recortó: un dibujo incompleto que parece completo es la peor entrega",
    ).toMatch(/advertencia|recort|l.mite/iu);
  });
});
