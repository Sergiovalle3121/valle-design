import assert from "node:assert/strict";
import {
  CAD_RENDER_LOD_SEGMENTS,
  CadTessellationCache,
  cadRenderLodTier,
  cadRenderSegmentBudget,
  cadRenderSegmentsForSagitta,
  tessellateCadEntity,
  type CadTessellation,
} from "./tessellation-cache";
import type { CadNativeEntity } from "../entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// ---------------------------------------------------------------------------
// Escalones de LOD: anclas absolutas en los dos bordes, no sólo monotonía.
// ---------------------------------------------------------------------------
assert.equal(cadRenderLodTier(0), 0);
assert.equal(cadRenderLodTier(24), 0, "24 px sigue siendo el escalón grueso");
assert.equal(cadRenderLodTier(24.0001), 1);
assert.equal(cadRenderLodTier(320), 1, "320 px sigue siendo el escalón medio");
assert.equal(cadRenderLodTier(320.0001), 2);
assert.equal(cadRenderLodTier(1e9), 2);
assert.equal(cadRenderLodTier(Number.NaN), 0, "un tamaño no numérico cae al escalón barato");
ok(true, "cadRenderLodTier ancla en 24 px y 320 px, con NaN al escalón grueso");

assert.deepEqual([...CAD_RENDER_LOD_SEGMENTS], [8, 32, 128]);
assert.equal(cadRenderSegmentBudget(2), 128);
assert.equal(cadRenderSegmentBudget(2, 0.5), 64, "medio barrido gasta la mitad");
assert.equal(cadRenderSegmentBudget(0, 0.01), 2, "el mínimo es 2 segmentos, nunca 0");
assert.equal(cadRenderSegmentBudget(1, 5), 32, "un barrido mayor que una vuelta se recorta a una");
ok(true, "cadRenderSegmentBudget escala con el barrido y respeta el mínimo de 2");

// Regla de la flecha: un círculo de 100 px de radio con 0,5 px de tolerancia
// necesita 32 segmentos; uno de 4 px necesita 4. Números concretos, no «más».
assert.equal(cadRenderSegmentsForSagitta(100, 0.5), 32);
assert.equal(cadRenderSegmentsForSagitta(4, 0.5), 7);
assert.equal(cadRenderSegmentsForSagitta(0.4, 0.5), 2, "por debajo de la tolerancia bastan 2");
assert.equal(cadRenderSegmentsForSagitta(0, 0.5), 2);
assert.ok(
  cadRenderSegmentsForSagitta(10_000, 0.5) > cadRenderSegmentsForSagitta(1_000, 0.5),
  "más radio aparente pide más segmentos",
);
ok(true, "cadRenderSegmentsForSagitta: 100 px → 32 segmentos, 4 px → 7");

// ---------------------------------------------------------------------------
// Teselado a través del registro: el LOD cambia el número de puntos DE VERDAD.
// Si el escalón no llegase al adaptador, esta comprobación fallaría en vez de
// pasar de forma vacía.
// ---------------------------------------------------------------------------
const circle: Extract<CadNativeEntity, { type: "circle" }> = {
  id: "c1",
  type: "circle",
  center: { x: 0, y: 0, z: 0 },
  radius: 100,
  layer: "0",
};
const coarse = tessellateCadEntity(circle, cadRenderSegmentBudget(0));
const fine = tessellateCadEntity(circle, cadRenderSegmentBudget(2));
assert.ok(coarse.pointCount >= 3, "hasta el escalón grueso dibuja un polígono");
assert.ok(
  fine.pointCount > coarse.pointCount * 3,
  `el escalón fino debe tener muchos más puntos: ${fine.pointCount} vs ${coarse.pointCount}`,
);
assert.equal(coarse.paths.length, 1);
assert.equal(coarse.paths[0].xy.length, coarse.pointCount * 2);
assert.ok(coarse.paths[0].xy instanceof Float32Array, "el teselado se guarda empaquetado");
// El resultado sigue estando sobre el círculo: radio conservado en cada punto.
for (let index = 0; index < fine.pointCount; index += 1) {
  const radius = Math.hypot(fine.paths[0].xy[index * 2], fine.paths[0].xy[index * 2 + 1]);
  assert.ok(Math.abs(radius - 100) < 0.01, `punto fuera del círculo: r=${radius}`);
}
ok(true, `el LOD llega al adaptador: ${coarse.pointCount} puntos gruesos frente a ${fine.pointCount} finos`);

const line: Extract<CadNativeEntity, { type: "line" }> = {
  id: "l1",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 10, y: 20, z: 0 },
  layer: "0",
};
const lineTess = tessellateCadEntity(line, 128);
assert.equal(lineTess.pointCount, 2, "una recta no gana nada con más segmentos");
assert.equal(lineTess.segmentCount, 1);
assert.deepEqual([...lineTess.paths[0].xy], [0, 0, 10, 20]);
assert.equal(lineTess.paths[0].closed, false);
ok(true, "la recta tesela a 2 puntos exactos sea cual sea el presupuesto");

// ---------------------------------------------------------------------------
// Caché: acierto, invalidación por affectedEntityIds y desalojo por tope.
// ---------------------------------------------------------------------------
const cache = new CadTessellationCache({ maxPoints: 1_000_000 });
let produced = 0;
const produce = (entity: CadNativeEntity, segments: number) => () => {
  produced += 1;
  return tessellateCadEntity(entity, segments);
};

cache.get("c1", 2, produce(circle, 128));
cache.get("c1", 2, produce(circle, 128));
cache.get("c1", 2, produce(circle, 128));
assert.equal(produced, 1, "tres lecturas del mismo (entidad, escalón) teselan una vez");
assert.equal(cache.stats.hits, 2);
assert.equal(cache.stats.misses, 1);
ok(true, "la caché acierta: 3 lecturas, 1 teselado");

// Escalones distintos son entradas distintas: el zoom no reutiliza detalle malo.
cache.get("c1", 0, produce(circle, 8));
assert.equal(produced, 2);
assert.equal(cache.stats.entries, 2);
assert.notEqual(cache.peek("c1", 0)?.pointCount, cache.peek("c1", 2)?.pointCount);
ok(true, "cada escalón de LOD tiene su propia entrada");

// Invalidar por id tira TODOS sus escalones y sólo los suyos.
cache.get("l1", 2, produce(line, 128));
assert.equal(cache.stats.entries, 3);
const dropped = cache.invalidate(["c1", "no-existe"]);
assert.equal(dropped, 2, "se tiran los dos escalones de c1 y ninguno más");
assert.equal(cache.peek("c1", 0), null);
assert.equal(cache.peek("c1", 2), null);
assert.ok(cache.peek("l1", 2) !== null, "l1 sobrevive a la invalidación de c1");
assert.equal(cache.stats.entries, 1);
ok(true, "invalidate(affectedEntityIds) borra los escalones de la entidad tocada y sólo esos");

// El contador de puntos retenidos baja al invalidar: si no bajase, el tope
// dejaría de acotar nada y la caché sería una fuga con contador bonito.
const beforePoints = cache.stats.points;
cache.invalidate(["l1"]);
assert.equal(cache.stats.points, 0, `los puntos retenidos deben caer a 0, quedaban ${beforePoints}`);
assert.equal(cache.stats.entries, 0);
ok(true, "los puntos retenidos bajan al invalidar");

// ---------------------------------------------------------------------------
// EL TOPE. Una caché sin tope es una fuga: se mete mucho más de lo que cabe y
// se comprueba que ni las entradas ni los puntos crecen sin límite.
// ---------------------------------------------------------------------------
const capped = new CadTessellationCache({ maxPoints: 5_000, maxEntries: 50 });
const flat: CadTessellation = {
  paths: [{ xy: new Float32Array(200), closed: false }],
  pointCount: 100,
  segmentCount: 99,
};
for (let index = 0; index < 2_000; index += 1)
  capped.get(`entity-${index}`, 1, () => flat);
assert.ok(
  capped.stats.points <= 5_000,
  `los puntos retenidos (${capped.stats.points}) no pueden pasar del tope de 5.000`,
);
assert.ok(
  capped.stats.entries <= 50,
  `las entradas (${capped.stats.entries}) no pueden pasar del tope de 50`,
);
assert.ok(capped.stats.evictions > 1_900, "2.000 inserciones con tope de 50 desalojan casi todo");
// LRU de verdad: lo último insertado sigue; lo primero, no.
assert.ok(capped.peek("entity-1999", 1) !== null, "la entrada más reciente sobrevive");
assert.equal(capped.peek("entity-0", 1), null, "la más antigua fue desalojada");
ok(true, `el tope LRU aguanta 2.000 inserciones en ${capped.stats.entries} entradas y ${capped.stats.points} puntos`);

// Una lectura renueva la antigüedad: lo consultado no se desaloja antes que lo
// dormido. Sin esto el «LRU» sería FIFO y la vista actual se tiraría sola.
const lru = new CadTessellationCache({ maxPoints: 1_000_000, maxEntries: 3 });
lru.get("a", 1, () => flat);
lru.get("b", 1, () => flat);
lru.get("c", 1, () => flat);
lru.get("a", 1, () => flat); // renueva "a"
lru.get("d", 1, () => flat); // desaloja el más viejo, que ahora es "b"
assert.ok(lru.peek("a", 1) !== null, "la entrada releída sobrevive");
assert.equal(lru.peek("b", 1), null, "la entrada no releída es la que cae");
assert.ok(lru.peek("c", 1) !== null);
assert.ok(lru.peek("d", 1) !== null);
ok(true, "releer renueva la antigüedad: es LRU, no FIFO");

console.log(
  `tessellation-cache: ${checks} comprobaciones verdes — LOD anclado en 24/320 px, tope LRU acotado a ${capped.stats.entries} entradas y ${capped.stats.points} puntos tras 2.000 inserciones.`,
);
