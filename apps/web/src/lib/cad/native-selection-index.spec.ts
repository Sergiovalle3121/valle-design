import assert from "node:assert/strict";
import { planCadNativeRenderBudget } from "./native-render-budget";
import { CadNativeSelectionIndex } from "./native-selection-index";
import type { CadNativeEntity } from "./entity-runtime";

const entities: CadNativeEntity[] = Array.from({ length: 1_000 }, (_, index) => ({
  id: `arc-${index}`,
  type: "arc",
  center: { x: index * 20, y: 100, z: 0 },
  radius: 5,
  startAngle: 0,
  endAngle: 180,
  layer: "BENCHMARK",
}));
const detailed = planCadNativeRenderBudget(entities, [], 10);
const omitted = entities.find(
  (entity) => !detailed.entities.some((candidate) => candidate.id === entity.id),
);
assert.ok(omitted);
assert.equal(omitted.type, "arc");
const materialized = planCadNativeRenderBudget(entities, [omitted.id], 10);
assert.equal(materialized.entities.length, 10);
assert.equal(
  materialized.entities.some((entity) => entity.id === omitted.id),
  true,
);

const index = new CadNativeSelectionIndex(100);
index.replace(entities);
assert.equal(index.size, 1_000);
assert.equal(
  index.hitTest({ x: omitted.center.x + omitted.radius, y: omitted.center.y }, 0.5)[0]?.id,
  omitted.id,
);

const windowHits = index.intersecting({
  minX: omitted.center.x - 6,
  minY: omitted.center.y - 6,
  maxX: omitted.center.x + 6,
  maxY: omitted.center.y + 6,
}, false);
assert.deepEqual(windowHits.map((entity) => entity.id), [omitted.id]);

const polygon = [
  { x: omitted.center.x - 7, y: omitted.center.y - 7 },
  { x: omitted.center.x + 7, y: omitted.center.y - 7 },
  { x: omitted.center.x + 7, y: omitted.center.y + 7 },
  { x: omitted.center.x - 7, y: omitted.center.y + 7 },
];
assert.deepEqual(index.path(polygon, "polygon", false).map((entity) => entity.id), [omitted.id]);
assert.deepEqual(index.path([
  { x: omitted.center.x - 7, y: omitted.center.y },
  { x: omitted.center.x + 7, y: omitted.center.y },
], "fence").map((entity) => entity.id), [omitted.id]);
assert.deepEqual(index.path([
  { x: omitted.center.x, y: omitted.center.y - 7 },
  { x: omitted.center.x + 7, y: omitted.center.y },
  { x: omitted.center.x, y: omitted.center.y + 7 },
], "lasso").map((entity) => entity.id), [omitted.id]);
assert.deepEqual(index.path([
  { x: omitted.center.x - 2, y: omitted.center.y - 2 },
  { x: omitted.center.x + 2, y: omitted.center.y - 2 },
  { x: omitted.center.x + 2, y: omitted.center.y + 2 },
  { x: omitted.center.x - 2, y: omitted.center.y + 2 },
], "polygon", false), []);

const moved = {
  ...omitted,
  center: { ...omitted.center, y: 500 },
};
index.applyPatch({ upsert: [moved], remove: [] });
assert.equal(
  index.hitTest({ x: omitted.center.x + omitted.radius, y: omitted.center.y }, 0.5).length,
  0,
);
assert.equal(
  index.hitTest({ x: moved.center.x + moved.radius, y: moved.center.y }, 0.5)[0]?.id,
  moved.id,
);

index.applyPatch({ upsert: [], remove: [moved.id] });
assert.equal(index.entity(moved.id), undefined);
assert.equal(index.size, 999);

// --- filtros por capa: lo apagado no imanta; lo bloqueado no se designa --------
{
  const filtered = new CadNativeSelectionIndex();
  const layerDocument = {
    layers: [
      { id: "viva", name: "viva", color: "#fff", visible: true, locked: false },
      { id: "apagada", name: "apagada", color: "#fff", visible: false, locked: false },
      { id: "candada", name: "candada", color: "#fff", visible: true, locked: true },
    ],
  } as never;
  const at = (id: string, layer: string, x: number) =>
    ({
      id,
      type: "circle",
      center: { x, y: 0, z: 0 },
      radius: 1,
      layer,
    }) as never;
  filtered.replace(
    [at("v1", "viva", 0), at("o1", "apagada", 10), at("l1", "candada", 20)],
    layerDocument,
  );
  const everywhere = { minX: -5, minY: -5, maxX: 25, maxY: 5 };
  // Consumidores internos (regeneración, render): ven todo lo no congelado.
  assert.equal(filtered.search(everywhere).length, 3, "el filtro de fábrica no cambia");
  // El cursor no imanta lo invisible; lo bloqueado SÍ imanta.
  assert.deepEqual(
    filtered.search(everywhere, Infinity, "snap").map((entity) => entity.id).sort(),
    ["l1", "v1"],
    "capa apagada fuera del enganche; la bloqueada imanta",
  );
  // Un clic o una ventana no designan lo apagado NI lo bloqueado.
  assert.deepEqual(
    filtered.search(everywhere, Infinity, "selection").map((entity) => entity.id),
    ["v1"],
    "sólo la capa viva se designa",
  );
  assert.equal(filtered.hitTest({ x: 21, y: 0 }, 0.5, 16, "selection").length, 0);
  assert.equal(filtered.hitTest({ x: 21, y: 0 }, 0.5, 16)[0]?.id, "l1");
  assert.equal(
    filtered.intersecting(everywhere, true, 300, "selection").length,
    1,
    "la ventana tampoco captura apagadas ni bloqueadas",
  );
}

// Regresión COMMERCIAL-RC1: designar es designar TODO lo encerrado. El tope
// por defecto era 300 y truncaba EN SILENCIO (medido en el estrés denso: una
// ventana sobre 64 habitaciones encierra 1.280 trazos y devolvía 300 — mover
// «lo designado» movía 300 de 1.280 sin decirlo). Con las 1.000 de este spec:
{
  const everything = index.intersecting(
    { minX: -100, minY: -100, maxX: 1_000 * 20 + 100, maxY: 300 },
    true,
  );
  assert.equal(
    everything.length,
    999, // las 1.000 del corpus menos la baja aplicada arriba
    "una ventana que encierra 999 entidades designa las 999 — sin tope silencioso",
  );
  assert.equal(
    index.intersecting(
      { minX: -100, minY: -100, maxX: 1_000 * 20 + 100, maxY: 300 },
      true,
      300,
    ).length,
    300,
    "el tope sigue disponible para quien lo pida EXPLÍCITAMENTE",
  );
}

console.log(
  "native-selection-index: el índice espacial sigue altas, bajas y movimientos, " +
    "y las capas apagadas no imantan ni se designan (las bloqueadas imantan sin designarse)",
);
