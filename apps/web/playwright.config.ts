import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, API_ORIGIN, SESSION_SECRET } from "./e2e/fixtures/constants";

const webServerPort =
  new URL(BASE_URL).port || (BASE_URL.startsWith("https:") ? "443" : "80");

/**
 * Playwright config de la suite E2E CAD de Valle Design (specs dorados
 * 10-28 + performance, heredados del origen).
 *
 * La suite corre contra el dev server real de Next y stubbea el backend en la
 * frontera de red (NEXT_PUBLIC_API_URL → API_ORIGIN, interceptado por los
 * fixtures de e2e/). Hermético: sin NestJS ni base de datos.
 *
 * NOTA R3: los specs dorados interceptan las rutas LEGACY
 * `/line-engineering/*`; desde R2 el adaptador `src/lib/cad-api.ts` reescribe
 * esas llamadas a `/v1/cad/*` ANTES de tocar la red, así que en R3 los
 * intercepts/fixtures deben moverse a la superficie v1.
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
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Apunta la capa de datos del cliente al origen del fake backend.
      NEXT_PUBLIC_API_URL: API_ORIGIN,
      // Firma de cookies de sesión con el mismo secreto del proceso de test.
      AXOS_SESSION_SECRET: SESSION_SECRET,
      PORT: webServerPort,
      BROWSER: "none",
    },
  },
});
