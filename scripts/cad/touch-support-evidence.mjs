#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/touch-support.json`.
 *
 * ## Por qué el artefacto lo escribe un script y no una persona
 *
 * Porque una afirmación escrita a mano sobre gestos no se puede volver a
 * comprobar. Aquí se levanta el servidor, se corre la sonda táctil varias veces
 * en PROCESOS SEPARADOS y se vuelca el resultado. Si alguien quiere discutir un
 * veredicto, lo vuelve a generar.
 *
 * ## Unanimidad, no promedio
 *
 * Un gesto funciona o no funciona; promediar veredictos no significa nada. Se
 * exige que las corridas coincidan: un cheque que no sale igual en todas se
 * publica como `inestable` y se cuenta entre lo NO cubierto. Nunca se publica
 * «funciona» apoyándose en la corrida que salió bien.
 *
 * ## El límite grande
 *
 * Chromium con táctil emulado NO es un iPad. Lo dice el propio artefacto, en
 * `alcance.noMedido` y en `limiteDeLaEmulacion`, y lo repite quien lo cite.
 *
 * Uso:
 *   node scripts/cad/touch-support-evidence.mjs            # levanta el servidor él mismo
 *   E2E_BASE_URL=http://localhost:3000 node …              # reutiliza uno ya arrancado
 *   TOUCH_PROBE_RUNS=1 node …                              # corridas (por defecto 3)
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(here, "touch-support-probe.mts");
const output = path.join(root, "docs/cad/evidence/touch-support.json");

const RUNS = Number(process.env.TOUCH_PROBE_RUNS ?? 3);
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:4010";

async function serverIsUp() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(3_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Levanta el servidor de desarrollo si no hay ninguno escuchando.
 *
 * Se reutiliza el que ya esté arriba a propósito: en un portátil con varios
 * agentes trabajando, arrancar un Next de más cuesta minutos y contamina la
 * medida de todos los demás.
 */
async function ensureServer() {
  if (await serverIsUp()) return null;
  const child = spawn("npm", ["run", "dev"], {
    cwd: web,
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: API_ORIGIN,
      PORT: new URL(BASE_URL).port || "3000",
      BROWSER: "none",
    },
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await serverIsUp()) return child;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  child.kill();
  throw new Error(`el servidor web no respondió en ${BASE_URL} tras 180 s`);
}

function runProbe(index) {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  process.stderr.write(`· corrida ${index + 1}/${RUNS}…\n`);
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 1_800_000,
    env: { ...process.env, E2E_BASE_URL: BASE_URL },
  });
  return JSON.parse(stdout);
}

function environment() {
  const cpus = os.cpus();
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model ?? "desconocido",
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    declaredMachine:
      `${cpus[0]?.model?.trim() ?? "CPU desconocida"} (${cpus.length} hilos lógicos), ` +
      `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, ` +
      "portátil de desarrollo con carga vecina (otros agentes trabajando en el mismo equipo)",
  };
}

/**
 * Cruza las corridas de un perfil. Un cheque sólo conserva su veredicto si TODAS
 * dijeron lo mismo; si discrepan, pasa a `inestable` y su desacuerdo se publica.
 */
function crossRuns(runs, profileId) {
  const perRun = runs.map((run) => run.profiles.find((profile) => profile.id === profileId));
  if (perRun.some((profile) => !profile))
    throw new Error(`el perfil ${profileId} no aparece en todas las corridas`);
  const checkIds = perRun[0].checks.map((check) => check.id);
  const checks = checkIds.map((id) => {
    const samples = perRun.map((profile) => profile.checks.find((check) => check.id === id));
    if (samples.some((sample) => !sample))
      throw new Error(`el cheque ${id} no aparece en todas las corridas del perfil ${profileId}`);
    const verdicts = [...new Set(samples.map((sample) => sample.veredicto))];
    const stable = verdicts.length === 1;
    return {
      id,
      gesto: samples[0].gesto,
      esperado: samples[0].esperado,
      veredicto: stable ? verdicts[0] : "inestable",
      observado: samples[0].observado,
      veredictoPorCorrida: samples.map((sample) => sample.veredicto),
      medidaPorCorrida: samples.map((sample) => sample.medida ?? null),
    };
  });
  return {
    id: profileId,
    label: perRun[0].label,
    viewport: perRun[0].viewport,
    disposicion: perRun[0].layout,
    checks,
  };
}

const startedAt = new Date().toISOString();
const server = await ensureServer();
let runs;
try {
  runs = [];
  for (let index = 0; index < RUNS; index += 1) runs.push(runProbe(index));
} finally {
  if (server) server.kill();
}
const finishedAt = new Date().toISOString();

const profileIds = runs[0].profiles.map((profile) => profile.id);
const profiles = profileIds.map((id) => crossRuns(runs, id));

const flat = profiles.flatMap((profile) =>
  profile.checks.map((check) => ({ perfil: profile.id, ...check })),
);
const byVerdict = (verdict) =>
  flat.filter((entry) => entry.veredicto === verdict).map((entry) => `${entry.id} · ${entry.perfil}`);

const evidence = {
  $schema: "urn:valle-design:schema:cad-touch-support-evidence:v1",
  schemaVersion: 1,
  evidenceId: "valle-design-touch-support-v1",
  startedAt,
  finishedAt,
  enforcement: "report-only",
  enforcementRationale:
    "Los gestos que este artefacto declara VIVOS están cerrados por un golden ejecutable " +
    "(e2e/golden/56-cad-tableta-en-obra.spec.ts), que falla si dejan de funcionar. Este JSON no fija " +
    "presupuesto: es el mapa de qué gesto responde en qué tamaño de pantalla, y su valor está en lo que " +
    "declara ROTO y en lo que declara NO MEDIDO.",
  environment: environment(),
  metodo: {
    corridas: RUNS,
    agregacion:
      "unanimidad exigida entre corridas en PROCESOS SEPARADOS. Un cheque que no sale igual en todas se " +
      "publica como «inestable» y cuenta como NO cubierto: un gesto no se declara vivo apoyándose en la " +
      "corrida que salió bien.",
    generador: "scripts/cad/touch-support-evidence.mjs + scripts/cad/touch-support-probe.mts",
    comoSeInyectanLosGestos:
      "Por CDP (`Input.dispatchTouchEvent`), único camino con MÁS DE UN PUNTO DE CONTACTO: la API de " +
      "Playwright sólo sabe dar un toque. Cada contacto declara 12 px de radio, la huella de un dedo " +
      "adulto en una tableta de 10\".",
    comoSeJuzgaCadaGesto:
      "Por su EFECTO, nunca por «se disparó el evento»: el paneo y el zoom invirtiendo la transformación " +
      "mundo↔pantalla que el editor publica bajo el cursor; la designación en el contador de selección; " +
      "el dibujo en el número de entidades del documento canónico.",
    instrumentoDeMedida:
      "La transformación mundo↔pantalla se lee moviendo un RATÓN sintético, porque un dedo no tiene HUD " +
      "de coordenadas: no hay hover. El ratón es el aparato de medida, no parte del gesto juzgado — " +
      "ningún veredicto depende de que exista un ratón.",
  },
  limiteDeLaEmulacion: {
    titulo: "Chromium con táctil emulado NO es un iPad",
    detalle:
      "Estas cifras salen de puntos de contacto sintéticos en un Chromium de escritorio. No reproducen " +
      "la latencia del dedo, ni la deriva del contacto real, ni la heurística de gestos del sistema " +
      "operativo, ni el menú contextual por pulsación larga que sintetiza un navegador móvil de verdad " +
      "(en emulación NO se emite `contextmenu`, y está medido). Tampoco hay teclado en pantalla, que en " +
      "una tableta se come la mitad inferior al enfocar la línea de comandos.",
    consecuencia:
      "Lo que este artefacto demuestra es lo que el PRODUCTO hace con una secuencia de contactos. Lo que " +
      "un iPad hace con un dedo sólo lo demuestra un iPad. Nadie debe citar este archivo como «funciona " +
      "en tableta»: dice «funciona con táctil emulado en Chromium».",
  },
  resumen: {
    gestosVivos: byVerdict("funciona"),
    gestosRotos: byVerdict("roto"),
    gestosParciales: byVerdict("parcial"),
    gestosInestables: byVerdict("inestable"),
  },
  defectosConocidos: [
    {
      id: "objetivos-tactiles-por-debajo-de-44px",
      severidad: "media",
      titulo: "Casi todos los controles bajan del mínimo táctil de 44 px",
      // Las cifras salen de la disposición medida, no de una estimación.
      medido: Object.fromEntries(
        profiles.map((profile) => [profile.id, profile.disposicion.objetivosTactiles]),
      ),
      consecuencia:
        "44 px de lado es el mínimo que publican Apple y Google para un objetivo táctil. Por debajo, el " +
        "dedo falla el botón y el usuario culpa al programa. El control más pequeño del editor mide 16,5 px.",
      porQueNoSeArreglaAqui:
        "No es un problema del viewport ni de los gestos: es el tamaño de casi cien controles repartidos " +
        "por barras y paletas, y agrandarlos es un cambio del sistema de diseño con su propia ola. " +
        "Cambiarlos a ciegas junto a los gestos habría mezclado dos regresiones distintas en un mismo diff.",
      estado: "medido y declarado; no arreglado en esta ola",
    },
  ],
  perfiles: profiles,
  alcance: {
    medido: [
      "designación de una entidad con un toque, en tres tamaños de tableta",
      "tolerancia de temblor del toque: 4, 8 y 16 px entre pulsar y soltar",
      "qué hace un dedo arrastrando sobre el fondo del plano",
      "paneo con dos dedos: desplazamiento conseguido y deriva de escala",
      "zoom por pellizco: factor conseguido frente al factor pedido",
      "dibujar una línea a toques, comprobado en el número de entidades del documento",
      "apuntar deslizando y soltar, que es la única forma que tiene un dedo de ver antes de fijar",
      "pulsación larga como sustituto del botón derecho",
      "captura a objeto bajo el dedo a 0, 6, 12 y 20 px de un extremo conocido",
      "que encuadrar con dos dedos no fije puntos ni altere el comando abierto",
      "qué fracción del lienzo tapan los paneles flotantes y qué elemento recibe cada toque",
      "cuántos controles visibles quedan por debajo de los 44 px de lado",
    ],
    noMedido: [
      "un dispositivo táctil REAL: iPad, tableta Android o portátil con pantalla táctil",
      "la latencia del dedo, la deriva del contacto y el rechazo de la palma de la mano",
      "el lápiz (Apple Pencil / S Pen), su presión y su hover, que cambian el problema de precisión",
      "el teclado en pantalla y qué esconde al enfocar la línea de comandos",
      "Safari de iPadOS y su gestión propia de gestos: aquí sólo corre Chromium",
      "la rotación del dispositivo en caliente y el reencuadre que provoca",
      "el rendimiento del táctil bajo carga: los presupuestos de paneo y zoom se miden en plan-budget.spec.ts",
      "el trabajo sin conexión en obra, que es otra pregunta y tiene sus propias evidencias",
      "la LUPA sobre el punto que el dedo tapa: se resolvió desplazando la insignia de captura fuera de " +
        "la huella (40 px medidos), no ampliando el dibujo. Una lupa de verdad exige conservar el buffer " +
        "de dibujo y copiar un fotograma entero por muestra, y el presupuesto de paneo son 8,1 ms",
      "el gesto de DOS dedos para deshacer y el de TRES para rehacer, que iOS popularizó y aquí no existen",
      "el modo 3D: todo lo que se mide aquí es el modo PLANO, que es donde se dibuja. En 3D un dedo sigue " +
        "orbitando —es el gesto universal de un visor— y por tanto apuntar deslizando NO está resuelto ahí; " +
        "quien dibuje en una tableta tiene que estar en 2D, que es lo que el propio botón anuncia",
    ],
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(`Escrito ${path.relative(root, output)}`);
console.log(`  vivos ${evidence.resumen.gestosVivos.length} · parciales ${evidence.resumen.gestosParciales.length} · rotos ${evidence.resumen.gestosRotos.length} · inestables ${evidence.resumen.gestosInestables.length}`);
for (const entry of evidence.resumen.gestosRotos) console.log(`  ROTO  ${entry}`);
for (const entry of evidence.resumen.gestosInestables) console.log(`  INEST ${entry}`);
