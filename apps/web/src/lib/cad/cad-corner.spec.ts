/**
 * Empalme general: línea contra arco, arco contra arco, arco contra círculo.
 *
 * Las cuatro afirmaciones que sostienen este módulo:
 *
 *   1. El centro está a `r` de LAS DOS curvas y los puntos de tangencia están a
 *      `r` del centro. Es la definición de tangencia, y comprobarla ancla el
 *      resultado sin depender de qué candidato se eligió.
 *   2. El PUNTO DE DESIGNACIÓN elige. Dos curvas admiten hasta ocho empalmes del
 *      mismo radio; se comprueba que pinchando en lados opuestos salen centros
 *      DISTINTOS. Sin esta aserción, una implementación que siempre devolviera
 *      el primer candidato pasaría todo lo demás.
 *   3. NADA sale NaN. Es el modo de fallo que este repositorio ya sufrió con
 *      `computeCadLineFillet` recibiendo un arco: `entity.start` indefinido,
 *      coordenadas NaN escritas en el documento y exportadas a DXF sin un solo
 *      error visible.
 *   4. Lo imposible se RECHAZA con su motivo, no con un arco flotando.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import { computeCadCurveFillet, type CadCornerEntity } from "./cad-corner";
import type { CadVec2 } from "./primitives";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadCornerEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer: "0",
});
const circle = (id: string, x: number, y: number, radius: number): CadCornerEntity => ({
  id,
  type: "circle",
  center: { x, y, z: 0 },
  radius,
  layer: "0",
});
const arc = (
  id: string,
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): CadCornerEntity => ({
  id,
  type: "arc",
  center: { x, y, z: 0 },
  radius,
  startAngle,
  endAngle,
  layer: "0",
});

const distance = (a: CadVec2, b: CadVec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distancia del punto a la curva de apoyo SIN acotar. */
function supportDistance(entity: CadCornerEntity, point: CadVec2): number {
  if (entity.type === "line") {
    const dx = entity.end.x - entity.start.x;
    const dy = entity.end.y - entity.start.y;
    const length = Math.hypot(dx, dy);
    return Math.abs((point.x - entity.start.x) * dy - (point.y - entity.start.y) * dx) / length;
  }
  return Math.abs(distance(point, entity.center) - entity.radius);
}

/** La comprobación que define «tangente», hecha sobre el resultado real. */
function assertTangency(
  outcome: ReturnType<typeof computeCadCurveFillet>,
  first: CadCornerEntity,
  second: CadCornerEntity,
  radius: number,
  what: string,
) {
  assert.ok(!("error" in outcome), `${what}: ${"error" in outcome ? outcome.error : ""}`);
  const center = outcome.arc.center;
  near(supportDistance(first, center), radius, 1e-6, `${what}: el centro está a r del primero`);
  near(supportDistance(second, center), radius, 1e-6, `${what}: y a r del segundo`);
  near(distance(center, outcome.tangents[0]), radius, 1e-6, `${what}: primera tangencia`);
  near(distance(center, outcome.tangents[1]), radius, 1e-6, `${what}: segunda tangencia`);
  near(supportDistance(first, outcome.tangents[0]), 0, 1e-6, `${what}: la tangencia toca el primero`);
  near(supportDistance(second, outcome.tangents[1]), 0, 1e-6, `${what}: y toca el segundo`);
  // Todo lo que sale acaba en el documento.
  let finite = true;
  JSON.stringify(outcome, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) finite = false;
    return value;
  });
  checks += 1;
  assert.ok(finite, `${what}: un número no finito en la geometría emitida`);
}

// --- línea contra círculo, con un ancla calculada a mano ---------------------------
{
  // Recta y = 0 y circunferencia de radio 100 centrada en (0, 200). Un empalme
  // de radio 20 tiene el centro a y = ±20 y a 80 o 120 del centro del círculo.
  // Pinchando arriba de la recta y abajo del círculo, el centro cae en
  // (x, 20) con |(x,20) − (0,200)| = 120 ⇒ x² = 120² − 180² < 0: imposible.
  // Con radio 60: y = 60, distancia = 160 ⇒ x² = 160² − 140² = 6000.
  const target = circle("c", 0, 200, 100);
  const outcome = computeCadCurveFillet(
    line("l", -400, 0, 400, 0),
    target,
    60,
    "f1",
    { x: 100, y: 0 },
    { x: 80, y: 140 },
  );
  assertTangency(outcome, line("l", -400, 0, 400, 0), target, 60, "línea/círculo");
  assert.ok(!("error" in outcome));
  near(Math.abs(outcome.arc.center.x), Math.sqrt(6000), 1e-6, "el centro cae donde dice la cuenta");
  near(outcome.arc.center.y, 60, 1e-9, "y a la altura del radio");
  near(outcome.arc.radius, 60, 1e-12, "con el radio pedido");
}

// --- el PUNTO DE DESIGNACIÓN elige entre los candidatos ------------------------------
{
  const horizontal = line("h", -400, 0, 400, 0);
  const target = circle("c", 0, 200, 100);
  const right = computeCadCurveFillet(horizontal, target, 60, "f", { x: 300, y: 0 }, { x: 90, y: 160 });
  const left = computeCadCurveFillet(horizontal, target, 60, "f", { x: -300, y: 0 }, { x: -90, y: 160 });
  assert.ok(!("error" in right) && !("error" in left));
  checks += 1;
  assert.ok(
    Math.abs(right.arc.center.x - left.arc.center.x) > 1,
    "pinchar a la derecha y a la izquierda debe dar centros DISTINTOS: si no, " +
      "el punto de designación no se está usando y el empalme sale donde le apetece",
  );
  assert.ok(right.arc.center.x > 0, "el de la derecha, a la derecha");
  assert.ok(left.arc.center.x < 0, "y el de la izquierda, a la izquierda");
}

// --- arco contra arco -----------------------------------------------------------------
{
  // Dos semicírculos de radio 100 separados 300 entre centros: el hueco entre
  // ellos mide 100, así que un empalme tangente por fuera necesita r ≥ 50 —dos
  // veces (100+r) tiene que alcanzar los 300—. Con 80 sí hay solución.
  const first = arc("a1", 0, 0, 100, 0, 180);
  const second = arc("a2", 300, 0, 100, 0, 180);
  const outcome = computeCadCurveFillet(first, second, 80, "f", { x: 90, y: 40 }, { x: 210, y: 40 });
  assertTangency(outcome, first, second, 80, "arco/arco");
}

// --- arco contra círculo, y el radio pegado a la geometría -------------------------------
{
  const first = arc("a", 0, 0, 50, 0, 90);
  const second = circle("c", 200, 0, 50);
  const outcome = computeCadCurveFillet(first, second, 60, "f", { x: 45, y: 20 }, { x: 155, y: 20 });
  assertTangency(outcome, first, second, 60, "arco/círculo");
}

// --- el arco de empalme es el CORTO --------------------------------------------------------
{
  const outcome = computeCadCurveFillet(
    line("h", -400, 0, 400, 0),
    line("v", 0, -400, 0, 400),
    50,
    "f",
    { x: 200, y: 0 },
    { x: 0, y: 200 },
  );
  assert.ok(!("error" in outcome));
  const sweep = ((outcome.arc.endAngle - outcome.arc.startAngle) % 360 + 360) % 360;
  checks += 1;
  assert.ok(
    sweep <= 180 + 1e-9,
    `el empalme debe ser el arco corto; salió un barrido de ${sweep}°`,
  );
}

// --- lo imposible se rechaza con su motivo ---------------------------------------------------
{
  const same = computeCadCurveFillet(
    line("a", 0, 0, 10, 0),
    line("a", 0, 0, 10, 0),
    5,
    "f",
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  );
  assert.ok("error" in same && same.error.includes("distintos"));

  const zero = computeCadCurveFillet(
    line("a", 0, 0, 10, 0),
    line("b", 0, 0, 0, 10),
    0,
    "f",
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  );
  assert.ok("error" in zero && zero.error.includes("mayor que cero"));

  const degenerate = computeCadCurveFillet(
    line("a", 3, 3, 3, 3),
    line("b", 0, 0, 0, 10),
    5,
    "f",
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  );
  assert.ok("error" in degenerate && degenerate.error.includes("degenerado"));

  // Dos rectas PARALELAS no tienen esquina, y el radio no arregla eso.
  const parallel = computeCadCurveFillet(
    line("a", 0, 0, 100, 0),
    line("b", 0, 50, 100, 50),
    5,
    "f",
    { x: 50, y: 0 },
    { x: 50, y: 50 },
  );
  assert.ok("error" in parallel && parallel.error.includes("empalme"), "paralelas");

  // Círculos demasiado separados para el radio pedido.
  const tooFar = computeCadCurveFillet(
    circle("a", 0, 0, 10),
    circle("b", 1000, 0, 10),
    5,
    "f",
    { x: 10, y: 0 },
    { x: 990, y: 0 },
  );
  assert.ok("error" in tooFar && tooFar.error.includes("radio menor"), "demasiado lejos");
}

// --- barrido de casos: ninguno produce NaN ---------------------------------------------------
{
  const shapes: CadCornerEntity[] = [
    line("l1", -100, 0, 100, 0),
    line("l2", 0, -100, 0, 100),
    line("l3", -100, -100, 100, 100),
    circle("c1", 0, 0, 40),
    circle("c2", 60, 20, 25),
    arc("r1", 10, 10, 30, 20, 200),
    arc("r2", -30, 40, 15, 100, 300),
  ];
  for (const first of shapes)
    for (const second of shapes) {
      if (first.id === second.id) continue;
      for (const radius of [1, 7, 50, 500]) {
        const outcome = computeCadCurveFillet(
          first,
          second,
          radius,
          "f",
          { x: 5, y: 5 },
          { x: -5, y: -5 },
        );
        checks += 1;
        if ("error" in outcome) continue;
        let finite = true;
        JSON.stringify(outcome, (_key, value) => {
          if (typeof value === "number" && !Number.isFinite(value)) finite = false;
          return value;
        });
        assert.ok(
          finite,
          `${first.type}/${second.type} con radio ${radius} emitió un número no finito`,
        );
      }
    }
}

// --- el arco lleva su procedencia, para que se sepa de dónde salió ------------------------------
{
  const outcome = computeCadCurveFillet(
    line("h", -400, 0, 400, 0),
    circle("c", 0, 200, 100),
    60,
    "corner-1",
    { x: 100, y: 0 },
    { x: 80, y: 140 },
  );
  assert.ok(!("error" in outcome));
  assert.equal(outcome.arc.id, "corner-1", "usa el id que se le da, no uno inventado");
  assert.equal((outcome.arc as CadEntity).layer, "0", "y hereda la capa del primer objeto");
  assert.equal(outcome.arc.context?.metadata?.sourceType, "FILLET");
  assert.equal(outcome.arc.context?.metadata?.sourceIds, "h,c");
}

console.log(
  `empalme general: ${checks} comprobaciones de tangencia real (línea/círculo, arco/arco, ` +
    `arco/círculo), elección por punto de designación y barrido sin ningún número no finito`,
);
