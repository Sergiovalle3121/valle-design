import assert from "node:assert/strict";
import {
  canonicalEntityFromDrawAction,
  offsetCanonicalEntity,
  type CanonicalDrawAction,
} from "./draw-action-entities";
import type { CadEntity } from "./cad-document";

/**
 * PRIORIDAD 2 — las herramientas básicas producen entidades CANÓNICAS.
 *
 * Antes: LINE → un muro, POLYLINE → varios muros desconectados, RECT → una
 * zona, CIRCLE → una zona con `shape: 'circle'`. El documento describía
 * mobiliario, no geometría.
 */

let counter = 0;
const options = (layer = "MUROS") => ({
  layer,
  newId: () => `ent-${++counter}`,
});

function ok(action: CanonicalDrawAction, layer?: string) {
  const result = canonicalEntityFromDrawAction(action, options(layer));
  assert.equal(result.ok, true, `esperaba aceptar ${action.type}`);
  return result.ok ? result.entity : null!;
}

function rejected(action: CanonicalDrawAction) {
  const result = canonicalEntityFromDrawAction(action, options());
  assert.equal(result.ok, false, `esperaba rechazar ${action.type}`);
  return result.ok ? null! : result.reason;
}

/* ── LINE → una entidad `line` ── */

const line = ok({
  type: "addSegment",
  a: { x: 1_000, y: 1_000 },
  b: { x: 5_000, y: 1_000 },
});
assert.equal(line.type, "line");
assert.equal(line.layer, "MUROS", "nace en la capa activa");
if (line.type !== "line") throw new Error("unreachable");
assert.deepEqual(line.start, { x: 1_000, y: 1_000, z: 0 }, "el dibujo 2D vive en z = 0");
assert.deepEqual(line.end, { x: 5_000, y: 1_000, z: 0 });

assert.equal(
  rejected({ type: "addSegment", a: { x: 10, y: 10 }, b: { x: 10, y: 10 } }),
  "degenerate-segment",
  "dos clics en el mismo punto no son una línea",
);
assert.equal(
  rejected({ type: "addSegment", a: { x: 0, y: 0 }, b: { x: Number.NaN, y: 0 } }),
  "non-finite",
);

/* ── POLYLINE → UNA entidad `polyline`, no N muros ── */

const polyline = ok({
  type: "addPolyline",
  points: [
    { x: 0, y: 0 },
    { x: 1_000, y: 0 },
    { x: 1_000, y: 800 },
  ],
  closed: false,
});
assert.equal(polyline.type, "polyline");
if (polyline.type !== "polyline") throw new Error("unreachable");
assert.equal(polyline.closed, false);
assert.equal(polyline.vertices.length, 3, "una sola entidad conserva TODOS los vértices");
assert.deepEqual(polyline.vertices[2], { x: 1_000, y: 800, z: 0 });

// Un clic repetido no debe producir un vértice duplicado consecutivo.
const deduped = ok({
  type: "addPolyline",
  points: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 500, y: 0 },
  ],
  closed: false,
});
if (deduped.type !== "polyline") throw new Error("unreachable");
assert.equal(deduped.vertices.length, 2);

// Cerrada: el cierre lo declara `closed`, no un vértice repetido al final.
const closed = ok({
  type: "addPolyline",
  points: [
    { x: 0, y: 0 },
    { x: 900, y: 0 },
    { x: 900, y: 700 },
    { x: 0, y: 0 },
  ],
  closed: true,
});
if (closed.type !== "polyline") throw new Error("unreachable");
assert.equal(closed.closed, true);
assert.equal(closed.vertices.length, 3, "no se duplica el primer vértice al final");

assert.equal(
  rejected({ type: "addPolyline", points: [{ x: 5, y: 5 }], closed: false }),
  "degenerate-polyline",
);
assert.equal(
  rejected({
    type: "addPolyline",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    closed: true,
  }),
  "degenerate-polyline",
  "una cerrada necesita tres vértices para encerrar área",
);

/* ── RECT → polilínea CERRADA de cuatro vértices únicos ── */

const rect = ok({ type: "addRect", x: 100, y: 200, w: 400, h: 300 });
assert.equal(rect.type, "polyline");
if (rect.type !== "polyline") throw new Error("unreachable");
assert.equal(rect.closed, true);
assert.equal(rect.vertices.length, 4, "cuatro vértices únicos, sin repetir el primero");
assert.deepEqual(rect.vertices.map((v) => [v.x, v.y]), [
  [100, 200],
  [500, 200],
  [500, 500],
  [100, 500],
]);

// Arrastre en dirección inversa: mismo rectángulo, no uno negativo.
const inverted = ok({ type: "addRect", x: 500, y: 500, w: -400, h: -300 });
if (inverted.type !== "polyline") throw new Error("unreachable");
assert.deepEqual(inverted.vertices.map((v) => [v.x, v.y]), [
  [100, 200],
  [500, 200],
  [500, 500],
  [100, 500],
]);

assert.equal(
  rejected({ type: "addRect", x: 0, y: 0, w: 0, h: 300 }),
  "degenerate-rect",
);

/* ── CIRCLE → una entidad `circle` sin rastro heredado ── */

const circle = ok({ type: "addCircle", cx: 4_000, cy: 3_000, r: 250 }, "0");
assert.equal(circle.type, "circle");
if (circle.type !== "circle") throw new Error("unreachable");
assert.equal(circle.radius, 250);
assert.deepEqual(circle.center, { x: 4_000, y: 3_000, z: 0 });
assert.equal(circle.layer, "0");
assert.equal(
  (circle as { legacy?: unknown }).legacy,
  undefined,
  "un círculo dibujado hoy NO nace como asset heredado",
);

assert.equal(
  rejected({ type: "addCircle", cx: 0, cy: 0, r: 0 }),
  "degenerate-circle",
);

/* ── Los ids salen del generador inyectado: nada aleatorio en el kernel ── */

const before = counter;
ok({ type: "addCircle", cx: 0, cy: 0, r: 10 });
assert.equal(counter, before + 1, "se consume exactamente un id por entidad");

/* ── OFFSET real: perpendicular, no una traslación de la caja ── */

// La geometría EXACTA del desfase (contorno cerrado, bulge, orientación,
// inglete, resultados imposibles) vive en `canonical-offset.spec.ts`. Aquí
// sólo queda el contrato de este módulo: la operación devuelve un resultado
// explícito, nunca `null` ambiguo ni geometría aproximada en silencio.

function offsetOk(entity: CadEntity, distance: number, id: string) {
  const result = offsetCanonicalEntity(entity, distance, () => id);
  assert.equal(result.ok, true, "esperaba un desfase válido");
  if (!result.ok) throw new Error("unreachable");
  return result.entity;
}

function offsetRejected(entity: CadEntity, distance: number) {
  const result = offsetCanonicalEntity(entity, distance, () => "unused");
  assert.equal(result.ok, false, "esperaba rechazar el desfase");
  if (result.ok) throw new Error("unreachable");
  return result.reason;
}

// El OFFSET heredado hacía `x + distancia` sobre el asset. Sobre una línea
// VERTICAL eso la movía a lo largo de su propio eje y no la desfasaba en
// absoluto; el desfase correcto es perpendicular.
const vertical = ok({
  type: "addSegment",
  a: { x: 1_000, y: 0 },
  b: { x: 1_000, y: 2_000 },
});
const offsetLine = offsetOk(vertical, 250, "off-1");
if (offsetLine.type !== "line") throw new Error("unreachable");
assert.notEqual(offsetLine.id, vertical.id, "el desfase es una entidad nueva");
assert.equal(Math.abs(offsetLine.start.x - 1_000), 250, "se desplaza en X, perpendicular");
assert.equal(offsetLine.start.y, 0, "y NO a lo largo de su propio eje");
assert.equal(offsetLine.end.y, 2_000);

// Un círculo se desfasa concéntricamente.
const baseCircle = ok({ type: "addCircle", cx: 0, cy: 0, r: 500 });
const offsetCircle = offsetOk(baseCircle, 100, "off-2");
if (offsetCircle.type !== "circle") throw new Error("unreachable");
assert.equal(offsetCircle.radius, 600);
assert.deepEqual(offsetCircle.center, { x: 0, y: 0, z: 0 });
assert.equal(
  offsetRejected(baseCircle, -500),
  "impossible-result",
  "un radio no positivo no es un círculo: la operación no produce nada",
);

// Una polilínea cerrada sigue cerrada, conserva sus vértices y —lo que las
// aserciones anteriores no comprobaban— la geometría correcta en TODAS las
// esquinas, incluida la primera.
const closedSquare = ok({ type: "addRect", x: 0, y: 0, w: 1_000, h: 1_000 });
const offsetSquare = offsetOk(closedSquare, 100, "off-4");
if (offsetSquare.type !== "polyline") throw new Error("unreachable");
assert.equal(offsetSquare.closed, true);
assert.equal(offsetSquare.vertices.length, 4, "el contorno no se abre por una esquina");
assert.deepEqual(
  offsetSquare.vertices.map((vertex) => [vertex.x, vertex.y]),
  [
    [100, 100],
    [900, 100],
    [900, 900],
    [100, 900],
  ],
  "sin costura diagonal en el vértice de cierre",
);

assert.equal(
  offsetRejected(vertical, 0),
  "invalid-distance",
  "un desfase de cero no crea geometría duplicada",
);

console.log("draw-action-entities.spec.ts OK");
