import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, API_ORIGIN } from "./e2e/fixtures/constants";

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
  // `e2e/auditoria/` NO corre en la suite, y no es un descuido: son las pruebas
  // de la auditoría de cliente final, y están ROJAS A PROPÓSITO. Cada una
  // reproduce en el navegador un defecto confirmado —el que la publicación deja
  // el dibujo sin poder guardarse, el que una línea sobre la fachada se va al
  // suelo, el que redefinir un bloque mueve las instancias nueve metros— y
  // seguirá roja hasta que ese defecto se arregle. Meterlas en la suite pondría
  // el veredicto en rojo permanente, que es exactamente cómo se pierde un
  // veredicto: cuando siempre está rojo, deja de mirarse.
  //
  // Una exclusión así se pudre en silencio, así que no está sola:
  // `scripts/cad/check-auditoria-manifest.mjs` exige que cada archivo de aquí
  // esté declarado en `e2e/auditoria/manifiesto.json` con su defecto, y que la
  // lista SÓLO ENCOJA. Cuando un defecto se arregla, su spec no se borra: se
  // GRADÚA a `e2e/golden/` y pasa a defender el arreglo. Ver el README de esa
  // carpeta.
  testIgnore: ["auditoria/**"],
  outputDir: "./e2e/.test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // En CI un retry salva la corrida entera (60-90 min de runner) de los flakes
  // documentados en docs/history/audits/main-rojo-e2e-20260809.md; Playwright marca el
  // test como "flaky" en el reporte, así que la señal no se pierde. En local
  // se mantiene 0: un flake debe verse, no taparse.
  retries: process.env.CI ? 1 : 0,
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
      // GPU REAL bajo demanda, sólo para las medidas de rendimiento locales.
      //
      // El binario headless-shell que Playwright usa por defecto rasteriza
      // WebGL con SwiftShader (software) AUNQUE la máquina tenga GPU: sirve
      // para comparar caminos de render entre sí, pero publica FPS que ningún
      // usuario del producto va a ver. Con CAD_PERF_REAL_GPU=1 se lanza el
      // Chromium completo en headless nuevo (canal "chromium"), que en
      // Windows/Linux sí toca la GPU de la máquina vía ANGLE. No se miente en
      // ningún caso: la evidencia declara `webglRenderer`, así que cada
      // corrida lleva escrito qué rasterizador la produjo.
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CAD_PERF_REAL_GPU === "1" ? { channel: "chromium" as const } : {}),
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // El viewport CAD se dibuja con THREE.WebGLRenderer. Firefox headless
        // en el runner SIN GPU no habilita WebGL por defecto (Chromium sí, vía
        // SwiftShader), así que sin estas prefs TODA la suite dorada fallaba en
        // Firefox por el navegador, no por el producto. Se fuerza el backend
        // software para que Firefox ejercite el mismo viewport real que
        // Chromium.
        //
        // `layers.acceleration.force-enabled` estaba aquí y se ha RETIRADO: en
        // un runner sin GPU fuerza la ruta acelerada y es candidata a agotar la
        // lista de drivers (FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS). Lo que
        // Firefox headless necesita es la ruta EGL surfaceless sobre llvmpipe,
        // que es lo que habilitan WebRender por software y `libegl1` en CI.
        //
        // SOLO EN CI: en una máquina de desarrollo con GPU real este combo es
        // exactamente el contrario de lo que Firefox necesita — WebRender por
        // software + WebGL forzado EN PROCESO estrella la pestaña entera
        // (medido en Windows: «Page crashed» en cada golden; con las prefs de
        // serie la misma suite pasa). Firefox de escritorio ya trae WebGL.
        launchOptions: {
          firefoxUserPrefs:
            process.env.CI === "true"
              ? {
                  "webgl.disabled": false,
                  "webgl.force-enabled": true,
                  "webgl.forbid-software": false,
                  "webgl.out-of-process": false,
                  "gfx.webrender.software": true,
                  "gfx.webrender.all": true,
                }
              : {},
        },
      },
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
      PORT: webServerPort,
      BROWSER: "none",
    },
  },
});
