#!/usr/bin/env tsx
/**
 * LA CAPTURA DE LA PORTADA — lo que abre «Probar sin cuenta», sin retoques.
 *
 * La portada y el acceso enseñaban `estudio-dark.png`: el estudio en modo Pro
 * (diez pestañas de cinta), sobre el lienzo azul marino de antes y con un
 * plano dibujado para la foto. Nadie que llega ve eso: una visita nueva abre
 * `/demo` en Esencial, con el lienzo gris «Estudio», la casa habitación de
 * ejemplo y sus cuartos rotulados con nombre y m². Esta captura es ESA
 * pantalla, tomada a la misma resolución que las demás (1440 × 900 a densidad
 * 2) para que `ProductFrame` no cambie de proporción.
 *
 * No toca el backend: la demostración vive en el navegador. Tampoco oculta ni
 * añade nada — ni el botón «Crea tu cuenta» ni el aviso de la demostración —,
 * porque la promesa de la portada es que el botón de al lado abre exactamente
 * esto.
 *
 *   npm run capture:hero            # contra el servidor que ya corre (next start o dev)
 *
 * ## El plano de ejemplo del tablero vacío (opcional)
 *
 * El tablero de una cuenta nueva promete «Abre un plano de ejemplo» con una
 * vista previa: tiene que ser ESE plano tal como se abre, en Esencial. Para
 * fotografiarlo hace falta una cuenta de verdad, así que el paso sólo corre
 * contra la pila real con el arnés de identidad (el mismo de los e2e reales):
 *
 *   E2E_API_ORIGIN=http://localhost:4000 \
 *   E2E_IDENTITY_HARNESS_KEY=… npm run capture:hero
 *
 * Crea una cuenta desechable, verifica el correo por el arnés, crea el
 * despacho, pulsa el botón del tablero y guarda `estudio-ejemplo-dark.png`.
 *
 * `capture-product-shots.mts` sigue generando el resto de `public/product/`
 * (paletas, línea de comandos, espacio papel) sobre el estudio heredado.
 */
import { chromium, type Browser } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "..", "public", "product");
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };
const API_ORIGIN = process.env.E2E_API_ORIGIN;
const HARNESS_KEY = process.env.E2E_IDENTITY_HARNESS_KEY;
const PASSWORD = "Captura-del-ejemplo-2026!";

async function captureSamplePlan(browser: Browser): Promise<void> {
  if (!API_ORIGIN || !HARNESS_KEY) {
    console.log("  · estudio-ejemplo-dark.png — omitida (hace falta E2E_API_ORIGIN y E2E_IDENTITY_HARNESS_KEY)");
    return;
  }
  const email = `captura-ejemplo-${Date.now().toString(36)}@example.test`;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "es-MX",
  });
  try {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/register`);
    await page.getByLabel("Nombre").fill("Captura del ejemplo");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(PASSWORD);
    await page.getByText(/^Acepto los/).click();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await page.getByRole("status").filter({ hasText: /Cuenta creada/iu }).waitFor({ timeout: 30_000 });
    const outbox = await context.request.get(
      `${API_ORIGIN}/_development/email-outbox?${new URLSearchParams({ recipient: email })}`,
      { headers: { "x-valle-test-harness": HARNESS_KEY } },
    );
    if (!outbox.ok()) throw new Error(`el arnés de correo respondió ${outbox.status()}`);
    const token = ((await outbox.json()) as { payload: { token: string } }).payload.token;
    await page.goto(`${BASE_URL}/verify-email?token=${encodeURIComponent(token)}`);
    await page.getByRole("status").filter({ hasText: /verificado/iu }).waitFor({ timeout: 30_000 });
    await page.goto(`${BASE_URL}/login?returnTo=/dashboard`);
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/dashboard"),
      page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
    ]);
    await page.getByLabel("Nombre del despacho").fill("Despacho de la captura");
    await page.getByRole("button", { name: "Crear organización" }).click();
    const sample = page.getByTestId("first-minute-sample");
    await sample.waitFor({ state: "visible", timeout: 30_000 });
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/studio/"), { timeout: 60_000 }),
      sample.click(),
    ]);
    await page.getByTestId("cad-command-input").waitFor({ state: "visible", timeout: 120_000 });
    await page.getByTestId("cad-essential-bar").waitFor({ state: "visible", timeout: 30_000 });
    const skip = page.getByTestId("cad-guided-tour-skip");
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.mouse.move(VIEWPORT.width - 4, 4);
    await page.waitForTimeout(3_000);
    const file = path.join(OUT_DIR, "estudio-ejemplo-dark.png");
    await page.screenshot({ path: file, animations: "disabled" });
    console.log(`  · ${path.basename(file)} — el plano de ejemplo del tablero, abierto por una cuenta nueva`);
  } finally {
    await context.close();
  }
}

async function main() {
  const reachable = await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) })
    .then((res) => res.status < 500)
    .catch(() => false);
  if (!reachable) {
    throw new Error(`No hay servidor en ${BASE_URL}. Arráncalo con \`npm run dev\` o \`npm start\`.`);
  }
  const browser = await chromium.launch();
  try {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: "reduce",
        locale: "es-MX",
      });
      // Tema por el mismo almacenamiento que el conmutador; modo sin guardar,
      // como una visita nueva (Esencial es el que abre la demostración).
      await context.addInitScript((value) => {
        window.localStorage.setItem("valle_theme", value);
        window.localStorage.removeItem("valle:cad:ui-mode:v1");
      }, theme);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/demo`);
      await page.getByTestId("cad-command-input").waitFor({ state: "visible", timeout: 120_000 });
      await page.getByTestId("cad-essential-bar").waitFor({ state: "visible", timeout: 30_000 });
      // El acompañante de la primera vez tapa el lienzo: en una foto de venta
      // estorba, y quien entra lo cierra con un clic.
      const skip = page.getByTestId("cad-guided-tour-skip");
      if (await skip.isVisible().catch(() => false)) await skip.click();
      // Los seis cuartos con su rótulo: la señal de que la casa terminó de
      // pintarse y el encuadre se asentó.
      const names = page.getByTestId("cad-room-name-hitbox");
      for (let tries = 0; tries < 60 && (await names.count()) < 6; tries += 1) await page.waitForTimeout(500);
      if ((await names.count()) < 6) throw new Error("la casa de la demostración no terminó de pintarse");
      // El puntero fuera del lienzo: sin cruceta en la foto.
      await page.mouse.move(VIEWPORT.width - 4, 4);
      await page.waitForTimeout(1_200);
      const file = path.join(OUT_DIR, `estudio-esencial-${theme}.png`);
      await page.screenshot({ path: file, animations: "disabled" });
      console.log(`  · ${path.basename(file)} — la demostración en Esencial, tema ${theme === "dark" ? "oscuro" : "claro"}`);
      await context.close();
    }
    await captureSamplePlan(browser);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
