/**
 * Corpus del solucionador: casos que se saben resolver a mano.
 *
 * El primero es el que justifica todo el trabajo — un lazo acoplado que el
 * iterador de punto fijo anterior NO resuelve — y se comprueba contra los dos
 * algoritmos a la vez para que la mejora sea un hecho ejecutable.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { solveCadConstraintsFixedPoint } from "./legacy-fixed-point";
import { solveConstraintSystem } from "./solver";
import type { CadConstraint } from "./constraint-schema";

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
const lengthOf = (entity: CadEntity | undefined): number =>
  entity?.type === "line" ? Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) : Number.NaN;
const find = (entities: readonly CadEntity[], id: string) => entities.find((entity) => entity.id === id);

const documentOf = (entities: CadEntity[], constraints: CadConstraint[]): CadDocument => ({
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [], entities, history: [], modelSpace: { entityIds: entities.map((entity) => entity.id) },
  paperSpaces: [], styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [], constraints, externalReferences: [], unsupportedEntities: [], lossManifest: [], publications: [],
});

// ---------------------------------------------------------------------------
// 1. El lazo acoplado: triángulo 3-4-5 con los tres lados acotados
// ---------------------------------------------------------------------------

const triangleEntities = [
  line("l1", 0, 0, 900, 100),
  line("l2", 900, 100, 500, 700),
  line("l3", 500, 700, 0, 0),
];
const triangleConstraints: CadConstraint[] = [
  { id: "c1", kind: "coincident", entityIds: ["l1", "l2"], enabled: true },
  { id: "c2", kind: "coincident", entityIds: ["l2", "l3"], enabled: true },
  { id: "c3", kind: "coincident", entityIds: ["l3", "l1"], enabled: true },
  { id: "d1", kind: "distance", entityIds: ["l1"], value: 300, enabled: true },
  { id: "d2", kind: "distance", entityIds: ["l2"], value: 400, enabled: true },
  { id: "d3", kind: "distance", entityIds: ["l3"], value: 500, enabled: true },
];

const legacy = solveCadConstraintsFixedPoint(documentOf(triangleEntities, triangleConstraints));
ok(!legacy.converged, "el iterador de punto fijo NO resuelve el lazo acoplado");
ok(legacy.iterations === 16, "y agota sus 16 pasadas intentándolo");

const triangle = solveConstraintSystem(triangleEntities, triangleConstraints, { tolerance: 1e-9 });
ok(triangle.converged, "Newton sí resuelve el mismo lazo");
close(lengthOf(find(triangle.entities, "l1")), 300, 1e-9, "lado a exacto");
close(lengthOf(find(triangle.entities, "l2")), 400, 1e-9, "lado b exacto");
close(lengthOf(find(triangle.entities, "l3")), 500, 1e-9, "lado c exacto");
// Las esquinas se tocan: el lazo está cerrado de verdad, no «casi».
for (const [a, b] of [["l1", "l2"], ["l2", "l3"], ["l3", "l1"]]) {
  const first = find(triangle.entities, a);
  const second = find(triangle.entities, b);
  ok(first?.type === "line" && second?.type === "line", "los tres lados siguen siendo líneas");
  if (first?.type === "line" && second?.type === "line")
    close(Math.hypot(first.end.x - second.start.x, first.end.y - second.start.y), 0, 1e-9, `esquina ${a}-${b}`);
}
// Un 3-4-5 es rectángulo: el ángulo entre los catetos sale solo.
{
  const a = find(triangle.entities, "l1");
  const b = find(triangle.entities, "l2");
  if (a?.type === "line" && b?.type === "line") {
    const ux = a.end.x - a.start.x, uy = a.end.y - a.start.y;
    const vx = b.end.x - b.start.x, vy = b.end.y - b.start.y;
    close((ux * vx + uy * vy) / (300 * 400), 0, 1e-9, "los catetos quedan perpendiculares");
  }
}

// Cero grados de libertad de FORMA; los tres que quedan son sólido rígido.
ok(triangle.degreesOfFreedom === 3, "quedan 3 grados libres");
ok(triangle.rigidBodyModes === 3, "y los 3 son movimientos de sólido rígido");
ok(triangle.internalDegreesOfFreedom === 0, "la forma está completamente determinada");
ok(triangle.status === "under_constrained", "sin anclar, el conjunto puede moverse por el plano");

// Anclando un lado del triángulo ya resuelto, el sistema queda cerrado del todo.
const anchored = solveConstraintSystem(triangle.entities, [
  ...triangleConstraints,
  { id: "fx", kind: "fix", entityIds: ["l1"], enabled: true },
], { tolerance: 1e-9 });
ok(anchored.converged, "el triángulo anclado también converge");
ok(anchored.degreesOfFreedom === 0, "y ya no le queda ningún grado libre");
ok(anchored.status === "fully_constrained", "estado: completamente restringido");
close(lengthOf(find(anchored.entities, "l1")), 300, 1e-9, "el lado anclado conserva su longitud acotada");

// ---------------------------------------------------------------------------
// 2. Cuadrilátero con tres lados y un ángulo: queda UN grado libre
// ---------------------------------------------------------------------------

const quad = solveConstraintSystem([
  line("q1", 0, 0, 1000, 0),
  line("q2", 1000, 0, 1000, 800),
  line("q3", 1000, 800, 100, 900),
  line("q4", 100, 900, 0, 0),
], [
  { id: "k1", kind: "coincident", entityIds: ["q1", "q2"], enabled: true },
  { id: "k2", kind: "coincident", entityIds: ["q2", "q3"], enabled: true },
  { id: "k3", kind: "coincident", entityIds: ["q3", "q4"], enabled: true },
  { id: "k4", kind: "coincident", entityIds: ["q4", "q1"], enabled: true },
  { id: "m1", kind: "distance", entityIds: ["q1"], value: 1000, enabled: true },
  { id: "m2", kind: "distance", entityIds: ["q2"], value: 800, enabled: true },
  { id: "m3", kind: "distance", entityIds: ["q3"], value: 900, enabled: true },
  { id: "g1", kind: "angle", entityIds: ["q1", "q2"], value: 90, enabled: true },
], { tolerance: 1e-9 });
ok(quad.converged, "el cuadrilátero converge");
ok(quad.rigidBodyModes === 3, "tres movimientos de sólido rígido");
ok(quad.internalDegreesOfFreedom === 1, "queda exactamente UN grado de libertad interno");
close(lengthOf(find(quad.entities, "q1")), 1000, 1e-9, "lado acotado 1");
close(lengthOf(find(quad.entities, "q2")), 800, 1e-9, "lado acotado 2");
close(lengthOf(find(quad.entities, "q3")), 900, 1e-9, "lado acotado 3");

// ---------------------------------------------------------------------------
// 3. Sistema contradictorio: dice CUÁLES chocan, no sólo que no converge
// ---------------------------------------------------------------------------

const clash = solveConstraintSystem([line("s", 0, 0, 100, 0)], [
  { id: "dA", kind: "distance", entityIds: ["s"], value: 200, enabled: true },
  { id: "dB", kind: "distance", entityIds: ["s"], value: 300, enabled: true },
], { tolerance: 1e-9 });
ok(!clash.converged, "dos longitudes incompatibles no convergen");
ok(clash.status === "over_constrained", "y el estado lo dice: sobre-restringido");
assert.deepEqual(clash.conflictingConstraintIds, ["dB"], "señala la restricción que sobra");
ok(
  clash.issues.some((issue) => issue.code === "constraint_conflict" && issue.constraintIds.includes("dA")),
  "y nombra con quién choca",
);
ok(clash.entities.length === 0, "un sistema imposible no devuelve geometría a medias");

// Redundante pero compatible: sobra, no estorba, y se distingue del conflicto.
const redundant = solveConstraintSystem([line("r1", 0, 0, 100, 0), line("r2", 0, 50, 100, 60)], [
  { id: "p1", kind: "parallel", entityIds: ["r1", "r2"], enabled: true },
  { id: "p2", kind: "parallel", entityIds: ["r1", "r2"], enabled: true },
], { tolerance: 1e-9 });
ok(redundant.converged, "la restricción repetida no impide converger");
assert.deepEqual(redundant.redundantConstraintIds, ["p2"], "la segunda es la redundante");
assert.deepEqual(redundant.conflictingConstraintIds, [], "y no hay conflicto");
ok(redundant.status !== "over_constrained", "redundante no es lo mismo que contradictorio");

// ---------------------------------------------------------------------------
// 4. Descomposición en bloques: tres lazos sueltos son tres sistemas
// ---------------------------------------------------------------------------

const spread: CadEntity[] = [];
const spreadConstraints: CadConstraint[] = [];
for (let group = 0; group < 3; group += 1) {
  const base = group * 10_000;
  spread.push(line(`t${group}a`, base, 0, base + 900, 100));
  spread.push(line(`t${group}b`, base + 900, 100, base + 500, 700));
  spread.push(line(`t${group}c`, base + 500, 700, base, 0));
  spreadConstraints.push(
    { id: `${group}-c1`, kind: "coincident", entityIds: [`t${group}a`, `t${group}b`], enabled: true },
    { id: `${group}-c2`, kind: "coincident", entityIds: [`t${group}b`, `t${group}c`], enabled: true },
    { id: `${group}-c3`, kind: "coincident", entityIds: [`t${group}c`, `t${group}a`], enabled: true },
    { id: `${group}-d1`, kind: "distance", entityIds: [`t${group}a`], value: 300, enabled: true },
    { id: `${group}-d2`, kind: "distance", entityIds: [`t${group}b`], value: 400, enabled: true },
    { id: `${group}-d3`, kind: "distance", entityIds: [`t${group}c`], value: 500, enabled: true },
  );
}
const blocks = solveConstraintSystem(spread, spreadConstraints, { tolerance: 1e-9 });
ok(blocks.converged, "los tres lazos convergen");
ok(blocks.blocks === 3, "y se resolvieron como TRES sistemas independientes");
ok(blocks.rigidBodyModes === 9, "cada lazo conserva sus tres movimientos de sólido rígido");
ok(blocks.internalDegreesOfFreedom === 0, "ninguno queda con forma indeterminada");

// ---------------------------------------------------------------------------
// 5. Estabilidad
// ---------------------------------------------------------------------------

// Arrancar MUY lejos de la solución: converge, o falla diciéndolo.
const faraway = solveConstraintSystem([
  line("f1", 0, 0, 1, 0),
  line("f2", 900_000, 400_000, 900_001, 400_000),
  line("f3", -500_000, 800_000, -500_001, 800_000),
], [
  { id: "c1", kind: "coincident", entityIds: ["f1", "f2"], enabled: true },
  { id: "c2", kind: "coincident", entityIds: ["f2", "f3"], enabled: true },
  { id: "c3", kind: "coincident", entityIds: ["f3", "f1"], enabled: true },
  { id: "d1", kind: "distance", entityIds: ["f1"], value: 300, enabled: true },
  { id: "d2", kind: "distance", entityIds: ["f2"], value: 400, enabled: true },
  { id: "d3", kind: "distance", entityIds: ["f3"], value: 500, enabled: true },
], { tolerance: 1e-6 });
if (faraway.converged) {
  close(lengthOf(find(faraway.entities, "f1")), 300, 1e-5, "arrancando lejos, el lado a acaba donde debe");
  close(lengthOf(find(faraway.entities, "f2")), 400, 1e-5, "arrancando lejos, el lado b acaba donde debe");
  close(lengthOf(find(faraway.entities, "f3")), 500, 1e-5, "arrancando lejos, el lado c acaba donde debe");
} else {
  ok(faraway.entities.length === 0, "si no converge, no devuelve basura como si fuera solución");
  ok(faraway.issues.length > 0, "y explica por qué");
}

// Geometría degenerada: se rechaza con nombre, nunca se devuelve.
const zeroLength = solveConstraintSystem([line("z", 10, 10, 10, 10)], [
  { id: "h", kind: "horizontal", entityIds: ["z"], enabled: true },
], { tolerance: 1e-9 });
ok(!zeroLength.converged, "una línea de longitud cero no se puede orientar");
ok(zeroLength.status === "inconsistent", "y se informa como inconsistente");
ok(zeroLength.entities.length === 0, "sin devolver geometría degenerada");

const zeroRadius = solveConstraintSystem([
  { id: "o", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 0, layer: "0" },
], [{ id: "rr", kind: "radius", entityIds: ["o"], value: 0, enabled: true }], { tolerance: 1e-9 });
ok(!zeroRadius.converged, "un círculo de radio cero no es un círculo");
ok(zeroRadius.entities.length === 0, "y tampoco se devuelve");

// Una restricción sobre una entidad que no participa se rechaza por su nombre.
const unsupported = solveConstraintSystem([
  { id: "tx", type: "text", x: 0, y: 0, text: "hola", layer: "0" },
], [{ id: "h", kind: "horizontal", entityIds: ["tx"], enabled: true }]);
ok(!unsupported.converged, "un TEXT no participa en el dibujo paramétrico");
ok(
  unsupported.issues.some((issue) => issue.message.includes("text")),
  "y el mensaje dice de qué tipo era",
);

// Determinismo: misma entrada, misma salida, aunque cambie el orden del array.
const runA = solveConstraintSystem(triangleEntities, triangleConstraints, { tolerance: 1e-9 });
const runB = solveConstraintSystem([...triangleEntities].reverse(), [...triangleConstraints].reverse(), {
  tolerance: 1e-9,
});
const key = (result: typeof runA) =>
  JSON.stringify([...result.entities].sort((a, b) => (a.id < b.id ? -1 : 1)));
ok(key(runA) === key(triangle), "dos ejecuciones idénticas dan exactamente la misma solución");
ok(key(runB) === key(runA), "y el orden de entrada no cambia el resultado");

// ---------------------------------------------------------------------------
// 6. Lo que el usuario acaba de mover se respeta… salvo que sea imposible
// ---------------------------------------------------------------------------

const dragged = solveConstraintSystem([line("a", 0, 0, 1000, 0), line("b", 0, 500, 707, 1207)], [
  { id: "par", kind: "parallel", entityIds: ["a", "b"], enabled: true },
], { tolerance: 1e-9, preferFixedEntityIds: ["a"] });
ok(dragged.converged, "propagar a partir de lo movido converge");
assert.deepEqual(dragged.changedEntityIds, ["b"], "sólo se mueve la entidad dependiente");

const forced = solveConstraintSystem([line("a", 0, 0, 1000, 0)], [
  { id: "len", kind: "distance", entityIds: ["a"], value: 2400, enabled: true },
], { tolerance: 1e-9, preferFixedEntityIds: ["a"] });
ok(forced.converged, "acotar lo que acabas de tocar no puede fallar por haberlo tocado");
close(lengthOf(find(forced.entities, "a")), 2400, 1e-9, "la cota se cumple");

console.log(`cad constraint solver spec: ${checks} comprobaciones verdes`);
