import assert from "node:assert/strict";
import {
  CadRenderTileIndex,
  cadTileCoordFromId,
  cadTileId,
  diffCadTiles,
  suggestCadTileSize,
} from "./tile-index";
import type { CadBounds } from "../entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function boundsAt(x: number, y: number, size = 4): CadBounds {
  return { minX: x, minY: y, maxX: x + size, maxY: y + size };
}

function intersects(a: CadBounds, b: CadBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

// ---------------------------------------------------------------------------
// Anclas absolutas de la rejilla. Una propiedad de ida y vuelta se cumple de
// forma vacía si nadie toca el campo; estas dicen qué tile concreto sale.
// ---------------------------------------------------------------------------
const index = new CadRenderTileIndex(100);
assert.deepEqual(index.ownerTile(boundsAt(0, 0)), { tx: 0, ty: 0 });
assert.deepEqual(index.ownerTile(boundsAt(96, 96)), { tx: 0, ty: 0 });
// Centro en (100, 100) → primer tile de la segunda fila y columna.
assert.deepEqual(index.ownerTile({ minX: 98, minY: 98, maxX: 102, maxY: 102 }), {
  tx: 1,
  ty: 1,
});
assert.deepEqual(index.ownerTile(boundsAt(-100, -100)), { tx: -1, ty: -1 });
ok(true, "ownerTile ancla en (0,0), (1,1) y (-1,-1)");

assert.equal(cadTileId(3, -7), "3:-7");
assert.deepEqual(cadTileCoordFromId("3:-7"), { tx: 3, ty: -7 });
assert.deepEqual(cadTileCoordFromId("-12:-34"), { tx: -12, ty: -34 });
ok(true, "cadTileId y cadTileCoordFromId son inversas con signo negativo");

// ---------------------------------------------------------------------------
// Cada entidad pertenece a EXACTAMENTE un tile: una línea a caballo de cuatro
// tiles se dibujaría cuatro veces si el índice la duplicase.
// ---------------------------------------------------------------------------
const straddling = new CadRenderTileIndex(100);
straddling.upsert("cross", { minX: 80, minY: 80, maxX: 120, maxY: 120 });
const owningTiles = ["0:0", "0:1", "1:0", "1:1"].filter((tile) =>
  straddling.entityIdsInTile(tile).includes("cross"),
);
assert.deepEqual(owningTiles, ["1:1"], "la entidad a caballo vive en un solo tile");
assert.equal(straddling.tileCount, 1);
// Y aun así se ve desde una vista que sólo toca su esquina inferior izquierda.
assert.deepEqual(straddling.visibleEntityIds({ minX: 70, minY: 70, maxX: 85, maxY: 85 }), [
  "cross",
]);
ok(true, "la rejilla laxa no duplica ni pierde la entidad a caballo");

// ---------------------------------------------------------------------------
// El culling devuelve TODAS las visibles. Se compara con un barrido exhaustivo
// sobre 4.000 entidades y varias ventanas: es la prueba de que se acabó el
// muestreo, no una propiedad que se cumpla sola.
// ---------------------------------------------------------------------------
const population = new CadRenderTileIndex(512);
const truth = new Map<string, CadBounds>();
let seed = 20260809;
const rng = () => {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 0x1_0000_0000;
};
for (let i = 0; i < 4_000; i += 1) {
  const bounds = boundsAt(
    Math.round(rng() * 8_000 - 4_000),
    Math.round(rng() * 8_000 - 4_000),
    1 + Math.round(rng() * 60),
  );
  const id = `e-${i}`;
  truth.set(id, bounds);
  population.upsert(id, bounds);
}
assert.equal(population.size, 4_000);

const windows: CadBounds[] = [
  { minX: -4_100, minY: -4_100, maxX: 4_100, maxY: 4_100 },
  { minX: -1_000, minY: -1_000, maxX: 1_000, maxY: 1_000 },
  { minX: 900, minY: -3_000, maxX: 1_400, maxY: -2_400 },
  { minX: 3_900, minY: 3_900, maxX: 4_200, maxY: 4_200 },
  { minX: 10_000, minY: 10_000, maxX: 10_100, maxY: 10_100 },
];
for (const window of windows) {
  const expected = [...truth]
    .filter(([, bounds]) => intersects(bounds, window))
    .map(([id]) => id)
    .sort();
  const actual = [...population.visibleEntityIds(window)].sort();
  assert.deepEqual(
    actual,
    expected,
    `la ventana ${JSON.stringify(window)} debe devolver las ${expected.length} visibles`,
  );
}
// Ancla absoluta: la vista completa devuelve las 4.000, ni una muestreada.
assert.equal(population.visibleEntityIds(windows[0]).length, 4_000);
// Y una vista vacía devuelve cero, no «todo por si acaso».
assert.equal(population.visibleEntityIds(windows[4]).length, 0);
ok(true, "el culling coincide con el barrido exhaustivo en 5 ventanas (0 y 4.000 incluidas)");

// Sin duplicados: cada id aparece una vez.
const full = population.visibleEntityIds(windows[0]);
assert.equal(new Set(full).size, full.length, "ninguna entidad se devuelve dos veces");
ok(true, "visibleEntityIds no repite entidades");

// ---------------------------------------------------------------------------
// Un paneo pequeño es un delta pequeño. Es LA propiedad que justifica los
// tiles: si panear devolviese siempre el conjunto entero, no habría ganancia.
// ---------------------------------------------------------------------------
const viewA: CadBounds = { minX: -1_000, minY: -1_000, maxX: 1_000, maxY: 1_000 };
const viewB: CadBounds = { minX: -940, minY: -1_000, maxX: 1_060, maxY: 1_000 };
const tilesA = population.visibleTileIds(viewA);
const tilesB = population.visibleTileIds(viewB);
const diff = diffCadTiles(tilesA, tilesB);
assert.ok(tilesA.length >= 9, `la vista debe cubrir varios tiles, cubre ${tilesA.length}`);
assert.ok(
  diff.retained.length > diff.added.length + diff.removed.length,
  `un paneo de 60 unidades debe conservar más de lo que mueve: +${diff.added.length} -${diff.removed.length} =${diff.retained.length}`,
);
assert.deepEqual(
  [...diff.added, ...diff.retained].sort(),
  [...tilesB].sort(),
  "added ∪ retained reconstruye la vista nueva",
);
assert.equal(
  diff.retained.filter((id) => diff.removed.includes(id)).length,
  0,
  "retained y removed son disjuntos",
);
ok(true, `panear 60 unidades mueve ${diff.added.length + diff.removed.length} tiles y conserva ${diff.retained.length}`);

// Diff degenerado: sin cambio de vista no entra ni sale nada.
const idle = diffCadTiles(tilesA, tilesA);
assert.equal(idle.added.length, 0);
assert.equal(idle.removed.length, 0);
assert.equal(idle.retained.length, tilesA.length);
ok(true, "una vista quieta produce un diff vacío");

// Los tiles salen ordenados por cercanía al centro de la vista.
const centred = population.visibleTileIds(viewA);
const centreDistance = (id: string) => {
  const { tx, ty } = cadTileCoordFromId(id);
  const dx = (tx + 0.5) * 512 - 0;
  const dy = (ty + 0.5) * 512 - 0;
  return dx * dx + dy * dy;
};
for (let i = 1; i < centred.length; i += 1)
  assert.ok(
    centreDistance(centred[i - 1]) <= centreDistance(centred[i]),
    "visibleTileIds debe salir ordenado por distancia al centro",
  );
ok(true, "la prioridad por cercanía al centro sale del índice, no del consumidor");

// ---------------------------------------------------------------------------
// Bajas y movimientos: la caja del tile encoge, no se queda inflada para siempre.
// ---------------------------------------------------------------------------
const shrinking = new CadRenderTileIndex(100);
shrinking.upsert("small", { minX: 10, minY: 10, maxX: 20, maxY: 20 });
// Centro en (50, 10) → tile 0:0, pero se estira 900 unidades hacia arriba.
shrinking.upsert("wide", { minX: 10, minY: -880, maxX: 90, maxY: 900 });
assert.equal(shrinking.tile("0:0")?.contentBounds.maxY, 900);
assert.equal(shrinking.tile("0:0")?.contentBounds.minY, -880);
assert.deepEqual(shrinking.visibleEntityIds({ minX: 0, minY: 800, maxX: 100, maxY: 950 }), [
  "wide",
]);
shrinking.remove("wide");
assert.deepEqual(shrinking.tile("0:0")?.contentBounds, {
  minX: 10,
  minY: 10,
  maxX: 20,
  maxY: 20,
});
assert.deepEqual(shrinking.visibleEntityIds({ minX: 0, minY: 800, maxX: 100, maxY: 950 }), []);
ok(true, "quitar una entidad grande encoge la caja del tile a valores exactos");

// Mover una entidad de tile no la deja fantasma en el anterior.
shrinking.upsert("small", { minX: 610, minY: 610, maxX: 620, maxY: 620 });
assert.equal(shrinking.tile("0:0"), null, "el tile vacío desaparece");
assert.deepEqual(shrinking.entityIdsInTile("6:6"), ["small"]);
assert.equal(shrinking.size, 1);
ok(true, "un upsert que cruza de tile reubica en vez de duplicar");

shrinking.clear();
assert.equal(shrinking.size, 0);
assert.equal(shrinking.tileCount, 0);
ok(true, "clear deja el índice vacío");

// ---------------------------------------------------------------------------
// suggestCadTileSize: valores concretos, no sólo «devuelve algo positivo».
// ---------------------------------------------------------------------------
assert.equal(
  suggestCadTileSize({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 10),
  100,
  "por debajo del objetivo, un solo tile cubre el dibujo",
);
// 100k entidades, 256 por tile → ~391 tiles sobre 64.000² → lado ≈ 3.236 → 4.096.
assert.equal(
  suggestCadTileSize({ minX: 0, minY: 0, maxX: 64_000, maxY: 64_000 }, 100_000),
  4_096,
);
assert.ok(Number.isInteger(Math.log2(suggestCadTileSize({ minX: 0, minY: 0, maxX: 9_999, maxY: 3_333 }, 50_000))));
ok(true, "suggestCadTileSize devuelve potencias de dos con anclas comprobadas");

// Guardas.
assert.throws(() => new CadRenderTileIndex(0), /tileSize must be positive/);
ok(true, "un tamaño de tile no positivo se rechaza");

console.log(
  `tile-index: ${checks} comprobaciones verdes — culling exhaustivo verificado contra barrido en 4.000 entidades, delta de paneo ${diff.added.length}+${diff.removed.length} frente a ${diff.retained.length} conservados.`,
);
