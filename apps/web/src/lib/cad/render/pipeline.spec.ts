import assert from "node:assert/strict";
import { CadRenderPipeline, cadRenderZoomOctave } from "./pipeline";
import { CadTessellationCache } from "./tessellation-cache";
import { createCadBenchmarkCorpus } from "../benchmark/corpus";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import { planCadNativeRenderBudget } from "../native-render-budget";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const ENTITIES = 20_000;
const corpus = createCadBenchmarkCorpus({ entities: ENTITIES });
const nativeEntities = corpus.nativeEntities;
const drawOrderIds = corpus.document.modelSpace.entityIds;

function boundsOf(entity: CadNativeEntity) {
  return CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, corpus.document);
}

// Extensión real del corpus, para encuadrar vistas con sentido.
let minX = Number.POSITIVE_INFINITY;
let minY = Number.POSITIVE_INFINITY;
let maxX = Number.NEGATIVE_INFINITY;
let maxY = Number.NEGATIVE_INFINITY;
for (const entity of nativeEntities) {
  const bounds = boundsOf(entity);
  minX = Math.min(minX, bounds.minX);
  minY = Math.min(minY, bounds.minY);
  maxX = Math.max(maxX, bounds.maxX);
  maxY = Math.max(maxY, bounds.maxY);
}

// ---------------------------------------------------------------------------
// Octava del zoom: cuantizar es lo que impide que cada muesca de rueda
// invalide la escena entera.
// ---------------------------------------------------------------------------
assert.equal(cadRenderZoomOctave(1), 0);
assert.equal(cadRenderZoomOctave(2), 1);
assert.equal(cadRenderZoomOctave(1.2), 0, "un zoom del 20 % no cambia de octava");
assert.equal(cadRenderZoomOctave(0.25), -2);
assert.equal(cadRenderZoomOctave(0), 0, "un zoom no positivo no revienta");
ok(true, "cadRenderZoomOctave cuantiza a potencias de dos con anclas comprobadas");

// ---------------------------------------------------------------------------
// LA PRUEBA QUE JUSTIFICA EL PR: en reposo, las entidades detalladas son
// EXACTAMENTE las visibles. El pipeline anterior muestreaba, y esta comparación
// lo deja por escrito con la función vieja al lado.
// ---------------------------------------------------------------------------
const pipeline = new CadRenderPipeline();
pipeline.replace(nativeEntities, drawOrderIds);
assert.equal(pipeline.stats().totalEntities, ENTITIES);

const fullView = {
  bounds: { minX, minY, maxX, maxY },
  pixelsPerUnit: 0.05,
};
pipeline.setView(fullView);
const framesToSettle = pipeline.settle();
const settled = pipeline.stats();
assert.equal(settled.settled, true, "la escena tiene que asentarse");
assert.equal(
  settled.renderedEntities,
  settled.visibleEntities,
  `en reposo se detallan TODAS las visibles: ${settled.renderedEntities} de ${settled.visibleEntities}`,
);
assert.equal(settled.visibleEntities, ENTITIES, "la vista completa ve el documento entero");
assert.ok(settled.instances > ENTITIES, "cada entidad aporta al menos un segmento");

// El camino anterior, para el mismo encuadre y con la misma entrada.
const legacyPlan = planCadNativeRenderBudget(nativeEntities, [], undefined, {
  visibleEntities: nativeEntities,
});
assert.ok(
  legacyPlan.rendered < settled.renderedEntities,
  `el plan anterior detallaba ${legacyPlan.rendered} de ${legacyPlan.visible} visibles; el nuevo detalla ${settled.renderedEntities}`,
);
assert.equal(legacyPlan.limited, true, "y lo declaraba como recortado");
ok(
  true,
  `en reposo el pipeline detalla ${settled.renderedEntities}/${settled.visibleEntities} visibles en ${framesToSettle} cuadros; planCadNativeRenderBudget detallaba ${legacyPlan.rendered}`,
);

// Y una vista parcial detalla exactamente las de esa vista, ni una más.
const quarter = {
  bounds: {
    minX,
    minY,
    maxX: minX + (maxX - minX) / 4,
    maxY: minY + (maxY - minY) / 4,
  },
  pixelsPerUnit: 0.2,
};
pipeline.setView(quarter);
pipeline.settle();
const quarterStats = pipeline.stats();
assert.equal(quarterStats.renderedEntities, quarterStats.visibleEntities);
assert.ok(
  quarterStats.visibleEntities > 0 && quarterStats.visibleEntities < ENTITIES,
  `un cuarto de la vista debe ver una parte: ${quarterStats.visibleEntities}`,
);
ok(true, `una vista parcial detalla ${quarterStats.renderedEntities} y ve ${quarterStats.visibleEntities}: idénticos`);

// ---------------------------------------------------------------------------
// PANEAR ES AÑADIR Y QUITAR TILES, NO RECONSTRUIR LA ESCENA.
// ---------------------------------------------------------------------------
// La ventana se mide en TILES para que la prueba diga algo: una vista más
// pequeña que un tile haría que panear no cambiase nunca de conjunto y la
// comprobación pasaría de forma vacía.
const tileSize = pipeline.tileSize;
assert.ok(tileSize > 0 && (maxX - minX) / tileSize >= 6, `el corpus debe cubrir varios tiles: ${(maxX - minX) / tileSize}`);
const viewSpan = tileSize * 4;
const panBase = {
  bounds: {
    minX: minX + tileSize,
    minY: minY + tileSize,
    maxX: minX + tileSize + viewSpan,
    maxY: minY + tileSize + viewSpan,
  },
  pixelsPerUnit: 0.2,
};
pipeline.setView(panBase);
pipeline.settle();
const beforePan = pipeline.stats();
assert.ok(beforePan.visibleTiles >= 16, `la vista debe abarcar muchos tiles: ${beforePan.visibleTiles}`);
// Un paneo de un tile completo: el caso EXIGENTE, no uno subpíxel.
const step = tileSize;
const panUpdate = pipeline.setView({
  bounds: {
    minX: panBase.bounds.minX + step,
    minY: panBase.bounds.minY,
    maxX: panBase.bounds.maxX + step,
    maxY: panBase.bounds.maxY,
  },
  pixelsPerUnit: 0.2,
});
assert.equal(panUpdate.lodChanged, false, "un paneo puro no cambia de octava");
assert.ok(panUpdate.addedTiles > 0, "panear un tile entero SÍ trae tiles nuevos");
assert.ok(
  panUpdate.retainedTiles > panUpdate.addedTiles * 2,
  `panear un tile debe conservar el grueso de la escena: +${panUpdate.addedTiles} -${panUpdate.removedTiles} =${panUpdate.retainedTiles}`,
);
assert.equal(
  pipeline.stats().pendingTasks,
  panUpdate.addedTiles,
  "se encola EXACTAMENTE el trabajo de los tiles nuevos, ni uno más",
);
pipeline.settle();
const afterPan = pipeline.stats();
assert.equal(afterPan.renderedEntities, afterPan.visibleEntities);
ok(
  true,
  `panear un tile conserva ${panUpdate.retainedTiles} tiles, añade ${panUpdate.addedTiles} y quita ${panUpdate.removedTiles}; sólo se encolan los ${panUpdate.addedTiles} nuevos`,
);

// Un paneo que NO cambia de tiles no encola nada en absoluto.
const microUpdate = pipeline.setView({
  bounds: {
    minX: panBase.bounds.minX + step + 0.0001,
    minY: panBase.bounds.minY,
    maxX: panBase.bounds.maxX + step + 0.0001,
    maxY: panBase.bounds.maxY,
  },
  pixelsPerUnit: 0.2,
});
assert.equal(microUpdate.addedTiles, 0);
assert.equal(microUpdate.removedTiles, 0);
assert.equal(pipeline.stats().pendingTasks, 0, "un paneo subpíxel no reconstruye NADA");
ok(true, "un paneo que no cambia el conjunto de tiles no genera trabajo");

// ---------------------------------------------------------------------------
// Zoom: cambiar de octava reconstruye, y lo hace apoyándose en la caché.
// ---------------------------------------------------------------------------
const zoomUpdate = pipeline.setView({ bounds: panBase.bounds, pixelsPerUnit: 3.2 });
assert.equal(zoomUpdate.lodChanged, true, "cruzar octavas cambia el LOD");
pipeline.settle();
const zoomed = pipeline.stats();
assert.equal(zoomed.renderedEntities, zoomed.visibleEntities, "tras el zoom siguen estando todas");
// Volver a la octava anterior debe acertar en la caché: el teselado ya existe.
const missesBeforeReturn = pipeline.stats().cache.misses;
pipeline.setView({ bounds: panBase.bounds, pixelsPerUnit: 0.2 });
pipeline.settle();
const missesAfterReturn = pipeline.stats().cache.misses;
assert.ok(
  missesAfterReturn - missesBeforeReturn < zoomed.visibleEntities,
  `volver al zoom anterior debe reutilizar teselado: ${missesAfterReturn - missesBeforeReturn} fallos nuevos para ${zoomed.visibleEntities} entidades`,
);
ok(true, `hacer zoom y volver reutiliza teselado: sólo ${missesAfterReturn - missesBeforeReturn} fallos de caché nuevos`);

// ---------------------------------------------------------------------------
// Invalidación por affectedEntityIds: se rehace lo tocado y sólo lo tocado.
// ---------------------------------------------------------------------------
pipeline.setView(quarter);
pipeline.settle();
const target = pipeline.renderedEntityIds()[0];
const original = nativeEntities.find((entity) => entity.id === target)!;
const cacheBefore = pipeline.stats().cache.entries;
const evicted = pipeline.invalidate([target], [original]);
assert.equal(evicted, 1, "sólo se libera el tile que contenía la entidad tocada");
assert.ok(
  pipeline.stats().cache.entries < cacheBefore,
  "y su teselado sale de la caché",
);
assert.ok(pipeline.stats().pendingTasks > 0, "el tile liberado vuelve a la cola");
pipeline.settle();
assert.equal(
  pipeline.stats().renderedEntities,
  pipeline.stats().visibleEntities,
  "tras reconstruir siguen estando todas",
);
ok(true, "invalidate(affectedEntityIds) libera un solo tile y lo reconstruye con presupuesto");

// Una baja desaparece del culling y del detalle.
const removedId = pipeline.renderedEntityIds()[0];
pipeline.invalidate([removedId]);
pipeline.settle();
assert.ok(
  !pipeline.renderedEntityIds().includes(removedId),
  "una entidad dada de baja deja de dibujarse",
);
assert.equal(pipeline.stats().totalEntities, ENTITIES - 1);
ok(true, "una baja sale del índice, del detalle y del total");

// ---------------------------------------------------------------------------
// La memoria no crece paseando: los tiles que salen de la vista se liberan y la
// caché tiene tope. Es la propiedad que la prueba de fuga persigue.
// ---------------------------------------------------------------------------
const walker = new CadRenderPipeline({
  cache: new CadTessellationCache({ maxPoints: 200_000, maxEntries: 20_000 }),
});
walker.replace(nativeEntities, drawOrderIds);
const windowWidth = walker.tileSize * 3;
const windowHeight = walker.tileSize * 3;
let peakResident = 0;
for (let stop = 0; stop < 40; stop += 1) {
  const originX = minX + ((maxX - minX - windowWidth) * stop) / 39;
  walker.setView({
    bounds: {
      minX: originX,
      minY,
      maxX: originX + windowWidth,
      maxY: minY + windowHeight,
    },
    pixelsPerUnit: 0.4,
  });
  walker.settle();
  peakResident = Math.max(peakResident, walker.stats().residentTiles);
  assert.equal(
    walker.stats().renderedEntities,
    walker.stats().visibleEntities,
    `en la parada ${stop} el detalle debe cubrir lo visible`,
  );
}
const walked = walker.stats();
assert.equal(
  walked.residentTiles,
  walked.visibleTiles,
  `tras 40 paradas sólo quedan residentes los tiles visibles: ${walked.residentTiles} frente a ${walked.visibleTiles}`,
);
assert.ok(
  walked.cache.points <= 200_000,
  `la caché respeta su tope tras el paseo: ${walked.cache.points}`,
);
ok(
  true,
  `tras 40 paradas de paneo quedan ${walked.residentTiles} tiles residentes (pico ${peakResident}) y ${walked.cache.points} puntos en caché`,
);

walker.dispose();
const disposed = walker.stats();
assert.equal(disposed.totalEntities, 0);
assert.equal(disposed.residentTiles, 0);
assert.equal(disposed.cache.points, 0);
ok(true, "dispose() suelta entidades, tiles residentes y caché");

console.log(
  `pipeline: ${checks} comprobaciones verdes — en reposo ${settled.renderedEntities}/${settled.visibleEntities} entidades detalladas (planCadNativeRenderBudget detallaba ${legacyPlan.rendered}), panear un tile conserva ${panUpdate.retainedTiles} de ${beforePan.visibleTiles} y añade ${panUpdate.addedTiles}, y 40 paradas de paseo dejan ${walked.residentTiles} tiles residentes.`,
);
