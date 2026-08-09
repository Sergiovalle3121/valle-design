/**
 * AUTOCONSTRAIN sobre un perfil ya dibujado.
 *
 * Lo que se comprueba no es «infiere algo», sino QUÉ infiere y qué descarta:
 * un rectángulo tiene que salir con las relaciones que lo definen y sin el
 * atracón de redundantes que haría el dibujo inmanejable.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../cad-document";
import { autoConstrainCadEntities } from "./auto-constrain";
import { solveConstraintSystem } from "./solver";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer: "0",
});

// Rectángulo dibujado con enganches: esquinas exactas, lados a escuadra.
const rectangle: CadEntity[] = [
  line("bottom", 0, 0, 1000, 0),
  line("right", 1000, 0, 1000, 600),
  line("top", 1000, 600, 0, 600),
  line("left", 0, 600, 0, 0),
];
const ids = rectangle.map((entity) => entity.id);

const inferred = autoConstrainCadEntities(rectangle, ids);
const kinds = inferred.added.map((constraint) => `${constraint.kind}:${constraint.entityIds.join("+")}`).sort();

ok(inferred.added.length > 0, "el rectángulo produce restricciones");
ok(kinds.filter((entry) => entry.startsWith("horizontal")).length === 2, "los dos lados horizontales se reconocen");
ok(kinds.filter((entry) => entry.startsWith("vertical")).length === 2, "y los dos verticales");
ok(kinds.filter((entry) => entry.startsWith("coincident")).length === 4, "las cuatro esquinas se unen");
ok(
  kinds.every((entry) => !entry.startsWith("parallel")),
  "NO se añade paralelismo entre dos rectas que ya son horizontales: no aporta nada",
);
ok(
  kinds.every((entry) => !entry.startsWith("perpendicular")),
  "ni perpendicularidad entre una horizontal y una vertical",
);
ok(
  inferred.skipped.some((entry) => entry.reason === "no aporta ninguna ecuación nueva"),
  "y los descartes se explican en vez de desaparecer en silencio",
);

// El conjunto inferido deja el rectángulo con los grados de libertad que le
// tocan: posición (2), giro NO —los lados están anclados a los ejes— y las dos
// medidas. Es decir: 2 de sólido rígido + ancho + alto.
const solved = solveConstraintSystem(rectangle, inferred.added, { tolerance: 1e-9 });
ok(solved.converged, "las restricciones inferidas son compatibles con el dibujo");
ok(solved.rigidBodyModes === 2, "quedan las dos traslaciones (el giro lo quita el ser horizontal)");
ok(solved.internalDegreesOfFreedom === 2, "y dos grados internos: ancho y alto");
assert.deepEqual(solved.conflictingConstraintIds, [], "nada se contradice");
assert.deepEqual(solved.redundantConstraintIds, [], "y nada sobra: el filtro de rango hizo su trabajo");
checks += 2;

// Idempotencia: volver a ejecutarlo sobre lo ya restringido no añade nada.
const again = autoConstrainCadEntities(rectangle, ids, inferred.added);
assert.deepEqual(again.added, [], "una segunda pasada no añade nada");
checks += 1;

// Determinismo: mismos ids, mismas restricciones, en el mismo orden.
const repeat = autoConstrainCadEntities(rectangle, [...ids].reverse());
assert.deepEqual(
  repeat.added.map((constraint) => constraint.id),
  inferred.added.map((constraint) => constraint.id),
  "el orden de la selección no cambia el resultado",
);
checks += 1;

// Tangencia y concentricidad se deducen de la geometría real.
const round: CadEntity[] = [
  { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 100, layer: "0" },
  { id: "c2", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 250, layer: "0" },
  { id: "c3", type: "circle", center: { x: 500, y: 0, z: 0 }, radius: 250, layer: "0" },
  line("tan", -1000, 100, 1000, 100),
];
const roundInferred = autoConstrainCadEntities(round, round.map((entity) => entity.id));
const roundKinds = roundInferred.added.map((constraint) => `${constraint.kind}:${constraint.entityIds.join("+")}`);
ok(roundKinds.includes("concentric:c1+c2"), "dos círculos con el mismo centro salen concéntricos");
ok(roundKinds.includes("equalRadius:c2+c3"), "dos radios iguales salen como radio igual");
ok(roundKinds.includes("tangent:c2+c3"), "dos círculos que se tocan salen tangentes");
ok(
  roundInferred.added.find((constraint) => constraint.id === "auto:tangent:c2+c3")?.tangency === "external",
  "y el CASO de la tangencia se declara al deducirla, no se adivina después",
);
ok(roundKinds.includes("tangent:c1+tan"), "una recta a distancia r del centro sale tangente al círculo");
ok(roundKinds.includes("horizontal:tan"), "y la recta horizontal, horizontal");

// Una tolerancia angular holgada reconoce lo que se dibujó «casi» a escuadra.
const sloppy = [line("a", 0, 0, 1000, 5), line("b", 0, 500, 900, 495)];
ok(
  autoConstrainCadEntities(sloppy, ["a", "b"], [], { angleToleranceDeg: 1 }).added.some(
    (constraint) => constraint.kind === "horizontal",
  ),
  "con 1 grado de holgura, medio grado de desviación se reconoce como horizontal",
);
assert.deepEqual(
  autoConstrainCadEntities(sloppy, ["a", "b"], [], { angleToleranceDeg: 0.01 }).added,
  [],
  "y con una holgura fina no se inventa nada",
);
checks += 1;

// Deducir sobre una selección grande no puede costar minutos. El filtro de
// rango es incremental precisamente por esto: preguntando al solucionador una
// vez por candidata, cuarenta objetos alineados —1.600 candidatas— no
// terminaban. El margen es holgadísimo a propósito, para que falle cuando
// alguien vuelva a hacerlo cuadrático y no cuando la máquina va cargada.
{
  const many: CadEntity[] = [];
  for (let index = 0; index < 40; index += 1) many.push(line(`l${index}`, index * 100, 0, index * 100 + 100, 0));
  const started = Date.now();
  const result = autoConstrainCadEntities(many, many.map((entity) => entity.id));
  const elapsed = Date.now() - started;
  ok(elapsed < 10_000, `deducir sobre 40 objetos tarda ${elapsed} ms`);
  ok(result.added.length > 0, "y deduce algo");
  ok(
    result.added.length < result.skipped.length,
    "descartando muchas más de las que acepta: 40 rectas alineadas no necesitan 1.600 relaciones",
  );
  const check = solveConstraintSystem(many, result.added, { tolerance: 1e-9 });
  assert.deepEqual(check.redundantConstraintIds, [], "y lo aceptado no tiene redundancias");
  checks += 1;
}

console.log(`cad autoconstrain spec: ${checks} comprobaciones verdes`);
