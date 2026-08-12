import assert from "node:assert/strict";
import {
  cadDocumentBounds,
  createCadRenderScenario,
  measureCadDenseEditing,
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

// LA COMPARACIÓN DE RELOJ DE PARED SE HA IDO DE AQUÍ. No se ha ablandado: se
// ha mudado a donde se puede medir.
//
// #65 dejó este bloque como mayoría de cinco paseos emparejados y declaró su
// residuo con honestidad: **con los cuatro núcleos saturados seguía cayendo 5
// de 12**. Y escribió cuál era el arreglo durable y de quién: sacar la
// comparación temporal a `scripts/cad-render-benchmark.mts`, que corre en
// condiciones controladas con su propia puerta, «y eso toca render-benchmark.ts
// y es del dueño de #62». Esto lo cierra.
//
// El diagnóstico de #65, que sigue siendo correcto y por eso se conserva
// escrito: el ruido de planificación es ABSOLUTO —una pausa de GC cuesta los
// mismos milisegundos a los dos caminos— pero el coste real no lo es. El nuevo
// ronda 5-7 ms por cuadro y el anterior 9, así que un hipo de 5 ms apenas mueve
// al anterior y DUPLICA al nuevo. Y el «p95» sobre ~8 cuadros ES el máximo, el
// estadístico más sensible al ruido que existe. Ninguna estadística arregla eso
// dentro de `run-specs.mjs`, que encadena 260 specs y nunca deja la máquina
// tranquila.
//
// Dónde vive ahora, y por qué ahí sí: `npm run benchmark:cad:render` es un paso
// propio de CI, en serie y en su propio proceso, que juzga contra los
// presupuestos ABSOLUTOS versionados de `benchmark/render-baseline.json` —con
// margen ×2,5 sobre la peor corrida de calibración y suelos por métrica— y
// publica la mediana de varias corridas. Medido: 0 fallos de 12 sin carga y 0
// de 12 con los cuatro núcleos saturados.
//
// La ADENDA que `main` añadió mientras esto se escribía es la pieza que faltaba,
// y va aquí porque su medida sobrevive aunque su cura se retire. Midiendo los
// dos caminos JUNTOS en cada ronda, sobre una máquina con contención:
//
//   nuevo/anterior:  10.368/10.229   8.933/8.571   9.795/8.191   5.735/7.915   8.023/8.124
//
// Los dos caminos miden LO MISMO dentro del ruido. Ésa es la conclusión que
// decide, y es más fuerte que cualquier estadístico: si la ventaja real es ~0,
// ninguna regla de recuento la salva —pedir tres victorias de cinco es pedir
// tres caras de cinco— y la mediana emparejada tampoco, porque con tolerancia
// ×1,25 sobre un empate lo que queda no es un gate sino un margen. Más rondas
// no arreglan una moneda; sólo la lanzan más veces, y aquí cuestan diez medidas
// de 25.000 entidades dentro del runner que encadena 260 specs.
//
// Un gate RELATIVO entre dos caminos que empatan no tiene señal que dar. El
// gate que sí la tiene es ABSOLUTO —cada camino contra su presupuesto
// versionado— y por eso vive en `benchmark:cad:render` y no aquí.
//
// Lo que se queda en este archivo es lo que NO puede parpadear: recuentos de
// entidades. «En reposo, detalladas == visibles» y «con el dibujo entero a la
// vista el anterior se queda en su techo» no dependen del reloj ni de la carga,
// y son las que cazan el regreso del muestreo — que es lo que este pipeline
// vino a arreglar.

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

// ---------------------------------------------------------------------------
// EDICIÓN DENSA: los invariantes que no dependen del reloj. Los tiempos de este
// arnés se publican en benchmark:cad:render (report-only hasta tener línea
// base); aquí se afirma lo que no puede parpadear: que las ediciones EVICTAN
// tiles de verdad, que ninguna entidad se pierde por el camino y que tras el
// paseo de MOVEs la fidelidad sigue siendo total.
// ---------------------------------------------------------------------------
const editing = measureCadDenseEditing(
  corpus.nativeEntities,
  corpus.document.modelSpace.entityIds,
  scenario.initial,
  { editBatches: 6, entitiesPerBatch: 5 },
);
assert.equal(editing.samplesMs.length, 6, "una muestra por lote de edición");
assert.ok(
  editing.samplesMs.every((sample) => sample >= 0),
  "las muestras de commit→asentado son tiempos",
);
assert.ok(
  editing.evictedTilesTotal >= 6,
  `cada lote debe liberar al menos un tile: ${editing.evictedTilesTotal} en 6 lotes`,
);
assert.equal(
  editing.totalEntitiesAfterEdits,
  ENTITIES,
  "un MOVE no da de baja nada: las entidades siguen todas",
);
assert.equal(
  editing.detailedAtRestAfterEdits,
  editing.visibleAtRestAfterEdits,
  "tras el paseo de ediciones la fidelidad sigue siendo total",
);
ok(
  true,
  `6 lotes de 5 MOVE liberan ${editing.evictedTilesTotal} tiles, conservan ${editing.totalEntitiesAfterEdits} entidades y dejan ${editing.detailedAtRestAfterEdits}/${editing.visibleAtRestAfterEdits} detalladas (commit→asentado p95 ${editing.commitToSettleP95Ms} ms, sólo informativo aquí)`,
);

console.log(
  `render-benchmark: ${checks} comprobaciones verdes — a ${ENTITIES} entidades con el dibujo entero a la vista el pipeline nuevo detalla ${fullNext.detailedAtRest} y el anterior ${fullLegacy.detailedAtRest}; los tiempos por cuadro los juzga benchmark:cad:render en su propio paso de CI; el montón crece ${leak.heapGrowthMb} MiB en tres ciclos. MEDIDA DE CPU EN NODE, no de cuadros de navegador ni de GPU.`,
);
