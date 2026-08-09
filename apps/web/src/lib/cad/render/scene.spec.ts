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
// dispose() suelta la escena entera.
// ---------------------------------------------------------------------------
scene.dispose();
assert.equal(scene.group.children.length, 0, "dispose vacía el grupo");
assert.equal(scene.stats().totalEntities, 0);
assert.equal(scene.stats().meshes, 0);
ok(true, "dispose() vacía el grupo y suelta el pipeline");

console.log(
  `scene: ${checks} comprobaciones verdes — 4.000 entidades se dibujan con ${first.created} objetos de escena (${stats.instances} instancias), panear conserva ${panned.retained} mallas y ocultar una capa apaga ${hidden.length} lotes sin liberar geometría.`,
);
