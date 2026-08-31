/**
 * CONTRATO de `block-cache.ts`: la geometría LOCAL de un bloque se memoriza
 * por (blockId, versión, segmentos) — no por instancia — y la afín de
 * colocación de cada instancia se aplica aparte, sin volver a tocar el
 * contenido del bloque.
 *
 * Lo que este spec fija, y por qué:
 *
 *   · `produce()` se llama UNA vez por (blockId, versión, segmentos), nunca
 *     una por instancia. Es la propiedad que convierte «34.000 INSERT
 *     resuelven su bloque» en «un puñado de bloques distintos lo resuelven».
 *   · redefinir el bloque (`block.version` sube) invalida la entrada; un
 *     escalón de segmentos distinto es una entrada distinta.
 *   · `cadBlockWorldBounds`/`cadBlockWorldPaths` —la afín de colocación,
 *     DUPLICADA a propósito de `insertMatrix` (ver la cabecera de
 *     `block-cache.ts`)— coinciden con `resolveCadInsert`, la fuente de
 *     verdad, en traslación pura, giro, escala NO uniforme y reflexión. Sin
 *     esto la duplicación podría divergir en silencio y dibujar bloques mal
 *     colocados sin que ningún gate lo note.
 *   · dos instancias del MISMO bloque con colocaciones distintas no se
 *     contaminan entre sí: la caché es por bloque, no por instancia, así que
 *     tiene que demostrarse que compartir la entrada no comparte el lugar.
 */
import { strict as assert } from "node:assert";
import {
  cadBlockCacheSize,
  cadBlockLocalGeometry,
  cadBlockWorldBounds,
  cadBlockWorldPaths,
  clearCadBlockCache,
  type CadBlockLocalGeometry,
} from "./block-cache";
import { defineCadBlock, insertCadBlock, resolveCadInsert } from "./professional-blocks";
import { blockChildPaths, insertAdapter } from "./block-text-adapters";
import { pointsBounds } from "./entity-hit-geometry";
import { layoutToCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const close = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) < tolerance;

// ── La caché genérica: memoriza por (blockId, versión, segmentos) ──────────
clearCadBlockCache();
ok(cadBlockCacheSize() === 0, "arranca vacía");

let produced = 0;
const geometry = (): CadBlockLocalGeometry => {
  produced += 1;
  return { paths: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
};

const first = cadBlockLocalGeometry("door", 1, 96, geometry);
const second = cadBlockLocalGeometry("door", 1, 96, geometry);
ok(produced === 1, "la misma (bloque, versión, segmentos) no vuelve a producir");
ok(first === second, "devuelve la MISMA referencia en vez de recomputar");

cadBlockLocalGeometry("door", 2, 96, geometry);
ok(produced === 2, "subir la versión invalida y recomputa");

cadBlockLocalGeometry("door", 2, 32, geometry);
ok(produced === 3, "otro escalón de segmentos es otra entrada");

cadBlockLocalGeometry("window", 1, 96, geometry);
ok(cadBlockCacheSize() === 2, "una entrada por bloque, no por versión ni por escalón acumulados");

clearCadBlockCache();
ok(cadBlockCacheSize() === 0, "`clearCadBlockCache` vacía de verdad");

// ── La afín de colocación coincide con `resolveCadInsert` ───────────────────
function groundTruthBounds(document: CadDocument, insertId: string, segments = 96) {
  const resolved = resolveCadInsert(document, insertId, 16);
  const points = resolved.entities.flatMap((child) => blockChildPaths(child, segments)).flatMap((path) => path.points);
  return pointsBounds(points);
}

function buildDocument(): CadDocument {
  const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
    id,
    type: "line",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    layer: "0",
  });
  let document = layoutToCadDocument({
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  });
  document = {
    ...document,
    entities: [line("wing-a", 10, 20, 30, 20), line("wing-b", 30, 20, 30, 5)],
    modelSpace: { entityIds: ["wing-a", "wing-b"] },
  };
  document = defineCadBlock(document, {
    id: "l-bracket",
    name: "L-BRACKET",
    entityIds: ["wing-a", "wing-b"],
    basePoint: { x: 10, y: 20, z: 0 },
  });
  return document;
}

const placements: Array<{ id: string; insertion: { x: number; y: number }; rotation: number; scale: { x: number; y: number } }> = [
  // Insertar en `basePoint` (10,20) hace que el mundo coincida con lo
  // autorado: es la MISMA identidad que usa `localBlockGeometry` para su
  // propio INSERT sintético (ver `block-text-adapters.ts`).
  { id: "identity", insertion: { x: 10, y: 20 }, rotation: 0, scale: { x: 1, y: 1 } },
  { id: "rotated", insertion: { x: 500, y: -200 }, rotation: 37, scale: { x: 1, y: 1 } },
  { id: "non-uniform", insertion: { x: -80, y: 60 }, rotation: 15, scale: { x: 3, y: 0.5 } },
  { id: "reflected", insertion: { x: 200, y: 200 }, rotation: 200, scale: { x: -2, y: 2 } },
  // Cardinal (90°) + escala no uniforme + reflejada: el camino O(1) —transformar
  // sólo las 4 esquinas del AABB local— tiene que seguir dando el envolvente
  // EXACTO aquí, no sólo en la identidad.
  { id: "cardinal-90", insertion: { x: 300, y: 300 }, rotation: 90, scale: { x: 1, y: -3 } },
];

clearCadBlockCache();
let document = buildDocument();
for (const placement of placements) {
  document = insertCadBlock(document, {
    id: placement.id,
    block: "l-bracket",
    insertion: { x: placement.insertion.x, y: placement.insertion.y, z: 0 },
    scale: { x: placement.scale.x, y: placement.scale.y, z: 1 },
    rotation: placement.rotation,
    layer: "0",
  });
}

for (const placement of placements) {
  const entity = document.entities.find((candidate) => candidate.id === placement.id)!;
  ok(CAD_ENTITY_REGISTRY.supports(entity), `${placement.id}: INSERT es una entidad nativa soportada`);
  const truth = groundTruthBounds(document, placement.id);
  const fast = insertAdapter.bounds.bounds(entity as Parameters<typeof insertAdapter.bounds.bounds>[0], document);
  ok(
    close(truth.minX, fast.minX) && close(truth.minY, fast.minY) && close(truth.maxX, fast.maxX) && close(truth.maxY, fast.maxY),
    `${placement.id}: bounds cacheados == bounds de resolveCadInsert (verdad: ${JSON.stringify(truth)}, caché: ${JSON.stringify(fast)})`,
  );
}

// El AABB local de `l-bracket` se calculó UNA vez, no una por instancia: todas
// las colocaciones de la MISMA definición comparten la entrada de la caché.
ok(cadBlockCacheSize() === 1, `${placements.length} instancias del mismo bloque comparten una única entrada`);

// ── hitTest no se contamina entre instancias del mismo bloque ──────────────
const rotatedEntity = document.entities.find((candidate) => candidate.id === "rotated")!;
const identityEntity = document.entities.find((candidate) => candidate.id === "identity")!;
// El punto medio de `wing-a` en la instancia "identity" (sin transformar) es
// (20, 20); en "rotated" ese mismo punto del bloque cae en otro lugar del
// mundo, así que tiene que dar HIT en una instancia y no en la otra.
ok(
  insertAdapter.hitTester.hitTest(identityEntity as Parameters<typeof insertAdapter.hitTester.hitTest>[0], { x: 20, y: 20 }, 0.5, document),
  "el punto local (20,20) da hit en la instancia SIN transformar",
);
ok(
  !insertAdapter.hitTester.hitTest(rotatedEntity as Parameters<typeof insertAdapter.hitTester.hitTest>[0], { x: 20, y: 20 }, 0.5, document),
  "el mismo punto de mundo NO da hit en la instancia ROTADA: la caché por bloque no filtró la afín de la instancia",
);

// ── `cadBlockWorldBounds`/`cadBlockWorldPaths` en aislamiento ───────────────
const localRectangle = { minX: 0, minY: 0, maxX: 10, maxY: 4 };
const rotatedWorld = cadBlockWorldBounds(localRectangle, {
  insertion: { x: 0, y: 0 },
  rotationDeg: 90,
  scaleX: 1,
  scaleY: 1,
  basePoint: { x: 0, y: 0 },
});
// Un rectángulo de 10×4 girado 90° es un rectángulo de 4×10 centrado en el
// mismo origen: las X pasan a ser las Y con el signo que impone el giro.
ok(
  close(rotatedWorld.minX, -4) && close(rotatedWorld.maxX, 0) && close(rotatedWorld.minY, 0) && close(rotatedWorld.maxY, 10),
  `girar 90° un rectángulo 10×4 da 4×10: ${JSON.stringify(rotatedWorld)}`,
);
const paths = cadBlockWorldPaths(
  [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }],
  { insertion: { x: 5, y: 5 }, rotationDeg: 0, scaleX: 2, scaleY: 2, basePoint: { x: 0, y: 0 } },
);
ok(
  close(paths[0].points[1].x, 25) && close(paths[0].points[1].y, 5),
  `escalar ×2 y trasladar (5,5) lleva (10,0) a (25,5): ${JSON.stringify(paths[0].points[1])}`,
);

console.log(
  `block-cache: ${checks} comprobaciones verdes — la caché memoriza por (bloque, versión, segmentos) y no por instancia, ` +
    "redefinir el bloque o pedir otro escalón invalida, varias colocaciones del mismo bloque comparten una entrada, " +
    "el envolvente coincide con resolveCadInsert en traslación, giro cardinal y arbitrario, escala no uniforme y " +
    "reflexión, y dos instancias del mismo bloque no se contaminan entre sí.",
);
