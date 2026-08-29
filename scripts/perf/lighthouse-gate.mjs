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
 * ## Cada pasada se archiva en su propio directorio (y por qué a mano)
 *
 * `lhci collect` vuelca SIEMPRE en `.lighthouseci/` y BORRA lo que hubiera
 * antes, así que la pasada móvil pisa la de escritorio. La primera versión de
 * este script creía resolverlo pasando `--outputDir` a `collect`: esa opción NO
 * EXISTE en `lhci collect` —es de `upload --target=filesystem`— y yargs la
 * ignora sin decir nada, de modo que el gate seguía aseverando bien mientras el
 * paso de CI que subía `.lighthouseci-escritorio/` no encontraba nada y pasaba
 * en verde con un aviso. Dos números en aviso durante una campaña que existía
 * para medirlos. La lección es la de siempre: una opción aceptada en silencio
 * no es una opción aplicada. Ahora el archivado lo hace este script —copia
 * `.lighthouseci/` a `.lighthouseci-<pasada>/` en cuanto termina de medir— y
 * comprueba que el directorio archivado contiene informes; si no, falla.
 *
 * ## El resumen se imprime, no sólo se guarda
 *
 * El log del job se trunca antes de llegar a las puntuaciones, y un artefacto
 * puede no subirse. Por eso el script calcula él mismo la MEDIANA de las tres
 * corridas por ruta y la deja en tres sitios: la salida estándar, el fichero
 * `informes-lighthouse/resumen.json` y, si corre en Actions, el resumen del job
 * (`GITHUB_STEP_SUMMARY`). La medida no puede depender de que alguien acierte
 * a descargar un zip.
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
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
    salida: "escritorio",
  },
  {
    nombre: "móvil",
    fichero: join(AQUI, "lighthouserc.mobile.json"),
    salida: "movil",
  },
];

/**
 * Dónde quedan los informes para que alguien los lea. SIN punto delante, y ese
 * detalle costó una corrida entera de CI: `actions/upload-artifact` trae
 * `include-hidden-files: false` de serie y descarta todo lo que empiece por
 * punto. Con los informes en `.lighthouseci-escritorio/` el paso no encontraba
 * nada y —una vez puesto en `error`— fallaba en rojo sin decir por qué, porque
 * «no files were found» no menciona que los haya excluido por ocultos.
 *
 * Se podría haber añadido `include-hidden-files: true` y seguir. No: un
 * directorio de informes que se publica para leerlo NO es un fichero oculto, y
 * llamarlo con punto delante era el error de fondo. Con el nombre correcto el
 * problema no vuelve, ni aquí ni en el próximo paso que suba algo.
 */
const INFORMES = join(RAIZ, "informes-lighthouse");
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

/**
 * Donde `lhci collect` deja SIEMPRE los informes, digan lo que digan las opciones.
 * Absoluto y anclado en RAIZ, que es el `cwd` con el que se lanza lhci: si se
 * resolviera contra `process.cwd()`, lanzar el script desde `apps/web` haría que
 * lhci escribiera en un sitio y el resumen leyera en otro.
 */
const CRUDO = join(RAIZ, ".lighthouseci");

/**
 * La mediana, no la media: tres corridas y una que se cruza con el recolector
 * de basura del runner. La media se lleva ese pico a la nota publicada; la
 * mediana lo deja donde está, en una corrida de tres.
 */
export function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  if (orden.length === 0) return null;
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

function ruta(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Lee los `lhr-*.json` de la pasada recién medida y devuelve una fila por ruta
 * con la mediana de cada categoría y de las tres métricas que explican la nota
 * de rendimiento cuando baja. Sin esto, para saber qué midió el runner hay que
 * descargar un zip de 20 MB y abrir nueve JSON a mano.
 */
export function resumirPasada(pasada, crudo = CRUDO) {
  const ficheros = readdirSync(crudo).filter((f) => f.startsWith("lhr-") && f.endsWith(".json"));
  const porRuta = new Map();
  for (const fichero of ficheros) {
    let lhr;
    try {
      lhr = JSON.parse(readFileSync(join(crudo, fichero), "utf8"));
    } catch {
      continue;
    }
    const clave = ruta(lhr.requestedUrl ?? lhr.finalDisplayedUrl ?? lhr.finalUrl ?? "?");
    if (!porRuta.has(clave)) porRuta.set(clave, []);
    porRuta.get(clave).push(lhr);
  }
  const filas = [];
  const entradas = [...porRuta.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [camino, corridas] of entradas) {
    const cat = (nombre) =>
      mediana(corridas.map((l) => l.categories?.[nombre]?.score).filter((v) => typeof v === "number"));
    const aud = (nombre) =>
      mediana(
        corridas.map((l) => l.audits?.[nombre]?.numericValue).filter((v) => typeof v === "number"),
      );
    filas.push({
      pasada,
      ruta: camino,
      corridas: corridas.length,
      rendimiento: cat("performance"),
      accesibilidad: cat("accessibility"),
      buenasPracticas: cat("best-practices"),
      seo: cat("seo"),
      lcpMs: aud("largest-contentful-paint"),
      cls: aud("cumulative-layout-shift"),
      tbtMs: aud("total-blocking-time"),
    });
  }
  return filas;
}

/**
 * Copia la pasada a su propio directorio ANTES de que la siguiente la borre, y
 * comprueba que lo copiado son informes de verdad. Que el directorio exista no
 * basta: el fallo que esto arregla consistía justamente en un directorio que
 * nunca llegó a existir mientras todo salía en verde.
 */
export function archivarPasada(salida, filas, crudo = CRUDO) {
  rmSync(salida, { recursive: true, force: true });
  cpSync(crudo, salida, { recursive: true });
  const informes = readdirSync(salida).filter((f) => f.startsWith("lhr-") && f.endsWith(".json"));
  if (informes.length === 0 || filas.length === 0) {
    console.error(
      `Lighthouse: se archivó ${salida} pero no contiene ningún informe \`lhr-*.json\`.\n` +
        "Sin informes no hay medida que publicar, y un gate que mide y no publica no sirve.",
    );
    return false;
  }
  console.log(`   informes archivados en ${salida} (${informes.length})`);
  return true;
}

const pct = (v) => (typeof v === "number" ? Math.round(v * 100) : "—");
/** LCP en segundos, que es como se lee. */
const seg = (v) => (typeof v === "number" ? `${(v / 1000).toFixed(2)} s` : "—");
/** TBT en milisegundos: en segundos, un bloqueo de 159 ms se imprime «0.16 s» y parece nada. */
const mseg = (v) => (typeof v === "number" ? `${Math.round(v)} ms` : "—");
const cls3 = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

/**
 * Publica el resumen por triplicado: consola, fichero y resumen del job. El log
 * se trunca, el artefacto puede no subirse; el resumen del job sobrevive a los
 * dos y es donde alguien mira primero cuando el gate se pone rojo.
 */
export function imprimirTabla(filas) {
  console.log("\n── Mediana de las corridas ──");
  console.log("pasada      ruta        rend  a11y  bp   seo  LCP      CLS    TBT");
  for (const f of filas) {
    console.log(
      `${f.pasada.padEnd(11)} ${f.ruta.padEnd(11)} ${String(pct(f.rendimiento)).padStart(4)}` +
        ` ${String(pct(f.accesibilidad)).padStart(5)} ${String(pct(f.buenasPracticas)).padStart(4)}` +
        ` ${String(pct(f.seo)).padStart(4)}  ${seg(f.lcpMs).padStart(7)} ${cls3(f.cls).padStart(6)}` +
        ` ${mseg(f.tbtMs).padStart(7)}`,
    );
  }
}

export function publicarResumen(filas, destino = INFORMES) {
  if (filas.length === 0) return;
  imprimirTabla(filas);
  // El directorio ya existe si alguna pasada se archivó, pero el resumen no
  // puede depender de ese orden.
  mkdirSync(destino, { recursive: true });
  writeFileSync(
    join(destino, "resumen.json"),
    `${JSON.stringify({ generado: "por scripts/perf/lighthouse-gate.mjs", filas }, null, 2)}\n`,
    "utf8",
  );
  const resumenJob = process.env.GITHUB_STEP_SUMMARY;
  if (!resumenJob) return;
  const lineas = [
    "### Lighthouse — mediana de tres corridas por ruta",
    "",
    "| pasada | ruta | rendimiento | accesibilidad | buenas prácticas | SEO | LCP | CLS | TBT |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...filas.map(
      (f) =>
        `| ${f.pasada} | \`${f.ruta}\` | ${pct(f.rendimiento)} | ${pct(f.accesibilidad)} |` +
        ` ${pct(f.buenasPracticas)} | ${pct(f.seo)} | ${seg(f.lcpMs)} | ${cls3(f.cls)} | ${mseg(f.tbtMs)} |`,
    ),
    "",
  ];
  try {
    appendFileSync(resumenJob, `${lineas.join("\n")}\n`, "utf8");
  } catch {
    /* el resumen es un extra: si no se puede escribir, la tabla ya salió por consola */
  }
}

/**
 * Reimprime la tabla ya medida, sin arrancar servidor ni navegador.
 *
 * Existe por un problema de LECTURA, no de medida: el artefacto de Lighthouse
 * pesa doce megas y vive en un almacén que la política de red de algunos
 * entornos no deja descargar; el resumen del job de Actions no se puede leer
 * por API; y el log del job se trunca POR EL PRINCIPIO. La única copia que
 * siempre se puede leer es la que queda en las ÚLTIMAS líneas del log. Diez
 * líneas de CI evitan tener que relanzar una corrida entera para enterarse de
 * lo que ya se midió.
 *
 * No falla si no hay resumen: es un paso de lectura, y hacerlo fallar taparía
 * el fallo de verdad que impidió medir.
 */
function reimprimirResumen() {
  const ruta = join(INFORMES, "resumen.json");
  if (!existsSync(ruta)) {
    console.log(
      `No hay ${ruta}: esta corrida no tiene informes que enseñar.\n` +
        "Puede ser que la medida no llegara a producirse, o que la descarga del artefacto fallara.",
    );
    return;
  }
  try {
    const { filas } = JSON.parse(readFileSync(ruta, "utf8"));
    if (!Array.isArray(filas) || filas.length === 0) {
      console.log(`${ruta} no contiene filas.`);
      return;
    }
    imprimirTabla(filas);
  } catch (e) {
    console.log(`No se pudo leer ${ruta}: ${e?.message ?? e}`);
  }
}

async function main() {
  if (process.argv.includes("--resumen")) {
    reimprimirResumen();
    return;
  }
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
  const filas = [];
  try {
    for (const { nombre, fichero, salida } of CONFIGS) {
      console.log(`\n── Lighthouse · ${nombre} ──`);
      // Sin `--outputDir`: `lhci collect` no la tiene y la ignoraba en silencio.
      const medir = spawnSync("npx", ["--yes", "@lhci/cli", "collect", `--config=${fichero}`], {
        cwd: RAIZ,
        stdio: "inherit",
        env,
      });
      if ((medir.status ?? 1) !== 0) {
        codigo = medir.status ?? 1;
        break;
      }
      // Resumir y archivar ANTES de aseverar: si la aseveración corta la pasada,
      // la medida que la explica ya está guardada.
      const filasPasada = resumirPasada(nombre);
      filas.push(...filasPasada);
      if (!archivarPasada(join(INFORMES, salida), filasPasada)) {
        codigo = 1;
        break;
      }
      if (soloMedir) continue;
      const aseverar = spawnSync("npx", ["--yes", "@lhci/cli", "assert", `--config=${fichero}`], {
        cwd: RAIZ,
        stdio: "inherit",
        env,
      });
      if ((aseverar.status ?? 1) !== 0) {
        console.error(`Lighthouse ${nombre}: por debajo del umbral.`);
        codigo = aseverar.status ?? 1;
      }
    }
  } finally {
    matarGrupo(servidor);
    publicarResumen(filas);
  }

  if (codigo !== 0) {
    console.error(
      "\nGate de Lighthouse: FALLÓ. Los informes están en `informes-lighthouse/`, y la tabla\n" +
        "de medianas de arriba dice qué ruta y qué métrica.\n" +
        "Antes de tocar la página, comprueba si el fallo es de la página o de la máquina: " +
        "un runner cargado hunde la puntuación de rendimiento sin que el producto haya cambiado.",
    );
  } else {
    console.log("\nGate de Lighthouse OK.");
  }
  process.exit(codigo);
}

// Sólo se mide cuando se EJECUTA este fichero. Su spec lo importa para
// ejercitar las funciones puras, y sin esta guarda cada `node --test` arrancaría
// un `next start` y cuatro minutos de Chrome.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
