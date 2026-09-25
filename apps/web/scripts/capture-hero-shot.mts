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
 * `capture-product-shots.mts` sigue generando el resto de `public/product/`
 * (paletas, línea de comandos, espacio papel) sobre el estudio heredado.
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "..", "public", "product");
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };

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
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
