import assert from "node:assert/strict";
import * as THREE from "three";
import { CadRenderScene } from "./scene";
import { createCadBenchmarkCorpus } from "../benchmark/corpus";
import { cadDocumentBounds, createCadRenderScenario } from "./render-benchmark";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const corpus = createCadBenchmarkCorpus({ entities: 4_000 });
const bounds = cadDocumentBounds(corpus.nativeEntities);
const scenario = createCadRenderScenario(bounds, 6);
const viewport = { scale: 0.01, width: 1_600, height: 1_200, elevation: 0.11 };

const scene = new CadRenderScene({ viewport });
scene.replace(corpus.nativeEntities, corpus.document.modelSpace.entityIds);
assert.equal(scene.group.children.length, 0, "sin vista no hay nada en la escena");

scene.setView(scenario.initial);
while (!scene.settled) scene.runFrame();
const first = scene.sync();
assert.ok(first.created > 0, "la primera sincronización crea mallas");
assert.equal(first.disposed, 0);
assert.equal(scene.group.children.length, first.created);
const stats = scene.stats();
assert.equal(
  stats.renderedEntities,
  stats.visibleEntities,
  `en reposo el detalle cubre lo visible: ${stats.renderedEntities}/${stats.visibleEntities}`,
);
assert.equal(stats.visibleEntities, 4_000);
assert.equal(stats.meshes, first.created);
ok(true, `la escena materializa ${first.created} mallas para ${stats.visibleEntities} entidades — y son ${stats.instances} instancias, no ${stats.visibleEntities} objetos`);

// LA CIFRA: un objeto por entidad serían 4.000 hijos de escena.
assert.ok(
  scene.group.children.length < 400,
  `4.000 entidades no pueden ser ${scene.group.children.length} objetos de escena`,
);
// Y son (tiles × cubos de estilo), no una clave global: dos tiles del mismo
// color tienen que ser dos lotes. Cuando la clave no llevaba el tile, los 48
// lotes colapsaban a 3 y el resto del dibujo se perdía.
const bucketKeys = new Set(
  scene.group.children
    .filter((child) => child.userData.cadLineBatch === true)
    .map((child) => String(child.userData.cadLineBatchKey)),
);
assert.equal(bucketKeys.size, scene.group.children.length, "cada malla tiene su clave propia");
assert.ok(
  [...bucketKeys].every((key) => key.includes("#")),
  "la clave de lote lleva el tile por delante del cubo de estilo",
);
ok(true, `4.000 entidades caben en ${scene.group.children.length} objetos de escena, uno por (tile × estilo)`);

// Cada malla es instanciada de verdad, con sus atributos por instancia.
const mesh = scene.group.children.find(
  (child) => child.userData.cadLineBatch === true,
) as THREE.Mesh;
assert.ok(mesh, "debe haber al menos una malla de lote");
const geometry = mesh.geometry as THREE.InstancedBufferGeometry;
assert.ok(geometry instanceof THREE.InstancedBufferGeometry);
assert.ok(geometry.instanceCount > 0);
for (const attribute of ["instanceStart", "instanceEnd", "instanceStyle", "instanceArc"])
  assert.ok(
    geometry.getAttribute(attribute) instanceof THREE.InstancedBufferAttribute,
    `falta el atributo por instancia ${attribute}`,
  );
assert.equal(geometry.getAttribute("position").count, 4, "el quad base tiene cuatro vértices");
assert.equal(geometry.getIndex()?.count, 6, "y dos triángulos");
assert.equal(mesh.frustumCulled, false, "el culling ya lo hizo el índice de tiles");
ok(true, `la malla lleva ${geometry.instanceCount} instancias sobre un quad de 4 vértices`);

// ---------------------------------------------------------------------------
// RECONCILIAR, NO RECONSTRUIR. Un paneo que conserva tiles conserva mallas.
// ---------------------------------------------------------------------------
scene.setView(scenario.pan[0]);
while (!scene.settled) scene.runFrame();
scene.sync();
const before = scene.stats().meshes;
scene.setView(scenario.pan[1]);
while (!scene.settled) scene.runFrame();
const panned = scene.sync();
assert.ok(
  panned.retained > 0,
  `un paneo debe conservar mallas ya subidas: ${panned.retained} conservadas, ${panned.created} creadas`,
);
assert.equal(
  scene.group.children.length,
  before - panned.disposed + panned.created,
  "el recuento de hijos cuadra con el diff declarado",
);
const pannedStats = scene.stats();
assert.equal(pannedStats.renderedEntities, pannedStats.visibleEntities);
ok(true, `panear conserva ${panned.retained} mallas, crea ${panned.created} y libera ${panned.disposed}`);

// Volver a sincronizar sin mover la vista no toca nada: ni una malla nueva.
const idle = scene.sync();
assert.equal(idle.created, 0, "una sincronización sin cambios no crea mallas");
assert.equal(idle.disposed, 0);
assert.equal(idle.glyphs, 0, "el corpus no tiene MTEXT, así que no hay glifos que contar");
assert.equal(
  idle.retained,
  scene.group.children.length,
  "conserva EXACTAMENTE las mallas que ya estaban",
);
ok(true, "sincronizar dos veces seguidas sin mover la vista no crea ni destruye nada");

// ---------------------------------------------------------------------------
// EDITAR TIENE QUE VERSE. Es el caso que rompe una comprobación de reutilización
// basada sólo en el número de instancias: mover una línea no cambia cuántos
// segmentos tiene, así que la malla vieja se quedaría en la GPU con las
// coordenadas de antes y la edición no aparecería.
// ---------------------------------------------------------------------------
const editedId = scene.pipeline
  .renderedEntityIds()
  .find((id) => corpus.nativeEntities.find((entity) => entity.id === id)?.type === "line")!;
const originalEntity = corpus.nativeEntities.find(
  (entity) => entity.id === editedId,
)! as Extract<(typeof corpus.nativeEntities)[number], { type: "line" }>;
// Mover la línea NO cambia su número de segmentos: es exactamente el caso que
// una comprobación por recuento de instancias dejaría pasar.
const movedEntity = {
  ...originalEntity,
  start: { ...originalEntity.start, x: originalEntity.start.x + 7.5 },
};
const buffersBefore = new Map(
  scene.group.children
    .filter((child) => child.userData.cadLineBatch === true)
    .map((child) => [String(child.userData.cadLineBatchKey), child.userData.cadLineBatchBuffer]),
);
const segmentsBefore = scene.stats().instances;
scene.invalidate([editedId], [movedEntity]);
while (!scene.settled) scene.runFrame();
const edited = scene.sync();
assert.ok(edited.created > 0, "una edición obliga a resubir la geometría de su lote");
assert.equal(
  scene.stats().instances,
  segmentsBefore,
  "mover una línea no cambia el número de segmentos — por eso el recuento no basta",
);
const changedBatches = scene.group.children
  .filter((child) => child.userData.cadLineBatch === true)
  .filter((child) => {
    const key = String(child.userData.cadLineBatchKey);
    return buffersBefore.has(key) && buffersBefore.get(key) !== child.userData.cadLineBatchBuffer;
  });
assert.ok(
  changedBatches.length > 0,
  "al menos un lote tiene que traer memoria NUEVA, o la edición no llegaría a la GPU",
);
// Y el PUNTO nuevo está de verdad en los atributos que se van a subir. Se busca
// el par (x, y) completo, no una coordenada suelta: un x que coincidiese por
// casualidad con el de otra entidad no probaría nada.
const newX = movedEntity.start.x;
const newY = movedEntity.start.y;
const oldX = originalEntity.start.x;
const hasPoint = (x: number, y: number) =>
  scene.pipeline.visibleBatches().some((batch) => {
    for (let index = 0; index < batch.instanceCount; index += 1)
      if (
        Math.abs(batch.instanceStart[index * 2] - x) < 0.05 &&
        Math.abs(batch.instanceStart[index * 2 + 1] - y) < 0.05
      )
        return true;
    return false;
  });
assert.ok(hasPoint(newX, newY), `el punto movido (${newX}, ${newY}) debe estar en los lotes`);
assert.ok(!hasPoint(oldX, newY), `y el punto anterior (${oldX}, ${newY}) ya no`);
const editedStats = scene.stats();
assert.equal(editedStats.renderedEntities, editedStats.visibleEntities);
ok(
  true,
  `mover una línea sin cambiar su recuento de segmentos resube ${changedBatches.length} lote(s) y la coordenada nueva llega a los atributos`,
);

// ---------------------------------------------------------------------------
// Ocultar una capa es un booleano, no una reconstrucción.
// ---------------------------------------------------------------------------
const layers = new Set(
  scene.group.children
    .filter((child) => child.userData.cadLineBatch === true)
    .map((child) => String(child.userData.cadLineBatchLayer)),
);
assert.ok(layers.has("BENCH-LINES"), `las capas del corpus deben estar: ${[...layers].join(", ")}`);
const meshesBefore = scene.group.children.length;
scene.setHiddenLayers(new Set(["BENCH-LINES"]));
assert.equal(scene.group.children.length, meshesBefore, "ocultar una capa NO destruye geometría");
const hidden = scene.group.children.filter(
  (child) => child.userData.cadLineBatch === true && !child.visible,
);
assert.ok(hidden.length > 0, "pero sí apaga sus lotes");
assert.ok(
  hidden.every((child) => child.userData.cadLineBatchLayer === "BENCH-LINES"),
  "y sólo los suyos",
);
scene.setHiddenLayers(new Set());
assert.ok(
  scene.group.children.every((child) => child.visible),
  "volver a mostrarla los enciende otra vez",
);
ok(true, `ocultar una capa apaga ${hidden.length} lotes sin liberar ni una geometría`);

// ---------------------------------------------------------------------------
// TIPOS DE LÍNEA: la tabla llega al shader cuando llega el documento. Medido el
// 2026-09-02: la escena creaba el material sin patrones y nadie escribía el
// uniforme, así que las 8 ranuras valían (0, 0) y toda línea era continua
// aunque su ranura fuese correcta.
// ---------------------------------------------------------------------------
const untouched = scene.linetypeUniforms();
assert.ok(untouched.meta.every((value) => value === 0), "sin documento no hay ninguna ranura con tramos");
const documentWithCenter = {
  ...corpus.document,
  meta: { ...corpus.document.meta, linetypeScale: 25 },
  styles: {
    ...corpus.document.styles,
    linetype: { CENTER: { pattern: [1.25, -0.25, 0.25, -0.25] } },
  },
};
scene.replace(corpus.nativeEntities, corpus.document.modelSpace.entityIds, documentWithCenter);
const lined = scene.linetypeUniforms();
assert.deepEqual([...lined.meta.slice(2, 4)], [4, 2], "la ranura 1 (CENTER, catálogo alfabético) lleva [4 tramos, periodo 2]");
assert.deepEqual([...lined.dash.slice(8, 12)], [1.25, -0.25, 0.25, -0.25], "y sus cuatro tramos con signo");
assert.equal(lined.scale, 25, "LTSCALE del documento viaja como uniforme");
assert.deepEqual(lined.overflow, [], "nueve de fábrica más el catálogo no desbordan");
// Una edición con el MISMO catálogo no reempaqueta: misma referencia.
scene.setView(scenario.initial);
while (!scene.settled) scene.runFrame();
scene.invalidate([editedId], [movedEntity], documentWithCenter);
assert.equal(scene.linetypeUniforms().dash, lined.dash, "editar sin cambiar el catálogo no reempaqueta los uniformes");
// Otro catálogo sí: la ranura 1 pasa a ser DASHED2.
scene.invalidate([editedId], [movedEntity], {
  ...documentWithCenter,
  styles: { ...documentWithCenter.styles, linetype: { DASHED2: { pattern: [0.25, -0.125] } } },
});
assert.deepEqual([...scene.linetypeUniforms().meta.slice(2, 4)], [2, 0.375], "cambiar el catálogo reescribe la tabla");
ok(true, "la tabla de tipos de línea entra en los uniformes con el documento, y sólo se reempaqueta cuando cambia el catálogo");

// ---------------------------------------------------------------------------
// dispose() suelta la escena entera.
// ---------------------------------------------------------------------------
scene.dispose();
assert.equal(scene.group.children.length, 0, "dispose vacía el grupo");
assert.equal(scene.stats().totalEntities, 0);
assert.equal(scene.stats().meshes, 0);
ok(true, "dispose() vacía el grupo y suelta el pipeline");

console.log(
  `scene: ${checks} comprobaciones verdes — 4.000 entidades se dibujan con ${first.created} objetos de escena (${stats.instances} instancias), panear conserva ${panned.retained} mallas, ocultar una capa apaga ${hidden.length} lotes sin liberar geometría y CENTER llega al shader con sus 4 tramos.`,
);
