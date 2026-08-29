#!/usr/bin/env node
/**
 * Gate de Lighthouse — el veredicto de un navegador de verdad sobre el embudo.
 *
 * ## Por qué hace falta habiendo ya dos medidores de peso
 *
 * `bundle-budget.mjs` mide bytes y `frontend-load-budget.spec.ts` mide bytes
 * descargados. Ninguno de los dos dice cuánto TARDA la página en ser útil: un
 * bundle pequeño con una fuente que bloquea el pintado, una imagen sin tamaño
 * declarado que mueve el texto al llegar, o un script que ocupa el hilo
 * principal medio segundo, salen bien en peso y mal en pantalla. Lighthouse
 * mide eso — LCP, CLS, bloqueo del hilo — arrancando Chrome de verdad.
 *
 * ## Qué levanta este script y por qué no lo hace lhci
 *
 * El servidor lo arranca este script, no `startServerCommand` de lhci, porque
 * tiene que ser EL MISMO build de producción que ya mide el presupuesto de
 * bundle. Dejar que lhci lo levante por su cuenta duplicaría el arranque en un
 * job que ya va largo, y peor: abriría la puerta a medir un build distinto del
 * que se está publicando.
 *
 * ## Cada pasada escribe en su propio directorio
 *
 * `lhci collect` vuelca SIEMPRE en `.lighthouseci/` si no se le dice otra cosa
 * —`upload.outputDir` es de otro paso—, así que la primera versión de este
 * script dejaba la pasada móvil pisando la de escritorio y publicaba una tabla
 * con los números de una mezclados con los de la otra. Cada pasada lleva ahora
 * su `--outputDir`.
 *
 * ## Sobre los umbrales
 *
 * Están en `lighthouserc.json` y salen de lo medido con margen. Un umbral
 * inventado en un runner compartido no mide el producto: mide la carga del
 * runner. Cuando este gate falle, lo primero es mirar si falló por la página o
 * por la máquina — el informe queda en `.lighthouseci/`.
 *
 *   node scripts/perf/lighthouse-gate.mjs            # arranca, mide, asevera
 *   node scripts/perf/lighthouse-gate.mjs --collect  # sólo mide, no asevera
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";


/**
 * Mata el árbol entero del servidor, no sólo su raíz. `spawn` con
 * `detached: true` le da su propio grupo de procesos; un `kill` sobre `-pid`
 * llega a todos los descendientes. Sin esto, el `next-server` nieto sobrevive
 * al script y se queda escuchando en su puerto.
 */
function matarGrupo(proceso) {
  if (!proceso || proceso.killed) return;
  try {
    process.kill(-proceso.pid, "SIGKILL");
  } catch {
    // El grupo ya murió, o el sistema no lo permite: el fallback es el hijo.
    try {
      proceso.kill("SIGKILL");
    } catch {
      /* nada más que hacer */
    }
  }
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");
const WEB = join(RAIZ, "apps", "web");
/**
 * Dos configuraciones y dos pasadas: escritorio y móvil. No es celo — el
 * emulado móvil de Lighthouse ralentiza la CPU 4× y estrangula la red, y ahí
 * es donde un bundle que en escritorio «va bien» deja de ir bien. Medir sólo
 * escritorio publica una nota que ningún usuario de teléfono reconoce.
 */
const CONFIGS = [
  {
    nombre: "escritorio",
    fichero: join(AQUI, "lighthouserc.json"),
    salida: ".lighthouseci-escritorio",
  },
  {
    nombre: "móvil",
    fichero: join(AQUI, "lighthouserc.mobile.json"),
    salida: ".lighthouseci-movil",
  },
];
const PUERTO = 3141;
const BASE = `http://127.0.0.1:${PUERTO}`;

/**
 * Dónde está Chrome. En el runner de CI viene Google Chrome instalado; en este
 * contenedor de desarrollo sólo está el Chromium de Playwright. Se busca en ese
 * orden y se falla ruidosamente si no hay ninguno, en vez de dejar que lhci se
 * caiga con un mensaje que no dice qué falta.
 */
function rutaDeChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidatos = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of candidatos) if (existsSync(c)) return c;
  // El Chromium de Playwright, si el paquete está instalado.
  const encontrado = spawnSync(
    process.execPath,
    ["-e", "try{const{chromium}=require('@playwright/test');process.stdout.write(chromium.executablePath())}catch{}"],
    { cwd: WEB, encoding: "utf8" },
  );
  const ruta = (encontrado.stdout ?? "").trim();
  if (ruta && existsSync(ruta)) return ruta;
  return null;
}

async function esperar(base, intentos = 100) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const r = await fetch(base, { redirect: "manual" });
      if (r.status > 0) return true;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  if (!existsSync(join(WEB, ".next", "BUILD_ID"))) {
    console.error(`No hay build en ${join(WEB, ".next")}. Corre \`npm run build\` antes.`);
    process.exit(1);
  }
  const chrome = rutaDeChrome();
  if (!chrome) {
    console.error(
      "No se encontró ningún Chrome. Define CHROME_PATH o instala google-chrome / el navegador de Playwright.",
    );
    process.exit(1);
  }

  // `detached: true` + matar el GRUPO: `npx` lanza `next start`, que a su vez
  // lanza `next-server`. Matar sólo el hijo directo deja al nieto escuchando en
  // su puerto para siempre.
  const servidor = spawn("npx", ["next", "start", "-p", String(PUERTO)], {
    cwd: WEB,
    stdio: "ignore",
    env: process.env,
    detached: true,
  });
  const vivo = await esperar(BASE);
  if (!vivo) {
    matarGrupo(servidor);
    console.error(`El servidor no respondió en ${BASE}`);
    process.exit(1);
  }

  const soloMedir = process.argv.includes("--collect");
  const env = { ...process.env, CHROME_PATH: chrome };
  let codigo = 0;
  try {
    for (const { nombre, fichero, salida } of CONFIGS) {
      console.log(`\n── Lighthouse · ${nombre} ──`);
      const medir = spawnSync(
        "npx",
        ["--yes", "@lhci/cli", "collect", `--config=${fichero}`, `--outputDir=${salida}`],
        { cwd: RAIZ, stdio: "inherit", env },
      );
      if ((medir.status ?? 1) !== 0) {
        codigo = medir.status ?? 1;
        break;
      }
      if (soloMedir) continue;
      const aseverar = spawnSync(
        "npx",
        ["--yes", "@lhci/cli", "assert", `--config=${fichero}`, `--outputDir=${salida}`],
        { cwd: RAIZ, stdio: "inherit", env },
      );
      if ((aseverar.status ?? 1) !== 0) {
        console.error(`Lighthouse ${nombre}: por debajo del umbral.`);
        codigo = aseverar.status ?? 1;
      }
    }
  } finally {
    matarGrupo(servidor);
  }

  if (codigo !== 0) {
    console.error(
      "\nGate de Lighthouse: FALLÓ. El informe completo está en `.lighthouseci/`.\n" +
        "Antes de tocar la página, comprueba si el fallo es de la página o de la máquina: " +
        "un runner cargado hunde la puntuación de rendimiento sin que el producto haya cambiado.",
    );
  } else {
    console.log("\nGate de Lighthouse OK.");
  }
  process.exit(codigo);
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
