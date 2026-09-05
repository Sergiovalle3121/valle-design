#!/usr/bin/env node
/**
 * UN comando para medir el SLO de navegador y el estrés de edición densa en la
 * GPU del titular, y publicar los dos artefactos con la máquina declarada.
 *
 *     node scripts/perf/slo-navegador.mjs --dry-run   # el plan, sin tocar nada
 *     node scripts/perf/slo-navegador.mjs             # la corrida de verdad
 *
 * ## Por qué hacía falta
 *
 * Las dos cifras que la campaña necesita —`architecture@100k` a ≤5 s de detalle
 * completo y ≥30 fps de paneo p95, y el estrés de edición densa— **no se pueden
 * medir donde se escribe el código**. Este contenedor no tiene GPU: Chromium
 * cae en SwiftShader, y un fps rasterizado por software no es el de ningún
 * usuario. La medida sólo existe en la máquina del titular, y hasta hoy exigía
 * recordar seis variables de entorno, dos invocaciones de Playwright, un cruce
 * de corridas y un copiado a mano del artefacto. Cada uno de esos pasos es un
 * sitio donde se publica una cifra sin saber en qué se midió.
 *
 * ## Lo que hace, en una invocación
 *
 * 1. **Comprueba antes de medir**: que el navegador de Playwright existe, que
 *    lo que rasteriza es una GPU y no SwiftShader/llvmpipe, y que hay build de
 *    producción o un servidor de producción ya en marcha.
 * 2. **Mide**: el SLO de navegador en el escalón `full` (que es el que trae los
 *    100k) y el estrés de edición densa a 100k, tantas corridas como exija el
 *    cruce.
 * 3. **Publica** `docs/cad/evidence/browser-slo-100k.json` y
 *    `docs/cad/evidence/cad-dense-editing-100k.json` con
 *    `environment.declaredMachine` COMPUESTO de datos reales: modelo de CPU,
 *    hilos, RAM, sistema operativo, navegador y el rasterizador que WebGL
 *    declaró.
 *
 * ## Y sobre todo: se niega
 *
 * No escribe si la comprobación previa falla, si la corrida quedó parcial, si
 * `environment.declaredMachine` saldría vacía o genérica, o si la corrida
 * ENCOGE la cobertura ya publicada. La razón está escrita en el contrato: una
 * evidencia a medias que sobrescribe a la vigente es peor que no tener corrida,
 * porque la vigente no vuelve. Para explorar sin arriesgar lo publicado está
 * `--output <dir>`.
 *
 * ## Reparto de responsabilidades
 *
 * - Aquí: OBSERVAR (lanzar el navegador, interrogar a WebGL, mirar el puerto),
 *   correr Playwright y escribir.
 * - `slo-navegador-contract.mjs`: JUZGAR. Se importa, no se copia.
 * - `scripts/cad/dense-editing-evidence.mjs`: el cruce de las corridas densas,
 *   que ya existía y ya se niega con menos de tres. Se invoca, no se reimplementa.
 * - `slo-navegador.spec.mjs`: le exige a esto que se niegue, con el negativo
 *   REAL de este contenedor.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTEFACTO_EDICION_DENSA,
  ARTEFACTO_NAVEGADOR,
  DIRECTORIO_EVIDENCIA,
  RAIZ,
  clasificarRasterizador,
  componerMaquina,
  leerJsonSiExiste,
  tripletasDe,
  verificarArtefactoEdicionDensa,
  verificarArtefactoNavegador,
  verificarComprobacionPrevia,
  verificarCorridasDensas,
  verificarMaquinaDeclarada,
} from "./slo-navegador-contract.mjs";

export {
  ARTEFACTO_EDICION_DENSA,
  ARTEFACTO_NAVEGADOR,
  DIRECTORIO_EVIDENCIA,
  componerMaquina,
  verificarComprobacionPrevia,
};

const aqui = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(RAIZ, "apps/web");
const SPEC_NAVEGADOR = "e2e/performance/cad-render-browser.spec.ts";
const SPEC_DENSA = "e2e/performance/cad-dense-editing-100k.spec.ts";
const SALIDA_NAVEGADOR = path.join(WEB, "e2e/.test-results");
const CORRIDAS_DENSAS_DIR = path.join(WEB, "e2e/.artifacts/cad-dense-editing-100k");
const CRUCE_DENSO = path.join(RAIZ, "scripts/cad/dense-editing-evidence.mjs");
const COMPILACION = path.join(WEB, ".next/BUILD_ID");

/** Proyectos de Playwright que este runner sabe medir. */
export const PROYECTOS = ["chromium", "firefox"];
/** Corridas del estrés denso que el cruce exige para publicar su mediana. */
export const CORRIDAS_DENSAS_POR_DEFECTO = 3;

const relativo = (ruta) => path.relative(RAIZ, ruta).replaceAll(path.sep, "/");

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

/**
 * Parseo estricto: una bandera desconocida es un ERROR, no algo que se ignora.
 *
 * Un runner que traga `--mixes` (con ese plural que todo el mundo escribe) y
 * mide otra cosa publica un artefacto que no es el que se pidió, y el fallo se
 * descubre leyendo el JSON. Aquí cuesta un mensaje y cero minutos de máquina.
 */
export function parsearArgumentos(argv) {
  const opciones = {
    mezclas: [],
    entidades: [],
    salida: DIRECTORIO_EVIDENCIA,
    dryRun: false,
    proyecto: "chromium",
    corridasDensas: CORRIDAS_DENSAS_POR_DEFECTO,
    solo: "todo",
    ayuda: false,
  };
  const errores = [];
  const lista = (valor) =>
    String(valor ?? "")
      .split(",")
      .map((parte) => parte.trim())
      .filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const bandera = argv[i];
    const valor = argv[i + 1];
    const exigeValor = () => {
      if (valor === undefined || valor.startsWith("--")) {
        errores.push(`${bandera} necesita un valor`);
        return null;
      }
      i += 1;
      return valor;
    };
    switch (bandera) {
      case "--mix":
      case "--mezcla": {
        const dado = exigeValor();
        if (dado !== null) opciones.mezclas.push(...lista(dado));
        break;
      }
      case "--entities":
      case "--entidades": {
        const dado = exigeValor();
        if (dado === null) break;
        for (const parte of lista(dado)) {
          const numero = Number(parte);
          if (!Number.isInteger(numero) || numero <= 0)
            errores.push(`--entities recibió «${parte}», que no es un entero positivo`);
          else opciones.entidades.push(numero);
        }
        break;
      }
      case "--output":
      case "--salida": {
        const dado = exigeValor();
        if (dado !== null) opciones.salida = path.resolve(process.cwd(), dado);
        break;
      }
      case "--dry-run":
      case "--plan":
        opciones.dryRun = true;
        break;
      case "--project":
      case "--proyecto": {
        const dado = exigeValor();
        if (dado === null) break;
        if (!PROYECTOS.includes(dado))
          errores.push(`--project recibió «${dado}»; los que hay son ${PROYECTOS.join(", ")}`);
        else opciones.proyecto = dado;
        break;
      }
      case "--corridas": {
        const dado = exigeValor();
        if (dado === null) break;
        const numero = Number(dado);
        if (!Number.isInteger(numero) || numero < 1)
          errores.push(`--corridas recibió «${dado}», que no es un entero ≥ 1`);
        else opciones.corridasDensas = numero;
        break;
      }
      case "--solo": {
        const dado = exigeValor();
        if (dado === null) break;
        if (!["navegador", "densa", "todo"].includes(dado))
          errores.push(`--solo recibió «${dado}»; los valores son navegador, densa o todo`);
        else opciones.solo = dado;
        break;
      }
      case "--help":
      case "-h":
      case "--ayuda":
        opciones.ayuda = true;
        break;
      default:
        errores.push(`bandera desconocida: ${bandera}`);
    }
  }
  return { opciones, errores };
}

export const AYUDA = `Medición en GPU real del SLO de navegador y del estrés de edición densa.

  node scripts/perf/slo-navegador.mjs [opciones]

  --dry-run              imprime el plan y la comprobación previa; no toca nada
  --mix <a,b>            limita las mezclas del SLO de navegador (exploratorio)
  --entities <n,m>       limita los tamaños de corpus (exploratorio)
  --output <dir>         destino de los artefactos (por defecto docs/cad/evidence)
  --project <navegador>  ${PROYECTOS.join(" | ")} (por defecto chromium)
  --corridas <n>         corridas del estrés denso (por defecto ${CORRIDAS_DENSAS_POR_DEFECTO}; el cruce exige 3)
  --solo <navegador|densa|todo>
  --help

Un recorte con --mix/--entities NO puede publicarse sobre docs/cad/evidence:
encogería la evidencia vigente. Para eso está --output.`;

// ---------------------------------------------------------------------------
// Observación: lo que esta máquina es, medido y no supuesto
// ---------------------------------------------------------------------------

/** La instantánea del sistema. Pura lectura de `os`, sin juicio. */
export function observarMaquina() {
  const cpus = os.cpus();
  return {
    cpuModelo: cpus[0]?.model?.trim() ?? "",
    hilos: cpus.length,
    memoriaBytes: os.totalmem(),
    tipoSO: os.type(),
    versionSO: os.release(),
    arquitectura: process.arch,
  };
}

/**
 * Lanza el navegador REAL —el mismo que va a medir— y le pregunta a WebGL quién
 * rasteriza.
 *
 * No se comprueba la existencia del binario mirando rutas: se LANZA. Es la
 * única comprobación que no se puede desincronizar de lo que Playwright hará
 * después, y de paso trae la versión del navegador y el rasterizador, que son
 * dos de los datos que van dentro de `declaredMachine`.
 *
 * `channel: "chromium"` en Chromium por el mismo motivo que lo pone
 * `playwright.config.ts` con `CAD_PERF_REAL_GPU=1`: el binario headless-shell
 * por defecto rasteriza con SwiftShader AUNQUE la máquina tenga tarjeta.
 */
export async function observarNavegador({ proyecto = "chromium" } = {}) {
  const require = createRequire(path.join(WEB, "package.json"));
  const playwright = require("playwright-core");
  const tipo = playwright[proyecto];
  const opciones = proyecto === "chromium" ? { channel: "chromium" } : {};
  const ruta = (() => {
    try {
      return tipo.executablePath();
    } catch {
      return "sin ruta declarada";
    }
  })();

  let navegador = null;
  try {
    navegador = await tipo.launch(opciones);
  } catch (error) {
    const mensaje = String(error?.message ?? error);
    // Playwright distingue «no está descargado» de «está y no arranca», y son
    // dos arreglos distintos: uno se instala, el otro se depura.
    const faltaBinario = /executable doesn'?t exist|please run the following command to download/i.test(
      mensaje,
    );
    return {
      navegador: {
        nombre: proyecto,
        ruta,
        presente: !faltaBinario,
        error: mensaje.split("\n")[0],
      },
      rasterizador: null,
    };
  }

  try {
    const pagina = await navegador.newPage();
    const webgl = await pagina.evaluate(() => {
      const lienzo = document.createElement("canvas");
      const gl = lienzo.getContext("webgl2") ?? lienzo.getContext("webgl");
      if (!gl) return { disponible: false };
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        disponible: true,
        vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        webglVersion: gl.getParameter(gl.VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      };
    });
    const userAgent = await pagina.evaluate(() => navigator.userAgent);
    return {
      navegador: {
        nombre: proyecto,
        ruta,
        presente: true,
        version: navegador.version(),
        userAgent,
      },
      rasterizador: webgl.disponible ? webgl : null,
      razonSinRasterizador: webgl.disponible
        ? null
        : "el navegador arrancó pero no dio contexto WebGL: sin él no hay nada que rasterizar",
    };
  } finally {
    await navegador.close();
  }
}

/**
 * ¿Hay servidor, y es el de producción?
 *
 * La trampa que esto cierra es concreta: `playwright.config.ts` reutiliza un
 * servidor ya en marcha fuera de CI. Si el titular tiene `npm run dev`
 * levantado, la corrida mediría React en modo desarrollo sin minificar y
 * publicaría esos milisegundos como los del producto. Los marcadores que se
 * buscan son los que Next inyecta SÓLO en dev.
 */
export async function observarServidor({ url = process.env.E2E_BASE_URL ?? "http://localhost:3000" } = {}) {
  const base = {
    url,
    compilacionPresente: fs.existsSync(COMPILACION),
    rutaCompilacion: relativo(COMPILACION),
  };
  try {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 3000);
    const respuesta = await fetch(url, { signal: control.signal });
    const cuerpo = await respuesta.text();
    clearTimeout(reloj);
    const esDesarrollo =
      /\/_next\/static\/development\/|webpack-hmr|react-refresh|\/_next\/static\/chunks\/[^"']*\?v=\d/.test(
        cuerpo,
      );
    return { ...base, alcanzable: true, estado: respuesta.status, esDesarrollo };
  } catch (error) {
    return {
      ...base,
      alcanzable: false,
      esDesarrollo: false,
      error: String(error?.message ?? error).split("\n")[0],
    };
  }
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

/** Escribe sólo cuando ya se ha decidido escribir: temporal + rename. */
function escribirAtomico(destino, contenido) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = `${destino}.tmp-${process.pid}`;
  fs.writeFileSync(temporal, contenido);
  fs.renameSync(temporal, destino);
}

/**
 * Publica el artefacto del SLO de navegador, o no publica nada y dice por qué.
 *
 * Es la puerta que el spec ejercita con una corrida marcada PARCIAL contra el
 * `docs/cad/evidence` de verdad: tiene que negarse y dejar el fichero vigente
 * byte a byte como estaba.
 */
export function publicarArtefactoNavegador({ artefacto, directorio, procedencia = null }) {
  const ruta = path.join(directorio, ARTEFACTO_NAVEGADOR);
  const vigente = leerJsonSiExiste(ruta);
  // La procedencia viaja DENTRO del artefacto, como el `generatedWith` del
  // cruce denso: sin ella, meses después, «con qué banderas salió esto» se
  // contesta adivinando.
  const publicable = procedencia ? { ...artefacto, publication: procedencia } : artefacto;
  const veredicto = verificarArtefactoNavegador(publicable, { vigente });
  if (!veredicto.passed) return { publicado: false, violaciones: veredicto.violations, ruta };
  escribirAtomico(ruta, `${JSON.stringify(publicable, null, 2)}\n`);
  return { publicado: true, violaciones: [], ruta };
}

/**
 * Publica el cruce del estrés denso delegando en el script que ya lo sabe hacer.
 *
 * El cruce escribe SIEMPRE en `docs/cad/evidence` (no toma destino), así que
 * aquí se hace lo único honesto: se guarda el fichero vigente antes de
 * invocarlo y se RESTAURA byte a byte si lo que sale no pasa el contrato. Un
 * cruce que publica una máquina vacía no se corrige a mano después: se
 * deshace.
 */
export function publicarCruceDenso({ corridas, minimo = CORRIDAS_DENSAS_POR_DEFECTO }) {
  const ruta = path.join(DIRECTORIO_EVIDENCIA, ARTEFACTO_EDICION_DENSA);
  const previo = verificarCorridasDensas(corridas, { minimo });
  if (!previo.passed) return { publicado: false, violaciones: previo.violations, ruta };

  const respaldo = fs.existsSync(ruta) ? fs.readFileSync(ruta) : null;
  const cruce = spawnSync(process.execPath, [CRUCE_DENSO], {
    cwd: RAIZ,
    stdio: "inherit",
    env: process.env,
  });
  const restaurar = () => {
    if (respaldo === null) fs.rmSync(ruta, { force: true });
    else fs.writeFileSync(ruta, respaldo);
  };
  if (cruce.status !== 0) {
    restaurar();
    return {
      publicado: false,
      violaciones: [`el cruce salió con código ${cruce.status}`],
      ruta,
    };
  }
  const veredicto = verificarArtefactoEdicionDensa(leerJsonSiExiste(ruta), { minimo });
  if (!veredicto.passed) {
    restaurar();
    return { publicado: false, violaciones: veredicto.violations, ruta };
  }
  return { publicado: true, violaciones: [], ruta };
}

// ---------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------

function correrPlaywright({ spec, proyecto, entorno, timeoutMs }) {
  const require = createRequire(path.join(WEB, "package.json"));
  const cli = require.resolve("@playwright/test/cli");
  const resultado = spawnSync(process.execPath, [cli, "test", spec, `--project=${proyecto}`], {
    cwd: WEB,
    stdio: "inherit",
    timeout: timeoutMs,
    env: { ...process.env, ...entorno },
  });
  return resultado.status ?? 1;
}

/** Aparta las corridas densas de invocaciones anteriores: el cruce las lee TODAS. */
function apartarCorridasPrevias() {
  if (!fs.existsSync(CORRIDAS_DENSAS_DIR)) return [];
  const previas = fs.readdirSync(CORRIDAS_DENSAS_DIR).filter((archivo) => archivo.endsWith(".json"));
  if (previas.length === 0) return [];
  const destino = path.join(
    path.dirname(CORRIDAS_DENSAS_DIR),
    `cad-dense-editing-100k-previas/${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(destino, { recursive: true });
  for (const archivo of previas)
    fs.renameSync(path.join(CORRIDAS_DENSAS_DIR, archivo), path.join(destino, archivo));
  return previas.map((archivo) => path.join(relativo(destino), archivo));
}

function leerCorridasDensas() {
  if (!fs.existsSync(CORRIDAS_DENSAS_DIR)) return [];
  return fs
    .readdirSync(CORRIDAS_DENSAS_DIR)
    .filter((archivo) => archivo.endsWith(".json"))
    .sort()
    .map((archivo) => leerJsonSiExiste(path.join(CORRIDAS_DENSAS_DIR, archivo)))
    .filter(Boolean);
}

/**
 * Duración de la corrida vigente, para que el plan no invente su estimación.
 * Si no hay vigente, no se estima: se dice que no se sabe.
 */
function duracionVigente(vigente) {
  const inicio = Date.parse(vigente?.startedAt ?? "");
  const fin = Date.parse(vigente?.finishedAt ?? "");
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null;
  return Math.round(((fin - inicio) / 60_000) * 10) / 10;
}

export async function main(argv = process.argv.slice(2)) {
  const { opciones, errores } = parsearArgumentos(argv);
  if (opciones.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  if (errores.length > 0) {
    for (const error of errores) console.error(`  × ${error}`);
    console.error("\n" + AYUDA);
    return 2;
  }

  const vigenteNavegador = leerJsonSiExiste(path.join(opciones.salida, ARTEFACTO_NAVEGADOR));
  const objetivosVigentes = vigenteNavegador ? tripletasDe(vigenteNavegador) : [];
  const recorta =
    opciones.mezclas.length > 0 || opciones.entidades.length > 0
      ? objetivosVigentes.filter((tripleta) => {
          const [corpus, resto] = tripleta.split("@");
          const entidades = Number(resto.split("/")[0]);
          const mezclaFuera = opciones.mezclas.length > 0 && !opciones.mezclas.includes(corpus);
          const tamanoFuera = opciones.entidades.length > 0 && !opciones.entidades.includes(entidades);
          return mezclaFuera || tamanoFuera;
        })
      : [];

  const instantanea = observarMaquina();
  const observadoNavegador = await observarNavegador({ proyecto: opciones.proyecto });
  const servidor = await observarServidor();
  const observado = { ...observadoNavegador, servidor };
  const previa = verificarComprobacionPrevia(observado);
  const maquina = componerMaquina({
    ...instantanea,
    navegador: {
      nombre: observadoNavegador.navegador.nombre,
      version: observadoNavegador.navegador.version ?? "",
      webglRenderer: observado.rasterizador?.renderer ?? "",
      webglVendor: observado.rasterizador?.vendor ?? "",
    },
  });
  const maquinaVeredicto = verificarMaquinaDeclarada(maquina);

  // --- El plan. Se imprime SIEMPRE, corra o no corra ------------------------
  const minutos = duracionVigente(vigenteNavegador);
  console.log("Plan de corrida · SLO de navegador y estrés de edición densa\n");
  console.log(`  destino            ${relativo(opciones.salida)}`);
  console.log(`  proyecto           ${opciones.proyecto} (escalón full, CAD_PERF_REAL_GPU=1)`);
  console.log(
    `  SLO de navegador   ${relativo(path.join(WEB, SPEC_NAVEGADOR))}` +
      `${opciones.solo === "densa" ? "  [omitido por --solo densa]" : ""}`,
  );
  console.log(
    `  edición densa      ${relativo(path.join(WEB, SPEC_DENSA))} × ${opciones.corridasDensas}` +
      `${opciones.solo === "navegador" ? "  [omitido por --solo navegador]" : ""}`,
  );
  console.log(
    `  mezclas            ${opciones.mezclas.length ? opciones.mezclas.join(", ") : "todas las del escalón full"}`,
  );
  console.log(
    `  entidades          ${opciones.entidades.length ? opciones.entidades.join(", ") : "todas las del escalón full"}`,
  );
  console.log(
    `  cobertura vigente  ${objetivosVigentes.length} perfil(es)` +
      `${minutos === null ? "" : ` · la corrida publicada tardó ${minutos} min`}`,
  );
  console.log(`  artefactos         ${ARTEFACTO_NAVEGADOR}, ${ARTEFACTO_EDICION_DENSA}`);
  console.log(`\n  máquina compuesta  ${maquina}\n`);

  console.log("Comprobación previa:");
  console.log(
    `  navegador   ${observado.navegador.presente ? "presente" : "AUSENTE"} · ${observado.navegador.ruta}` +
      `${observado.navegador.version ? ` · ${observado.navegador.version}` : ""}`,
  );
  const rasterizador = clasificarRasterizador(observado.rasterizador);
  console.log(`  GPU         ${rasterizador.real ? "real" : "NO"} · ${rasterizador.motivo}`);
  console.log(
    `  servidor    ${servidor.alcanzable ? `responde en ${servidor.url}` : `no responde en ${servidor.url}`}` +
      ` · build ${servidor.compilacionPresente ? "presente" : "AUSENTE"}` +
      `${servidor.alcanzable && servidor.esDesarrollo ? " · es un servidor de DESARROLLO" : ""}`,
  );
  if (!previa.passed) for (const violacion of previa.violations) console.log(`  × ${violacion}`);
  if (!maquinaVeredicto.passed)
    for (const violacion of maquinaVeredicto.violations) console.log(`  × ${violacion}`);
  if (recorta.length > 0 && opciones.salida === DIRECTORIO_EVIDENCIA)
    console.log(
      `  × los filtros dejarían fuera ${recorta.length} perfil(es) ya publicados: ` +
        "eso ENCOGE la evidencia vigente",
    );

  if (opciones.dryRun) {
    console.log(
      `\n--dry-run: no se ha tocado nada. ${
        previa.passed && maquinaVeredicto.passed
          ? "La corrida real puede medir."
          : "Tal cual está esta máquina, la corrida real se negaría a medir."
      }`,
    );
    return 0;
  }

  if (!previa.passed || !maquinaVeredicto.passed) {
    console.error(
      "\nNO se mide y NO se escribe nada: la comprobación previa no pasa. " +
        "Una corrida que no puede medir con GPU real no puede tampoco sobrescribir la evidencia vigente.",
    );
    return 1;
  }
  if (recorta.length > 0 && opciones.salida === DIRECTORIO_EVIDENCIA) {
    console.error(
      "\nNO se corre: los filtros recortan la cobertura publicada. Usa --output <dir> para una " +
        "corrida exploratoria.",
    );
    return 1;
  }

  const entornoComun = {
    CAD_PERF_E2E: "1",
    CAD_PERF_REAL_GPU: "1",
    E2E_PROD: "1",
    CAD_PERF_DECLARED_MACHINE: maquina,
  };
  const problemas = [];

  // --- 1. SLO de navegador --------------------------------------------------
  if (opciones.solo !== "densa") {
    console.log("\n· Midiendo el SLO de navegador (escalón full)…\n");
    const codigo = correrPlaywright({
      spec: SPEC_NAVEGADOR,
      proyecto: opciones.proyecto,
      timeoutMs: 3 * 3600_000,
      entorno: {
        ...entornoComun,
        CAD_RENDER_BROWSER_TIER: "full",
        CAD_RENDER_BROWSER_MIXES: opciones.mezclas.join(","),
        CAD_RENDER_BROWSER_ENTITIES: opciones.entidades.join(","),
      },
    });
    const crudo = path.join(SALIDA_NAVEGADOR, `cad-render-browser-${opciones.proyecto}.json`);
    const artefacto = leerJsonSiExiste(crudo);
    if (codigo !== 0)
      problemas.push(`Playwright salió con código ${codigo} midiendo el SLO de navegador`);
    if (!artefacto) problemas.push(`la corrida no dejó artefacto en ${relativo(crudo)}`);
    else {
      const resultado = publicarArtefactoNavegador({
        artefacto,
        directorio: opciones.salida,
        procedencia: {
          publishedBy: "scripts/perf/slo-navegador.mjs",
          publishedAt: new Date().toISOString(),
          command: ["node", "scripts/perf/slo-navegador.mjs", ...argv].join(" "),
          preflight: {
            browser: observado.navegador,
            rasterizer: observado.rasterizador,
            server: { url: servidor.url, reachable: servidor.alcanzable, build: servidor.compilacionPresente },
          },
        },
      });
      if (resultado.publicado) console.log(`\n  publicado ${relativo(resultado.ruta)}`);
      else {
        problemas.push(`no se publica ${ARTEFACTO_NAVEGADOR}:`);
        problemas.push(...resultado.violaciones.map((violacion) => `    ${violacion}`));
      }
    }
  }

  // --- 2. Estrés de edición densa ------------------------------------------
  if (opciones.solo !== "navegador") {
    const apartadas = apartarCorridasPrevias();
    if (apartadas.length > 0)
      console.log(
        `\n· ${apartadas.length} corrida(s) densa(s) anteriores apartadas: el cruce lee el ` +
          "directorio entero y mezclarlas sería cruzar máquinas distintas.",
      );
    for (let corrida = 1; corrida <= opciones.corridasDensas; corrida += 1) {
      console.log(`\n· Estrés de edición densa a 100k · corrida ${corrida}/${opciones.corridasDensas}…\n`);
      const codigo = correrPlaywright({
        spec: SPEC_DENSA,
        proyecto: opciones.proyecto,
        timeoutMs: 3 * 3600_000,
        entorno: entornoComun,
      });
      if (codigo !== 0) problemas.push(`la corrida densa ${corrida} salió con código ${codigo}`);
    }
    const corridas = leerCorridasDensas();
    if (opciones.salida !== DIRECTORIO_EVIDENCIA) {
      // El cruce no toma destino y siempre escribe en docs/cad/evidence: en una
      // corrida exploratoria se dejan las corridas donde el titular las pueda
      // mirar, y se dice por qué no hay cruce en vez de escribir donde no toca.
      fs.mkdirSync(path.join(opciones.salida, "corridas-densas"), { recursive: true });
      for (const corrida of corridas)
        fs.writeFileSync(
          path.join(opciones.salida, "corridas-densas", `${corrida.runId}.json`),
          `${JSON.stringify(corrida, null, 2)}\n`,
        );
      console.log(
        `\n  ${corridas.length} corrida(s) densa(s) copiadas a ` +
          `${relativo(path.join(opciones.salida, "corridas-densas"))}. El cruce publicado sólo se ` +
          "genera sobre docs/cad/evidence (lo escribe scripts/cad/dense-editing-evidence.mjs).",
      );
    } else {
      const resultado = publicarCruceDenso({ corridas, minimo: opciones.corridasDensas });
      if (resultado.publicado) console.log(`\n  publicado ${relativo(resultado.ruta)}`);
      else {
        problemas.push(`no se publica ${ARTEFACTO_EDICION_DENSA}:`);
        problemas.push(...resultado.violaciones.map((violacion) => `    ${violacion}`));
      }
    }
  }

  if (problemas.length > 0) {
    console.error("\nLa corrida NO publicó todo lo que iba a publicar —");
    for (const problema of problemas) console.error(`  × ${problema}`);
    return 1;
  }
  console.log("\nMedición completa. Los artefactos declaran la máquina de esta corrida.");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(aqui, "slo-navegador.mjs")) {
  main().then(
    (codigo) => process.exit(codigo),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
