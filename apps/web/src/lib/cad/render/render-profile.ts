/**
 * Instrumentación POR ETAPA del pipeline de render. Apagada por defecto.
 *
 * ## Por qué hace falta
 *
 * El benchmark de Node publica un `firstDetailMs` y el spec de navegador un
 * `detailReadyMs`, y entre los dos hay dos órdenes de magnitud: 902 ms de CPU en
 * Node contra 208–221 s de reloj en Chromium con SwiftShader. Con un solo número
 * por corrida no se puede decir dónde se van los segundos, y sin saberlo
 * cualquier optimización es una apuesta. Aquí se parte el número en las etapas
 * que el pipeline atraviesa de verdad: teselar, escribir instancias, recalcular
 * la vista, encolar trabajo, armar el lote que viaja al worker y sembrar su
 * respuesta.
 *
 * ## Por qué no afecta al camino de producción
 *
 * El estado es UN puntero de módulo. Apagada, cada punto de medida cuesta una
 * lectura de `active === null` y una llamada que V8 alinea: no se pide reloj, no
 * se asigna nada y no se recorre nada. Encendida cuesta dos `performance.now()`
 * por punto, que es exactamente lo que hay que aceptar para poder medir — y por
 * eso se enciende sólo desde el arnés del benchmark, nunca desde el editor.
 *
 * La alternativa —envolver el pipeline en decoradores o duplicar el bucle— o
 * distorsiona el camino medido o mide otro camino. Un contador detrás de una
 * bandera mide EL código que corre en producción, que es el único que importa.
 *
 * Puro: sin THREE, sin DOM y sin `node:perf_hooks`, para que el mismo módulo
 * sirva en Node y en el navegador.
 */

/** Etapas del pipeline que se cronometran por separado. */
export type CadRenderStage =
  /** Teselar la entidad, incluida la consulta a la caché LRU que lo evita. */
  | "tessellate"
  /** Resolver estilo, elegir cubo y escribir las instancias en arrays tipados. */
  | "batchPush"
  /** Convertir un MTEXT en petición de quads para el atlas compartido. */
  | "textRequest"
  /** `setView`: tiles visibles nuevos y diferencia contra los de antes. */
  | "viewDiff"
  /** Encolar un tile en el planificador, con su prioridad por cercanía. */
  | "tileEnqueue"
  /** Juntar las entidades sin teselado que viajarán en un mensaje al worker. */
  | "offThreadCollect"
  /** Sembrar en la caché lo que el worker devolvió. */
  | "offThreadSeed"
  /** Derivar los lotes visibles: lo que consume la reconciliación de escena. */
  | "visibleBatches";

/** Contadores sin reloj: el volumen que explica los tiempos de arriba. */
export type CadRenderCounter =
  /** Invocaciones de `buildTileChunk`. Es el átomo de trabajo del planificador. */
  | "chunks"
  /** Mensajes enviados al teselador fuera de hilo. */
  | "offThreadBatches"
  /** Entidades que viajaron en esos mensajes. */
  | "offThreadEntities";

export interface CadRenderStageProfile {
  ms: Record<CadRenderStage, number>;
  calls: Record<CadRenderStage, number>;
  counters: Record<CadRenderCounter, number>;
}

export const CAD_RENDER_STAGES: readonly CadRenderStage[] = [
  "tessellate",
  "batchPush",
  "textRequest",
  "viewDiff",
  "tileEnqueue",
  "offThreadCollect",
  "offThreadSeed",
  "visibleBatches",
];

export const CAD_RENDER_COUNTERS: readonly CadRenderCounter[] = [
  "chunks",
  "offThreadBatches",
  "offThreadEntities",
];

/**
 * Reloj propio en vez de `node:perf_hooks`: este módulo lo importa `pipeline.ts`,
 * que se empaqueta para el navegador. Un import de Node ahí rompe el bundle.
 */
const now: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

function emptyProfile(): CadRenderStageProfile {
  const ms = {} as Record<CadRenderStage, number>;
  const calls = {} as Record<CadRenderStage, number>;
  for (const stage of CAD_RENDER_STAGES) {
    ms[stage] = 0;
    calls[stage] = 0;
  }
  const counters = {} as Record<CadRenderCounter, number>;
  for (const counter of CAD_RENDER_COUNTERS) counters[counter] = 0;
  return { ms, calls, counters };
}

/** Perfil en curso, o `null`. Ser `null` ES la bandera de apagado. */
let active: CadRenderStageProfile | null = null;

/** ¿Está midiendo? Lo consultan los specs; el pipeline usa `cadRenderMark`. */
export function cadRenderProfiling(): boolean {
  return active !== null;
}

/**
 * Marca de inicio de una etapa. Devuelve 0 —y no pide reloj— cuando está
 * apagada, que es el caso de producción; `cadRenderStage` reconoce ese 0 y no
 * acumula nada.
 */
export function cadRenderMark(): number {
  return active === null ? 0 : now();
}

/** Cierra una etapa abierta con `cadRenderMark`. Un 0 significa «no se midió». */
export function cadRenderStage(stage: CadRenderStage, startedAt: number): void {
  if (active === null || startedAt === 0) return;
  active.ms[stage] += now() - startedAt;
  active.calls[stage] += 1;
}

export function cadRenderCount(counter: CadRenderCounter, amount = 1): void {
  if (active === null) return;
  active.counters[counter] += amount;
}

/** Enciende la medición y descarta lo acumulado por una corrida anterior. */
export function startCadRenderProfile(): void {
  active = emptyProfile();
}

/**
 * Apaga la medición y devuelve lo acumulado, redondeado a microsegundos. Sin
 * perfil en curso devuelve uno vacío en vez de fallar: un arnés que para dos
 * veces es un error de arnés, no una corrida que haya que tirar.
 */
export function stopCadRenderProfile(): CadRenderStageProfile {
  const profile = active ?? emptyProfile();
  active = null;
  for (const stage of CAD_RENDER_STAGES)
    profile.ms[stage] = Math.round(profile.ms[stage] * 1_000) / 1_000;
  return profile;
}

/** Suma de todas las etapas. Es el «total explicado» frente al reloj de pared. */
export function cadRenderStageTotalMs(profile: CadRenderStageProfile): number {
  let total = 0;
  for (const stage of CAD_RENDER_STAGES) total += profile.ms[stage];
  return Math.round(total * 1_000) / 1_000;
}
