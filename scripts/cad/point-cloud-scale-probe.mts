/**
 * Sonda de escala de nube de puntos: UNA corrida, medida y volcada a stdout.
 *
 * Imprime un JSON por stdout y nada más. `point-cloud-scale-evidence.mjs` la
 * ejecuta tres veces en PROCESOS SEPARADOS, cruza los resultados y publica la
 * mediana. El reparto es el mismo que el de la sonda de fidelidad de trazado, y
 * por la misma razón: aquí vive lo que hay que MEDIR y allí lo que hay que
 * declarar de la máquina, para que ninguna de las dos mitades pueda maquillar a
 * la otra.
 *
 * ## Qué se mide, y sobre qué
 *
 * Sobre BYTES DE VERDAD. Cada escalón fabrica un archivo LAS completo con el
 * escritor de `fixtures.ts` —el mismo que usan las specs— y lo lee con el lector
 * del producto. Nada se inventa en memoria saltándose el formato: si el lector
 * se equivocara, estas cifras serían de otra cosa.
 *
 * Se cronometran los cuatro momentos que un usuario percibe por separado:
 * abrir el archivo, construir el índice, designar por ventana y buscar el punto
 * bajo el cursor.
 *
 * ## La comparación con el índice que ya existe
 *
 * `CadSpatialIndex` es el índice del editor y sostiene la designación y las
 * referencias a objetos. Se mide AQUÍ, con los mismos puntos y en el mismo
 * proceso, en vez de descartarlo por escrito. Sólo se corre en los escalones
 * pequeños, y el artefacto declara hasta dónde se corrió y por qué no más.
 */
import { performance } from "node:perf_hooks";
import { CadSpatialIndex } from "../../apps/web/src/lib/cad/entity-runtime";
import { buildLasBytes } from "../../apps/web/src/lib/geo/fixtures";
import { readLas } from "../../apps/web/src/lib/geo/las";
import { GeoPointIndex } from "../../apps/web/src/lib/geo/point-index";

/** Escalones. El mayor es una teja de vuelo LiDAR de verdad. */
const TIERS = (process.env.VALLE_POINT_TIERS ?? "100000,1000000,4000000")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

/**
 * Escalones donde SÍ se mide el índice del editor.
 *
 * Por encima el experimento deja de ser informativo y pasa a ser un pulso con
 * el recolector de basura: lo que se quiere saber —cuánto cuesta por punto— ya
 * se sabe con dos escalones, y el artefacto lo declara en vez de fingir que se
 * midió todo.
 */
const ENTITY_INDEX_TIERS = new Set([100_000]);

/** Sondas de vecino más próximo por escalón. */
const NEAREST_PROBES = 2_000;

const gc = (globalThis as { gc?: () => void }).gc;

function measure<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}

/** Generador repetible para las sondas. Misma semilla, mismas consultas. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

interface WindowMeasurement {
  label: string;
  /** Fracción del lado de la nube que abarca la ventana. */
  sideFraction: number;
  queries: number;
  totalMs: number;
  msPerQuery: number;
  hitsPerQuery: number;
}

function measureWindows(
  index: GeoPointIndex,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): WindowMeasurement[] {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const cases: Array<{ label: string; fraction: number; queries: number }> = [
    { label: "detalle (zoom cerrado sobre un mojón)", fraction: 0.002, queries: 2_000 },
    { label: "designación por ventana", fraction: 0.02, queries: 1_000 },
    { label: "encuadre de trabajo", fraction: 0.2, queries: 200 },
  ];
  return cases.map(({ label, fraction, queries }) => {
    const next = random(4_242);
    const w = width * fraction;
    const h = height * fraction;
    let hits = 0;
    const started = performance.now();
    for (let query = 0; query < queries; query += 1) {
      const x = bounds.minX + next() * (width - w);
      const y = bounds.minY + next() * (height - h);
      hits += index.countInBox(x, y, x + w, y + h);
    }
    const totalMs = performance.now() - started;
    return {
      label,
      sideFraction: fraction,
      queries,
      totalMs,
      msPerQuery: totalMs / queries,
      hitsPerQuery: hits / queries,
    };
  });
}

/**
 * Coste del índice de entidades del editor sobre los mismos puntos.
 *
 * Se le da a cada punto un rectángulo degenerado, que es lo único que se le
 * puede dar: `CadSpatialIndex` indexa cosas con extensión y un punto no la
 * tiene. Ése es justamente el resultado que interesa medir.
 */
function measureEntityIndex(
  xs: Float64Array,
  ys: Float64Array,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
  gc?.();
  const before = process.memoryUsage();
  const cellSize = Math.max((bounds.maxX - bounds.minX) / 512, 1e-6);
  const index = new CadSpatialIndex(cellSize);
  const build = measure(() => {
    for (let i = 0; i < xs.length; i += 1)
      index.upsert(`p${i}`, { minX: xs[i], minY: ys[i], maxX: xs[i], maxY: ys[i] });
  });
  gc?.();
  const after = process.memoryUsage();

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const next = random(4_242);
  const w = width * 0.02;
  const h = height * 0.02;
  const queries = 200;
  let hits = 0;
  const started = performance.now();
  for (let query = 0; query < queries; query += 1) {
    const x = bounds.minX + next() * (width - w);
    const y = bounds.minY + next() * (height - h);
    hits += index.search({ minX: x, minY: y, maxX: x + w, maxY: y + h }).length;
  }
  const queryMs = performance.now() - started;

  return {
    buildMs: build.ms,
    heapBytes: after.heapUsed - before.heapUsed,
    rssBytes: after.rss - before.rss,
    bytesPerPoint: (after.heapUsed - before.heapUsed) / xs.length,
    windowQueries: queries,
    windowMsPerQuery: queryMs / queries,
    windowHitsPerQuery: hits / queries,
  };
}

function runTier(count: number) {
  // Cuadrado de un kilómetro por escalón, para que la DENSIDAD cambie con el
  // número de puntos igual que cambia en un vuelo real: más pasadas sobre el
  // mismo terreno, no más terreno.
  const bytes = buildLasBytes({ count, pointFormat: 1, versionMinor: 2, epsg: 32_614, spanM: 1_000 });
  gc?.();
  const beforeRead = process.memoryUsage();
  const read = measure(() => readLas({ las: bytes, name: `nube-${count}.las`, maxPoints: count }));
  const cloud = read.value;
  gc?.();
  const afterRead = process.memoryUsage();

  const bounds = {
    minX: cloud.measuredBounds.minX,
    minY: cloud.measuredBounds.minY,
    maxX: cloud.measuredBounds.maxX,
    maxY: cloud.measuredBounds.maxY,
  };

  gc?.();
  const beforeIndex = process.memoryUsage();
  const built = measure(() => GeoPointIndex.build(cloud.x, cloud.y));
  const index = built.value;
  gc?.();
  const afterIndex = process.memoryUsage();
  const stats = index.stats();

  const windows = measureWindows(index, bounds);

  const next = random(9_001);
  const nearestStarted = performance.now();
  let nearestFound = 0;
  for (let probe = 0; probe < NEAREST_PROBES; probe += 1) {
    const x = bounds.minX + next() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + next() * (bounds.maxY - bounds.minY);
    if (index.nearest(x, y) >= 0) nearestFound += 1;
  }
  const nearestMs = performance.now() - nearestStarted;

  // Radio de dos metros: la consulta que hace falta para clasificar un punto
  // por sus vecinos o para medir la densidad local del levantamiento.
  const radiusNext = random(9_002);
  const radiusStarted = performance.now();
  let radiusHits = 0;
  const radiusQueries = 1_000;
  for (let probe = 0; probe < radiusQueries; probe += 1) {
    const x = bounds.minX + radiusNext() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + radiusNext() * (bounds.maxY - bounds.minY);
    radiusHits += index.queryRadius(x, y, 2).length;
  }
  const radiusMs = performance.now() - radiusStarted;

  const entityIndex = ENTITY_INDEX_TIERS.has(count)
    ? measureEntityIndex(cloud.x, cloud.y, bounds)
    : null;

  return {
    points: count,
    lasBytes: bytes.byteLength,
    densityPointsPerSquareMetre:
      count / Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)),
    read: {
      ms: read.ms,
      pointsPerSecond: count / (read.ms / 1000),
      coordinateBytes: cloud.x.byteLength + cloud.y.byteLength + cloud.z.byteLength,
      rssDeltaBytes: afterRead.rss - beforeRead.rss,
    },
    index: {
      buildMs: built.ms,
      pointsPerSecond: count / (built.ms / 1000),
      bytes: stats.indexBytes,
      bytesPerPoint: stats.indexBytes / count,
      heapDeltaBytes: afterIndex.heapUsed - beforeIndex.heapUsed,
      cellCountX: stats.cellCountX,
      cellCountY: stats.cellCountY,
      cellSizeM: stats.cellSize,
      occupiedCells: stats.occupiedCells,
      maxPointsPerCell: stats.maxPointsPerCell,
    },
    windows,
    nearest: {
      probes: NEAREST_PROBES,
      totalMs: nearestMs,
      msPerQuery: nearestMs / NEAREST_PROBES,
      resolved: nearestFound,
    },
    radius: {
      radiusM: 2,
      queries: radiusQueries,
      totalMs: radiusMs,
      msPerQuery: radiusMs / radiusQueries,
      hitsPerQuery: radiusHits / radiusQueries,
    },
    entityIndex,
  };
}

/**
 * Trabajo de CPU fijo, cronometrado antes de medir nada.
 *
 * Es la vara para saber si la corrida tuvo la máquina para ella sola. Este
 * portátil trabaja con varios agentes a la vez, y un tiempo alto de esta sonda
 * dice que la corrida compitió por los núcleos — cosa que no se puede deducir de
 * los tiempos del propio banco, porque ahí no se distingue una regresión del
 * producto de un vecino ruidoso. Al publicarse las tres muestras, quien lea el
 * artefacto puede juzgarlo por su cuenta en vez de fiarse.
 */
function calibrationMs(): number {
  const started = performance.now();
  let accumulator = 0;
  for (let index = 1; index <= 20_000_000; index += 1) accumulator += Math.sqrt(index);
  // Se usa el resultado para que ningún optimizador se lleve el bucle entero.
  if (!Number.isFinite(accumulator)) throw new Error("calibración imposible");
  return performance.now() - started;
}

const calibration = calibrationMs();
const tiers = TIERS.map((count) => {
  process.stderr.write(`  · escalón ${count.toLocaleString("es-MX")} puntos…\n`);
  return runTier(count);
});

process.stdout.write(
  JSON.stringify({
    calibrationMs: calibration,
    tiers,
    peakRssBytes: process.memoryUsage().rss,
    nodeVersion: process.version,
    gcExposed: typeof gc === "function",
  }),
);
