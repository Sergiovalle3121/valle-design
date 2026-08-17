/**
 * Las operaciones que un arquitecto hace TODO EL DÍA, medidas por separado.
 *
 * ## Qué problema resuelve este módulo
 *
 * El benchmark de render publica `firstDetailMs` y un p95 de cuadro al panear.
 * Son buenas cifras y no bastan: describen la APERTURA de un dibujo y el paseo
 * por él. Un arquitecto abre el archivo una vez por la mañana y luego pasa ocho
 * horas seleccionando, enganchando a puntos notables y moviendo cosas. Ninguna
 * de esas tres operaciones tenía número.
 *
 * Aquí se miden las cinco que componen el día real:
 *
 * 1. **Apertura** hasta el primer detalle completo.
 * 2. **Paneo** y **zoom**, cuadro a cuadro.
 * 3. **Selección por ventana y por captura** (window / crossing).
 * 4. **OSNAP**: la consulta de puntos notables bajo el cursor.
 * 5. **Edición que invalida geometría**: mover y borrar un grupo.
 *
 * ## Por qué percentiles y no medias
 *
 * Una media esconde exactamente lo que duele. El coste de estas operaciones es
 * de cola larga —un hatch caro, un tile que toca reconstruir, una pausa del
 * recolector— y la media la promedia hasta hacerla desaparecer. Lo que el
 * usuario nota es el p95: uno de cada veinte gestos. Todas las muestras viajan
 * en la evidencia para que los percentiles no sean una caja negra.
 *
 * ## Por qué la edición usa lo que devolvió la selección
 *
 * `measureCadDenseEditing` reparte las ediciones a paso fijo por todo el
 * documento, que es correcto para medir invalidación repartida. Pero no es lo
 * que hace una persona: una persona encierra una habitación en una ventana y
 * mueve LO QUE SALIÓ. Esos ids están agrupados en el espacio, comparten tiles y
 * comparten vecindad, así que el trabajo de invalidación es de otra forma. Aquí
 * la edición se alimenta de la selección justamente por eso.
 *
 * ## Lo que este módulo NO mide, dicho aquí y repetido en la evidencia
 *
 * Es trabajo de CPU en Node. No hay navegador, ni GPU, ni composición, ni
 * cuadros por segundo, ni red, ni API. El rasterizado de glifos tampoco: en
 * Node no hay `<canvas>`, así que del texto se mide la petición de quads y no
 * el dibujado. Decir «pantalla» desde aquí sería inventárselo.
 */
import { performance } from "node:perf_hooks";
import type { CadDocument } from "../cad-document";
import {
  CAD_ENTITY_REGISTRY,
  type CadBounds,
  type CadNativeEntity,
} from "../entity-runtime";
import { CadNativeSelectionIndex } from "../native-selection-index";
import { snap, type SnapScene } from "../snap-engine";
import { CadRenderPipeline, type CadRenderView } from "../render/pipeline";
import { cadPercentile, cadRound3, type CadRenderScenario } from "./scenario";

/** Resumen de una muestra: los dos percentiles que se publican, y el peor. */
export interface CadPlanLatency {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  samples: number;
  /** Todas las muestras, redondeadas. Sin esto los percentiles no se auditan. */
  samplesMs: number[];
}

function latency(samples: readonly number[]): CadPlanLatency {
  return {
    p50Ms: cadPercentile(samples, 0.5),
    p95Ms: cadPercentile(samples, 0.95),
    maxMs: samples.length > 0 ? cadRound3(Math.max(...samples)) : 0,
    samples: samples.length,
    samplesMs: samples.map(cadRound3),
  };
}

// ---------------------------------------------------------------------------
// 1 y 2 · Apertura, paneo y zoom
// ---------------------------------------------------------------------------

export interface CadPlanViewportMeasurement {
  /** Apertura: reloj de pared hasta que la vista inicial está detallada. */
  openMs: number;
  framesToOpen: number;
  /** Trabajo de CPU por cuadro durante el paseo. */
  pan: CadPlanLatency;
  /** Ídem durante el zoom. */
  zoom: CadPlanLatency;
  /** Reloj de pared del zoom completo, de gesto a escena asentada. */
  zoomSettleMs: number;
  visibleAtRest: number;
  detailedAtRest: number;
  segmentsAtRest: number;
}

/**
 * Recorre el guion compartido con el pipeline de producción.
 *
 * Mismo bucle que `measureCadNextPipeline` a propósito —`while` en la apertura,
 * `do/while` en cada parada para que toda parada aporte al menos una muestra—
 * porque cambiar la forma del bucle cambiaría los números y dejarían de ser
 * comparables con la evidencia ya publicada. Lo único que cambia es que aquí se
 * guardan TODAS las muestras, para poder publicar p50 además de p95.
 */
export function measureCadPlanViewport(
  entities: readonly CadNativeEntity[],
  drawOrderIds: readonly string[],
  scenario: CadRenderScenario,
  document?: CadDocument,
): CadPlanViewportMeasurement {
  const pipeline = new CadRenderPipeline({ document });
  pipeline.replace(entities, drawOrderIds, document);

  const openStarted = performance.now();
  pipeline.setView(scenario.initial);
  let framesToOpen = 0;
  while (!pipeline.settled) {
    pipeline.runFrame();
    framesToOpen += 1;
  }
  const openMs = cadRound3(performance.now() - openStarted);

  const panFrames: number[] = [];
  for (const stop of scenario.pan) {
    pipeline.setView(stop);
    do {
      const started = performance.now();
      pipeline.runFrame();
      panFrames.push(performance.now() - started);
    } while (!pipeline.settled);
  }

  const zoomFrames: number[] = [];
  const zoomStarted = performance.now();
  pipeline.setView(scenario.zoom);
  do {
    const started = performance.now();
    pipeline.runFrame();
    zoomFrames.push(performance.now() - started);
  } while (!pipeline.settled);
  const zoomSettleMs = cadRound3(performance.now() - zoomStarted);

  // `stats()` es O(visibles): se llama UNA vez y fuera de los bucles.
  const stats = pipeline.stats();
  const measurement: CadPlanViewportMeasurement = {
    openMs,
    framesToOpen,
    pan: latency(panFrames),
    zoom: latency(zoomFrames),
    zoomSettleMs,
    visibleAtRest: stats.visibleEntities,
    detailedAtRest: stats.renderedEntities,
    segmentsAtRest: stats.instances,
  };
  pipeline.dispose();
  return measurement;
}

// ---------------------------------------------------------------------------
// 3 · Selección por ventana y por captura
// ---------------------------------------------------------------------------

export interface CadPlanSelectionMeasurement {
  /** `window` exige dentro entero; `crossing` basta con tocar. */
  mode: "window" | "crossing";
  latency: CadPlanLatency;
  /** Cuántas entidades devolvió cada consulta: mediana y máximo. */
  hitsP50: number;
  hitsMax: number;
  hitsTotal: number;
  /** Lado de la ventana en unidades de dibujo (mm). Ver el comentario. */
  windowSideMm: number;
}

/**
 * Construye el índice de selección de PRODUCCIÓN sobre el corpus.
 *
 * El tamaño de celda se toma del `cellSize` de la mezcla y no del 100 por
 * defecto de la clase. No es cosmético: con celdas de 100 sobre un dibujo cuya
 * trama son 700, cada entidad se registra en decenas de celdas y las que se
 * pasan del tope acaban en el conjunto de desbordamiento, que se recorre en
 * CADA consulta. Medir eso sería medir una mala configuración, no el motor.
 */
export function createCadPlanSelectionIndex(
  entities: readonly CadNativeEntity[],
  cellSize: number,
  document?: CadDocument,
): CadNativeSelectionIndex {
  const index = new CadNativeSelectionIndex(cellSize);
  // El documento es OBLIGATORIO aquí: la caja de un INSERT se obtiene
  // expandiendo su definición de bloque, y sin documento cada uno de los 2.800
  // inserts degeneraría a una caja de reserva alrededor del punto de inserción.
  // El índice quedaría mal poblado y los tiempos no significarían nada.
  index.replace(entities, document);
  return index;
}

/**
 * Ventanas del tamaño de una HABITACIÓN, paseadas por el dibujo.
 *
 * Una selección real no encierra el plano entero ni un punto: encierra una
 * estancia. El lado se fija en tres celdas de la trama —unos 2,1 m con el
 * `cellSize` de esta mezcla— que es el orden de una recámara, y las ventanas se
 * reparten por toda la extensión con un paso primo para no caer siempre sobre
 * la misma columna de celdas y acabar midiendo un solo vecindario.
 */
export function createCadPlanSelectionWindows(
  bounds: CadBounds,
  cellSize: number,
  count: number,
): CadBounds[] {
  const side = cellSize * 3;
  const spanX = Math.max(bounds.maxX - bounds.minX - side, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY - side, 1);
  const windows: CadBounds[] = [];
  for (let query = 0; query < count; query += 1) {
    const minX = bounds.minX + (spanX * ((query * 97) % count)) / count;
    const minY = bounds.minY + (spanY * ((query * 31) % count)) / count;
    windows.push({ minX, minY, maxX: minX + side, maxY: minY + side });
  }
  return windows;
}

export function measureCadPlanSelection(
  index: CadNativeSelectionIndex,
  windows: readonly CadBounds[],
  mode: "window" | "crossing",
  cellSize: number,
): CadPlanSelectionMeasurement {
  const samples: number[] = [];
  const hits: number[] = [];
  for (const window of windows) {
    const started = performance.now();
    // Sin tope: el 300 por defecto TRUNCA, y una consulta truncada mide el
    // tope, no el dibujo. Se paga el recuento real y se publica al lado.
    const found = index.intersecting(
      window,
      mode === "crossing",
      Number.POSITIVE_INFINITY,
    );
    samples.push(performance.now() - started);
    hits.push(found.length);
  }
  return {
    mode,
    latency: latency(samples),
    hitsP50: Math.round(cadPercentile(hits, 0.5)),
    hitsMax: hits.length > 0 ? Math.max(...hits) : 0,
    hitsTotal: hits.reduce((sum, count) => sum + count, 0),
    windowSideMm: cadRound3(cellSize * 3),
  };
}

// ---------------------------------------------------------------------------
// 4 · OSNAP
// ---------------------------------------------------------------------------

export interface CadPlanSnapMeasurement {
  latency: CadPlanLatency;
  /** Apertura de enganche en unidades de dibujo. Ver de dónde sale. */
  apertureMm: number;
  /** Consultas que encontraron un punto notable. Cero sería no medir nada. */
  resolved: number;
  queries: number;
  /** Reparto de los tipos de enganche que ganaron. */
  byType: Record<string, number>;
}

/**
 * OSNAP compuesto igual que lo compone el editor.
 *
 * No hay una función «dame los enganches cerca del cursor»: el editor consulta
 * el índice, arma una `SnapScene` con los trazos y los puntos notables de los
 * candidatos, y se la pasa al resolutor. Se reproduce ese encadenado exacto
 * —es el mismo que ya usa `professional-snap-query-benchmark.spec.ts`— porque
 * medir sólo el resolutor mediría la parte barata.
 *
 * La apertura se DERIVA del zoom de trabajo: 12 píxeles de tolerancia divididos
 * por los píxeles por unidad de la vista. Una apertura fija en milímetros sería
 * un número inventado que además cambia de significado con cada zoom.
 */
export function measureCadPlanSnap(
  index: CadNativeSelectionIndex,
  cursors: readonly { x: number; y: number }[],
  apertureMm: number,
  document?: CadDocument,
): CadPlanSnapMeasurement {
  const samples: number[] = [];
  const byType: Record<string, number> = {};
  let resolved = 0;
  for (const cursor of cursors) {
    const started = performance.now();
    // La caja de candidatos es mayor que la apertura a propósito: perpendicular
    // y tangente se calculan contra segmentos que NO pasan por debajo del
    // cursor, así que acotarla a la apertura los dejaría fuera y el enganche
    // saldría más barato de lo que es.
    const candidates = index.search(
      {
        minX: cursor.x - apertureMm * 4,
        minY: cursor.y - apertureMm * 4,
        maxX: cursor.x + apertureMm * 4,
        maxY: cursor.y + apertureMm * 4,
      },
      48,
    );
    const scene: SnapScene = {
      segments: [],
      endpoints: [],
      centers: [],
      quadrants: [],
      tangents: [],
    };
    for (const entity of candidates) {
      const adapter = CAD_ENTITY_REGISTRY.adapter(entity);
      // 24 segmentos por curva: el escalón que el editor usa para el enganche,
      // más bajo que el de dibujo porque un enganche no necesita la curva fina.
      for (const path of adapter.renderer.paths(entity, 24, document)) {
        for (let point = 1; point < path.points.length; point += 1)
          scene.segments!.push({
            a: path.points[point - 1],
            b: path.points[point],
          });
      }
      for (const candidate of adapter.snaps.snaps(entity, cursor)) {
        if (candidate.kind === "center") scene.centers!.push(candidate.point);
        else if (candidate.kind === "quadrant")
          scene.quadrants!.push(candidate.point);
        else if (candidate.kind === "tangent")
          scene.tangents!.push(candidate.point);
        else scene.endpoints!.push(candidate.point);
      }
    }
    const result = snap(cursor, scene, {
      tolerance: apertureMm,
      maxSegments: 96,
      from: { x: cursor.x - apertureMm * 8, y: cursor.y },
    });
    samples.push(performance.now() - started);
    if (result) {
      resolved += 1;
      byType[result.type] = (byType[result.type] ?? 0) + 1;
    }
  }
  return {
    latency: latency(samples),
    apertureMm: cadRound3(apertureMm),
    resolved,
    queries: cursors.length,
    byType,
  };
}

// ---------------------------------------------------------------------------
// 5 · Edición que invalida geometría
// ---------------------------------------------------------------------------

export interface CadPlanEditMeasurement {
  /** `move` reemplaza la geometría; `delete` la quita del documento. */
  operation: "move" | "delete";
  groups: number;
  entitiesPerGroupP50: number;
  entitiesTotal: number;
  /** commit→escena asentada: lo que tarda el dibujo en volver a estar bien. */
  commitToSettle: CadPlanLatency;
  /** Coste del PRIMER cuadro tras el commit: lo que nota el ratón. */
  firstFrame: CadPlanLatency;
  /** Tiles liberados. Cero significaría que la edición no invalidó nada. */
  evictedTilesTotal: number;
  detailedAtRestAfterEdits: number;
  visibleAtRestAfterEdits: number;
  totalEntitiesAfterEdits: number;
}

/**
 * Traslada CUALQUIER tipo de entidad delegando en el adaptador del registro.
 *
 * Es deliberadamente distinto del `translateCadEntity` privado del benchmark de
 * render, que sólo sabe mover líneas, círculos, arcos y polilíneas porque el
 * corpus de 100.000 no tiene más. Aquí el 30 % del dibujo son cotas, hatches,
 * rótulos e inserts: con aquel traductor se saltarían en silencio y la medida
 * diría «moví un grupo» habiendo movido sólo la mitad barata del grupo.
 */
function translateCadPlanEntity(
  entity: CadNativeEntity,
  dx: number,
  dy: number,
): CadNativeEntity {
  return CAD_ENTITY_REGISTRY.adapter(entity).commands.transform(entity, {
    translation: { x: dx, y: dy },
  });
}

/**
 * Mueve o borra los grupos que devolvió una selección por ventana.
 *
 * Los ids no se eligen a paso fijo por el documento: son EXACTAMENTE los que
 * salieron de encerrar una habitación. Están juntos en el espacio, comparten
 * tiles y comparten vecindad, y por eso su invalidación tiene una forma
 * distinta —y más realista— que la de un reparto uniforme.
 *
 * El empujón del MOVE es una fracción pequeña de la celda y alterna de signo:
 * un MOVE fino que casi nunca cambia de tile, que es el gesto de verdad. Un
 * salto grande mediría la migración entre tiles, que es otra cosa.
 */
export function measureCadPlanEdit(
  entities: readonly CadNativeEntity[],
  drawOrderIds: readonly string[],
  view: CadRenderView,
  groups: readonly (readonly string[])[],
  operation: "move" | "delete",
  cellSize: number,
  document?: CadDocument,
): CadPlanEditMeasurement {
  const pipeline = new CadRenderPipeline({ document });
  pipeline.replace(entities, drawOrderIds, document);
  pipeline.setView(view);
  pipeline.settle();

  const current = new Map(entities.map((entity) => [entity.id, entity] as const));
  const commitSamples: number[] = [];
  const firstFrames: number[] = [];
  const groupSizes: number[] = [];
  let evictedTilesTotal = 0;
  let entitiesTotal = 0;

  for (let group = 0; group < groups.length; group += 1) {
    const affected: string[] = [];
    const upserts: CadNativeEntity[] = [];
    const direction = group % 2 === 0 ? 1 : -1;
    for (const id of groups[group]) {
      const entity = current.get(id);
      if (!entity) continue;
      affected.push(id);
      if (operation === "move") {
        const moved = translateCadPlanEntity(
          entity,
          (direction * cellSize) / 20,
          (direction * cellSize) / 20,
        );
        upserts.push(moved);
        current.set(id, moved);
      } else {
        // BORRAR es invalidar sin reposición: el contrato de `invalidate` dice
        // que un id afectado que no viene en `upserts` se trata como baja.
        current.delete(id);
      }
    }
    if (affected.length === 0) continue;
    groupSizes.push(affected.length);
    entitiesTotal += affected.length;

    const commitStarted = performance.now();
    evictedTilesTotal += pipeline.invalidate(affected, upserts, document);
    let frames = 0;
    while (!pipeline.settled) {
      const frameStarted = performance.now();
      pipeline.runFrame();
      if (frames === 0) firstFrames.push(performance.now() - frameStarted);
      frames += 1;
    }
    commitSamples.push(performance.now() - commitStarted);
  }

  const stats = pipeline.stats();
  const measurement: CadPlanEditMeasurement = {
    operation,
    groups: groupSizes.length,
    entitiesPerGroupP50: Math.round(cadPercentile(groupSizes, 0.5)),
    entitiesTotal,
    commitToSettle: latency(commitSamples),
    firstFrame: latency(firstFrames),
    evictedTilesTotal,
    detailedAtRestAfterEdits: stats.renderedEntities,
    visibleAtRestAfterEdits: stats.visibleEntities,
    totalEntitiesAfterEdits: stats.totalEntities,
  };
  pipeline.dispose();
  return measurement;
}
