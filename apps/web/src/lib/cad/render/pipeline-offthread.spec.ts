/**
 * El pipeline con teselado FUERA de hilo: el camino que corre en el navegador.
 *
 * En Node no hay `Worker`, así que estas pruebas inyectan un teselador
 * asíncrono controlado a mano —mismo núcleo `tessellateCadEntityBatch` que usa
 * el worker de verdad— y ejercitan lo que sólo el camino asíncrono puede
 * romper: el completado fuera de orden, el asentado honesto mientras hay
 * peticiones en vuelo, el doble búfer de octava con la respuesta pendiente,
 * una edición que cruza una petición en vuelo, la reserva síncrona cuando el
 * teselador revienta y el dispose con trabajo volando.
 */
import assert from "node:assert/strict";
import {
  CadRenderPipeline,
  type CadOffThreadTessellator,
} from "./pipeline";
import { tessellateCadEntityBatch } from "./tessellate.worker";
import type { CadTessellateOffThreadResult } from "./tessellate-worker-client";
import {
  CadTessellationCache,
  tessellateCadEntity,
  type CadRenderLodTier,
  type CadTessellation,
} from "./tessellation-cache";
import { createCadBenchmarkCorpus } from "../benchmark/corpus";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Deja correr los `then` de las promesas ya resueltas. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

interface RecordedRequest {
  entities: CadNativeEntity[];
  segments: number[];
  resolve: (outcome: CadTessellateOffThreadResult) => void;
  reject: (reason: Error) => void;
}

/**
 * Teselador inyectable con resolución MANUAL: el test decide cuándo y en qué
 * orden llega cada respuesta, que es justo lo que el worker real no garantiza.
 */
function manualTessellator(): {
  offThread: CadOffThreadTessellator;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const offThread: CadOffThreadTessellator = (entities, segments) =>
    new Promise((resolve, reject) => {
      requests.push({ entities: [...entities], segments: [...segments], resolve, reject });
    });
  return { offThread, requests };
}

/** Responde una petición con el MISMO núcleo que usa el worker de verdad. */
function answer(request: RecordedRequest): void {
  request.resolve({
    results: tessellateCadEntityBatch(request.entities, request.segments).results,
    source: "worker",
  });
}

/**
 * Bucle de cuadros del consumidor asíncrono: corre cuadros y, cuando el
 * planificador se queda sin tareas pero hay peticiones en vuelo, responde una
 * en el orden pedido. `lifo` responde la ÚLTIMA primero: completado fuera de
 * orden a propósito.
 */
async function drive(
  pipeline: CadRenderPipeline,
  requests: RecordedRequest[],
  order: "fifo" | "lifo",
): Promise<number> {
  let answered = 0;
  let guard = 0;
  while (!pipeline.settled) {
    if (++guard > 200_000) throw new Error("el pipeline no asienta");
    const frame = pipeline.runFrame();
    if (frame.ran > 0) continue;
    if (requests.length > 0) {
      const request = order === "lifo" ? requests.pop()! : requests.shift()!;
      answer(request);
      answered += 1;
    }
    await flush();
  }
  return answered;
}

const ENTITIES = 2_000;
const corpus = createCadBenchmarkCorpus({ entities: ENTITIES });
const nativeEntities = corpus.nativeEntities;
const drawOrderIds = corpus.document.modelSpace.entityIds;

let minX = Number.POSITIVE_INFINITY;
let minY = Number.POSITIVE_INFINITY;
let maxX = Number.NEGATIVE_INFINITY;
let maxY = Number.NEGATIVE_INFINITY;
for (const entity of nativeEntities) {
  const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, corpus.document);
  minX = Math.min(minX, bounds.minX);
  minY = Math.min(minY, bounds.minY);
  maxX = Math.max(maxX, bounds.maxX);
  maxY = Math.max(maxY, bounds.maxY);
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Carga completa con respuestas FUERA DE ORDEN: converge, y en reposo las
  // detalladas son EXACTAMENTE las visibles — la misma propiedad que el camino
  // síncrono, ahora con el teselado llegando en el orden que le da la gana.
  // -------------------------------------------------------------------------
  {
    const { offThread, requests } = manualTessellator();
    const pipeline = new CadRenderPipeline({ offThread });
    pipeline.replace(nativeEntities, drawOrderIds);
    pipeline.setView({ bounds: { minX, minY, maxX, maxY }, pixelsPerUnit: 0.05 });

    // Mientras la primera petición vuela, la escena NO está asentada: es lo
    // que impide que el indicador (y los goldens) declaren listo un dibujo a
    // medias.
    while (requests.length === 0 && pipeline.runFrame().ran > 0) {
      /* hasta que el primer trozo pida teselado */
    }
    assert.ok(requests.length > 0, "el primer trozo pide teselado al worker");
    assert.equal(pipeline.settled, false, "con peticiones en vuelo no hay reposo");
    assert.ok(
      pipeline.stats().pendingTasks >= requests.length,
      "las peticiones en vuelo cuentan como trabajo pendiente",
    );
    ok(true, "una petición en vuelo mantiene la escena sin asentar y cuenta en pendingTasks");

    const answered = await drive(pipeline, requests, "lifo");
    const settled = pipeline.stats();
    assert.equal(settled.settled, true);
    assert.equal(
      settled.renderedEntities,
      settled.visibleEntities,
      `en reposo se detallan TODAS las visibles: ${settled.renderedEntities} de ${settled.visibleEntities}`,
    );
    assert.equal(settled.visibleEntities, ENTITIES);
    assert.ok(settled.instances > ENTITIES, "cada entidad aporta al menos un segmento");
    assert.ok(answered > 1, `hubo varias respuestas y llegaron al revés: ${answered}`);
    assert.equal(
      settled.tessellation,
      "worker",
      "las estadísticas declaran el origen del teselado, que es lo que el golden lee del DOM",
    );
    ok(
      true,
      `la carga asienta con ${answered} respuestas servidas en orden inverso y detalla ${settled.renderedEntities}/${settled.visibleEntities}`,
    );

    // -----------------------------------------------------------------------
    // DOBLE BÚFER + WORKER: al cruzar de octava, mientras las peticiones del
    // relevo están EN VUELO —ni siquiera respondidas—, la octava vieja sigue
    // sirviendo: cero huecos. Es el spec de cero huecos del camino síncrono,
    // endurecido con la espera asíncrona en medio.
    // -----------------------------------------------------------------------
    const zoomUpdate = pipeline.setView({
      bounds: { minX, minY, maxX, maxY },
      pixelsPerUnit: 3.2,
    });
    assert.equal(zoomUpdate.lodChanged, true, "cruzar octavas cambia el LOD");
    // Vaciar el planificador SIN responder nada: todo el relevo queda en vuelo.
    while (pipeline.runFrame().ran > 0) {
      /* hasta dejar sólo peticiones en vuelo */
    }
    assert.ok(requests.length > 0, "el relevo de octava pide teselado");
    const midReplan = pipeline.stats();
    assert.equal(midReplan.settled, false);
    assert.equal(
      midReplan.renderedEntities,
      midReplan.visibleEntities,
      `DURANTE la espera del worker la octava vieja sigue sirviendo: cero huecos (${midReplan.renderedEntities}/${midReplan.visibleEntities})`,
    );
    assert.ok(
      pipeline.visibleBatches().length > 0,
      "y los lotes visibles no desaparecen mientras el teselado del relevo está en vuelo",
    );
    ok(true, "cero huecos durante el replan de octava incluso con todo el teselado en vuelo");

    await drive(pipeline, requests, "lifo");
    const zoomed = pipeline.stats();
    assert.equal(zoomed.renderedEntities, zoomed.visibleEntities, "tras el zoom siguen todas");
    ok(true, "el relevo asincrónico completa la octava nueva sin perder entidades");

    pipeline.dispose();
    assert.equal(requests.length, 0, "no quedan peticiones sin responder al final");
  }

  // -------------------------------------------------------------------------
  // Una EDICIÓN que cruza una petición en vuelo no resucita geometría vieja:
  // la respuesta pedida antes de la edición se descarta entera y el tile pide
  // de nuevo con la entidad nueva.
  // -------------------------------------------------------------------------
  {
    const lines: CadNativeEntity[] = [
      { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0" },
      { id: "b", type: "line", start: { x: 0, y: 50, z: 0 }, end: { x: 100, y: 50, z: 0 }, layer: "0" },
      { id: "c", type: "line", start: { x: 0, y: 90, z: 0 }, end: { x: 100, y: 90, z: 0 }, layer: "0" },
    ] as CadNativeEntity[];
    const cache = new CadTessellationCache();
    const { offThread, requests } = manualTessellator();
    const pipeline = new CadRenderPipeline({ offThread, cache });
    pipeline.replace(lines, ["a", "b", "c"]);
    pipeline.setView({ bounds: { minX: -10, minY: -10, maxX: 110, maxY: 100 }, pixelsPerUnit: 1 });
    while (requests.length === 0 && pipeline.runFrame().ran > 0) {
      /* hasta poner la petición en vuelo */
    }
    assert.ok(requests.length >= 1, "el teselado de las líneas viaja al worker");
    const stale = requests.splice(0);

    // La edición llega ANTES de la respuesta: `b` se mueve.
    const moved: CadNativeEntity = {
      id: "b",
      type: "line",
      start: { x: 0, y: 60, z: 0 },
      end: { x: 100, y: 60, z: 0 },
      layer: "0",
    } as CadNativeEntity;
    pipeline.invalidate(["b"], [moved]);

    // Ahora sí llegan las respuestas VIEJAS, con la `b` de antes de moverse.
    for (const request of stale) answer(request);
    await flush();
    const answeredLate = await drive(pipeline, requests, "fifo");
    assert.ok(answeredLate >= 1, "el tile pide un lote fresco tras descartar el viejo");
    const final = pipeline.stats();
    assert.equal(final.renderedEntities, final.visibleEntities);

    // La caché tiene que contener la geometría MOVIDA, no la de la respuesta
    // vieja. Se mira en la caché inyectada, que es donde la siembra viviría.
    let cached: CadTessellation | null = null;
    for (const tier of [0, 1, 2] as CadRenderLodTier[]) {
      cached = cache.peek("b", tier);
      if (cached) break;
    }
    assert.ok(cached, "la entidad editada tiene teselado en caché");
    const expected = tessellateCadEntity(moved, 8);
    assert.deepEqual(
      [...cached!.paths[0].xy],
      [...expected.paths[0].xy],
      "el teselado en caché es el de DESPUÉS de la edición",
    );
    ok(true, "una respuesta pedida antes de una edición se descarta y no resucita la geometría vieja");
    pipeline.dispose();
  }

  // -------------------------------------------------------------------------
  // El teselador revienta: reserva síncrona LIMPIA. El pipeline renuncia al
  // worker y termina el dibujo entero por el camino de siempre.
  // -------------------------------------------------------------------------
  {
    let failures = 0;
    const broken: CadOffThreadTessellator = () => {
      failures += 1;
      return Promise.reject(new Error("worker roto a propósito"));
    };
    const pipeline = new CadRenderPipeline({ offThread: broken });
    pipeline.replace(nativeEntities, drawOrderIds);
    pipeline.setView({ bounds: { minX, minY, maxX, maxY }, pixelsPerUnit: 0.05 });
    let guard = 0;
    while (!pipeline.settled) {
      if (++guard > 200_000) throw new Error("la reserva no asienta");
      if (pipeline.runFrame().ran === 0) await flush();
    }
    const rescued = pipeline.stats();
    assert.equal(rescued.renderedEntities, rescued.visibleEntities);
    assert.equal(rescued.visibleEntities, ENTITIES);
    // Varios tiles pueden pedir en el mismo cuadro antes de que el primer
    // rechazo se procese; lo que se afirma es que la renuncia OCURRE y que el
    // dibujo termina entero sin worker.
    assert.ok(failures >= 1, "el teselador roto llegó a llamarse");
    const failuresAtSettle = failures;
    pipeline.setView({ bounds: { minX, minY, maxX, maxY }, pixelsPerUnit: 0.2 });
    pipeline.settle();
    assert.equal(failures, failuresAtSettle, "tras renunciar, no se vuelve a intentar el worker");
    ok(
      true,
      `con el teselador roto (${failuresAtSettle} fallos) la reserva síncrona detalla ${rescued.renderedEntities}/${rescued.visibleEntities} y no reintenta`,
    );
    pipeline.dispose();
  }

  // -------------------------------------------------------------------------
  // Dispose con peticiones EN VUELO: nada pendiente, nada resucita cuando la
  // respuesta llega tarde. Es la mitad asíncrona de la prueba de fuga.
  // -------------------------------------------------------------------------
  {
    const { offThread, requests } = manualTessellator();
    const pipeline = new CadRenderPipeline({ offThread });
    pipeline.replace(nativeEntities, drawOrderIds);
    pipeline.setView({ bounds: { minX, minY, maxX, maxY }, pixelsPerUnit: 0.05 });
    while (requests.length === 0 && pipeline.runFrame().ran > 0) {
      /* hasta poner peticiones en vuelo */
    }
    assert.ok(requests.length > 0);
    pipeline.dispose();
    assert.equal(pipeline.settled, true, "dispose no deja trabajo pendiente fantasma");
    // La respuesta llega DESPUÉS del dispose y no debe reconstruir nada.
    for (const request of requests.splice(0)) answer(request);
    await flush();
    const disposed = pipeline.stats();
    assert.equal(disposed.totalEntities, 0);
    assert.equal(disposed.residentTiles, 0);
    assert.equal(disposed.pendingTasks, 0);
    assert.equal(disposed.cache.points, 0);
    ok(true, "una respuesta que llega tras dispose() no resucita tiles ni deja pendientes");
  }

  console.log(
    `pipeline-offthread: ${checks} comprobaciones verdes — la carga asienta con respuestas fuera de orden, el replan de octava no muestra huecos con el teselado en vuelo, una edición en vuelo no resucita geometría vieja, la reserva síncrona rescata al worker roto y dispose() no deja fantasmas.`,
  );
}

void main();
