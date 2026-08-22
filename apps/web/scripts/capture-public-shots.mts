#!/usr/bin/env tsx
/**
 * Capturas de las pantallas PÚBLICAS (portada, registro, precios, guías).
 * Usado para el antes/después de la campaña y para el material de venta.
 * Uso: tsx capture-public.mts <directorio-destino> <etiqueta>
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2];
const label = process.argv[3] ?? "";
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

const PAGES: Array<[string, string, "full" | "fold"]> = [
  ["/", "portada", "full"],
  ["/", "portada-fold", "fold"],
  ["/register", "registro", "fold"],
  ["/precios", "precios", "full"],
  ["/docs", "guias", "fold"],
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const theme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await ctx.addInitScript((v) => window.localStorage.setItem("valle_theme", v), theme);
    const page = await ctx.newPage();
    for (const [route, name, mode] of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const file = path.join(outDir, `${name}-${theme}${label ? "-" + label : ""}.png`);
      await page.screenshot({ path: file, fullPage: mode === "full", animations: "disabled" });
      console.log("  ·", path.basename(file));
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
