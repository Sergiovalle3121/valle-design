#!/usr/bin/env node
/**
 * El CONTRATO de la medición en GPU real: qué tiene que ser cierto ANTES de
 * medir, y qué tiene que declarar un artefacto para poder sobrescribir al que
 * ya está publicado.
 *
 * ## Por qué vive aparte del runner
 *
 * Por la misma razón que `curve-kernel-render-contract.mjs`: el runner es
 * maquinaria —lanza navegadores, arranca Playwright, copia ficheros— y esto es
 * la REGLA. Una regla enterrada dentro del programa que produce lo que juzga
 * se afloja el día que el número no pasa, y nadie lo nota porque el spec que la
 * probaba la tomaba del mismo sitio. Aquí la regla se importa desde tres
 * lados: el runner (para negarse), `--dry-run` (para decir qué fallaría) y el
 * spec (que le mete comprobaciones y artefactos rotos y exige el rechazo).
 *
 * ## Las cuatro cosas que se exigen
 *
 * 1. **Que el navegador exista.** No es una comprobación de cortesía: sin
 *    binario de Playwright no hay corrida, y una corrida que no ocurre no
 *    puede dejar el artefacto vigente peor de como estaba.
 * 2. **Que la GPU sea GPU.** Chromium rasteriza WebGL con SwiftShader y
 *    Firefox con llvmpipe cuando no hay tarjeta: publican fps que ningún
 *    usuario del producto va a ver. Un artefacto de «SLO de navegador» medido
 *    por software es peor que no tener artefacto, porque se cita.
 * 3. **Que la máquina se declare, y sea una máquina.** `declaredMachine` es lo
 *    que permite leer un 8,57 fps sin adivinar en qué se midió. Vacía, o
 *    genérica («linux x64», «CPU desconocida»), convierte la evidencia en un
 *    número sin dueño.
 * 4. **Que la corrida esté completa y no ENCOJA lo publicado.** Una corrida
 *    parcial que sobrescribe a la vigente destruye evidencia: los veinte
 *    perfiles del artefacto de hoy no vuelven porque alguien midiera dos con
 *    GPU. Se exige cubrir al menos lo que ya estaba.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Donde vive la evidencia versionada. `--output` puede apuntar a otro sitio. */
export const DIRECTORIO_EVIDENCIA = path.join(RAIZ, "docs/cad/evidence");

/** El SLO de navegador: fps, primer píxel, detalle completo, memoria de GPU. */
export const ARTEFACTO_NAVEGADOR = "browser-slo-100k.json";
/** El cruce del estrés de edición densa a 100k. */
export const ARTEFACTO_EDICION_DENSA = "cad-dense-editing-100k.json";

/**
 * Rasterizadores por software, por su nombre tal y como los declara WebGL.
 *
 * La lista es de cadenas MEDIDAS, no imaginadas: `SwiftShader` es lo que
 * devuelve Chromium sin GPU (incluido el «ANGLE (Google, Vulkan … SwiftShader
 * Device …)» de este contenedor), `llvmpipe` y `softpipe` son los de Mesa que
 * usa Firefox headless, `Microsoft Basic Render Driver` es el de Windows sin
 * driver, y `Apple Software Renderer` el de macOS en una VM.
 */
export const RASTERIZADOR_POR_SOFTWARE =
  /swiftshader|llvmpipe|softpipe|soft ?pipe|basic render driver|software renderer|mesa offscreen|osmesa|generic renderer/i;

/**
 * ¿La cifra que salga de aquí la produjo una GPU?
 *
 * Devuelve el veredicto Y su motivo, porque el motivo es lo que el titular
 * necesita leer: «no hay GPU» y «el navegador no quiso decir cuál» son dos
 * problemas distintos con dos arreglos distintos.
 */
export function clasificarRasterizador(rasterizador) {
  if (!rasterizador || typeof rasterizador !== "object")
    return { real: false, motivo: "no se pudo interrogar a WebGL: no hubo navegador que preguntar" };
  const { vendor, renderer } = rasterizador;
  if (!renderer || typeof renderer !== "string" || renderer.trim() === "")
    return {
      real: false,
      motivo:
        "el navegador no expuso el rasterizador (WEBGL_debug_renderer_info ausente): sin ese " +
        "dato no se puede afirmar que la medida sea de GPU",
    };
  if (RASTERIZADOR_POR_SOFTWARE.test(renderer) || RASTERIZADOR_POR_SOFTWARE.test(String(vendor ?? "")))
    return {
      real: false,
      motivo: `«${renderer}» es rasterizado POR SOFTWARE: sus fps no son los de ningún usuario`,
    };
  return { real: true, motivo: `${renderer}` };
}

/**
 * Palabras que delatan una máquina no declarada. Ninguna es hipotética: son
 * los rellenos que produce un `os.cpus()[0]?.model ?? "desconocida"` cuando el
 * sistema no contesta, y el «linux x64» que sale de concatenar platform y arch
 * y llamarlo máquina.
 */
const MAQUINA_GENERICA =
  /desconocid|unknown|sin identificar|por rellenar|placeholder|todo:|n\/?d\b|máquina de pruebas|generic/i;

/**
 * La máquina, declarada. Cinco condiciones, y cada una tapa una forma real de
 * quedarse sin poder leer la cifra meses después:
 *
 * - **no vacía**: el fallo que este entregable viene a impedir;
 * - **con cuerpo** (60 caracteres): «mi portátil» no permite comparar nada;
 * - **RAM, sistema, navegador y rasterizador**: los cuatro datos sin los cuales
 *   un fps no se puede reproducir ni discutir;
 * - **sin comodines**: «CPU desconocida» es peor que vacío, porque parece un
 *   dato.
 */
export function verificarMaquinaDeclarada(texto) {
  const violations = [];
  const fail = (message) => violations.push(message);
  if (typeof texto !== "string" || texto.trim() === "") {
    fail("environment.declaredMachine está vacío: la corrida no dice en qué máquina se midió");
    return { passed: false, violations };
  }
  const valor = texto.trim();
  if (valor.length < 60)
    fail(
      `environment.declaredMachine sólo trae ${valor.length} caracteres: no describe una máquina ` +
        "(hacen falta CPU, RAM, sistema, navegador y rasterizador)",
    );
  if (MAQUINA_GENERICA.test(valor))
    fail(`environment.declaredMachine es genérica: «${valor.slice(0, 80)}…»`);
  if (!/\d+([.,]\d+)?\s*(gb|gib)/i.test(valor))
    fail("environment.declaredMachine no dice cuánta RAM tenía la máquina");
  if (!/windows|linux|darwin|macos|mac os/i.test(valor))
    fail("environment.declaredMachine no dice sobre qué sistema operativo se midió");
  if (!/chromium|chrome|firefox|webkit|safari|edge/i.test(valor))
    fail("environment.declaredMachine no dice con qué navegador se midió");
  // El rasterizador se busca por la FORMA en que se declara («… sobre ANGLE
  // (AMD, …)») o por un nombre de API/driver, y NO por el fabricante suelto:
  // «AMD Ryzen 5 5500U with Radeon Graphics» es un modelo de CPU, y aceptar
  // «Radeon» como prueba de rasterizador dejaría pasar una máquina que nunca
  // dijo quién dibujó los fotogramas. La composición de este runner siempre
  // escribe «sobre <renderer>», así que la forma es comprobable.
  const mencionaRasterizador =
    /\bsobre\s+\S[^.]{5,}/i.test(valor) ||
    /angle|opengl|metal|direct3d|d3d11|vulkan|swiftshader|llvmpipe|geforce|quadro|adreno|mali|apple m\d/i.test(
      valor,
    );
  if (!mencionaRasterizador)
    fail("environment.declaredMachine no dice qué rasterizador produjo los fotogramas");
  return { passed: violations.length === 0, violations };
}

/**
 * Compone la máquina a partir de datos REALES. Es una función pura y recibe la
 * instantánea del sistema por parámetro en vez de leer `os` por su cuenta: así
 * el spec puede pasarle una instantánea degenerada —sin modelo de CPU, sin
 * memoria— y comprobar que lo que sale de ahí lo rechaza el verificador, que es
 * justo el caso que el runner tiene que atrapar antes de gastar una hora.
 */
export function componerMaquina(instantanea) {
  const {
    cpuModelo = "",
    hilos = 0,
    memoriaBytes = 0,
    tipoSO = "",
    versionSO = "",
    arquitectura = "",
    navegador = {},
    fecha = new Date().toISOString().slice(0, 10),
    nota = "",
  } = instantanea ?? {};
  // Un dato que falta se escribe «desconocido», no se deja en blanco. La
  // diferencia importa: el hueco en blanco produce una frase que PARECE una
  // máquina («firefox  sobre .»), y la palabra desconocido es justo la que el
  // verificador usa para negarse. Falta el dato → no se publica, en voz alta.
  const dato = (valor, ausente) => {
    const texto = String(valor ?? "").trim();
    return texto === "" ? ausente : texto;
  };
  const cpu = dato(cpuModelo, "CPU desconocida");
  const gb = memoriaBytes > 0 ? (memoriaBytes / 1024 ** 3).toFixed(1) : "0,0";
  const so = `${dato(tipoSO, "sistema desconocido")} ${String(versionSO).trim()}`.trim();
  const nombreNavegador = dato(navegador.nombre, "navegador desconocido");
  const versionNavegador = dato(navegador.version, "de versión desconocida");
  const rasterizador = dato(navegador.webglRenderer, "un rasterizador desconocido");
  const proveedor = String(navegador.webglVendor ?? "").trim();
  return (
    `${cpu} (${hilos} hilos lógicos), ${gb.replace(".", ",")} GB de RAM, ${so} (${dato(
      arquitectura,
      "arquitectura desconocida",
    )}), ` +
    `${nombreNavegador} ${versionNavegador} sobre ${rasterizador}` +
    (proveedor ? ` [proveedor ${proveedor}]` : "") +
    `. Corrida ${fecha} con scripts/perf/slo-navegador.mjs${nota ? `. ${nota}` : "."}`
  );
}

/**
 * La comprobación previa, como REGLA pura sobre hechos observados.
 *
 * El runner observa (¿existe el binario?, ¿qué dice WebGL?, ¿quién responde en
 * el puerto?) y esto juzga. Separarlo permite que el spec ejercite el juicio
 * con hechos inventados —y que la corrida real de este contenedor ejercite la
 * observación— sin que ninguna de las dos mitades se pruebe a sí misma.
 */
export function verificarComprobacionPrevia(observado) {
  const violations = [];
  const fail = (message) => violations.push(message);

  const navegador = observado?.navegador;
  if (!navegador?.presente)
    fail(
      `el navegador «${navegador?.nombre ?? "?"}» de Playwright NO está instalado ` +
        `(${navegador?.ruta ?? "sin ruta"}): instálalo con \`npx playwright install ${
          navegador?.nombre ?? "chromium"
        }\``,
    );

  // Sin binario no hay rasterizador que interrogar: se dice así en vez de
  // acumular un segundo fallo derivado que despista sobre la causa.
  if (navegador?.presente) {
    const veredicto = clasificarRasterizador(observado?.rasterizador);
    // Si el navegador arrancó y aun así no hay rasterizador, el motivo lo sabe
    // quien observó (WebGL deshabilitado, contexto perdido); se prefiere el
    // suyo al genérico, porque «no hubo navegador que preguntar» sería falso.
    const motivo =
      !veredicto.real && observado?.razonSinRasterizador
        ? observado.razonSinRasterizador
        : veredicto.motivo;
    if (!veredicto.real) fail(`la medida no sería de GPU real: ${motivo}`);
  }

  const servidor = observado?.servidor;
  if (!servidor) fail("no se comprobó el servidor de la aplicación");
  else if (servidor.alcanzable && servidor.esDesarrollo)
    fail(
      `hay un servidor de DESARROLLO respondiendo en ${servidor.url}: Next en dev sirve el build ` +
        "sin minificar y con React en modo desarrollo, así que sus tiempos no son los del " +
        "producto. Párala y deja que la corrida arranque `next start`",
    );
  else if (!servidor.alcanzable && !servidor.compilacionPresente)
    fail(
      `no hay servidor en ${servidor.url} ni build de producción que arrancar ` +
        `(${servidor.rutaCompilacion}): corre \`npm run build --workspace=valle-design-web\` antes`,
    );

  return { passed: violations.length === 0, violations };
}

/** Los perfiles de un artefacto de navegador, como tripletas comparables. */
export function tripletasDe(artefacto) {
  const perfiles = Array.isArray(artefacto?.profiles) ? artefacto.profiles : [];
  return perfiles.map((perfil) => `${perfil.corpusId}@${perfil.entities}/${perfil.pipeline}`);
}

/**
 * ¿Es publicable este artefacto de navegador SOBRE el que ya está?
 *
 * `vigente` es el artefacto publicado hoy, o `null` si no hay ninguno. La
 * comparación con él es la regla que impide el fallo más caro de todos: medir
 * dos perfiles con GPU real y perder los veinte que ya había.
 */
export function verificarArtefactoNavegador(artefacto, { vigente = null } = {}) {
  const violations = [];
  const fail = (message) => violations.push(message);

  if (!artefacto || typeof artefacto !== "object")
    return { passed: false, violations: ["el artefacto no es un objeto"] };

  const env = artefacto.environment;
  if (!env || typeof env !== "object") fail("falta el bloque `environment`");
  else {
    for (const campo of ["platform", "cpuModel", "logicalCpuCount", "totalMemoryBytes"])
      if (env[campo] === undefined || env[campo] === null || env[campo] === "")
        fail(`environment.${campo} falta o está vacío`);
    for (const violacion of verificarMaquinaDeclarada(env.declaredMachine).violations)
      fail(violacion);
    const veredicto = clasificarRasterizador({
      vendor: env.browser?.webglVendor,
      renderer: env.browser?.webglRenderer,
    });
    if (!veredicto.real) fail(`el artefacto no se midió con GPU real: ${veredicto.motivo}`);
    if (!env.browser?.userAgent) fail("environment.browser.userAgent falta: no se sabe qué navegador midió");
  }

  const run = artefacto.run;
  if (!run || typeof run !== "object") fail("falta el bloque `run`");
  else {
    if (run.tier !== "full")
      fail(`run.tier es «${run.tier}»: el artefacto de 100k exige el escalón full`);
    if (run.complete !== true)
      fail(
        "run.complete no es true: la corrida quedó PARCIAL y una evidencia a medias no " +
          "sobrescribe a la vigente",
      );
    if ((run.failures ?? []).length > 0)
      fail(`la corrida registró ${run.failures.length} fallo(s): ${run.failures.join(" | ")}`);
    if (Number.isInteger(run.plannedProfiles) && Number.isInteger(run.producedProfiles)) {
      if (run.producedProfiles !== run.plannedProfiles)
        fail(
          `se planearon ${run.plannedProfiles} perfiles y salieron ${run.producedProfiles}: ` +
            "corrida parcial",
        );
    } else fail("run no declara plannedProfiles/producedProfiles: no se puede saber si quedó parcial");
  }

  const perfiles = Array.isArray(artefacto.profiles) ? artefacto.profiles : [];
  if (perfiles.length === 0) fail("el artefacto no trae perfiles");
  for (const perfil of perfiles) {
    const etiqueta = `${perfil.corpusId}@${perfil.entities}/${perfil.pipeline}`;
    if (!(perfil.pan?.samples > 0))
      fail(`${etiqueta}: el paneo no presentó ningún cuadro, la medida está vacía`);
    if (!Number.isFinite(perfil.pan?.fpsP95))
      fail(`${etiqueta}: no hay fps p95, que es la cifra que este artefacto existe para dar`);
  }

  // La regla del no-encogimiento. Se compara por tripleta y no por número de
  // perfiles: veinte perfiles de otro corpus no reemplazan a los veinte de éste.
  if (vigente) {
    const nuevas = new Set(tripletasDe(artefacto));
    const perdidas = tripletasDe(vigente).filter((tripleta) => !nuevas.has(tripleta));
    if (perdidas.length > 0)
      fail(
        `la corrida ENCOGE la evidencia publicada: se perderían ${perdidas.length} perfil(es) ` +
          `(${perdidas.slice(0, 6).join(", ")}${perdidas.length > 6 ? ", …" : ""}). Para una ` +
          "corrida exploratoria usa --output <dir>",
      );
  }

  return { passed: violations.length === 0, violations };
}

/**
 * Las corridas del estrés denso ANTES de cruzarlas.
 *
 * El cruce lo hace `scripts/cad/dense-editing-evidence.mjs`, que ya se niega
 * con menos de tres corridas o con corpus distintos. Esto comprueba lo que ese
 * script no puede saber: que las corridas son de ESTA invocación y que traen la
 * máquina declarada, sin lo cual el cruce heredaría una máquina vacía.
 */
export function verificarCorridasDensas(corridas, { minimo = 3 } = {}) {
  const violations = [];
  const fail = (message) => violations.push(message);
  if (!Array.isArray(corridas) || corridas.length === 0) {
    fail("no hay ninguna corrida del estrés denso que publicar");
    return { passed: false, violations };
  }
  if (corridas.length < minimo)
    fail(
      `hay ${corridas.length} corrida(s) y el cruce exige ${minimo}: la mediana de dos corridas ` +
        "es el promedio de dos con otro nombre",
    );
  for (const corrida of corridas) {
    const etiqueta = corrida.runId ?? "sin runId";
    if (corrida.complete !== true)
      fail(`${etiqueta}: la corrida quedó incompleta (complete=${corrida.complete})`);
    if ((corrida.failures ?? []).length > 0)
      fail(`${etiqueta}: ${corrida.failures.length} gesto(s) no se pudieron ejecutar`);
    for (const violacion of verificarMaquinaDeclarada(corrida.environment?.declaredMachine).violations)
      fail(`${etiqueta}: ${violacion}`);
  }
  const corpus = new Set(corridas.map((corrida) => JSON.stringify(corrida.corpus)));
  if (corpus.size > 1) fail("las corridas no comparten corpus: el cruce mezclaría dibujos distintos");
  return { passed: violations.length === 0, violations };
}

/** El artefacto cruzado, ya escrito por el cruce, antes de darlo por bueno. */
export function verificarArtefactoEdicionDensa(artefacto, { minimo = 3 } = {}) {
  const violations = [];
  const fail = (message) => violations.push(message);
  if (!artefacto || typeof artefacto !== "object")
    return { passed: false, violations: ["el artefacto no es un objeto"] };
  for (const violacion of verificarMaquinaDeclarada(artefacto.environment?.declaredMachine).violations)
    fail(violacion);
  const corridas = Array.isArray(artefacto.runs) ? artefacto.runs : [];
  if (corridas.length < minimo)
    fail(`el cruce declara ${corridas.length} corrida(s) y se exigen ${minimo}`);
  if ((artefacto.incompleteRunsAccepted ?? []).length > 0)
    fail(
      `el cruce aceptó ${artefacto.incompleteRunsAccepted.length} corrida(s) incompleta(s): ` +
        "esta evidencia no se publica con --allow-partial",
    );
  if (!artefacto.measurements || Object.keys(artefacto.measurements).length === 0)
    fail("el cruce no trae ninguna medida");
  return { passed: violations.length === 0, violations };
}

/** Lee un JSON si existe; `null` si no. No lanza: la ausencia es un dato. */
export function leerJsonSiExiste(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}
