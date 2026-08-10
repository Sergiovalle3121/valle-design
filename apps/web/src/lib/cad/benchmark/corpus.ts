import manifestJson from "./corpus-manifest.json";
import {
  CAD_DOCUMENT_SCHEMA,
  type CadDocument,
  type CadEntity,
} from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";

export type CadBenchmarkTier = "smoke" | "scale";
export type CadBenchmarkBudgetEnforcement = "blocking" | "report-only";

export interface CadBenchmarkBudgets {
  totalMs: number;
  generateMs: number;
  spatialIndexBuildMs: number;
  selectionIndexBuildMs: number;
  selectionQueryP95Ms: number;
  serializeMs: number;
  dxfRoundTripMs: number;
  peakRssBytes: number;
}

export interface CadBenchmarkProfile {
  id: string;
  tier: CadBenchmarkTier;
  entities: number;
  queries: number;
  dxfSampleEntities: number;
  budgetEnforcement: CadBenchmarkBudgetEnforcement;
  nodeOldSpaceMb: number;
  hardware: {
    minimumTotalMemoryBytes: number;
    minimumFreeMemoryBytes: number;
  };
  budgets: CadBenchmarkBudgets;
}

export interface CadBenchmarkManifest {
  $schema: string;
  schemaVersion: 1;
  benchmarkId: string;
  generator: {
    id: string;
    seed: number;
    rng: string;
    cellSize: number;
    entityMix: { line: number; circle: number; arc: number };
  };
  determinismFixture: { entities: number; sha256: string };
  profiles: CadBenchmarkProfile[];
}

export const CAD_BENCHMARK_MANIFEST = manifestJson as CadBenchmarkManifest;

/** LCG32 with unsigned overflow; identical output on every supported JS runtime. */
export function createCadBenchmarkRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export interface CadBenchmarkCorpus {
  document: CadDocument;
  nativeEntities: CadNativeEntity[];
  entityMix: Record<CadNativeEntity["type"], number>;
}

/**
 * Recuento a cero de TODOS los tipos nativos.
 *
 * Vive aquí y no duplicado en cada generador a propósito: cuando el esquema
 * estrena un tipo, `Record<CadNativeEntity["type"], number>` deja de compilar
 * en UN sitio y el compilador obliga a declararlo. Si cada mezcla llevara su
 * propia copia, añadir un tipo rompería cuatro archivos y la tentación sería
 * arreglarlos con un `as` — que es exactamente perder el aviso.
 */
export function createEmptyCadEntityMix(): Record<
  CadNativeEntity["type"],
  number
> {
  return {
    line: 0,
    // POLYLINE ya es nativa, pero el generador determinista de
    // `createCadBenchmarkCorpus` todavía no la emite: añadirla cambiaría el
    // corpus y sus hashes, lo que exige actualizar el manifiesto del benchmark
    // de forma explícita. Las MEZCLAS de `corpus-mixes.ts` sí la emiten.
    polyline: 0,
    circle: 0,
    arc: 0,
    ellipse: 0,
    spline: 0,
    hatch: 0,
    mtext: 0,
    dimension: 0,
    mleader: 0,
    insert: 0,
    // Esquema 4. Igual que POLYLINE: el generador determinista todavía no las
    // emite, y hacerlo cambiaría el corpus y sus hashes. Se declaran en cero
    // para que el recuento siga cubriendo TODOS los tipos nativos y añadir uno
    // nuevo vuelva a fallar aquí, que es justo lo que se quiere.
    point: 0,
    xline: 0,
    ray: 0,
    solid: 0,
    wipeout: 0,
    image: 0,
    attdef: 0,
    table: 0,
  };
}

export function roundCadBenchmarkCoordinate(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundCoordinate(value: number): number {
  return roundCadBenchmarkCoordinate(value);
}

/**
 * Reproducible native CAD corpus. It deliberately contains only LINE, CIRCLE
 * and ARC entities: all three exercise the production registry, bounds and
 * hit-test implementations without claiming coverage for richer entity types.
 */
export function createCadBenchmarkCorpus(options: {
  entities: number;
  seed?: number;
  cellSize?: number;
}): CadBenchmarkCorpus {
  const count = Math.floor(options.entities);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("entities must be a positive safe integer.");

  const seed = options.seed ?? CAD_BENCHMARK_MANIFEST.generator.seed;
  const cellSize =
    options.cellSize ?? CAD_BENCHMARK_MANIFEST.generator.cellSize;
  if (!(cellSize > 0)) throw new Error("cellSize must be positive.");

  const rng = createCadBenchmarkRng(seed);
  const columns = Math.ceil(Math.sqrt(count));
  const idWidth = Math.max(7, String(count - 1).length);
  const nativeEntities: CadNativeEntity[] = new Array(count);
  const modelSpaceIds: string[] = new Array(count);
  const entityMix = createEmptyCadEntityMix();

  for (let index = 0; index < count; index += 1) {
    const id = `bench-${String(index).padStart(idWidth, "0")}`;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const baseX = column * cellSize;
    const baseY = row * cellSize;
    const jitterX = roundCoordinate((rng() - 0.5) * cellSize * 0.2);
    const jitterY = roundCoordinate((rng() - 0.5) * cellSize * 0.2);
    const selector = rng();
    let entity: CadNativeEntity;

    if (selector < CAD_BENCHMARK_MANIFEST.generator.entityMix.line) {
      entity = {
        id,
        type: "line",
        start: { x: baseX + 8 + jitterX, y: baseY + 12 + jitterY, z: 0 },
        end: { x: baseX + 48 + jitterX, y: baseY + 44 + jitterY, z: 0 },
        layer: "BENCH-LINES",
      };
    } else if (
      selector <
      CAD_BENCHMARK_MANIFEST.generator.entityMix.line +
        CAD_BENCHMARK_MANIFEST.generator.entityMix.circle
    ) {
      entity = {
        id,
        type: "circle",
        center: { x: baseX + 32 + jitterX, y: baseY + 32 + jitterY, z: 0 },
        radius: roundCoordinate(8 + rng() * 12),
        layer: "BENCH-CIRCLES",
      };
    } else {
      const startAngle = roundCoordinate(rng() * 90);
      entity = {
        id,
        type: "arc",
        center: { x: baseX + 32 + jitterX, y: baseY + 32 + jitterY, z: 0 },
        radius: roundCoordinate(10 + rng() * 10),
        startAngle,
        endAngle: roundCoordinate(startAngle + 180),
        layer: "BENCH-ARCS",
      };
    }

    nativeEntities[index] = entity;
    modelSpaceIds[index] = id;
    entityMix[entity.type] += 1;
  }

  const document: CadDocument = {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      {
        id: "BENCH-ARCS",
        name: "Benchmark arcs",
        color: "#ef4444",
        visible: true,
        locked: false,
      },
      {
        id: "BENCH-CIRCLES",
        name: "Benchmark circles",
        color: "#22c55e",
        visible: true,
        locked: false,
      },
      {
        id: "BENCH-LINES",
        name: "Benchmark lines",
        color: "#3b82f6",
        visible: true,
        locked: false,
      },
    ],
    entities: nativeEntities as CadEntity[],
    history: [],
    modelSpace: { entityIds: modelSpaceIds },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };

  return { document, nativeEntities, entityMix };
}
