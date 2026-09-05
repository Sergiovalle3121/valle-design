#!/usr/bin/env node
/**
 * Mide y PUBLICA el reparto por etapa de `architecture@100k` con el que el
 * trinquete (`check-etapas-100k.mjs`) juzga después.
 *
 * ## Por qué existe, si ya hay un perfilador
 *
 * `apps/web/scripts/cad-render-stage-profile-mix.mts` mide UNA corrida y
 * escribe un fichero con la máquina declarada A MANO en una constante del
 * propio script. Para un reparto exploratorio basta; para un trinquete, no:
 *
 * 1. **Una corrida no calibra nada.** El techo de una etapa tiene que salir de
 *    la dispersión que esa etapa muestra en esta máquina, y una sola medida no
 *    tiene dispersión. Aquí se corren TRES, cada una en su propio proceso —el
 *    mismo criterio que el suelo de tres corridas de la entrega 2— porque
 *    repetir dentro del mismo proceso mide una V8 ya calentada, no un arranque.
 * 2. **La máquina hay que componerla, no escribirla.** La constante del
 *    perfilador decía «Xeon a 2.10GHz» y esta máquina es un Xeon a 2.80GHz:
 *    una evidencia que describe otra máquina es peor que una sin describir.
 *    Aquí sale de `os`, y la compone `componerMaquina` del verificador.
 * 3. **Un identificador por corrida.** Sin él, tres corridas son tres números
 *    sueltos y no se puede decir cuál se pasó.
 * 4. **El corpus, atado a su sha versionado.** Un presupuesto medido sobre un
 *    corpus distinto juzga otro dibujo. Lo comprueba la sonda, y si no cuadra
 *    aquí no se publica nada.
 *
 * ## Lo que NO hace, a propósito
 *
 * No juzga. La regla vive en `check-etapas-100k.mjs` y se IMPORTA, no se
 * copia: un generador que llevara dentro su propio criterio de aceptación se
 * aflojaría con él el día que el número no pasara.
 *
 * Y no borra lo que no midió: `comparisonWithinThisSession` —el antes/después
 * del ×6,75 de agosto— se ARRASTRA verbatim desde el artefacto vigente. Es la
 * única copia de esa medición; republicar encima de ella sería perder la
 * referencia contra la que este trinquete se compara.
 *
 * ## Uso
 *
 *   node scripts/perf/etapas-100k-medir.mjs                 # 3 corridas y publica
 *   node scripts/perf/etapas-100k-medir.mjs --corridas 1    # una, para iterar
 *   node scripts/perf/etapas-100k-medir.mjs --dry-run       # mide y no escribe
 *   node scripts/perf/etapas-100k-medir.mjs --output /tmp/x.json
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";
// La REGLA se importa de donde vive. Ver la cabecera.
import {
  EVIDENCE_FILE,
  BUDGET_FILE,
  ESCENARIO_JUZGADO,
  ETAPAS_PRESUPUESTADAS,
  componerMaquina,
  corridaJuzgada,
  instantaneaDeEstaMaquina,
  mediana,
  verificarEtapas,
} from "./check-etapas-100k.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const WEB = path.join(RAIZ, "apps", "web");
const PERFILADOR = path.join(WEB, "scripts", "cad-render-stage-profile-mix.mts");
const SONDA = path.join(AQUI, "etapas-100k-lod-probe.mts");

const AYUDA = `
Mide y publica el reparto por etapa de architecture@100k.

  node scripts/perf/etapas-100k-medir.mjs [opciones]

  --corridas <n>     Corridas en procesos separados (por defecto 3).
  --mix <id>         Mezcla del corpus (por defecto architecture).
  --entities <n>     Entidades (por defecto 100000).
  --output <ruta>    Dónde publicar (por defecto el artefacto versionado).
  --dry-run          Mide y enseña el resultado, sin escribir.
  --help             Esto.

Sale 0 si lo publicado cabe en el presupuesto vigente, 1 si no.
`;

const redondear = (valor, decimales = 3) =>
  Number.isFinite(valor) ? Number(valor.toFixed(decimales)) : valor;

function parseCli(argv) {
  const opciones = {
    corridas: 3,
    mix: "architecture",
    entities: 100_000,
    output: EVIDENCE_FILE,
    dryRun: false,
  };
  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];
    if (argumento === "--corridas") opciones.corridas = Number.parseInt(argv[++indice] ?? "", 10);
    else if (argumento === "--mix") opciones.mix = argv[++indice] ?? "";
    else if (argumento === "--entities") opciones.entities = Number.parseInt(argv[++indice] ?? "", 10);
    else if (argumento === "--output") opciones.output = path.resolve(argv[++indice] ?? "");
    else if (argumento === "--dry-run") opciones.dryRun = true;
    else if (argumento === "--help" || argumento === "-h") return { ayuda: true, ...opciones };
    else throw new Error(`Bandera desconocida: ${argumento}`);
  }
  if (!Number.isInteger(opciones.corridas) || opciones.corridas < 1)
    throw new Error("--corridas tiene que ser un entero positivo.");
  if (!Number.isSafeInteger(opciones.entities) || opciones.entities < 1)
    throw new Error("--entities tiene que ser un entero positivo.");
  return opciones;
}

/** El intérprete de TypeScript, resuelto como lo hace el resto de la casa. */
function tsxCli() {
  const require = createRequire(path.join(WEB, "package.json"));
  return require.resolve("tsx/cli");
}

function leerJsonSiExiste(ruta) {
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}

/**
 * La sonda del corpus y del LOD, una vez por publicación.
 *
 * Se corre ANTES que los relojes: si el corpus no es el versionado, medir tres
 * veces sólo produce tres números sobre el dibujo equivocado.
 */
function correrSonda({ mix, entities }) {
  const resultado = spawnSync(
    process.execPath,
    [tsxCli(), SONDA, "--mix", mix, "--entities", String(entities)],
    { cwd: WEB, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 },
  );
  if (resultado.status !== 0)
    throw new Error(
      `la sonda de corpus y LOD salió con código ${resultado.status}: ${resultado.stderr ?? ""}`,
    );
  process.stderr.write(resultado.stderr ?? "");
  return JSON.parse(resultado.stdout);
}

/** Una corrida del perfilador, en su propio proceso. */
function correrPerfilador({ mix, entities, destino }) {
  const empezada = new Date().toISOString();
  const cargaAntes = os.loadavg()[0];
  const resultado = spawnSync(
    process.execPath,
    [tsxCli(), PERFILADOR, "--mix", mix, "--entities", String(entities), "--output", destino],
    { cwd: WEB, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 },
  );
  process.stderr.write(resultado.stderr ?? "");
  if (resultado.status !== 0)
    throw new Error(`el perfilador salió con código ${resultado.status}`);
  const crudo = leerJsonSiExiste(destino);
  if (!crudo) throw new Error(`el perfilador no dejó artefacto en ${destino}`);
  return {
    runId: `${empezada.replace(/[-:]/g, "").slice(0, 15)}Z-${randomUUID().slice(0, 8)}`,
    startedAt: crudo.startedAt,
    finishedAt: crudo.finishedAt,
    // La carga de la máquina al arrancar la corrida. Aquí conviven dos agentes
    // sobre cuatro hilos: sin este dato, una corrida medida bajo un vecino
    // ruidoso se lee igual que una limpia.
    loadavg1m: redondear(cargaAntes, 2),
    node: crudo.environment?.node,
    cpuModel: crudo.environment?.cpuModel,
    runs: crudo.runs,
  };
}

/** Resumen por clave: mínimo, mediana, máximo y dispersión relativa. */
function resumir(valores, decimales = 3) {
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const med = mediana(valores);
  return {
    min: redondear(min, decimales),
    mediana: redondear(med, decimales),
    max: redondear(max, decimales),
    dispersionRelativa: redondear(med > 0 ? (max - min) / med : 0, 4),
  };
}

function principal(argv) {
  let opciones;
  try {
    opciones = parseCli(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${AYUDA}\n`);
    return 2;
  }
  if (opciones.ayuda) {
    process.stdout.write(`${AYUDA}\n`);
    return 0;
  }

  const publicationId = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();

  // --- 1. El corpus y el LOD -------------------------------------------------
  const sonda = correrSonda(opciones);
  if (sonda.corpus.matchesManifest !== true) {
    process.stderr.write(
      `El corpus medido (${sonda.corpus.documentSha256.slice(0, 12)}…) NO es el que versiona ` +
        `corpus-mixes-manifest.json (${String(sonda.corpus.manifestSha256).slice(0, 12)}…). ` +
        "No se publica: un presupuesto sobre otro corpus juzga otro dibujo.\n",
    );
    return 1;
  }

  // --- 2. Las corridas -------------------------------------------------------
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "etapas-100k-"));
  const corridas = [];
  let ultimoCrudo = null;
  try {
    for (let indice = 0; indice < opciones.corridas; indice += 1) {
      const destino = path.join(temporal, `corrida-${indice}.json`);
      process.stderr.write(`\n· corrida ${indice + 1}/${opciones.corridas}\n`);
      corridas.push(correrPerfilador({ ...opciones, destino }));
      ultimoCrudo = leerJsonSiExiste(destino);
    }
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }

  // Tres corridas en máquinas distintas no son tres corridas: son tres
  // medidas. Si el modelo de CPU o la versión de Node bailan, no se agregan.
  const cpus = new Set(corridas.map((corrida) => corrida.cpuModel));
  const nodes = new Set(corridas.map((corrida) => corrida.node));
  if (cpus.size > 1 || nodes.size > 1) {
    process.stderr.write(
      `Las corridas no salieron de la misma máquina (CPU: ${[...cpus].join(" | ")}; ` +
        `Node: ${[...nodes].join(" | ")}). No se agregan.\n`,
    );
    return 1;
  }

  // --- 3. El reparto agregado ------------------------------------------------
  const juzgadas = corridas.map((corrida) => corridaJuzgada(corrida));
  if (juzgadas.some((run) => !run)) {
    process.stderr.write(
      `Alguna corrida no trae el escenario juzgado (${ESCENARIO_JUZGADO.descripcion}).\n`,
    );
    return 1;
  }

  const reparto = {
    escenario: ESCENARIO_JUZGADO.descripcion,
    etapas: Object.fromEntries(
      ETAPAS_PRESUPUESTADAS.map((etapa) => [
        etapa,
        resumir(juzgadas.map((run) => run.stages.ms[etapa])),
      ]),
    ),
    stageTotalMs: resumir(juzgadas.map((run) => run.stageTotalMs)),
    firstDetailMs: resumir(juzgadas.map((run) => run.firstDetailMs)),
    segmentsAtRest: resumir(juzgadas.map((run) => run.segmentsAtRest), 0),
    detailedAtRest: [...new Set(juzgadas.map((run) => run.detailedAtRest))],
    visibleAtRest: [...new Set(juzgadas.map((run) => run.visibleAtRest))],
    callsTessellate: [...new Set(juzgadas.map((run) => run.stages.calls.tessellate))],
  };

  // --- 4. El contraste con la medición de agosto ------------------------------
  //
  // No se escribe a mano: se calcula contra el bloque que el artefacto vigente
  // ya traía. Si un día vuelve a cuadrar, este bloque lo dirá solo.
  const candidato = leerJsonSiExiste(opciones.output) ?? leerJsonSiExiste(EVIDENCE_FILE);
  // Sólo se arrastra lo que habla del MISMO dibujo. Un bloque de agosto sobre
  // architecture@100k copiado a un artefacto de 10k describiría otra cosa con
  // el aplomo de una medición.
  const vigente =
    candidato &&
    candidato.corpus?.mix === opciones.mix &&
    candidato.corpus?.entities === opciones.entities
      ? candidato
      : null;
  const agosto = vigente?.comparisonWithinThisSession;
  /**
   * Las instancias residentes de agosto. El artefacto de agosto las lleva en
   * su `runs`; los que publica este medidor las llevan ya calculadas en su
   * propio `contraste`, así que la referencia no se pierde al republicar
   * encima —que es justo lo que la haría desaparecer sin ruido—.
   */
  const agostoSegmentos = vigente?.publication
    ? (vigente?.contraste?.segmentsAtRest?.agosto ?? null)
    : (vigente?.runs?.find(
        (run) => run.label === ESCENARIO_JUZGADO.label && run.reconciled === ESCENARIO_JUZGADO.reconciled,
      )?.segmentsAtRest ?? null);
  const contraste = agosto?.afterThisPr
    ? {
        que:
          "Mediana de estas corridas contra el `afterThisPr` publicado el 2026-08-31 " +
          "(mismo corpus, mismo escenario, mismas llamadas). Un cociente > 1 significa que " +
          "HOY se tarda más que entonces.",
        etapas: Object.fromEntries(
          ETAPAS_PRESUPUESTADAS.map((etapa) => {
            const entonces = agosto.afterThisPr.stagesMs?.[etapa];
            const ahora = reparto.etapas[etapa].mediana;
            return [
              etapa,
              {
                agostoMs: entonces ?? null,
                hoyMedianaMs: ahora,
                cociente: Number.isFinite(entonces) && entonces > 0 ? redondear(ahora / entonces, 3) : null,
              },
            ];
          }),
        ),
        segmentsAtRest: {
          agosto: agostoSegmentos,
          hoyMediana: reparto.segmentsAtRest.mediana,
          cociente:
            Number.isFinite(agostoSegmentos) && agostoSegmentos > 0
              ? redondear(reparto.segmentsAtRest.mediana / agostoSegmentos, 2)
              : null,
        },
        ratioPublicado: agosto?.ratio ?? null,
      }
    : null;

  // --- 5. El artefacto --------------------------------------------------------
  const instantanea = instantaneaDeEstaMaquina();
  const cpuList = os.cpus();
  // La PEOR corrida por coste explicado es la que se copia a `runs`, para que
  // el campo que el esquema v1 ya tenía siga existiendo y siga siendo una
  // corrida real y completa — la menos favorable, no la más lucida.
  const peor = corridas.reduce((a, b) =>
    corridaJuzgada(a).stageTotalMs >= corridaJuzgada(b).stageTotalMs ? a : b,
  );

  const evidencia = {
    $schema: "urn:valle-design:schema:cad-render-stage-profile-evidence:v1",
    schemaVersion: 1,
    benchmarkId: "valle-design-cad-render-stage-profile-mix-v1",
    publication: {
      publicationId,
      publishedAt: new Date().toISOString(),
      publisher: "scripts/perf/etapas-100k-medir.mjs",
      invocation: ["node", "scripts/perf/etapas-100k-medir.mjs", ...argv].join(" "),
      corridas: corridas.length,
      juzgadoPor: "scripts/perf/check-etapas-100k.mjs contra scripts/perf/etapas-100k-budget.json",
      arrastradoDelVigente: agosto ? ["comparisonWithinThisSession"] : [],
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    note:
      "Medido con la instrumentación de render-stage-profile.ts ENCENDIDA: dos relojes por " +
      "punto de medida. Sirve para REPARTIR el coste entre etapas y para que ese reparto tenga " +
      "techo (scripts/perf/etapas-100k-budget.json), no para compararlo con líneas base de otra " +
      "instrumentación. No mide el camino ANTERIOR, ni GPU, ni cuadros de navegador, ni FPS.",
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      architecture: process.arch,
      cpuModel: cpuList[0]?.model ?? "unknown",
      logicalCpuCount: os.availableParallelism?.() ?? cpuList.length,
      totalMemoryBytes: os.totalmem(),
      heapLimitBytes: getHeapStatistics().heap_size_limit,
      loadavg1mAlEmpezar: redondear(os.loadavg()[0], 2),
      gpu: false,
      browser: false,
      measurementKind: "cpu-node",
      declaredMachine: componerMaquina({
        ...instantanea,
        nota:
          "Contenedor cloud de la sesión (Claude Code on the web) con hasta dos agentes " +
          "trabajando a la vez sobre los mismos cuatro hilos: por eso cada corrida publica su " +
          "loadavg1m y el techo lleva el margen de la dispersión observada",
      }),
    },
    corpus: {
      mix: opciones.mix,
      entities: opciones.entities,
      entityMix: ultimoCrudo?.corpus?.entityMix ?? null,
      bounds: ultimoCrudo?.corpus?.bounds ?? null,
      documentSha256: sonda.corpus.documentSha256,
      manifestSha256: sonda.corpus.manifestSha256,
      matchesManifest: sonda.corpus.matchesManifest,
    },
    scenario: ultimoCrudo?.scenario ?? null,
    lod: sonda.lod,
    browserFrameMsSource: vigente?.browserFrameMsSource ?? null,
    browserFrameMs: ultimoCrudo?.browserFrameMs ?? null,
    reparto,
    corridas,
    runsSource: `corridas[${corridas.indexOf(peor)}] · ${peor.runId} · la PEOR por stageTotalMs del escenario juzgado`,
    runs: peor.runs,
    ...(agosto ? { comparisonWithinThisSession: agosto } : {}),
    ...(contraste ? { contraste } : {}),
  };

  const json = `${JSON.stringify(evidencia, null, 2)}\n`;
  if (opciones.dryRun) {
    process.stderr.write(`\n(--dry-run: no se escribió ${opciones.output})\n`);
  } else {
    fs.mkdirSync(path.dirname(opciones.output), { recursive: true });
    fs.writeFileSync(opciones.output, json, "utf8");
    process.stderr.write(`\nReparto publicado en ${opciones.output}\n`);
  }

  // --- 6. El veredicto, con la regla de fuera ---------------------------------
  const presupuesto = leerJsonSiExiste(BUDGET_FILE);
  if (!presupuesto) {
    process.stderr.write(
      "\nTodavía no hay presupuesto: calíbralo con `node scripts/perf/check-etapas-100k.mjs --bajar`.\n",
    );
    return 0;
  }
  const veredicto = verificarEtapas(evidencia, presupuesto);
  process.stderr.write(
    veredicto.passed
      ? "\nVERDE: el reparto cabe en el presupuesto.\n"
      : `\nROJO:\n${veredicto.violations.map((v) => `  · ${v}`).join("\n")}\n`,
  );
  return veredicto.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(principal(process.argv.slice(2)));
}
