import assert from "node:assert/strict";
import { tessellateCadEntityBatch } from "./tessellate.worker";
import {
  cadTessellationFromPayload,
  tessellateCadEntitiesOffThread,
} from "./tessellate-worker-client";
import { tessellateCadEntity } from "./tessellation-cache";
import type { CadNativeEntity } from "../entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const entities: CadNativeEntity[] = [
  { id: "l", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
  { id: "c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 50, layer: "0" },
  {
    id: "a",
    type: "arc",
    center: { x: 5, y: 5, z: 0 },
    radius: 20,
    startAngle: 0,
    endAngle: 90,
    layer: "0",
  },
];
const segments = [2, 64, 32];

// ---------------------------------------------------------------------------
// El núcleo compartido produce EXACTAMENTE lo mismo que el camino síncrono. Es
// lo que impide que la reserva se desvíe del worker en silencio.
// ---------------------------------------------------------------------------
const batch = tessellateCadEntityBatch(entities, segments);
assert.equal(batch.results.length, 3);
for (let index = 0; index < entities.length; index += 1) {
  const direct = tessellateCadEntity(entities[index], segments[index]);
  const viaWorker = cadTessellationFromPayload(batch.results[index]);
  assert.equal(viaWorker.pointCount, direct.pointCount, `${entities[index].id}: puntos`);
  assert.equal(viaWorker.segmentCount, direct.segmentCount, `${entities[index].id}: segmentos`);
  assert.equal(viaWorker.paths.length, direct.paths.length);
  for (let path = 0; path < direct.paths.length; path += 1) {
    assert.equal(viaWorker.paths[path].closed, direct.paths[path].closed);
    assert.deepEqual(
      [...viaWorker.paths[path].xy],
      [...direct.paths[path].xy],
      `${entities[index].id}: coordenadas idénticas`,
    );
  }
}
ok(true, "el núcleo del worker y el teselado directo dan coordenadas idénticas en línea, círculo y arco");

// Anclas absolutas, para que la igualdad de arriba no se cumpla con dos ceros.
assert.deepEqual([...batch.results[0].paths[0]], [0, 0, 10, 0]);
assert.equal(batch.results[1].closed[0], true, "el círculo vuelve cerrado");
assert.ok(batch.results[1].paths[0].length > 100, "y con el detalle que se pidió");
ok(true, "la línea vuelve como [0,0,10,0] y el círculo como camino cerrado detallado");

// ---------------------------------------------------------------------------
// Transferencias: los búferes salen en la lista de cesión, no se copian.
// ---------------------------------------------------------------------------
assert.equal(batch.transfer.length, 3, "un búfer transferible por camino");
for (const buffer of batch.transfer) assert.ok(buffer instanceof ArrayBuffer);
const declared = new Set(batch.transfer);
for (const result of batch.results)
  for (const path of result.paths)
    assert.ok(declared.has(path.buffer), "todo búfer devuelto viaja en la lista de cesión");
ok(true, "los tres búferes se ceden en vez de copiarse");

// Una entidad no soportada se salta sin romper el lote.
const withLegacy = tessellateCadEntityBatch(
  [entities[0], { id: "box", type: "box", x: 0, y: 0, w: 1, h: 1, rotation: 0 } as unknown as CadNativeEntity],
  [2, 2],
);
assert.equal(withLegacy.results.length, 1, "lo que el registro nativo no reclama se ignora");
assert.equal(withLegacy.results[0].entityId, "l");
ok(true, "una entidad fuera del registro nativo no rompe el lote");

// ---------------------------------------------------------------------------
// En Node no hay `Worker`: el cliente lo dice y entrega igual. Un pipeline que
// dejase de dar geometría sin worker sería peor que no tener worker.
// ---------------------------------------------------------------------------
void tessellateCadEntitiesOffThread(entities, segments).then((offThread) => {
  assert.equal(offThread.source, "fallback", "sin Worker el cliente lo declara, no lo disimula");
  assert.equal(offThread.results.length, 3);
  assert.deepEqual([...offThread.results[0].paths[0]], [0, 0, 10, 0]);
  ok(true, "sin Worker el cliente cae a la reserva y lo declara en `source`");

  console.log(
    `tessellate-worker: ${checks} comprobaciones verdes — el núcleo compartido y el teselado directo coinciden coordenada a coordenada en 3 entidades, con ${batch.transfer.length} búferes cedidos y reserva declarada como "${offThread.source}".`,
  );
});
