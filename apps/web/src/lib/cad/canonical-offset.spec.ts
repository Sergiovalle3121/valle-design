import assert from "node:assert/strict";
import {
  OFFSET_REJECTION_MESSAGE,
  offsetCanonicalEntity,
  type OffsetEntityResult,
} from "./draw-action-entities";
import { offsetPath, signedArea } from "./geom-edit";
import type { CadEntity } from "./cad-document";

/**
 * OFFSET canónico — geometría EXACTA, no "sigue cerrada y tiene 4 vértices".
 *
 * El offset de un contorno cerrado se calculaba como si fuese abierto: se
 * repetía el primer punto al final, se desplazaba el recorrido y se recortaba
 * el último vértice. El vértice 0 salía entonces del tramo desplazado inicial
 * en vez de la intersección con el tramo de cierre, así que el contorno tenía
 * una COSTURA DIAGONAL en la primera esquina. Las aserciones que sólo miraban
 * `closed === true` y `vertices.length === 4` pasaban con esa geometría rota,
 * por eso aquí se comprueban las coordenadas.
 *
 * Además: una polilínea con `bulge` describe arcos, y reconstruir sólo
 * `{x,y,z}` los convertía en cuerdas sin avisar. Eso ahora se rechaza.
 */

const TOLERANCE = 1e-9;
let counter = 0;
const nextId = () => `off-${++counter}`;

function accepted(result: OffsetEntityResult): CadEntity {
  assert.equal(
    result.ok,
    true,
    `esperaba aceptar el desfase, se rechazó por ${result.ok ? "" : result.reason}`,
  );
  if (!result.ok) throw new Error("unreachable");
  return result.entity;
}

function rejectedBecause(result: OffsetEntityResult, reason: string) {
  assert.equal(result.ok, false, `esperaba rechazar por ${reason}`);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.reason, reason);
  // Todo rechazo tiene un texto concreto: el usuario debe saber QUÉ pasó.
  assert.ok(
    OFFSET_REJECTION_MESSAGE[result.reason].length > 10,
    "cada rechazo explica el motivo",
  );
}

function polylineXY(entity: CadEntity): [number, number][] {
  if (entity.type !== "polyline") throw new Error("no es una polilínea");
  return entity.vertices.map((vertex) => [vertex.x, vertex.y]);
}

function assertPoints(
  actual: [number, number][],
  expected: [number, number][],
  message: string,
) {
  assert.equal(actual.length, expected.length, `${message}: número de vértices`);
  actual.forEach(([x, y], index) => {
    const [ex, ey] = expected[index];
    assert.ok(
      Math.abs(x - ex) <= TOLERANCE && Math.abs(y - ey) <= TOLERANCE,
      `${message}: vértice ${index} esperado (${ex}, ${ey}), obtenido (${x}, ${y})`,
    );
  });
}

function square(closed = true): CadEntity {
  return {
    id: "square",
    type: "polyline",
    closed,
    layer: "MUROS",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 1_000, z: 0 },
      { x: 0, y: 1_000, z: 0 },
    ],
  };
}

/* ── El caso obligatorio: cuadrado CCW de 1000, offset ±100 ────────────── */

const inner = accepted(offsetCanonicalEntity(square(), 100, nextId));
assertPoints(
  polylineXY(inner),
  [
    [100, 100],
    [900, 100],
    [900, 900],
    [100, 900],
  ],
  "OFFSET +100 sobre un cuadrado CCW produce el contorno interior exacto",
);
assert.equal(
  inner.type === "polyline" && inner.closed,
  true,
  "el contorno sigue cerrado",
);
assert.equal(inner.id === "square", false, "el desfase es una entidad nueva");
assert.equal(inner.layer, "MUROS", "hereda la capa del original");

const outer = accepted(offsetCanonicalEntity(square(), -100, nextId));
assertPoints(
  polylineXY(outer),
  [
    [-100, -100],
    [1_100, -100],
    [1_100, 1_100],
    [-100, 1_100],
  ],
  "OFFSET -100 produce el contorno exterior exacto",
);

// La costura diagonal se detecta sin mirar coordenadas concretas: en el
// contorno correcto los cuatro lados siguen siendo ejes-paralelos y del mismo
// largo. Con el vértice 0 mal resuelto, dos lados quedaban oblicuos.
{
  const vertices = polylineXY(inner);
  const sides = vertices.map(([x, y], index) => {
    const [nx, ny] = vertices[(index + 1) % vertices.length];
    return { dx: nx - x, dy: ny - y };
  });
  for (const { dx, dy } of sides) {
    assert.ok(
      Math.abs(dx) <= TOLERANCE || Math.abs(dy) <= TOLERANCE,
      "ningún lado del contorno desplazado es oblicuo (no hay costura diagonal)",
    );
    assert.ok(
      Math.abs(Math.hypot(dx, dy) - 800) <= TOLERANCE,
      "los cuatro lados miden 800",
    );
  }
  assert.equal(
    new Set(vertices.map(([x, y]) => `${x}:${y}`)).size,
    4,
    "cuatro vértices ÚNICOS: el cierre lo declara `closed`, no un punto repetido",
  );
}

/* ── Orientación inversa: el signo sigue al sentido de recorrido ────────── */

{
  const clockwise: CadEntity = {
    ...(square() as Extract<CadEntity, { type: "polyline" }>),
    vertices: [...(square() as Extract<CadEntity, { type: "polyline" }>).vertices].reverse(),
  };
  const result = accepted(offsetCanonicalEntity(clockwise, 100, nextId));
  // El mismo +100 que entraba en el contorno CCW sale en el CW: el signo es
  // "a la izquierda del recorrido", no "hacia dentro".
  assertPoints(
    polylineXY(result),
    [
      [-100, 1_100],
      [1_100, 1_100],
      [1_100, -100],
      [-100, -100],
    ],
    "invertir la orientación invierte el lado del desfase",
  );
  assert.ok(
    signedArea(polylineXY(result).map(([x, y]) => ({ x, y }))) < 0,
    "un contorno horario sigue siendo horario después del desfase",
  );
}

/* ── Una polilínea ABIERTA no se cierra sola ───────────────────────────── */

{
  const open = accepted(offsetCanonicalEntity(square(false), 100, nextId));
  assert.equal(open.type === "polyline" && open.closed, false);
  assertPoints(
    polylineXY(open),
    [
      [0, 100],
      [900, 100],
      [900, 900],
      [0, 900],
    ],
    "el recorrido abierto conserva sus extremos sin ingletar",
  );
}

/* ── BULGE: los arcos NO se convierten en cuerdas en silencio ──────────── */

{
  const withBulge: CadEntity = {
    id: "arc-pline",
    type: "polyline",
    closed: true,
    layer: "MUROS",
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 0.5 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 1_000, z: 0 },
    ],
  };
  rejectedBecause(
    offsetCanonicalEntity(withBulge, 100, nextId),
    "bulge-unsupported",
  );
  // Y el bulge del TRAMO DE CIERRE cuenta igual que cualquier otro.
  const closingBulge: CadEntity = {
    ...(withBulge as Extract<CadEntity, { type: "polyline" }>),
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 1_000, z: 0, bulge: -0.25 },
    ],
  };
  rejectedBecause(
    offsetCanonicalEntity(closingBulge, 100, nextId),
    "bulge-unsupported",
  );
  // `bulge: 0` es una recta declarada, no un arco: eso sí se desplaza.
  const zeroBulge: CadEntity = {
    ...(square() as Extract<CadEntity, { type: "polyline" }>),
    vertices: (square() as Extract<CadEntity, { type: "polyline" }>).vertices.map(
      (vertex) => ({ ...vertex, bulge: 0 }),
    ),
  };
  accepted(offsetCanonicalEntity(zeroBulge, 100, nextId));
}

/* ── La cota Z viaja con SU vértice ─────────────────────────────────────── */

{
  const elevated: CadEntity = {
    id: "elevated",
    type: "polyline",
    closed: true,
    layer: "MUROS",
    vertices: [
      { x: 0, y: 0, z: 10 },
      { x: 1_000, y: 0, z: 20 },
      { x: 1_000, y: 1_000, z: 30 },
      { x: 0, y: 1_000, z: 40 },
    ],
  };
  const result = accepted(offsetCanonicalEntity(elevated, 100, nextId));
  if (result.type !== "polyline") throw new Error("unreachable");
  assert.deepEqual(
    result.vertices.map((vertex) => vertex.z),
    [10, 20, 30, 40],
    "cada vértice conserva su propia z",
  );
}

/* ── Vértices repetidos: se funden, no producen normales inventadas ────── */

{
  const duplicated: CadEntity = {
    id: "dup",
    type: "polyline",
    closed: true,
    layer: "MUROS",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
      { x: 1_000, y: 1_000, z: 0 },
      { x: 0, y: 1_000, z: 0 },
    ],
  };
  const result = accepted(offsetCanonicalEntity(duplicated, 100, nextId));
  assertPoints(
    polylineXY(result),
    [
      [100, 100],
      [900, 100],
      [900, 900],
      [100, 900],
    ],
    "el vértice repetido desaparece y la esquina se resuelve igual",
  );
}

/* ── Resultados imposibles: se rechazan, no se inventan ────────────────── */

rejectedBecause(
  offsetCanonicalEntity(square(), 600, nextId),
  "impossible-result",
);
rejectedBecause(
  offsetCanonicalEntity(square(), 500, nextId),
  "impossible-result",
);
rejectedBecause(offsetCanonicalEntity(square(), 0, nextId), "invalid-distance");
rejectedBecause(
  offsetCanonicalEntity(square(), Number.NaN, nextId),
  "invalid-distance",
);
rejectedBecause(
  offsetCanonicalEntity(square(), Number.POSITIVE_INFINITY, nextId),
  "invalid-distance",
);

/* ── LINE degenerada: sin dirección no hay perpendicular ───────────────── */

{
  const degenerate: CadEntity = {
    id: "dot",
    type: "line",
    layer: "MUROS",
    start: { x: 5, y: 5, z: 0 },
    end: { x: 5, y: 5, z: 0 },
  };
  rejectedBecause(
    offsetCanonicalEntity(degenerate, 100, nextId),
    "degenerate-geometry",
  );
}

{
  const vertical: CadEntity = {
    id: "v",
    type: "line",
    layer: "MUROS",
    start: { x: 1_000, y: 0, z: 3 },
    end: { x: 1_000, y: 2_000, z: 7 },
  };
  const result = accepted(offsetCanonicalEntity(vertical, 250, nextId));
  if (result.type !== "line") throw new Error("unreachable");
  assert.deepEqual(
    [result.start.x, result.start.y, result.start.z],
    [750, 0, 3],
    "el desfase es perpendicular y conserva z",
  );
  assert.deepEqual([result.end.x, result.end.y, result.end.z], [750, 2_000, 7]);
}

/* ── Tipos no soportados: rechazo explícito, no `null` ambiguo ─────────── */

{
  const text: CadEntity = {
    id: "t",
    type: "mtext",
    layer: "MUROS",
    insert: { x: 0, y: 0, z: 0 },
    text: "hola",
    height: 100,
    width: 500,
    rotation: 0,
    attachment: "top-left",
  } as unknown as CadEntity;
  rejectedBecause(offsetCanonicalEntity(text, 100, nextId), "unsupported-entity");
}

/* ── El motor de recorrido: sin NaN, con tope de inglete ───────────────── */

{
  // Triángulo astilla: el vértice (1000,0) abre ~0.06°, así que su inglete
  // tiende al infinito. Desplazado HACIA FUERA el offset existe y sólo hay que
  // acotar la punta; el límite de inglete es lo que impide que una esquina
  // aguda dispare una coordenada de cientos de miles de unidades.
  const sliver = [
    { x: 0, y: 0 },
    { x: 1_000, y: 0 },
    { x: 0, y: 1 },
  ];
  const unbounded = offsetPath(sliver, -50, {
    closed: true,
    miterLimit: Number.MAX_SAFE_INTEGER,
  });
  assert.ok(unbounded);
  assert.ok(
    (unbounded ?? [])[1].x > 100_000,
    "sin tope, la punta se dispara: por eso el límite de inglete es obligatorio",
  );

  const bounded = offsetPath(sliver, -50, { closed: true, miterLimit: 4 });
  assert.ok(bounded, "hacia fuera el desfase de la astilla sí existe");
  for (const point of bounded ?? []) {
    assert.ok(
      Number.isFinite(point.x) && Number.isFinite(point.y),
      "ninguna coordenada es NaN o Infinity",
    );
  }
  const apex = (bounded ?? [])[1];
  assert.ok(
    Math.abs(Math.hypot(apex.x - 1_000, apex.y - 0) - 4 * 50) <= 1e-9,
    "la punta queda EXACTAMENTE a 4·|dist| del vértice original, sobre su bisectriz",
  );

  // Hacia DENTRO la astilla no tiene desfase posible: su radio interior es
  // menor que medio milímetro. Devolver un triángulo dado la vuelta sería peor
  // que rechazar.
  assert.equal(
    offsetPath(sliver, 50, { closed: true, miterLimit: 4 }),
    null,
    "un desfase interior mayor que el radio interior se rechaza",
  );
}

assert.equal(
  offsetPath([{ x: 0, y: 0 }], 10, { closed: false }),
  null,
  "un recorrido de un solo punto no admite desfase",
);
assert.equal(
  offsetPath(
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    10,
    { closed: false },
  ),
  null,
  "un recorrido sin ningún tramo real no admite desfase",
);
assert.equal(
  offsetPath(
    [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
    ],
    10,
    { closed: false },
  ),
  null,
  "una coordenada no finita no produce geometría",
);

// Tramos colineales: la esquina no existe y el resultado no salta al infinito.
{
  const collinear = offsetPath(
    [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 1_000, y: 0 },
    ],
    100,
    { closed: false },
  );
  assert.ok(collinear);
  assert.deepEqual(
    (collinear ?? []).map((point) => [point.x, point.y]),
    [
      [0, 100],
      [500, 100],
      [1_000, 100],
    ],
    "tres puntos colineales se desplazan en bloque",
  );
}

console.log("canonical-offset.spec.ts OK");
