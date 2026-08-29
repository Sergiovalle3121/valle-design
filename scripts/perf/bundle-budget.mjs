#!/usr/bin/env node
/**
 * Presupuesto de bundle por ruta — gate bloqueante de CI.
 *
 * QUÉ MIDE Y POR QUÉ ASÍ
 * ----------------------
 * Mide el JS de PRIMERA CARGA de cada ruta: los `<script src>` que el HTML
 * servido por `next start` referencia, sumados en bytes comprimidos con gzip.
 * No lee manifiestos internos de Next a propósito. Los manifiestos cambian de
 * forma entre versiones (en Next 16 con turbopack, `pages` viene vacío en
 * `.next/server/app/**\/build-manifest.json`) y, sobre todo, describen lo que
 * Next cree que emite, no lo que el navegador acaba descargando. El HTML sí es
 * el contrato con el navegador: lo que está ahí, viaja.
 *
 * Gzip y no bruto porque gzip es lo que cruza la red. El bruto se publica al
 * lado como referencia de coste de parseo, que no es lo mismo.
 *
 * Un import dinámico NO cuenta aquí, que es justo el punto: mover three.js a
 * `next/dynamic` debe verse como una caída en este número.
 *
 * CÓMO SE USA
 * -----------
 *   node scripts/perf/bundle-budget.mjs                 # arranca next start solo
 *   node scripts/perf/bundle-budget.mjs --base-url=...  # contra un server ya vivo
 *   node scripts/perf/bundle-budget.mjs --write         # reescribe el presupuesto
 *
 * TRINQUETE
 * ---------
 * Igual que el presupuesto del monolito y el de lint: el número del JSON sólo
 * puede BAJAR. `--write` se niega a subir un techo; para subirlo hay que
 * editar el JSON a mano y explicar por qué en el commit. Así una regresión no
 * se "arregla" ejecutando el actualizador.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");
const WEB = join(RAIZ, "apps", "web");
const PRESUPUESTO = join(AQUI, "bundle-budget.json");

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const tiene = (n) => args.includes(`--${n}`);

const ESCRIBIR = tiene("write");
const BASE_EXTERNA = flag("base-url");
const PUERTO = Number(flag("port") ?? 3131);

/** Tamaño gzip de un chunk servido, cacheado por ruta de fichero. */
const cacheGzip = new Map();
function pesoChunk(rutaUrl) {
  if (cacheGzip.has(rutaUrl)) return cacheGzip.get(rutaUrl);
  // `/_next/static/x.js` → `.next/static/x.js`
  const rel = rutaUrl.replace(/^\/_next\//, "");
  const fichero = join(WEB, ".next", rel);
  if (!existsSync(fichero)) {
    // Un chunk que el HTML pide y no está en disco es un fallo de build, no un 0.
    throw new Error(`El HTML referencia ${rutaUrl} pero ${fichero} no existe`);
  }
  const bruto = readFileSync(fichero);
  const peso = { bruto: statSync(fichero).size, gzip: gzipSync(bruto, { level: 9 }).length };
  cacheGzip.set(rutaUrl, peso);
  return peso;
}

/** Los `<script src>` de un HTML, sin duplicados y en orden de aparición. */
export function chunksDelHtml(html) {
  const vistos = new Set();
  const salida = [];
  for (const m of html.matchAll(/<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/g)) {
    if (!vistos.has(m[1])) {
      vistos.add(m[1]);
      salida.push(m[1]);
    }
  }
  return salida;
}

async function esperarServidor(base, intentos = 100) {
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

async function medir(base, rutas) {
  const filas = [];
  for (const ruta of rutas) {
    const res = await fetch(base + ruta, { redirect: "follow" });
    const html = await res.text();
    const chunks = chunksDelHtml(html);
    if (chunks.length === 0) {
      throw new Error(`La ruta ${ruta} no devolvió ningún <script src> (HTTP ${res.status})`);
    }
    let bruto = 0;
    let gzip = 0;
    for (const c of chunks) {
      const p = pesoChunk(c);
      bruto += p.bruto;
      gzip += p.gzip;
    }
    filas.push({ ruta, chunks: chunks.length, brutoKB: bruto / 1024, gzipKB: gzip / 1024 });
  }
  return filas;
}

function cargarPresupuesto() {
  if (!existsSync(PRESUPUESTO)) {
    return { descripcion: "", condiciones: {}, rutas: {} };
  }
  return JSON.parse(readFileSync(PRESUPUESTO, "utf8"));
}

async function main() {
  const presupuesto = cargarPresupuesto();
  const rutas = Object.keys(presupuesto.rutas);
  if (rutas.length === 0) {
    console.error("El presupuesto no declara ninguna ruta. Nada que medir.");
    process.exit(1);
  }

  let servidor = null;
  let base = BASE_EXTERNA;
  if (!base) {
    base = `http://127.0.0.1:${PUERTO}`;
    if (!existsSync(join(WEB, ".next", "BUILD_ID"))) {
      console.error(`No hay build en ${join(WEB, ".next")}. Corre \`npm run build\` antes.`);
      process.exit(1);
    }
    servidor = spawn("npx", ["next", "start", "-p", String(PUERTO)], {
      cwd: WEB,
      stdio: "ignore",
      env: process.env,
    });
    const vivo = await esperarServidor(base);
    if (!vivo) {
      servidor.kill("SIGKILL");
      console.error(`El servidor no respondió en ${base}`);
      process.exit(1);
    }
  }

  let filas;
  try {
    filas = await medir(base, rutas);
  } finally {
    if (servidor) servidor.kill("SIGKILL");
  }

  const ancho = Math.max(...filas.map((f) => f.ruta.length), 6);
  console.log("\nJS de primera carga por ruta (gzip; bruto entre paréntesis)\n");
  console.log(
    `  ${"ruta".padEnd(ancho)}  ${"gzip".padStart(9)}  ${"techo".padStart(9)}  ${"margen".padStart(9)}  chunks`,
  );

  const excesos = [];
  const holguras = [];
  for (const f of filas) {
    const techo = presupuesto.rutas[f.ruta].gzipKB;
    const margen = techo - f.gzipKB;
    const marca = margen < 0 ? "  ✗" : "";
    console.log(
      `  ${f.ruta.padEnd(ancho)}  ${f.gzipKB.toFixed(1).padStart(6)} KB  ${techo.toFixed(1).padStart(6)} KB  ${margen.toFixed(1).padStart(6)} KB  ${String(f.chunks).padStart(2)}${marca}`,
    );
    if (margen < 0) excesos.push({ ...f, techo });
    else if (margen > techo * 0.05) holguras.push({ ...f, techo });
  }
  const totalBruto = filas.reduce((a, f) => a + f.brutoKB, 0);
  console.log(`\n  bruto sumado de todas las rutas medidas: ${totalBruto.toFixed(1)} KB`);

  if (ESCRIBIR) {
    let bajadas = 0;
    for (const f of filas) {
      const techo = presupuesto.rutas[f.ruta].gzipKB;
      const nuevo = Number(f.gzipKB.toFixed(1));
      if (nuevo < techo) {
        presupuesto.rutas[f.ruta].gzipKB = nuevo;
        bajadas += 1;
      }
    }
    if (excesos.length > 0) {
      console.error(
        `\n--write NO sube techos. ${excesos.length} ruta(s) por encima del presupuesto: arréglalas o edita el JSON a mano explicando por qué.`,
      );
      process.exit(1);
    }
    writeFileSync(PRESUPUESTO, `${JSON.stringify(presupuesto, null, 2)}\n`);
    console.log(`\nPresupuesto actualizado: ${bajadas} techo(s) bajado(s).`);
    return;
  }

  if (excesos.length > 0) {
    console.error(`\n${excesos.length} ruta(s) por encima del presupuesto:`);
    for (const e of excesos) {
      console.error(
        `  ${e.ruta}: ${e.gzipKB.toFixed(1)} KB gzip contra un techo de ${e.techo.toFixed(1)} KB (+${(e.gzipKB - e.techo).toFixed(1)} KB)`,
      );
    }
    console.error(
      "\nO adelgazas la ruta, o justificas la subida editando scripts/perf/bundle-budget.json a mano.",
    );
    process.exit(1);
  }

  if (holguras.length > 0) {
    console.log(
      `\nAviso: ${holguras.length} ruta(s) con más de un 5% de holgura. Corre con --write para apretar el trinquete.`,
    );
  }
  console.log("\nPresupuesto de bundle respetado.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
