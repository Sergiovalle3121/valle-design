import assert from "node:assert/strict";
import {
  cadDocumentBounds,
  createCadRenderScenario,
  measureCadLegacyPipeline,
  measureCadNextPipeline,
  measureCadRenderLeak,
} from "./render-benchmark";
import { createCadBenchmarkCorpus } from "../benchmark/corpus";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/**
 * 25.000 entidades: bastantes para que el muestreo del camino anterior sea
 * visible (su techo son 10.000) y pocas para caber en el tiempo de un spec. El
 * corpus de 100.000 se mide en `scripts/cad-render-benchmark.mts`, que corre
 * aparte y no toca ningún presupuesto existente.
 */
const ENTITIES = 25_000;
const corpus = createCadBenchmarkCorpus({ entities: ENTITIES });
const bounds = cadDocumentBounds(corpus.nativeEntities);
assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, "el corpus debe tener extensión");

// ---------------------------------------------------------------------------
// El guion: mismas vistas para los dos caminos. Si el guion no fuese el mismo,
// la comparación no compararía nada.
// ---------------------------------------------------------------------------
const scenario = createCadRenderScenario(bounds, 8);
assert.equal(scenario.pan.length, 8);
assert.deepEqual(scenario.initial.bounds, bounds, "la vista inicial encuadra el dibujo entero");
assert.ok(
  scenario.zoom.pixelsPerUnit > scenario.pan[0].pixelsPerUnit * 3.9,
  "el zoom final es de 4×",
);
// El paseo avanza de verdad: la primera y la última parada no se solapan.
assert.ok(
  scenario.pan[7].bounds.minX > scenario.pan[0].bounds.maxX - (bounds.maxX - bounds.minX) / 4,
  "el paseo recorre el dibujo en vez de quedarse quieto",
);
ok(true, `el guion tiene 8 paradas de paneo y un zoom de 4× sobre una extensión de ${Math.round(bounds.maxX - bounds.minX)} unidades`);

// ---------------------------------------------------------------------------
// LOS DOS CAMINOS, EN LA MISMA CORRIDA Y SOBRE EL MISMO GUION.
// ---------------------------------------------------------------------------
const next = measureCadNextPipeline(corpus.nativeEntities, corpus.document.modelSpace.entityIds, scenario);
const legacy = measureCadLegacyPipeline(corpus.nativeEntities, scenario);

// LA CIFRA QUE IMPORTA: detalle en reposo frente a visibles.
assert.equal(
  next.detailedAtRest,
  next.visibleAtRest,
  `el pipeline nuevo detalla TODAS las visibles: ${next.detailedAtRest} de ${next.visibleAtRest}`,
);
assert.ok(next.visibleAtRest > 0, "el zoom final tiene que ver algo");
assert.ok(
  legacy.detailedAtRest < legacy.visibleAtRest || legacy.visibleAtRest <= 10_000,
  "el camino anterior muestrea en cuanto lo visible pasa de su techo",
);
ok(
  true,
  `en reposo: nuevo ${next.detailedAtRest}/${next.visibleAtRest} detalladas; anterior ${legacy.detailedAtRest}/${legacy.visibleAtRest}`,
);

// Vista completa: aquí el muestreo del camino anterior es innegable.
const fullNext = measureCadNextPipeline(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  { initial: scenario.initial, pan: [], zoom: scenario.initial },
);
const fullLegacy = measureCadLegacyPipeline(corpus.nativeEntities, {
  initial: scenario.initial,
  pan: [],
  zoom: scenario.initial,
});
assert.equal(fullNext.detailedAtRest, ENTITIES, "con el dibujo entero a la vista se detallan las 25.000");
assert.equal(fullLegacy.visibleAtRest, ENTITIES);
assert.equal(fullLegacy.detailedAtRest, 10_000, "el camino anterior se queda en su techo de 10.000");
ok(
  true,
  `con el dibujo entero a la vista: nuevo ${fullNext.detailedAtRest} detalladas, anterior ${fullLegacy.detailedAtRest} — y las visibles son ${ENTITIES} en ambos`,
);

// El troceado existe: el pipeline nuevo asienta en muchos cuadros, el anterior
// en uno solo (que es exactamente por qué bloqueaba el hilo).
assert.ok(
  next.framesToFirstDetail > 1,
  `el trabajo se reparte en cuadros: ${next.framesToFirstDetail}`,
);
assert.equal(legacy.framesToFirstDetail, 1, "el camino anterior lo hacía todo de una vez");
ok(true, `el pipeline nuevo asienta la vista inicial en ${next.framesToFirstDetail} cuadros; el anterior en 1`);

// Un cuadro del paneo del pipeline nuevo es MUY más barato que una
// reconstrucción del anterior. Es la diferencia entre responder y bloquear.
//
// POR QUÉ ESTO SE DECIDE POR MAYORÍA DE PASEOS EMPAREJADOS Y NO POR UNA
// MEDIDA SUELTA. Una sola muestra de reloj de pared no comparaba los dos
// pipelines: comparaba al runner consigo mismo.
//
// El ruido de planificación es ABSOLUTO —una pausa de GC o un desalojo cuestan
// los mismos milisegundos a los dos caminos— pero el coste real no lo es: el
// nuevo ronda los 5-7 ms por cuadro y el anterior los 9. Un hipo de 5 ms
// apenas mueve al anterior y DUPLICA al nuevo, así que el veredicto se lo
// llevaba quien tuviera mala suerte. Y encima el «p95» se calcula sobre los
// ~8 cuadros de las ocho paradas: con esa muestra un percentil 95 ES el
// máximo, o sea el estadístico más sensible al ruido que existe.
//
// Medido en local sobre `main`: 2 de cada 10 corridas invertían el signo
// —«nuevo 15.589 ms frente a 9.35 ms»— sin que nada hubiera cambiado. Así cayó
// `test:specs` en CI sobre una rama que sólo tocaba Markdown y el workflow.
//
// La cura es emparejar y repetir. Cada ronda mide los DOS caminos seguidos,
// sobre el mismo guion de ocho paradas —el escenario no se toca, no se ablanda
// el paseo—, y anota quién ganó. Se exige que el pipeline nuevo gane la MAYORÍA
// de las rondas. El ruido golpea rondas sueltas de forma independiente, así que
// tolerar dos derrotas de cinco absorbe los hipos sin necesidad de que ninguna
// ronda salga perfecta.
//
// Y NO puede tapar una regresión. Lo que se repite es la MEDIDA, nunca la
// aserción: si el pipeline nuevo se volviera de verdad más caro que el
// anterior, perdería sistemáticamente y la mayoría no se alcanzaría. Lo único
// que este recuento elimina es que una hipo del runner dicte el veredicto.
const TIMING_ROUNDS = 5;
const REQUIRED_WINS = 3;

let p95Wins = 0;
let maxWins = 0;
const scoreboard: string[] = [];
for (let round = 0; round < TIMING_ROUNDS; round += 1) {
  const n = round === 0
    ? next
    : measureCadNextPipeline(corpus.nativeEntities, corpus.document.modelSpace.entityIds, scenario);
  const l = round === 0 ? legacy : measureCadLegacyPipeline(corpus.nativeEntities, scenario);
  if (n.panFrameP95Ms < l.panFrameP95Ms) p95Wins += 1;
  if (n.panFrameMaxMs < l.panFrameMaxMs) maxWins += 1;
  scoreboard.push(`${n.panFrameP95Ms}/${l.panFrameP95Ms}`);
}

assert.ok(
  p95Wins >= REQUIRED_WINS,
  `p95 por cuadro al panear: el pipeline nuevo sólo ganó ${p95Wins} de ${TIMING_ROUNDS} paseos (nuevo/anterior: ${scoreboard.join(", ")})`,
);
assert.ok(
  maxWins >= REQUIRED_WINS,
  `peor cuadro al panear: el pipeline nuevo sólo ganó ${maxWins} de ${TIMING_ROUNDS} paseos`,
);
ok(
  true,
  `paneo: el pipeline nuevo gana el p95 en ${p95Wins}/${TIMING_ROUNDS} paseos y el peor cuadro en ${maxWins}/${TIMING_ROUNDS} (p95 nuevo/anterior por ronda: ${scoreboard.join(", ")})`,
);

// ---------------------------------------------------------------------------
// PRUEBA DE FUGA: tres ciclos completos de abrir, panear, hacer zoom y cerrar.
// ---------------------------------------------------------------------------
const leak = measureCadRenderLeak(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  { initial: scenario.initial, pan: scenario.pan.slice(0, 4), zoom: scenario.zoom },
  3,
);
assert.equal(leak.cycles, 3);
assert.equal(leak.samplesMb.length, 3);
// Sin `--expose-gc` el montón no se puede forzar y la medida es ruido; el
// umbral se afloja en ese caso y se dice, en vez de fingir una medida limpia.
const gcAvailable = typeof (globalThis as { gc?: () => void }).gc === "function";
const threshold = gcAvailable ? 15 : 120;
assert.ok(
  leak.heapGrowthMb <= threshold,
  `el montón creció ${leak.heapGrowthMb} MiB entre el ciclo 1 y el 3 (umbral ${threshold} MiB, gc ${gcAvailable ? "disponible" : "NO disponible"})`,
);
ok(
  true,
  `tres ciclos completos: montón ${leak.samplesMb.join(" → ")} MiB, crecimiento ${leak.heapGrowthMb} MiB (gc ${gcAvailable ? "forzado" : "no forzado"})`,
);

console.log(
  `render-benchmark: ${checks} comprobaciones verdes — a ${ENTITIES} entidades con el dibujo entero a la vista el pipeline nuevo detalla ${fullNext.detailedAtRest} y el anterior ${fullLegacy.detailedAtRest}; el pipeline nuevo gana el p95 por cuadro al panear en ${p95Wins} de ${TIMING_ROUNDS} paseos emparejados; el montón crece ${leak.heapGrowthMb} MiB en tres ciclos. MEDIDA DE CPU EN NODE, no de cuadros de navegador ni de GPU.`,
);
