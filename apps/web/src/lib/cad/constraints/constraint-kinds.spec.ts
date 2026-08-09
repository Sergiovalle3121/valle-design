/**
 * Las diecisiete restricciones, una por una, sobre TODOS los tipos de entidad
 * que participan.
 *
 * Cada caso lleva su ANCLA ABSOLUTA: no basta con «la propiedad se cumple»,
 * porque una propiedad se cumple de forma vacía si el código no toca el campo.
 * Aquí se dice qué número concreto tiene que salir.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../cad-document";
import type { CadConstraint } from "./constraint-schema";
import { solveConstraintSystem } from "./solver";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const close = (actual: number, expected: number, tolerance: number, message: string) =>
  ok(Math.abs(actual - expected) <= tolerance, `${message} (${actual} vs ${expected})`);

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer: "0",
});
const circle = (id: string, x: number, y: number, r: number): CadEntity => ({
  id, type: "circle", center: { x, y, z: 0 }, radius: r, layer: "0",
});
const arc = (id: string, x: number, y: number, r: number, a0: number, a1: number): CadEntity => ({
  id, type: "arc", center: { x, y, z: 0 }, radius: r, startAngle: a0, endAngle: a1, layer: "0",
});
const spline = (id: string, points: [number, number][]): CadEntity => ({
  id, type: "spline", degree: 3, knots: [], layer: "0",
  controlPoints: points.map(([x, y]) => ({ x, y, z: 0 })),
});
const fix = (id: string, entityId: string): CadConstraint => ({
  id, kind: "fix", entityIds: [entityId], enabled: true,
});
const solve = (entities: CadEntity[], constraints: CadConstraint[]) =>
  solveConstraintSystem(entities, constraints, { tolerance: 1e-9 });
const get = (entities: readonly CadEntity[], id: string) => entities.find((entity) => entity.id === id);

/** Distancia con signo del punto al soporte infinito del segmento. */
function distanceToLine(entities: readonly CadEntity[], lineId: string, point: { x: number; y: number }): number {
  const target = get(entities, lineId);
  if (target?.type !== "line") return Number.NaN;
  const dx = target.end.x - target.start.x;
  const dy = target.end.y - target.start.y;
  const length = Math.hypot(dx, dy);
  return Math.abs((dx * (point.y - target.start.y) - dy * (point.x - target.start.x)) / length);
}

// ---------------------------------------------------------------------------
// Tangencia
// ---------------------------------------------------------------------------

// Recta-círculo: la distancia del centro a la recta es EXACTAMENTE el radio.
{
  const result = solve([line("t", 0, 0, 1000, 0), circle("o", 500, 400, 250)], [
    { id: "tg", kind: "tangent", entityIds: ["t", "o"], enabled: true },
    fix("fx", "o"),
  ]);
  ok(result.converged, "tangencia recta-círculo converge");
  const round = get(result.entities, "o");
  ok(round?.type === "circle", "el círculo sigue siendo un círculo");
  if (round?.type === "circle") {
    close(round.radius, 250, 1e-12, "el círculo anclado no cambia de radio");
    close(distanceToLine(result.entities, "t", round.center), 250, 1e-9, "dist(centro, recta) = r");
  }
}

// Recta-arco: se usa la circunferencia soporte del arco, y sus ángulos no se tocan.
{
  const result = solve([line("t", 0, 0, 1000, 0), arc("a", 500, 400, 250, 0, 180)], [
    { id: "tg", kind: "tangent", entityIds: ["t", "a"], enabled: true },
    fix("fx", "a"),
  ]);
  ok(result.converged, "tangencia recta-arco converge");
  const target = get(result.entities, "t");
  ok(target?.type === "line", "la recta sigue siendo recta");
  if (target?.type === "line") {
    close(target.start.y, 150, 1e-9, "la recta se sitúa a 150 (400 - 250)");
    close(target.end.y, 150, 1e-9, "y queda horizontal, como estaba");
  }
  close(distanceToLine(result.entities, "t", { x: 500, y: 400 }), 250, 1e-9, "dist(centro, recta) = r del arco");
}

// Círculo-círculo EXTERNA: la configuración inicial elige el caso.
{
  const result = solve([circle("a", 0, 0, 100), circle("b", 500, 0, 200)], [
    { id: "tg", kind: "tangent", entityIds: ["a", "b"], enabled: true },
    fix("fx", "a"),
  ]);
  const first = get(result.entities, "a");
  const second = get(result.entities, "b");
  ok(first?.type === "circle" && second?.type === "circle", "siguen siendo dos círculos");
  if (first?.type === "circle" && second?.type === "circle") {
    const distance = Math.hypot(first.center.x - second.center.x, first.center.y - second.center.y);
    close(distance, first.radius + second.radius, 1e-9, "externa: d = r1 + r2");
    close(first.radius, 100, 1e-12, "el círculo anclado no se toca");
  }
}

// Círculo-círculo INTERNA: uno dentro del otro; el caso correcto es el otro.
{
  const result = solve([circle("big", 0, 0, 500), circle("small", 100, 0, 200)], [
    { id: "tg", kind: "tangent", entityIds: ["big", "small"], enabled: true },
    fix("fx", "big"),
  ]);
  const outer = get(result.entities, "big");
  const inner = get(result.entities, "small");
  if (outer?.type === "circle" && inner?.type === "circle") {
    const distance = Math.hypot(outer.center.x - inner.center.x, outer.center.y - inner.center.y);
    close(distance, Math.abs(outer.radius - inner.radius), 1e-9, "interna: d = |r1 - r2|");
    close(inner.center.x, 200, 1e-6, "centro interior en 200");
    close(inner.radius, 300, 1e-6, "radio interior 300 (500 - 200)");
    ok(distance < outer.radius, "y el pequeño queda DENTRO, que es lo que distingue el caso");
  }
}

// El caso se puede declarar y entonces manda sobre la configuración inicial.
{
  const forced = solve([circle("big", 0, 0, 500), circle("small", 100, 0, 200)], [
    { id: "tg", kind: "tangent", entityIds: ["big", "small"], tangency: "external", enabled: true },
    fix("fx", "big"),
  ]);
  const outer = get(forced.entities, "big");
  const inner = get(forced.entities, "small");
  if (outer?.type === "circle" && inner?.type === "circle") {
    const distance = Math.hypot(outer.center.x - inner.center.x, outer.center.y - inner.center.y);
    close(distance, outer.radius + inner.radius, 1e-9, "declarar «external» impone la tangencia externa");
  }
}

// Sobre una elipse, la tangencia se RECHAZA por su nombre en vez de aproximarse.
{
  const rejected = solve([
    line("l", 0, 0, 100, 0),
    { id: "e", type: "ellipse", center: { x: 0, y: 0, z: 0 }, majorAxis: { x: 200, y: 0, z: 0 }, ratio: 0.5, startParameter: 0, endParameter: 6.28, layer: "0" },
  ], [{ id: "tg", kind: "tangent", entityIds: ["l", "e"], enabled: true }]);
  ok(!rejected.converged, "tangencia con elipse no se finge");
  ok(
    rejected.issues.some((issue) => issue.message.includes("ellipse")),
    "y el rechazo dice qué tipo no admite",
  );
}

// ---------------------------------------------------------------------------
// Concéntrica, radio igual, radio y diámetro
// ---------------------------------------------------------------------------

{
  const result = solve([circle("c1", 0, 0, 100), arc("c2", 300, 40, 250, 10, 90)], [
    { id: "cc", kind: "concentric", entityIds: ["c1", "c2"], enabled: true },
    { id: "er", kind: "equalRadius", entityIds: ["c1", "c2"], enabled: true },
    fix("fx", "c1"),
  ]);
  ok(result.converged, "concéntrica + radio igual entre círculo y ARCO converge");
  const target = get(result.entities, "c2");
  ok(target?.type === "arc", "el arco sigue siendo un arco");
  if (target?.type === "arc") {
    close(target.center.x, 0, 1e-9, "el arco toma el centro del círculo (x)");
    close(target.center.y, 0, 1e-9, "el arco toma el centro del círculo (y)");
    close(target.radius, 100, 1e-9, "y su radio");
    close(target.startAngle, 10, 1e-9, "sin tocar el ángulo inicial");
    close(target.endAngle, 90, 1e-9, "ni el final");
  }
}

{
  const result = solve([circle("c", 0, 0, 100), circle("d", 500, 0, 100)], [
    { id: "r1", kind: "radius", entityIds: ["c"], value: 250, enabled: true },
    { id: "d1", kind: "diameter", entityIds: ["d"], value: 800, enabled: true },
  ]);
  const byRadius = get(result.entities, "c");
  const byDiameter = get(result.entities, "d");
  if (byRadius?.type === "circle") close(byRadius.radius, 250, 1e-9, "radio 250");
  if (byDiameter?.type === "circle") close(byDiameter.radius, 400, 1e-9, "diámetro 800 son 400 de radio");
}

// ---------------------------------------------------------------------------
// Simetría respecto de un eje
// ---------------------------------------------------------------------------

{
  const result = solve([
    line("a", 100, 100, 300, 400), line("b", -150, 90, -280, 380), line("axis", 0, -500, 0, 500),
  ], [
    { id: "sy", kind: "symmetric", entityIds: ["a", "b", "axis"], enabled: true },
    fix("fa", "a"),
    fix("fx", "axis"),
  ]);
  ok(result.converged, "simetría de dos segmentos respecto de un eje");
  const mirrored = get(result.entities, "b");
  if (mirrored?.type === "line") {
    close(mirrored.start.x, -100, 1e-9, "inicio reflejado en x");
    close(mirrored.start.y, 100, 1e-9, "inicio reflejado en y");
    close(mirrored.end.x, -300, 1e-9, "final reflejado en x");
    close(mirrored.end.y, 400, 1e-9, "final reflejado en y");
  }
  ok(result.status === "fully_constrained", "con el eje y un lado anclados, no queda ningún grado libre");
}

{
  const result = solve([
    circle("a", 200, 100, 50), circle("b", -190, 130, 80), line("axis", 0, -500, 0, 500),
  ], [
    { id: "sy", kind: "symmetric", entityIds: ["a", "b", "axis"], enabled: true },
    fix("fa", "a"),
    fix("fx", "axis"),
  ]);
  const mirrored = get(result.entities, "b");
  if (mirrored?.type === "circle") {
    close(mirrored.center.x, -200, 1e-9, "centro reflejado");
    close(mirrored.center.y, 100, 1e-9, "centro reflejado (y)");
    close(mirrored.radius, 50, 1e-9, "dos círculos simétricos son además iguales");
  }
}

// ---------------------------------------------------------------------------
// Suave (G2) entre splines
// ---------------------------------------------------------------------------

{
  const result = solve([
    spline("s1", [[0, 0], [100, 200], [300, 250], [500, 250]]),
    spline("s2", [[520, 240], [700, 260], [900, 400], [1000, 600]]),
  ], [
    { id: "sm", kind: "smooth", entityIds: ["s1", "s2"], enabled: true },
    fix("f1", "s1"),
  ]);
  ok(result.converged, "continuidad G2 entre dos splines converge");
  const first = get(result.entities, "s1");
  const second = get(result.entities, "s2");
  if (first?.type === "spline" && second?.type === "spline") {
    const end = first.controlPoints[3];
    const start = second.controlPoints[0];
    close(Math.hypot(end.x - start.x, end.y - start.y), 0, 1e-9, "G0: las curvas se tocan");
    const d1 = { x: end.x - first.controlPoints[2].x, y: end.y - first.controlPoints[2].y };
    const d2 = { x: second.controlPoints[1].x - start.x, y: second.controlPoints[1].y - start.y };
    close(d1.x * d2.y - d1.y * d2.x, 0, 1e-6, "G1: misma tangente");
    const curvature = (
      d: { x: number; y: number },
      e: { x: number; y: number },
      degree: number,
    ) => (((degree - 1) / degree) * (d.x * e.y - d.y * e.x)) / Math.hypot(d.x, d.y) ** 3;
    const e1 = { x: first.controlPoints[2].x - first.controlPoints[1].x, y: first.controlPoints[2].y - first.controlPoints[1].y };
    const e2 = { x: second.controlPoints[2].x - second.controlPoints[1].x, y: second.controlPoints[2].y - second.controlPoints[1].y };
    close(curvature(d1, e1, 3), curvature(d2, e2, 3), 1e-12, "G2: misma curvatura con signo");
  }
}

// ---------------------------------------------------------------------------
// Las dimensionales generalizadas: no sólo entre líneas
// ---------------------------------------------------------------------------

{
  const result = solve([circle("c1", 0, 0, 50), circle("c2", 300, 0, 50)], [
    { id: "dd", kind: "distance", entityIds: ["c1", "c2"], value: 1000, enabled: true },
    fix("fx", "c1"),
  ]);
  const second = get(result.entities, "c2");
  if (second?.type === "circle") close(second.center.x, 1000, 1e-9, "distancia entre centros de dos círculos");
}

{
  // Una elipse también tiene dirección: `horizontal` alinea su eje mayor.
  const result = solve([
    { id: "e", type: "ellipse", center: { x: 0, y: 0, z: 0 }, majorAxis: { x: 200, y: 60, z: 0 }, ratio: 0.5, startParameter: 0, endParameter: 6.28, layer: "0" },
  ], [{ id: "h", kind: "horizontal", entityIds: ["e"], enabled: true }]);
  const ellipse = get(result.entities, "e");
  if (ellipse?.type === "ellipse") {
    close(ellipse.majorAxis.y, 0, 1e-9, "el eje mayor queda horizontal");
    close(Math.hypot(ellipse.majorAxis.x, ellipse.majorAxis.y), Math.hypot(200, 60), 1e-9, "sin cambiar de tamaño");
    close(ellipse.ratio, 0.5, 1e-12, "ni de proporción");
  }
}

{
  // Una polilínea participa: su último vértice se une al inicio de una línea.
  const result = solve([
    { id: "p", type: "polyline", closed: false, layer: "0", vertices: [
      { x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, { x: 500, y: 500, z: 0 },
    ] },
    line("l", 900, 900, 1200, 1200),
  ], [
    { id: "cc", kind: "coincident", entityIds: ["p", "l"], enabled: true },
    fix("fx", "l"),
  ]);
  const polyline = get(result.entities, "p");
  ok(polyline?.type === "polyline", "la polilínea sigue siendo polilínea");
  if (polyline?.type === "polyline") {
    close(polyline.vertices[2].x, 900, 1e-9, "el vértice final se une al inicio de la línea (x)");
    close(polyline.vertices[2].y, 900, 1e-9, "el vértice final se une al inicio de la línea (y)");
    close(polyline.vertices[0].x, 0, 1e-9, "y el resto de la polilínea no se mueve");
    ok(polyline.vertices.length === 3, "sin perder ni añadir vértices");
  }
}

// ---------------------------------------------------------------------------
// Anclaje
// ---------------------------------------------------------------------------

{
  const result = solve([line("a", 0, 0, 1000, 0), line("b", 0, 500, 700, 1200)], [
    { id: "par", kind: "parallel", entityIds: ["a", "b"], enabled: true },
    fix("fx", "a"),
  ]);
  const anchored = get(result.entities, "a");
  if (anchored?.type === "line") {
    close(anchored.start.x, 0, 1e-12, "lo anclado NO se mueve (x inicio)");
    close(anchored.end.x, 1000, 1e-12, "lo anclado NO se mueve (x final)");
  }
  assert.deepEqual(result.changedEntityIds, ["b"], "sólo se mueve lo que no está anclado");
  checks += 1;
}

{
  // Anclar algo que contradice una cota se detecta y se nombra.
  const result = solve([line("a", 0, 0, 1000, 0)], [
    fix("fx", "a"),
    { id: "len", kind: "distance", entityIds: ["a"], value: 2400, enabled: true },
  ]);
  ok(!result.converged, "una cota sobre una entidad anclada que no la cumple es imposible");
  assert.deepEqual(result.conflictingConstraintIds, ["len"], "y se señala la cota, no el anclaje");
  checks += 1;
}

console.log(`cad constraint kinds spec: ${checks} comprobaciones verdes`);
