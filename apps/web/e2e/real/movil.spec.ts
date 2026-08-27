/**
 * OLA 4.4 — EL PRODUCTO EN UN TELÉFONO.
 *
 * ─── Qué se exige y qué NO ─────────────────────────────────────────────────
 *
 * El embudo público —portada, precios, registro— y el tablero tienen que ser
 * **legibles y operables** en un teléfono: es donde llega el enlace que alguien
 * comparte en un chat, y un embudo que no se puede usar ahí no convierte.
 *
 * El ESTUDIO es otra cosa. Dibujar con precisión en 390 px de ancho no es un
 * objetivo razonable para el lanzamiento, y fingir que sí lo sería es
 * exactamente la clase de promesa que esta campaña existe para quitar. Lo que
 * se exige es que **lo diga**: una pantalla que explica que hace falta un
 * equipo más grande, con una salida. Romperse en silencio —un lienzo negro,
 * una barra cortada, un botón inalcanzable— es lo único inaceptable.
 *
 * ─── La medida que de verdad delata ────────────────────────────────────────
 *
 * El **desbordamiento horizontal**. Es el síntoma número uno de una página que
 * nadie miró en un móvil: el contenido se sale, la persona arrastra de lado y
 * decide que el producto no es para ella. Se mide comparando el ancho del
 * documento con el de la ventana, que es lo que el dedo nota.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiPost,
  apiPut,
  capturedToken,
  csrfHeaders,
  latestCapturedEmail,
} from "../fixtures/first-party";

/** iPhone 14: el tamaño más común al que llega un enlace por WhatsApp. */
const TELEFONO = { width: 390, height: 844 };

test.use({ viewport: TELEFONO, isMobile: true, hasTouch: true });

test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/** Cuánto se sale el contenido de la ventana, en píxeles. */
async function desbordamiento(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth,
  );
}

/** ¿Se puede leer? Ningún texto por debajo de lo que un pulgar tolera. */
async function textoDemasiadoPequeno(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const culpables: string[] = [];
    for (const element of document.querySelectorAll("p, li, a, button, label")) {
      const html = element as HTMLElement;
      const caja = html.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) continue;
      const texto = (html.textContent || "").trim();
      if (texto.length < 12) continue;
      const size = Number.parseFloat(getComputedStyle(html).fontSize);
      if (size > 0 && size < 11)
        culpables.push(`${size}px — «${texto.slice(0, 50)}»`);
    }
    return culpables.slice(0, 5);
  });
}

test.describe("El embudo público y el tablero, en un teléfono", () => {
  for (const [nombre, ruta] of [
    ["portada", "/"],
    ["precios", "/precios"],
    ["registro", "/register"],
    ["acceso", "/login"],
  ] as const) {
    test(`${nombre} se lee y no se sale de la pantalla`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`${BASE_URL}${ruta}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1_200);

      const exceso = await desbordamiento(page);
      expect(
        exceso,
        `«${nombre}» se sale ${exceso} px del ancho del teléfono: la persona ` +
          "arrastra de lado y decide que el producto no es para ella",
      ).toBeLessThanOrEqual(2);

      const pequenos = await textoDemasiadoPequeno(page);
      expect(
        pequenos,
        `«${nombre}» tiene texto por debajo de 11 px, ilegible en un teléfono`,
      ).toEqual([]);
    });
  }

  test("desde la portada se puede llegar al registro con el pulgar", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");

    const llamada = page
      .getByRole("link", { name: /crear cuenta|empezar|registr/iu })
      .first();
    await expect(llamada).toBeVisible({ timeout: 30_000 });

    // Operable con el dedo: la recomendación de accesibilidad son 44×44, y un
    // enlace de texto corrido no llega ni pretende. Lo que se exige es que el
    // objetivo se pueda tocar sin acertar en un píxel.
    const caja = await llamada.boundingBox();
    expect(caja, "la llamada a la acción tiene caja").not.toBeNull();
    expect(
      Math.min(caja!.width, caja!.height),
      `el objetivo mide ${caja!.width}×${caja!.height}: demasiado fino para un pulgar`,
    ).toBeGreaterThanOrEqual(24);

    await llamada.tap();
    await page.waitForURL(/\/register/u, { timeout: 30_000 });
    // Y el formulario se puede rellenar: los campos caben.
    await expect(page.getByLabel(/Correo electr.*nico/iu)).toBeVisible();
    expect(await desbordamiento(page)).toBeLessThanOrEqual(2);
  });

  test("sin sesión, el estudio manda a acceder en vez de quedarse mudo", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE_URL}/studio`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    const texto = (await page.locator("body").innerText()).trim();
    expect(
      texto.length,
      "el estudio en un teléfono no puede quedarse en una pantalla muda",
    ).toBeGreaterThan(20);
    expect(await desbordamiento(page)).toBeLessThanOrEqual(2);
  });
});

/**
 * Con SESIÓN: el tablero es la pantalla que un arquitecto abrirá en el
 * teléfono para enseñarle un plano a alguien, y el estudio es donde la promesa
 * tiene que ser honesta.
 */
test.describe("Con la sesión abierta, en un teléfono", () => {
  let context: BrowserContext;
  let page: Page;
  let documentId = "";
  const runId = Date.now().toString(36);
  const email = `movil-${runId}@example.test`;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: TELEFONO,
      isMobile: true,
      hasTouch: true,
    });
    page = await context.newPage();

    await context.request.post(`${API_ORIGIN}/v1/auth/register`, {
      data: { email, password: E2E_PASSWORD, displayName: "Desde el móvil" },
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
      { name: `Movil ${runId}`, slug: `movil-${runId}` },
    );
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId: organizacion.body.id },
      headers: await csrfHeaders(context),
    });
    const creado = await apiPost<{ id: string; cadDocumentVersion: number }>(
      context,
      "/v1/cad/documents",
      { name: "Planta desde el móvil" },
    );
    documentId = creado.body.id;
    await apiPut(context, `/v1/cad/documents/${documentId}/content`, {
      cadDocument: {
        meta: { version: 1, schema: 7, unit: "mm" },
        layers: [
          { id: "0", name: "0", color: "#000000", visible: true, locked: false },
        ],
        entities: [
          {
            id: "muro",
            type: "line",
            start: { x: 0, y: 0, z: 0 },
            end: { x: 3500, y: 0, z: 0 },
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
      },
      expectedCadDocumentVersion: creado.body.cadDocumentVersion,
    });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("el tablero se lee y se puede tocar", async () => {
    test.setTimeout(180_000);
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_500);

    const exceso = await desbordamiento(page);
    expect(
      exceso,
      `el tablero se sale ${exceso} px: es la pantalla que se abre para enseñar un plano a alguien`,
    ).toBeLessThanOrEqual(2);
    expect(await textoDemasiadoPequeno(page)).toEqual([]);

    // El documento está y se puede abrir con el dedo.
    const tarjeta = page
      .getByRole("button", { name: /Planta desde el m.vil/iu })
      .first();
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    const caja = await tarjeta.boundingBox();
    expect(
      Math.min(caja!.width, caja!.height),
      "una tarjeta de documento tiene que ser tocable, no un hilo",
    ).toBeGreaterThanOrEqual(24);
  });

  test("el estudio en un teléfono DICE qué hace falta, no se rompe callado", async () => {
    test.setTimeout(180_000);
    await page.goto(`/studio/${documentId}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(6_000);

    const texto = (await page.locator("body").innerText()).replace(/\s+/gu, " ");

    // Dos finales son aceptables y sólo dos: que el estudio ARRANQUE de verdad
    // en el teléfono, o que EXPLIQUE que hace falta una pantalla mayor. Lo
    // inaceptable es la tercera: una pantalla en blanco, un lienzo negro o una
    // barra cortada que deja a la persona sin saber qué pasó.
    const arranco = await page.getByTestId("cad-command-line").count();
    const loDice = /pantalla|equipo|escritorio|computadora|ordenador|m.s grande/iu.test(
      texto,
    );

    // El estudio ARRANCA en un teléfono, y eso está bien: sirve para lo que la
    // gente hace en un móvil, que es abrir el plano que le acaban de mandar y
    // mirarlo. Lo que NO puede pasar —y pasaba— es que los muelles laterales
    // se plieguen por CSS sin decir una palabra: quien lo abre ahí no lee
    // «pantalla estrecha», lee «este programa no tiene gestor de capas».
    await expect(
      page.getByTestId("cad-small-screen-notice"),
      "los paneles plegados tienen que explicarse: una degradación silenciosa hace parecer al producto menos de lo que es",
    ).toBeVisible({ timeout: 30_000 });

    // Y se quita de en medio de un toque: un aviso que no se puede cerrar es
    // peor que no tenerlo.
    await page.getByTestId("cad-small-screen-dismiss").tap();
    await expect(page.getByTestId("cad-small-screen-notice")).toBeHidden({
      timeout: 10_000,
    });
    console.log(
      `MÓVIL · el estudio en 390 px: ${arranco > 0 ? "ARRANCA (línea de comandos presente)" : "no arranca"}` +
        ` · ${loDice ? "explica que hace falta más pantalla" : "sin explicación"}`,
    );
    expect(
      arranco > 0 || loDice,
      `el estudio ni arrancó ni explicó nada en un teléfono. Lo que se ve: «${texto.slice(0, 200)}»`,
    ).toBe(true);

    const exceso = await desbordamiento(page);
    expect(
      exceso,
      `el estudio se sale ${exceso} px en un teléfono`,
    ).toBeLessThanOrEqual(2);
  });
});
