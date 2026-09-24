/**
 * «COMPARTIR» DESDE LA DEMOSTRACIÓN — la cuarta tarea del robot estudiante.
 *
 * Quien dibuja en `/demo` sin cuenta pulsa «Compartir», copia el enlace y lo
 * abre en un celular: tiene que ver SU plano, en sólo lectura, sin cuenta y
 * sin barra horizontal. El servidor del enlace temporal se simula aquí con
 * `page.route` para que la prueba sea hermética; lo que se verifica es lo que
 * el navegador manda y lo que enseña:
 *
 *  · el POST lleva el dibujo ACTUAL en gzip (con la línea recién trazada),
 *    no la casa de arranque ni un JSON sin comprimir;
 *  · el panel da el enlace de `/revision` con el token tras la almohadilla,
 *    «Copiar enlace» lo deja en el portapapeles, y hay QR y caducidad;
 *  · el celular canjea con `X-Demo-Share-Token` y pinta el plano;
 *  · «Borrar enlace» manda el DELETE con el token de gestión.
 *
 * Las garantías del servidor (sólo hashes, caducidad, saneado, límites) las
 * cubre `apps/api/src/modules/cad/cad-demo-share.pg.spec.ts` contra
 * PostgreSQL real.
 */
import { gunzipSync } from "node:zlib";
import { expect, test, type Request } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";

const SHARE_TOKEN = `vdds_${"a".repeat(43)}`;
const MANAGE_TOKEN = `vddm_${"b".repeat(43)}`;
const EXPIRES_AT = "2026-10-01T18:00:00.000Z";

/** El archivo gzip del multipart, sin depender de un parser de formularios. */
function uploadedDocument(request: Request): { entities: Array<{ id: string }> } {
  const body = request.postDataBuffer();
  if (!body) throw new Error("el POST no llevó cuerpo");
  const headerEnd = body.indexOf("\r\n\r\n", body.indexOf('filename="'));
  const boundary = `\r\n--${/boundary=(.+)$/.exec(request.headers()["content-type"] ?? "")?.[1]}`;
  const fileEnd = body.indexOf(boundary, headerEnd);
  return JSON.parse(gunzipSync(body.subarray(headerEnd + 4, fileEnd)).toString("utf8"));
}

test.describe("Compartir desde la demostración", () => {
  test("el enlace lleva el dibujo actual y abre en un celular sin cuenta", async ({ page, browser }) => {
    test.setTimeout(180_000);
    let shared: { entities: Array<{ id: string }> } | null = null;
    let deletedWith: string | null = null;
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route(`${API_ORIGIN}/v1/cad/demo-shares**`, async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        expect(request.headers()["content-type"]).toContain("multipart/form-data");
        shared = uploadedDocument(request);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ shareToken: SHARE_TOKEN, manageToken: MANAGE_TOKEN, expiresAt: EXPIRES_AT }),
        });
        return;
      }
      if (request.method() === "DELETE") {
        deletedWith = request.headers()["x-demo-share-manage-token"] ?? null;
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fallback();
    });

    await page.goto("/demo");
    const input = page.getByTestId("cad-command-input");
    await expect(input).toBeVisible({ timeout: 60_000 });
    const skip = page.getByTestId("cad-guided-tour-skip");
    if (await skip.count()) await skip.click();

    // Un trazo propio, y «Compartir» ENSEGUIDA: sin esperar al autosave de 2 s.
    for (const token of ["LINE", "0,0", "3000,0"]) {
      await input.click();
      await input.fill(token);
      await input.press("Enter");
    }
    await input.press("Enter");

    const share = page.getByRole("button", { name: "Compartir", exact: true });
    await expect(share).toBeVisible();
    await share.click();
    const copy = page.getByRole("button", { name: "Copiar enlace", exact: true });
    await expect(copy).toBeVisible({ timeout: 30_000 });

    expect(shared, "el botón debe subir el dibujo").not.toBeNull();
    const ids = shared!.entities.map((entity) => entity.id);
    expect(ids.length, "la casa habitación viaja completa").toBeGreaterThan(5);
    const starter = await page.evaluate(() => {
      const raw = localStorage.getItem("valle_demo_document");
      return raw ? (JSON.parse(raw) as { document: { entities: unknown[] } }).document.entities.length : 0;
    });
    expect(ids.length, "y con el trazo recién hecho: el autosave se vació antes de compartir").toBe(starter);

    const url = await page.getByTestId("cad-share-url").innerText();
    expect(url).toMatch(new RegExp(`/revision#cadReview=${SHARE_TOKEN}$`));
    await expect(page.getByTestId("cad-share-panel").getByRole("img")).toBeVisible();
    await expect(page.getByTestId("cad-share-expiry")).toContainText("2026");
    await expect(page.getByTestId("cad-share-register")).toHaveAttribute("href", /returnTo=%2Fdashboard%3Fdemo%3D1/);
    await copy.click();
    // El rótulo cambia a «Copiado»: se sigue por su testid, no por el nombre.
    await expect(page.getByTestId("cad-share-copy")).toHaveText("Copiado");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    // El celular: otro contexto, sin cookies ni almacenamiento del visitante.
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "es-MX" });
    try {
      const guest = await mobile.newPage();
      let redeemedWith: string | null = null;
      await guest.route(`${API_ORIGIN}/v1/cad/demo-shares/context`, async (route) => {
        redeemedWith = route.request().headers()["x-demo-share-token"] ?? null;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            readOnly: true,
            expiresAt: EXPIRES_AT,
            document: { name: "Plano de la demostración", cadDocument: shared },
          }),
        });
      });
      await guest.goto(url);
      await expect(guest.getByTestId("cad-review-banner")).toHaveText("COPIA COMPARTIDA · SOLO LECTURA", {
        timeout: 60_000,
      });
      expect(redeemedWith).toBe(SHARE_TOKEN);
      // El mismo criterio que el robot: un `svg` cuyo nombre dice «plano».
      await expect(guest.locator('svg[aria-label*="lano"]').first()).toBeVisible();
      await expect(guest.getByTestId("cad-demo-share-aside")).toContainText("caduca el");
      await expect(guest.getByTestId("cad-demo-share-try")).toHaveAttribute("href", "/demo");
      expect(guest.url(), "el token sale de la barra en cuanto se canjea").not.toContain(SHARE_TOKEN);
      const overflow = await guest.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "sin barra horizontal en el celular").toBe(0);
    } finally {
      await mobile.close();
    }

    await page.getByTestId("cad-share-delete").click();
    await expect(page.getByTestId("cad-share-deleted")).toBeVisible();
    expect(deletedWith).toBe(MANAGE_TOKEN);
  });
});
