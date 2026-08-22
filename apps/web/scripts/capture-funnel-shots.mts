#!/usr/bin/env tsx
/**
 * CAPTURAS DEL EMBUDO PRIVADO — tablero vacío, primer acceso y esperas.
 *
 * Las pantallas de detrás de la sesión no se pueden fotografiar navegando: hay
 * que autenticarse y responder por la API. Se reutilizan los MISMOS fixtures
 * herméticos de los goldens, así que estas capturas enseñan el producto real
 * respondiendo a datos reales, sin API ni base de datos.
 *
 *   npx tsx scripts/capture-funnel-shots.mts <directorio> [etiqueta]
 */
import { chromium, type BrowserContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installMockBackend } from "../e2e/fixtures/mock-backend";
import { loginAsStandaloneOwner } from "../e2e/fixtures/standalone-identity";
import { API_ORIGIN } from "../e2e/fixtures/constants";

const outDir = process.argv[2];
const label = process.argv[3] ? `-${process.argv[3]}` : "";
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

/**
 * El tablero llama a cuatro endpoints al montar. Se responden VACÍOS para
 * retratar el estado que importa —el primer minuto— y, en la variante de
 * primer acceso, la lista de organizaciones se deja vacía para que el editor
 * de identidad exija elegir una.
 */
async function stubDashboard(
  context: BrowserContext,
  { organizations }: { organizations: boolean },
) {
  await context.route(`${API_ORIGIN}/v1/organizations*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: organizations ? [] : [] }),
    }),
  );
  for (const surface of ["projects", "documents"]) {
    await context.route(`${API_ORIGIN}/v1/cad/${surface}*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      }),
    );
  }
  await context.route(`${API_ORIGIN}/v1/commercial/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subscription: null, items: [] }),
    }),
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ["dark", "light"] as const) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (value) => window.localStorage.setItem("valle_theme", value),
      theme,
    );
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await stubDashboard(context, { organizations: true });

    const page = await context.newPage();

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1_200);
    await page.screenshot({
      path: path.join(outDir, `tablero-vacio-${theme}${label}.png`),
      fullPage: true,
      animations: "disabled",
    });
    console.log("  ·", `tablero-vacio-${theme}${label}.png`);

    // Las pantallas públicas del embudo que cambian con la sesión cerrada.
    for (const [route, name] of [
      ["/verify-email", "verificacion"],
      ["/no-existe-esta-ruta", "404"],
    ] as const) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(outDir, `${name}-${theme}${label}.png`),
        animations: "disabled",
      });
      console.log("  ·", `${name}-${theme}${label}.png`);
    }

    await context.close();
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
