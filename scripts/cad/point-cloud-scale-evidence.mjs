#!/usr/bin/env node
/**
 * Publica `docs/cad/evidence/point-cloud-scale.json`.
 *
 * ## Por qué el artefacto lo escribe un script
 *
 * Porque un número escrito a mano no se puede volver a comprobar. Este archivo
 * ejecuta la sonda tres veces en procesos separados, cruza las corridas y vuelca
 * el resultado; si alguien quiere discutir una cifra, la vuelve a generar. Nada
 * de lo que sale aquí se teclea.
 *
 * ## Tres corridas, mediana, y la máquina declarada
 *
 * Es regla del repositorio: si se cita un número de rendimiento, se cita la
 * máquina. Y se citan TRES corridas en procesos separados, no tres vueltas
 * dentro del mismo: repetir en caliente mide un intérprete ya calentado, que no
 * es lo que le pasa a quien abre un archivo una vez.
 *
 * ## Y además se declara si la máquina estaba sola
 *
 * Este portátil trabaja con varios agentes a la vez, y publicar tiempos sin
 * decirlo sería publicar la contención de otro proceso como si fuera una
 * propiedad del producto. Se cuentan los procesos de Node vivos en cada corrida
 * y se cronometra un trabajo de CPU fijo; las tres muestras van en el artefacto
 * para que quien lo lea juzgue por su cuenta.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(here, "point-cloud-scale-probe.mts");
const output = path.join(root, "docs/cad/evidence/point-cloud-scale.json");

/** Corridas en procesos separados. Impar, para que la mediana sea un dato real. */
const RUNS = 3;

const round = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

/** Mediana. Con tres valores es el de en medio; sin trampas de promedio. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Resume una medida a lo largo de las corridas.
 *
 * Se publica la mediana Y las tres muestras. Sin las muestras, una mediana
 * puede esconder una corrida que tardó el triple, que es justo la información
 * que hace falta para saber si la máquina estaba libre.
 */
function summarize(samples, digits = 3) {
  return {
    median: round(median(samples), digits),
    samples: samples.map((value) => round(value, digits)),
    runs: samples.length,
  };
}

/**
 * Procesos de Node vivos ahora mismo.
 *
 * Es la medida más directa de «¿hay vecinos?» en este equipo, donde la carga la
 * ponen otros agentes que también son Node. Si el conteo falla —otro sistema
 * operativo, `tasklist` ausente— se devuelve `null` y el artefacto lo dice; no
 * se devuelve cero, porque cero significaría «comprobado y no hay» y aquí
 * significaría «no se pudo comprobar».
 */
function liveNodeProcesses() {
  try {
    const out = execFileSync(
      "tasklist",
      ["/FI", "IMAGENAME eq node.exe", "/FO", "CSV", "/NH"],
      { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] },
    );
    const lines = out.split("\n").filter((line) => line.trim().startsWith('"node.exe"'));
    return lines.length;
  } catch {
    return null;
  }
}

function runProbe(index) {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli", { paths: [web, root] });
  process.stderr.write(`· corrida ${index + 1}/${RUNS}…\n`);
  const neighboursBefore = liveNodeProcesses();
  const freeBefore = os.freemem();
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 1_800_000,
    env: {
      ...process.env,
      NODE_OPTIONS: "--expose-gc --max-old-space-size=4096",
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
    },
  });
  return {
    ...JSON.parse(stdout),
    // Uno de los procesos contados es la propia sonda; el resto son vecinos.
    neighbourNodeProcesses:
      neighboursBefore === null ? null : Math.max(0, neighboursBefore - 1),
    freeMemoryBytes: freeBefore,
  };
}

const startedAt = new Date().toISOString();
const runs = Array.from({ length: RUNS }, (_, index) => runProbe(index));
const finishedAt = new Date().toISOString();

const tierCount = runs[0].tiers.length;
for (const run of runs)
  if (run.tiers.length !== tierCount)
    throw new Error("Las corridas no midieron los mismos escalones.");

const tiers = runs[0].tiers.map((reference, tierIndex) => {
  const across = runs.map((run) => run.tiers[tierIndex]);
  for (const tier of across)
    if (tier.points !== reference.points)
      throw new Error("Las corridas no midieron los mismos escalones.");

  const windows = reference.windows.map((window, windowIndex) => ({
    label: window.label,
    sideFraction: window.sideFraction,
    queriesPerRun: window.queries,
    pointsInWindow: Math.round(median(across.map((t) => t.windows[windowIndex].hitsPerQuery))),
    msPerQuery: summarize(
      across.map((t) => t.windows[windowIndex].msPerQuery),
      4,
    ),
  }));

  return {
    points: reference.points,
    lasBytes: reference.lasBytes,
    extentM: 1_000,
    densityPointsPerSquareMetre: round(
      median(across.map((t) => t.densityPointsPerSquareMetre)),
      4,
    ),
    read: {
      note: "Del archivo LAS en memoria a tres Float64Array con las coordenadas ya escaladas.",
      ms: summarize(across.map((t) => t.read.ms)),
      pointsPerSecond: Math.round(median(across.map((t) => t.read.pointsPerSecond))),
      coordinateBytes: reference.read.coordinateBytes,
    },
    index: {
      note: "Rejilla uniforme con ordenación por conteo, en dos pasadas sobre arreglos tipados.",
      buildMs: summarize(across.map((t) => t.index.buildMs)),
      pointsPerSecond: Math.round(median(across.map((t) => t.index.pointsPerSecond))),
      bytes: reference.index.bytes,
      bytesPerPoint: round(reference.index.bytesPerPoint, 2),
      cellSizeM: round(reference.index.cellSizeM, 3),
      grid: `${reference.index.cellCountX} × ${reference.index.cellCountY}`,
      occupiedCells: reference.index.occupiedCells,
      maxPointsPerCell: reference.index.maxPointsPerCell,
    },
    windows,
    nearest: {
      note: "Punto más próximo al cursor, con anillos de celdas y parada demostrable.",
      probesPerRun: reference.nearest.probes,
      msPerQuery: summarize(across.map((t) => t.nearest.msPerQuery), 4),
    },
    radius: {
      note: "Vecinos a 2 m, que es la consulta de clasificar un punto o medir densidad local.",
      queriesPerRun: reference.radius.queries,
      pointsFound: round(median(across.map((t) => t.radius.hitsPerQuery)), 2),
      msPerQuery: summarize(across.map((t) => t.radius.msPerQuery), 4),
    },
  };
});

// Comparación con el índice del editor, sólo en los escalones donde se midió.
const comparisons = runs[0].tiers
  .map((tier, tierIndex) => {
    if (!tier.entityIndex) return null;
    const across = runs.map((run) => run.tiers[tierIndex]);
    const own = tiers[tierIndex];
    const designation = own.windows.find((window) => window.sideFraction === 0.02);
    return {
      points: tier.points,
      cadSpatialIndex: {
        buildMs: summarize(across.map((t) => t.entityIndex.buildMs)),
        heapBytes: Math.round(median(across.map((t) => t.entityIndex.heapBytes))),
        bytesPerPoint: Math.round(median(across.map((t) => t.entityIndex.bytesPerPoint))),
        windowMsPerQuery: summarize(
          across.map((t) => t.entityIndex.windowMsPerQuery),
          4,
        ),
      },
      geoPointIndex: {
        buildMs: own.index.buildMs,
        bytes: own.index.bytes,
        bytesPerPoint: own.index.bytesPerPoint,
        windowMsPerQuery: designation.msPerQuery,
      },
      ratio: {
        memory: round(
          median(across.map((t) => t.entityIndex.bytesPerPoint)) / own.index.bytesPerPoint,
          1,
        ),
        build: round(
          median(across.map((t) => t.entityIndex.buildMs)) / own.index.buildMs.median,
          1,
        ),
        windowQuery: round(
          median(across.map((t) => t.entityIndex.windowMsPerQuery)) /
            designation.msPerQuery.median,
          1,
        ),
      },
    };
  })
  .filter(Boolean);

const cpus = os.cpus();
const calibrations = runs.map((run) => run.calibrationMs);
const contentionSpread = Math.max(...calibrations) / Math.min(...calibrations);
const neighbourCounts = runs.map((run) => run.neighbourNodeProcesses);
const hadNeighbours = neighbourCounts.some((count) => (count ?? 0) > 0);
/**
 * La máquina, dicha con la carga que de verdad tenía.
 *
 * Poner sólo el modelo del procesador sería declarar una máquina que no es la
 * que midió: este equipo estaba compartido con otros agentes, y ese hecho
 * explica por qué las tres muestras de cada medida se separan tanto. Va DENTRO
 * de `declaredMachine` y no en una nota al pie porque es lo primero que hay que
 * saber para leer cualquier tiempo de este archivo.
 */
const declaredMachine =
  `${(cpus[0]?.model ?? "desconocido").trim()} (${cpus.length} hilos lógicos), ` +
  `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, ` +
  "portátil de desarrollo " +
  (hadNeighbours
    ? `CON CARGA VECINA: se midieron ${Math.min(...neighbourCounts.map((c) => c ?? 0))}–` +
      `${Math.max(...neighbourCounts.map((c) => c ?? 0))} procesos de Node ajenos a la sonda ` +
      `durante las corridas, y el mismo trabajo de CPU fijo tardó ${round(Math.min(...calibrations), 0)}–` +
      `${round(Math.max(...calibrations), 0)} ms según la corrida (factor ${round(contentionSpread, 1)}). ` +
      "Los tiempos publicados son, por tanto, una COTA SUPERIOR: en una máquina en reposo saldrían " +
      "mejores. Las cifras de memoria no se ven afectadas, porque son conteos de bytes."
    : "sin carga vecina detectada durante las corridas.");

const evidence = {
  $schema: "urn:valle-design:schema:cad-point-cloud-scale-evidence:v1",
  schemaVersion: 1,
  evidenceId: "valle-design-point-cloud-scale-v1",
  startedAt,
  finishedAt,
  enforcement: "report-only",
  enforcementRationale:
    "La CORRECCIÓN del índice está cerrada por una spec ejecutable —point-index.spec.ts— que " +
    "compara toda consulta contra la fuerza bruta y falla si difieren. Los TIEMPOS de este " +
    "artefacto no fijan presupuesto: están medidos en un portátil de desarrollo con otros agentes " +
    "trabajando en paralelo, y calibrarlos como umbral de CI produciría un gate que falla por " +
    "contención de máquina y no por una regresión del producto.",
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model ?? "desconocido",
    logicalCpuCount: cpus.length,
    availableParallelism: os.availableParallelism?.() ?? cpus.length,
    totalMemoryBytes: os.totalmem(),
    declaredMachine,
  },
  neighbours: {
    note:
      "Cuántos procesos de Node ajenos a la sonda estaban vivos al arrancar cada corrida, y " +
      "cuánto tardó en cada una el mismo trabajo de CPU fijo. Con la máquina para ella sola, la " +
      "calibración de las tres corridas coincide; una que se dispara delata a un vecino.",
    nodeProcessesPerRun: neighbourCounts,
    hadNeighbours,
    calibrationMs: summarize(calibrations, 1),
    contentionSpread: round(contentionSpread, 2),
    interpretation:
      hadNeighbours
        ? "Hubo vecinos. La calibración se separa por un factor de " +
          `${round(contentionSpread, 1)} entre la corrida más suelta y la más apretada, así que ` +
          "los tiempos de este archivo son una COTA SUPERIOR y no un presupuesto. Lo que NO " +
          "depende de la contención —los bytes por punto, el número de celdas, los puntos que " +
          "devuelve cada consulta— se puede leer tal cual."
        : "No se detectaron vecinos.",
    freeMemoryBytesPerRun: runs.map((run) => run.freeMemoryBytes),
    peakRssBytesPerRun: runs.map((run) => run.peakRssBytes),
  },
  method: {
    runs: RUNS,
    aggregation: "mediana de 3 corridas en PROCESOS SEPARADOS",
    generator:
      "scripts/cad/point-cloud-scale-evidence.mjs + scripts/cad/point-cloud-scale-probe.mts",
    everyNumberReadFrom:
      "un archivo LAS completo escrito con el mismo generador que usan las specs y leído con el " +
      "lector del producto. No se fabrica ninguna nube en memoria saltándose el formato: si el " +
      "lector se equivocara, estas cifras serían de otra cosa.",
    correctness:
      "apps/web/src/lib/geo/point-index.spec.ts compara TODA consulta —ventana, radio y vecino " +
      "más próximo— contra la fuerza bruta sobre los mismos puntos. Un índice rápido y " +
      "equivocado pasaría este banco y no pasa esa spec.",
  },
  corpus: {
    shape:
      "Nube repartida por un cuadrado de un kilómetro de lado, con cotas entre 1500 y 1560 m y " +
      "clasificación ASPRS repartida entre suelo, vegetación baja y edificio. Al crecer el " +
      "escalón crece la DENSIDAD, no la extensión: es lo que pasa en un vuelo real cuando se " +
      "dan más pasadas sobre el mismo terreno.",
    format: "LAS 1.2, formato de registro 1, escala de un milímetro, EPSG:32614 (UTM 14N).",
    generator: "apps/web/src/lib/geo/fixtures.ts, congruencial lineal con semilla fija",
  },
  tiers,
  indexComparison: {
    note:
      "El producto ya tenía un índice espacial —CadSpatialIndex, el del editor— y lo primero fue " +
      "intentar usarlo. Aquí está medido con los mismos puntos y en el mismo proceso, en vez de " +
      "descartado por escrito. No está mal hecho: está hecho para entidades con extensión, que se " +
      "insertan y se borran una a una mientras se dibuja, y por eso guarda por cada elemento una " +
      "lista de celdas y un identificador de cadena.",
    measuredAt: comparisons.map((comparison) => comparison.points),
    notMeasuredAbove:
      "Por encima de 100 000 puntos no se midió: con un escalón basta para saber el coste POR " +
      "PUNTO, y forzar el índice del editor a millones de entidades habría medido un pulso con el " +
      "recolector de basura en vez de una propiedad de la estructura.",
    comparisons,
  },
  scope: {
    measured: [
      "lectura de un archivo LAS completo hasta las coordenadas en metros, por escalón",
      "construcción del índice espacial, por escalón",
      "designación por ventana en tres tamaños: detalle, ventana de trabajo y encuadre",
      "punto más próximo al cursor",
      "vecinos dentro de un radio de 2 m",
      "memoria del índice, contada en bytes exactos de sus arreglos tipados",
      "coste por punto del índice de entidades del editor sobre los mismos datos",
      "procesos vecinos y trabajo de CPU fijo en cada corrida",
    ],
    notMeasured: [
      "dibujar la nube: no hay pipeline de render de puntos y no se anuncia ninguno",
      "el navegador: estas cifras son de Node, sin GPU, sin hilo de interfaz y sin composición",
      "LAZ comprimido, que no se lee (se detecta y se rechaza)",
      "GeoTIFF ni ningún ráster georreferenciado, que no se leen",
      "consultas sobre nubes que no caben en memoria: no hay lectura por trozos ni fuera de núcleo",
      "clasificación, filtrado por retorno ni cálculo de terreno a partir de la nube",
      "nubes de más de 4 millones de puntos, que en este equipo compiten por la memoria con los " +
        "demás agentes y darían un número de la contención y no del índice",
    ],
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

const biggest = tiers[tiers.length - 1];
process.stderr.write(
  `\n✅ ${path.relative(root, output)}\n` +
    `   ${biggest.points.toLocaleString("es-MX")} puntos: leer ${biggest.read.ms.median} ms, ` +
    `indexar ${biggest.index.buildMs.median} ms, ${biggest.index.bytesPerPoint} B/punto\n` +
    `   designación por ventana ${biggest.windows[1].msPerQuery.median} ms, ` +
    `vecino más próximo ${biggest.nearest.msPerQuery.median} ms\n`,
);
