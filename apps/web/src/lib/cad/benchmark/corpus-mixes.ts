/**
 * Mezclas de corpus que se parecen a un PLANO, no a una nube de primitivas.
 *
 * ## Por qué hacía falta esto
 *
 * El corpus determinista de `corpus.ts` emite LINE, CIRCLE y ARC. Es honesto
 * —lo dice en su propio comentario— y sirve para lo que se hizo: índices,
 * selección y serialización. Pero el benchmark de render lo usó tal cual, y el
 * resultado es que su evidencia declara `polyline: 0, hatch: 0, mtext: 0,
 * dimension: 0, insert: 0`. Es decir: **`text-atlas.ts` no se ha ejecutado
 * nunca en una medida** y el camino instanciado de INSERT no se ha medido.
 *
 * Medir lo fácil y publicar el número como si cubriera el producto es la forma
 * más barata de fabricar una regresión invisible: el día que alguien toque el
 * atlas de glifos, ningún gate se moverá.
 *
 * ## Las cuatro mezclas, y qué duele en cada una
 *
 * | Mezcla | Qué la caracteriza | Qué subsistema estresa |
 * | --- | --- | --- |
 * | `architecture` | Muros como polilíneas, puertas/ventanas como INSERT repetidos, sombreados de suelo, cotas y rótulos. **Muchos inserts, pocas definiciones.** | Expansión de bloques (`insertRenderPaths`), hatch, cotas y atlas. |
 * | `mechanical` | Splines y elipses, cotas con tolerancias, muchos arcos pequeños. | Teselado dependiente del LOD: un arco pequeño cambia de escalón con cualquier zoom. |
 * | `cartography` | Cientos de miles de segmentos de polilínea, poquísimo texto. | Volumen bruto de segmentos por lote y presión sobre la caché de teselado. |
 * | `text-hostile` | 20.000 MTEXT en el escalón de 100k, textos largos y alfabeto ancho. | `text-atlas.ts`: es la carga que reventaba el montón con un `<canvas>` por rótulo. |
 *
 * ## Determinismo, y qué significa exactamente aquí
 *
 * Dos cosas distintas, y conviene no confundirlas:
 *
 * 1. **El RNG es reproducible** (LCG32, misma aritmética en todo runtime). Eso
 *    fija la geometría hasta el último decimal, y por eso cada (mezcla × tamaño)
 *    tiene su `sha256` versionado en `corpus-mixes-manifest.json`.
 * 2. **La PROPORCIÓN de tipos no depende del RNG.** El selector de constructor
 *    es un reparto por resto mayor sobre un periodo de 1.000, no una tirada de
 *    dados: a 100.000 entidades la mezcla hostil tiene 20.000 MTEXT EXACTOS, no
 *    «unos 20.000». Un corpus cuyo recuento de MTEXT baila entre corridas no
 *    sirve para calibrar un presupuesto de atlas.
 *
 * Un SHA sin ancla absoluta se cumple de forma vacía: si el generador dejara de
 * emitir hatches, el hash cambiaría y alguien lo re-registraría sin mirar. Por
 * eso el manifiesto guarda TAMBIÉN el recuento por tipo, y el spec comprueba
 * los dos.
 */
import {
  CAD_DOCUMENT_SCHEMA,
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadLayerDef,
} from "../cad-document";
import {
  architectureBlocks,
  architectureSlots,
  cartographySlots,
  layer,
  mechanicalSlots,
  textHostileSlots,
} from "./corpus-mix-builders";
import type { CadNativeEntity } from "../entity-runtime";
import manifestJson from "./corpus-mixes-manifest.json";
import {
  createCadBenchmarkRng,
  createEmptyCadEntityMix,
  type CadBenchmarkCorpus,
} from "./corpus";

export type CadCorpusMixId =
  | "architecture"
  | "mechanical"
  | "cartography"
  | "text-hostile";

export const CAD_CORPUS_MIX_IDS: readonly CadCorpusMixId[] = [
  "architecture",
  "mechanical",
  "cartography",
  "text-hostile",
];

/** Los dos escalones que se versionan. Cambiar uno cambia su SHA. */
export const CAD_CORPUS_MIX_SIZES: readonly number[] = [10_000, 100_000];

/**
 * Periodo del reparto de tipos. 1.000 divide a 10.000 y a 100.000, así que los
 * pesos se cumplen EXACTOS en los dos escalones versionados.
 */
export const CAD_CORPUS_MIX_PERIOD = 1_000;

export interface CadCorpusMixManifestEntry {
  mix: CadCorpusMixId;
  entities: number;
  sha256: string;
  entityMix: Partial<Record<CadNativeEntity["type"], number>>;
}

export interface CadCorpusMixManifest {
  $schema: string;
  schemaVersion: 1;
  benchmarkId: string;
  generator: { id: string; rng: string; period: number };
  corpora: CadCorpusMixManifestEntry[];
}

export const CAD_CORPUS_MIX_MANIFEST = manifestJson as CadCorpusMixManifest;

export interface CadCorpusMixCellContext {
  /** Índice global de la entidad. Único y estable. */
  index: number;
  id: string;
  /** Esquina inferior izquierda de la celda de rejilla asignada. */
  baseX: number;
  baseY: number;
  cellSize: number;
  rng: () => number;
}

export type CadCorpusMixEntityBuilder = (
  context: CadCorpusMixCellContext,
) => CadNativeEntity;

export interface CadCorpusMixSlot {
  /** Peso entero sobre `CAD_CORPUS_MIX_PERIOD`. */
  weight: number;
  build: CadCorpusMixEntityBuilder;
}

export interface CadCorpusMixDefinition {
  id: CadCorpusMixId;
  /** Una línea que diga qué dibujo pretende parecer. */
  title: string;
  /** Qué subsistema estresa. Va a la evidencia, no sólo al código. */
  stresses: string;
  seed: number;
  cellSize: number;
  layers: CadLayerDef[];
  blocks: CadBlockDefinition[];
  slots: CadCorpusMixSlot[];
}

// ---------------------------------------------------------------------------
// Reparto de tipos por resto mayor
// ---------------------------------------------------------------------------

/**
 * Tabla de `period` posiciones que asigna cada ranura a un constructor.
 *
 * Se usa apportionment por resto mayor SECUENCIAL (el mismo método de reparto
 * de escaños de Sainte-Laguë en su forma incremental): en cada ranura gana el
 * constructor con mayor déficit acumulado. Eso INTERCALA los tipos en vez de
 * apilarlos en bloques —lo que importa cuando el índice de tiles reparte por
 * posición: una mezcla en bloques metería todos los MTEXT en la esquina
 * inferior izquierda y el atlas de glifos quedaría concentrado en dos tiles,
 * midiendo algo que ningún plano real hace.
 */
export function buildCadCorpusMixSchedule(
  weights: readonly number[],
  period = CAD_CORPUS_MIX_PERIOD,
): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total !== period)
    throw new Error(
      `Los pesos deben sumar exactamente ${period}; suman ${total}.`,
    );
  const assigned = new Array<number>(weights.length).fill(0);
  const schedule = new Array<number>(period);
  for (let slot = 0; slot < period; slot += 1) {
    let bestIndex = 0;
    let bestDeficit = -Infinity;
    for (let index = 0; index < weights.length; index += 1) {
      // Déficit = cuota que le tocaría a estas alturas menos lo ya asignado.
      const deficit =
        (weights[index] * (slot + 1)) / period - assigned[index];
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        bestIndex = index;
      }
    }
    assigned[bestIndex] += 1;
    schedule[slot] = bestIndex;
  }
  return schedule;
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export const CAD_CORPUS_MIXES: Record<CadCorpusMixId, CadCorpusMixDefinition> = {
  architecture: {
    id: "architecture",
    title: "Planta arquitectónica: muros, carpintería repetida, suelos y rótulos",
    stresses:
      "expansión de bloques por instancia, sombreados, cotas y atlas de glifos",
    seed: 0x41_52_51_00,
    cellSize: 900,
    layers: [
      layer("ARQ-CARP", "Carpintería", "#f59e0b"),
      layer("ARQ-COTAS", "Cotas", "#a3e635"),
      layer("ARQ-EJES", "Ejes", "#94a3b8"),
      layer("ARQ-ESTR", "Estructura", "#ef4444"),
      layer("ARQ-MUROS", "Muros", "#e2e8f0"),
      layer("ARQ-ROTUL", "Rotulación", "#38bdf8"),
      layer("ARQ-SUELO", "Suelos", "#64748b"),
    ],
    blocks: architectureBlocks(),
    slots: architectureSlots(),
  },
  mechanical: {
    id: "mechanical",
    title: "Pieza mecánica: splines, elipses, arcos pequeños y cotas con tolerancia",
    stresses:
      "teselado dependiente del escalón de LOD y densidad de glifos por cota",
    seed: 0x4d_45_43_00,
    cellSize: 60,
    layers: [
      layer("MEC-COTAS", "Cotas", "#a3e635"),
      layer("MEC-CONT", "Contorno", "#e2e8f0"),
      layer("MEC-EJES", "Taladros", "#f472b6"),
    ],
    blocks: [],
    slots: mechanicalSlots(),
  },
  cartography: {
    id: "cartography",
    title: "Cartografía: curvas de nivel largas y poquísimo texto",
    stresses: "volumen bruto de segmentos por lote y presión sobre la caché",
    seed: 0x43_41_52_00,
    cellSize: 5_000,
    layers: [
      layer("TOP-COTAS", "Cotas de nivel", "#a3e635"),
      layer("TOP-CURVAS", "Curvas de nivel", "#b45309"),
      layer("TOP-LIMITES", "Límites", "#94a3b8"),
    ],
    blocks: [],
    slots: cartographySlots(),
  },
  "text-hostile": {
    id: "text-hostile",
    title: "Hostil: 20.000 MTEXT de varias líneas con alfabeto ancho",
    stresses: "atlas de glifos y memoria de textura del texto",
    seed: 0x54_58_54_00,
    cellSize: 400,
    layers: [
      layer("TXT-GUIAS", "Guías", "#94a3b8"),
      layer("TXT-MARCOS", "Marcos", "#e2e8f0"),
      layer("TXT-NOTAS", "Notas", "#38bdf8"),
    ],
    blocks: [],
    slots: textHostileSlots(),
  },
};

/**
 * Genera una mezcla. Mismo contrato que `createCadBenchmarkCorpus`: documento
 * canónico completo, entidades nativas y recuento por tipo.
 *
 * El RNG es UNO solo para toda la corrida y se consume en orden de índice, así
 * que el corpus depende del tamaño pedido: 10k NO es el prefijo de 100k. Es
 * deliberado —cada tamaño tiene su SHA— y evita la trampa contraria, que sería
 * fabricar 100k y quedarse con los primeros 10k, donde el reparto por resto
 * mayor ya no cuadra en un prefijo arbitrario.
 */
export function createCadCorpusMix(options: {
  mix: CadCorpusMixId;
  entities: number;
  seed?: number;
}): CadBenchmarkCorpus {
  const definition = CAD_CORPUS_MIXES[options.mix];
  if (!definition) throw new Error(`Mezcla desconocida: ${options.mix}`);
  const count = Math.floor(options.entities);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("entities must be a positive safe integer.");

  const rng = createCadBenchmarkRng(options.seed ?? definition.seed);
  const schedule = buildCadCorpusMixSchedule(
    definition.slots.map((slot) => slot.weight),
  );
  const columns = Math.ceil(Math.sqrt(count));
  const idWidth = Math.max(7, String(count - 1).length);
  const nativeEntities: CadNativeEntity[] = new Array(count);
  const modelSpaceIds: string[] = new Array(count);
  const entityMix = createEmptyCadEntityMix();

  for (let index = 0; index < count; index += 1) {
    const id = `${options.mix}-${String(index).padStart(idWidth, "0")}`;
    const slot = definition.slots[schedule[index % schedule.length]];
    const entity = slot.build({
      index,
      id,
      baseX: (index % columns) * definition.cellSize,
      baseY: Math.floor(index / columns) * definition.cellSize,
      cellSize: definition.cellSize,
      rng,
    });
    nativeEntities[index] = entity;
    modelSpaceIds[index] = id;
    entityMix[entity.type] += 1;
  }

  const document: CadDocument = {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: definition.layers,
    entities: nativeEntities as CadEntity[],
    history: [],
    modelSpace: { entityIds: modelSpaceIds },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: definition.blocks,
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };

  return { document, nativeEntities, entityMix };
}

/** Entrada del manifiesto para un par (mezcla × tamaño), o `undefined`. */
export function findCadCorpusMixManifestEntry(
  mix: CadCorpusMixId,
  entities: number,
): CadCorpusMixManifestEntry | undefined {
  return CAD_CORPUS_MIX_MANIFEST.corpora.find(
    (entry) => entry.mix === mix && entry.entities === entities,
  );
}
