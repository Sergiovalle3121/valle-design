import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, API_ORIGIN, SESSION_SECRET } from "./e2e/fixtures/constants";

const webServerPort =
  new URL(BASE_URL).port || (BASE_URL.startsWith("https:") ? "443" : "80");

/**
 * Playwright config de la suite E2E CAD de Valle Design (specs dorados
 * 10-28 + performance + full-stack real, heredados/portados del origen).
 *
 * R3 — dos modos:
 *
 *  · GOLDENS (default): el navegador pide la superficie REAL `/v1/cad/*`
 *    (el adaptador R2 reescribe las rutas legacy del editor) y los fixtures
 *    de `e2e/fixtures/cad-v1-backend.ts` la stubbean en la frontera de red.
 *    Hermético: sin NestJS ni base de datos (así operan en el origen).
 *
 *  · FULL-STACK REAL (`E2E_REAL_API=1` + `e2e/real/`): NINGÚN intercept — el
 *    navegador habla con la API NestJS real. Requiere la API arrancada en
 *    E2E_API_ORIGIN y el web apuntando NEXT_PUBLIC_API_URL a ese origen.
 *
 * Servidor web: `npm run dev` por defecto; con `E2E_PROD=1` usa `next start`
 * (exige un `next build` previo hecho con el MISMO NEXT_PUBLIC_API_URL —
 * Next lo inlinea en build time). CI corre en modo prod.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: process.env.E2E_PROD === "1" ? "npm run start" : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Apunta la capa de datos del cliente al origen del backend (fake en
      // los goldens; API real en modo full-stack). En modo prod esto sólo
      // afecta al server de Next — el bundle ya lleva el valor del build.
      NEXT_PUBLIC_API_URL: API_ORIGIN,
      // Firma de cookies de sesión con el mismo secreto del proceso de test.
      AXOS_SESSION_SECRET: SESSION_SECRET,
      PORT: webServerPort,
      BROWSER: "none",
    },
  },
});
