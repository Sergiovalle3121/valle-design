/**
 * OLA 4.1 — LA PRIMERA HORA DE UN DESCONOCIDO, CRONOMETRADA.
 *
 * ─── Qué se recorre ────────────────────────────────────────────────────────
 *
 * El camino del usuario número uno, entero y contra el stack real: llega a la
 * portada sin cuenta, se registra, verifica, crea su despacho, y **abre su
 * primer plano**. No se simula ningún paso y no se inyecta ningún documento por
 * API: se pulsan los mismos botones.
 *
 * ─── Por qué cronometrar ───────────────────────────────────────────────────
 *
 * «El plano de ejemplo abre en segundos» es una afirmación, y una afirmación
 * sin número es una opinión. Aquí se mide y se imprime, para poder decirlo en
 * público con el número al lado. El techo que se afirma es deliberadamente
 * generoso —un navegador headless en un contenedor compartido es más lento que
 * cualquier portátil— porque lo que este gate tiene que cazar no es medio
 * segundo de más: es el día en que abrir el ejemplo tarde un minuto.
 *
 * ─── Y las tres redes de seguridad de la primera hora ──────────────────────
 *
 * El recorrido guiado (que termina en un PDF, no en cinco globos), la paleta
 * Ctrl+K (para quien no sabe dónde está nada) y el panel de atajos (para quien
 * viene de AutoCAD y teclea antes de mirar). Las tres se comprueban abiertas y
 * con contenido de verdad, no sólo montadas.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  capturedToken,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/**
 * Techo del ejemplo, de extremo a extremo: desde el clic hasta que el estudio
 * enseña geometría. Generoso a propósito (ver cabecera).
 */
const TECHO_EJEMPLO_MS = 45_000;

test.describe("La primera hora de un desconocido", () => {
  let context: BrowserContext;
  let page: Page;
  const runId = Date.now().toString(36);
  const email = `primera-${runId}@example.test`;
  let msHastaElPrimerPlano = 0;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1 · de la portada al despacho creado, sin tarjeta y sin ayuda", async () => {
    test.setTimeout(300_000);

    await page.goto("/");
    // Desde la portada se llega al registro sin buscar: hay una llamada a la
    // acción visible. Si dejara de haberla, el embudo entero se rompe en el
    // primer metro.
    const alRegistro = page
      .getByRole("link", { name: /crear cuenta|empezar|registr/iu })
      .first();
    await expect(alRegistro).toBeVisible({ timeout: 30_000 });

    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Arquitecto desconocido");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu, {
      timeout: 60_000,
    });

    const mensaje = await latestCapturedEmail(context.request, email);
    await page.goto(
      `/verify-email?token=${encodeURIComponent(capturedToken(mensaje))}`,
    );
    await expect(page.getByRole("status")).toContainText(/correo qued.* verificado/iu, {
      timeout: 60_000,
    });

    await page.goto("/login?returnTo=/dashboard");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);

    await page.getByLabel("Nombre del despacho").fill(`Taller ${runId}`);
    await page.getByRole("button", { name: "Crear organización" }).click();

    // Y lo primero que ve al entrar NO es un tablero vacío y mudo.
    await expect(page.getByTestId("dashboard-empty")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("first-minute-sample")).toBeVisible();
  });

  test("2 · el plano de ejemplo abre con geometría, y se cronometra", async () => {
    test.setTimeout(300_000);

    const arranque = Date.now();
    await page.getByTestId("first-minute-sample").click();

    // No basta con que cargue el estudio: tiene que haber DIBUJO. Un ejemplo
    // que abre vacío es peor que no tenerlo.
    await expect(page.getByTestId("cad-command-line")).toBeVisible({
      timeout: TECHO_EJEMPLO_MS,
    });
    await expect(page.getByTestId("cad-native-document-count")).not.toContainText(
      /^0$|\b0 entidades\b/u,
      { timeout: TECHO_EJEMPLO_MS },
    );
    msHastaElPrimerPlano = Date.now() - arranque;

    const contador = await page.getByTestId("cad-native-document-count").innerText();
    console.log(
      `PRIMERA HORA · el plano de ejemplo abrió en ${(msHastaElPrimerPlano / 1000).toFixed(1)} s ` +
        `con «${contador.replace(/\s+/gu, " ").trim()}» en pantalla`,
    );

    expect(
      msHastaElPrimerPlano,
      `el ejemplo tardó ${(msHastaElPrimerPlano / 1000).toFixed(1)} s: la promesa es «en segundos»`,
    ).toBeLessThan(TECHO_EJEMPLO_MS);
  });

  test("3 · el recorrido guiado sale una vez, lleva a un PDF y se puede saltar", async () => {
    test.setTimeout(300_000);

    const recorrido = page.getByTestId("cad-guided-tour");
    await expect(recorrido).toBeVisible({ timeout: 60_000 });

    // Los cinco pasos, y que terminen en un archivo: un recorrido que sólo
    // señala botones enseña dónde están los botones.
    for (const paso of ["lamina", "muro", "puerta", "cota", "pdf"])
      await expect(page.getByTestId(`cad-guided-tour-step-${paso}`)).toBeVisible();

    // Se salta, y saltarlo cuenta: recargar no lo trae de vuelta. Un recorrido
    // que reaparece es un anuncio.
    await page.getByTestId("cad-guided-tour-skip").click();
    await expect(recorrido).toBeHidden({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByTestId("cad-command-line")).toBeVisible({
      timeout: 120_000,
    });
    await page.waitForTimeout(2_500);
    await expect(recorrido).toBeHidden();
  });

  test("4 · Ctrl+K encuentra un comando de verdad, para quien no sabe dónde está nada", async () => {
    test.setTimeout(300_000);

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+k");
    const buscador = page.getByPlaceholder(/Buscar comando/iu);
    await expect(buscador).toBeVisible({ timeout: 30_000 });

    // Se escribe algo que un arquitecto escribiría, y sale algo aplicable.
    await buscador.fill("acot");
    await page.waitForTimeout(800);
    const resultados = await page
      .locator("button")
      .filter({ hasText: /acot/iu })
      .count();
    expect(
      resultados,
      "la paleta es la red de seguridad de la primera hora: buscar «acot» tiene que ofrecer algo",
    ).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });

  test("5 · «algo salió mal» llega al outbox, y el plano sólo con permiso", async () => {
    test.setTimeout(300_000);

    // Sin autorizar: el reporte sale y el plano NO viaja.
    await page.getByTestId("cad-incident-open").click();
    await expect(page.getByTestId("cad-incident-dialog")).toBeVisible({
      timeout: 30_000,
    });
    // El cuadro enseña lo que va a mandar: nada se recoge en segundo plano.
    await expect(page.getByTestId("cad-incident-payload")).toContainText(
      /Versi.n del estudio/iu,
    );
    await expect(page.getByTestId("cad-incident-payload")).toContainText(
      /Tu plano: no se env.a/iu,
    );
    // Y la casilla nace APAGADA: autorizar es un acto, no un descuido.
    await expect(page.getByTestId("cad-incident-authorize")).not.toBeChecked();

    await page
      .getByTestId("cad-incident-text")
      .fill(`Prueba de la primera hora ${runId}: la cota salió del revés.`);
    await page.getByTestId("cad-incident-send").click();
    await expect(page.getByTestId("cad-incident-sent")).toBeVisible({
      timeout: 60_000,
    });

    // Y llegó DE VERDAD al outbox, con lo que hace falta para reproducirlo y
    // sin lo que nadie autorizó.
    const entregado = await latestCapturedEmail(
      context.request,
      process.env.SUPPORT_EMAIL || "soporte@valledesign.test",
    );
    expect(entregado.template).toBe("support.incident");
    const payload = entregado.payload as Record<string, unknown>;
    expect(String(payload.summary)).toContain(runId);
    expect(payload.appVersion).toEqual(expect.any(String));
    expect(payload.userAgent).toEqual(expect.stringContaining("Mozilla"));
    expect(
      payload.documentId,
      "sin marcar la casilla, el plano no viaja ni como identificador",
    ).toBeNull();
    expect(payload.documentAuthorized).toBe(false);

    // Se cierra: el cuadro es modal y taparía la superficie de la prueba
    // siguiente, que es exactamente lo que le haría a un usuario si el botón
    // «Cerrar» no funcionara.
    await page
      .getByTestId("cad-incident-dialog")
      .getByRole("button", { name: "Cerrar" })
      .click();
    await expect(page.getByTestId("cad-incident-dialog")).toBeHidden({
      timeout: 30_000,
    });
  });

  test("6 · el panel de atajos dice lo que las teclas hacen de verdad", async () => {
    test.setTimeout(300_000);

    await page.locator('[title="Atajos y ayuda (?)"]').first().click();
    const panel = page.getByText("Atajos y herramientas", { exact: false }).first();
    await expect(panel).toBeVisible({ timeout: 30_000 });

    const texto = (await page.locator("body").innerText()).replace(/\s+/gu, " ");

    // La corrección de esta ola: `L` es LINE. Anunciarlo como «conectar flujo»
    // mandaba a alguien en su primera hora a pulsar L esperando unir objetos.
    expect(
      texto,
      "el panel ya no puede decir que L conecta flujo: L traza líneas",
    ).not.toMatch(/Conectar flujo/iu);

    // Y los atajos que un dibujante busca primero tienen que estar.
    for (const anunciado of ["Ctrl/⌘+S", "Ctrl/⌘+K", "F8", "Shift+L"])
      expect(texto, `el panel anuncia «${anunciado}»`).toContain(anunciado);
  });
});
