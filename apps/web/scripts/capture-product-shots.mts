#!/usr/bin/env tsx
/**
 * CAPTURAS REALES DEL PRODUCTO — reproducibles, no envejecidas.
 *
 * POR QUÉ EXISTE. La portada de un CAD que no enseña un dibujo es la carencia
 * número uno de este producto: hasta hoy, `public/` no tenía un solo archivo de
 * imagen y el hero pintaba una caja con degradado y una lista numerada. Un
 * arquitecto que llega a decidir si cambia de herramienta quiere ver la
 * herramienta.
 *
 * POR QUÉ ES UN SCRIPT Y NO SEIS PNG SUBIDOS A MANO. Una captura pegada en el
 * repositorio envejece en silencio: el producto cambia, la portada sigue
 * enseñando la interfaz del trimestre pasado, y nadie se entera hasta que un
 * cliente lo dice. Aquí las capturas se REGENERAN — el plano se vuelve a
 * dibujar comando a comando con la misma línea de comandos que usa una persona.
 *
 * Reutiliza los fixtures herméticos de los goldens (`e2e/fixtures/`): sin API
 * real, sin base de datos, sin red. Lo que se fotografía es el editor de verdad
 * respondiendo a órdenes de verdad.
 *
 *   npm run capture:product                # contra el servidor que ya corre
 *   npm run capture:product -- --start     # arranca `next dev` y lo apaga al salir
 *
 * En Windows hace falta `PLAYWRIGHT_BROWSERS_PATH` si los navegadores no están
 * en la ruta por defecto (ver docs/design/DESIGN_SYSTEM.md).
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installMockBackend } from "../e2e/fixtures/mock-backend";
import { installCadV1Backend } from "../e2e/fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../e2e/fixtures/standalone-identity";
import { createCadStarterDocument } from "../src/lib/cad/starter-templates";
import type { CadDocument } from "../src/lib/cad/cad-document";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_ORIGIN = process.env.E2E_API_ORIGIN || "http://localhost:4010";

/** Dónde caen las capturas. `public/product/` las sirve la portada. */
const OUT_DIR = path.join(webRoot, "public", "product");
/**
 * EL PLANO DE EJEMPLO — el mismo que sale en la portada.
 *
 * Que sean el mismo dibujo no es una economía: es una promesa cumplida. Quien
 * ve la captura del hero y pulsa «Abre un plano de ejemplo» abre EXACTAMENTE lo
 * que acaba de ver. La alternativa —una captura bonita y un ejemplo distinto—
 * es la primera decepción del producto, y llega en el primer minuto.
 *
 * El fixture se GENERA dibujando con los comandos reales, no se escribe a mano:
 * el día que el esquema del documento cambie, se regenera en vez de pudrirse.
 */
const SAMPLE_PLAN = path.join(webRoot, "src", "lib", "cad", "sample-plan.json");
/** Copia de referencia para el informe de la campaña (antes/después). */
const DOC_DIR = path.resolve(webRoot, "..", "..", "docs", "design", "before-after");

/**
 * Retina. Las capturas se muestran a la mitad de su tamaño en la portada, así
 * que se toman al doble: en una pantalla densa, una captura 1× de una interfaz
 * llena de texto de 11 px se ve emborronada, y eso lee como producto barato.
 */
const SCALE = 2;
const VIEWPORT = { width: 1440, height: 900 };

type Shot = { name: string; note: string };
const taken: Shot[] = [];

/* ── Utilidades de conducción del editor ─────────────────────────────────── */

async function type(page: Page, text: string) {
  const line = page.getByTestId("cad-command-input");
  await line.click();
  await line.fill(text);
  await page.keyboard.press("Enter");
}

async function shoot(page: Page, name: string, note: string, clip?: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, clip, animations: "disabled" });
  taken.push({ name, note });
  console.log(`  · ${name}.png — ${note}`);
}

/**
 * El plano de ejemplo: una planta arquitectónica real, no cuatro líneas.
 *
 * Se dibuja con la MISMA línea de comandos que usa una persona (WA para muro,
 * DLI para cota) sobre la plantilla mexicana de arranque, que ya trae capas,
 * estilo de cota, escala 1:50 y cajetín. Si el producto dejara de responder a
 * un alias, este script fallaría en vez de fotografiar un lienzo vacío.
 */
async function drawSamplePlan(page: Page) {
  // Cuatro muros que cierran una crujía de 8 × 5 m. Los muros resuelven su
  // unión en la esquina solos: eso es lo que la captura tiene que enseñar.
  const walls: Array<[string, string]> = [
    ["2000,2000", "10000,2000"],
    ["10000,2000", "10000,7000"],
    ["10000,7000", "2000,7000"],
    ["2000,7000", "2000,2000"],
  ];
  for (const [from, to] of walls) {
    await type(page, "WA");
    await type(page, from);
    await type(page, to);
    await page.keyboard.press("Enter");
  }

  // Un muro interior que divide la crujía.
  await type(page, "WA");
  await type(page, "6000,2000");
  await type(page, "6000,5000");
  await page.keyboard.press("Enter");

  // Cotas: la fachada completa y la crujía izquierda.
  await type(page, "DLI");
  await type(page, "2000,2000");
  await type(page, "10000,2000");
  await type(page, "6000,700");

  await type(page, "DLI");
  await type(page, "2000,2000");
  await type(page, "2000,7000");
  await type(page, "900,4500");

  await page.waitForTimeout(600);
}

/**
 * VISTA DE PLANO, NO ÓRBITA 3D.
 *
 * El editor arranca en 3D y con la cámara en su sitio de fábrica: la primera
 * captura salió con la planta como un plano inclinado en perspectiva, ilegible
 * como dibujo. Un CAD 2D que se anuncia con una órbita 3D vacía está enseñando
 * lo que NO es. Se conmuta a 2D por el mismo control que usa una persona y se
 * encuadra con ZOOM EXtensión, que es el comando de siempre.
 */
async function frameThePlan(page: Page) {
  const flat = page.getByTitle(/Vista de plano 2D/);
  if (await flat.isVisible().catch(() => false)) {
    await flat.click();
    await page.waitForTimeout(400);
  }
  await type(page, "ZOOM");
  await type(page, "EX");
  await page.waitForTimeout(500);
  // EXtensión encaja el dibujo a ras del borde del lienzo. Un plano que toca
  // los cuatro cantos se lee como recortado; el 0,75 le devuelve el aire que
  // un arquitecto deja alrededor de una planta.
  await type(page, "ZOOM");
  await type(page, "0.75X");
  await page.waitForTimeout(700);
}

function starterDocument(): CadDocument {
  return createCadStarterDocument({
    templateId: "planta-arquitectonica",
    project: "Casa Zaragoza",
    client: "Familia Zaragoza",
    title: "Planta baja",
    drawnBy: "S. Valle",
    date: "2026-08-21",
  });
}

async function installBackends(context: BrowserContext) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  return installCadV1Backend(context, {
    document: starterDocument() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 40_550,
      footprintH: 26_200,
      unit: "mm",
      gridSize: 100,
    },
  });
}

/* ── Arranque opcional del servidor ──────────────────────────────────────── */

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function maybeStartServer(): Promise<ChildProcess | null> {
  if (await reachable(BASE_URL)) {
    console.log(`· servidor ya en pie en ${BASE_URL}`);
    return null;
  }
  if (!process.argv.includes("--start")) {
    throw new Error(
      `No hay servidor en ${BASE_URL}.\n` +
        "Arráncalo con `npm run dev` o vuelve a llamar con `-- --start`.",
    );
  }
  console.log("· arrancando next dev…");
  const child = spawn("npm", ["run", "dev"], {
    cwd: webRoot,
    env: { ...process.env, NEXT_PUBLIC_API_URL: API_ORIGIN, BROWSER: "none" },
    stdio: "ignore",
    shell: true,
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await reachable(BASE_URL)) return child;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  child.kill();
  throw new Error("el servidor no respondió en 180 s");
}

/* ── El recorrido ────────────────────────────────────────────────────────── */

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(DOC_DIR, { recursive: true });
  const server = await maybeStartServer();

  const browser = await chromium.launch();
  try {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      // El tema lo fija el mismo almacenamiento que usa el conmutador real.
      await context.addInitScript(
        (value) => window.localStorage.setItem("valle_theme", value),
        theme,
      );
      const { snapshot } = await installBackends(context);
      const page = await context.newPage();

      await page.goto(`${BASE_URL}/legacy/studio`);
      await page
        .getByTestId("cad-command-line")
        .waitFor({ state: "visible", timeout: 120_000 });

      // El acompañante se cierra: en una captura de venta estorba, y su propia
      // pantalla se fotografía aparte.
      const skip = page.getByTestId("cad-guided-tour-skip");
      if (await skip.isVisible().catch(() => false)) await skip.click();

      await drawSamplePlan(page);
      await frameThePlan(page);

      await shoot(
        page,
        `estudio-${theme}`,
        `el estudio completo en tema ${theme === "dark" ? "oscuro" : "claro"}`,
      );

      if (theme === "dark") {
        /* El plano de ejemplo, tal y como quedó dibujado. */
        const { document: drawn } = snapshot();
        await writeFile(
          SAMPLE_PLAN,
          `${JSON.stringify(drawn, null, 2)}\n`,
          "utf8",
        );
        console.log("  · sample-plan.json — el plano que abre el tablero");

        /* Acercamiento a la línea de comandos con un comando EN CURSO. */
        await type(page, "DLI");
        await page.waitForTimeout(300);
        const dock = page.getByTestId("cad-command-line");
        const box = await dock.boundingBox();
        if (box) {
          await shoot(page, "linea-de-comandos", "un comando a medio ejecutar", {
            x: Math.max(0, box.x - 12),
            y: Math.max(0, box.y - 12),
            width: Math.min(VIEWPORT.width, box.width + 24),
            height: box.height + 24,
          });
        }
        await page.keyboard.press("Escape");

        /* Paletas de capas y de propiedades. */
        for (const [command, name, note] of [
          ["LAYER", "paleta-capas", "el gestor de capas"],
          ["PROPERTIES", "paleta-propiedades", "la paleta de propiedades"],
        ] as const) {
          await type(page, command);
          await page.waitForTimeout(500);
          await shoot(page, name, note);
          await page.keyboard.press("Escape");
        }

        /* Espacio papel con el cajetín. */
        await type(page, "LAYOUT");
        await page.waitForTimeout(700);
        await shoot(page, "espacio-papel", "la lámina con su cajetín");
        await page.keyboard.press("Escape");
      }

      await context.close();
    }

    await writeFile(
      path.join(OUT_DIR, "MANIFIESTO.md"),
      [
        "# Capturas del producto",
        "",
        "GENERADAS, no subidas a mano. Se regeneran con:",
        "",
        "```bash",
        "npm run capture:product -- --start",
        "```",
        "",
        "El plano se dibuja comando a comando con la línea de comandos real",
        "sobre la plantilla mexicana de arranque. Si el producto dejara de",
        "responder a un alias, el script fallaría en vez de fotografiar un",
        "lienzo vacío — que es la única forma de que una captura no envejezca",
        "en silencio.",
        "",
        "| Archivo | Qué muestra |",
        "| ------- | ----------- |",
        ...taken.map((s) => `| \`${s.name}.png\` | ${s.note} |`),
        "",
      ].join("\n"),
      "utf8",
    );

    console.log(`\n${taken.length} capturas en apps/web/public/product/`);
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
