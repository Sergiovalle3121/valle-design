/**
 * T-24·2 — cuántos pasos de deshacer sobreviven de verdad en un plano denso.
 *
 * ## Por qué hace falta esto y no basta con leer `canonical-history.ts`
 *
 * `CanonicalHistory` declara `maxEntries: 80`, y el editor lo pide con esos
 * mismos 80 (`Layout3DEditor.tsx`, dos altas). Pero el presupuesto REAL no es
 * ese: es `maxRetainedBytes` (32 MiB), y `enforceBudget()` expulsa la entrada
 * más vieja mientras el total retenido exceda ese techo — SALVO la última, que
 * nunca se expulsa (es el suelo de seguridad de datos, documentado en el
 * propio módulo). En un documento pequeño, 80 checkpoints caben de sobra en
 * 32 MiB y el límite que manda es el de entradas. En un plano denso, cada
 * checkpoint por sí solo pesa varios megabytes — y el límite que manda deja de
 * ser 80 mucho antes de llegar a 80.
 *
 * Esto se mide, no se intuye, porque `estimateBytes` no es `JSON.stringify`:
 * es una caminata que suma con su propio criterio (una cadena son sus
 * caracteres × 2 más 16 de cabecera, un objeto son sus claves × 16 más 32 de
 * cabecera, etc.), y ese criterio puede sobreestimar o subestimar el tamaño
 * real de un documento canónico según cuántas propiedades opcionales lleve
 * cada entidad. La única manera honesta de saber cuántos pasos sobreviven es
 * correr LA CLASE REAL, con SUS opciones reales, sobre un documento real.
 *
 * ## Qué corpus y qué edición
 *
 * El mismo corpus `plano-real` que sostiene el resto de
 * `document-limits.json` — la mezcla de muros, cotas, hatch y bloques de un
 * despacho de verdad, no arcos sueltos — y en cada escalón el mismo tamaño ya
 * publicado ahí, para que las dos series sean comparables entidad a entidad.
 *
 * La edición que se repite es un MOVE real de una sola entidad, aplicado con
 * `executeCadEntityCommandBatch` — la única ruta de mutación del producto —,
 * exactamente como lo dispara el motor de comandos. Se repite 150 veces
 * (bastante más que `maxEntries`) para que el conteo de deshacer llegue a su
 * RÉGIMEN ESTACIONARIO: las primeras vueltas todavía están llenando el
 * presupuesto, y publicar esas sería publicar un tránsito, no el límite.
 *
 * ## Qué NO mide
 *
 * No mide cuánto tarda cada `recordCurrent` (eso es trabajo de CPU síncrono
 * que ya se puede leer en `documentBytes`/`serializeMs` de este mismo
 * artefacto, a través del tamaño del documento). Mide sólo la PROFUNDIDAD que
 * sobrevive — la pregunta que de verdad importa cuando alguien pulsa Ctrl+Z
 * varias veces seguidas y descubre que ya no hay nada que deshacer.
 */
import { createCadCorpusMix } from "../../apps/web/src/lib/cad/benchmark/corpus-mixes";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../apps/web/src/lib/cad/entity-commands";
import { CanonicalHistory } from "../../apps/web/src/lib/cad/canonical-history";
import type { CadDocument } from "../../apps/web/src/lib/cad/cad-document";

// Las mismas opciones EXACTAS con las que `Layout3DEditor.tsx` instancia el
// historial de verdad — no una aproximación: si el producto cambia estos
// números, este banco debe leerlos de ahí, no redeclararlos a mano y
// desincronizarse en silencio.
const PRODUCTION_HISTORY_OPTIONS = {
  maxEntries: 80,
  maxRetainedBytes: 32 * 1024 * 1024,
  groupWindowMs: 400,
};

// Los mismos escalones que ya publica `document-limits.json`, para que las
// dos series se lean una al lado de la otra sin tener que interpolar nada.
const TIERS = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 150_000];

// Bastante más que `maxEntries` (80): el régimen estacionario tiene que
// alcanzarse ANTES del final de la corrida, o el número publicado sería un
// tránsito y no un límite.
const EDITS_PER_TIER = 150;

// Cuántas de las últimas vueltas se exigen IDÉNTICAS antes de aceptar que la
// profundidad ya se estabilizó. Sin esto, una corrida que todavía estuviera
// oscilando publicaría un número de la vuelta final, que podría no ser el
// régimen estacionario todavía.
const STABILITY_WINDOW = 20;

function moveCommandFor(document: CadDocument, index: number): CadEntityCommand {
  const entity = document.entities[index % document.entities.length];
  // Un desplazamiento minúsculo: lo que importa es que el documento cambie —y
  // por tanto sea una entrada de historia nueva y legítima—, no la distancia.
  return {
    type: "transform",
    entityId: entity.id,
    transform: { translation: { x: 0.001, y: 0 } },
  };
}

interface TierResult {
  entities: number;
  steadyStateUndoDepth: number;
  stabilizedAfterEdits: number | null;
  retainedBytesAtSteadyState: number;
  estimatedBytesPerCheckpoint: number;
  maxEntries: number;
  maxRetainedBytes: number;
  boundBy: "entries" | "bytes";
}

function runTier(entities: number): TierResult {
  const corpus = createCadCorpusMix({ mix: "plano-real", entities, seed: 24 });
  const history = new CanonicalHistory<CadDocument>(corpus.document, PRODUCTION_HISTORY_OPTIONS);
  let current = corpus.document;
  const undoDepths: number[] = [];
  for (let index = 0; index < EDITS_PER_TIER; index += 1) {
    // El mismo orden que `recordHistoryDocument`: se registra el documento
    // ANTES de mutar, y sólo después se aplica la mutación.
    history.recordCurrent(current);
    const result = executeCadEntityCommandBatch(current, [moveCommandFor(current, index)], "MOVE");
    current = result.document;
    undoDepths.push(history.depths().undo);
  }
  const tail = undoDepths.slice(-STABILITY_WINDOW);
  const stable = tail.every((value) => value === tail[0]);
  const steadyStateUndoDepth = tail.at(-1)!;
  const stabilizedAt = undoDepths.findIndex(
    (value, index) => index >= undoDepths.length - STABILITY_WINDOW ? false : value === steadyStateUndoDepth && undoDepths.slice(index).every((later) => later === steadyStateUndoDepth),
  );
  const stats = history.stats();
  const estimatedBytesPerCheckpoint =
    steadyStateUndoDepth > 0 ? Math.round(stats.retainedBytes / steadyStateUndoDepth) : 0;
  if (!stable)
    throw new Error(
      `undo-depth-benchmark: la profundidad de deshacer en ${entities} entidades NO se estabilizó en ` +
        `${EDITS_PER_TIER} ediciones (últimas ${STABILITY_WINDOW}: ${tail.join(", ")}) — hace falta más ` +
        "margen antes de publicar un número.",
    );
  return {
    entities,
    steadyStateUndoDepth,
    stabilizedAfterEdits: stabilizedAt >= 0 ? stabilizedAt + 1 : null,
    retainedBytesAtSteadyState: stats.retainedBytes,
    estimatedBytesPerCheckpoint,
    maxEntries: PRODUCTION_HISTORY_OPTIONS.maxEntries,
    maxRetainedBytes: PRODUCTION_HISTORY_OPTIONS.maxRetainedBytes,
    boundBy: steadyStateUndoDepth >= PRODUCTION_HISTORY_OPTIONS.maxEntries ? "entries" : "bytes",
  };
}

const tiers = TIERS.map((entities) => {
  process.stderr.write(`  · undo-depth-benchmark: escalón ${entities.toLocaleString("es-MX")} entidades…\n`);
  return runTier(entities);
});

process.stdout.write(JSON.stringify({ productionHistoryOptions: PRODUCTION_HISTORY_OPTIONS, tiers }, null, 2));
process.stdout.write("\n");
