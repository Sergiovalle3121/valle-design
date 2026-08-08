/**
 * Recortar y alargar un ARCO — la otra mitad de TRIM/EXTEND.
 *
 * EL HUECO. El PR anterior abrió la FRONTERA a círculos y arcos, pero el
 * OBJETIVO seguía teniendo que ser una línea. Recortar un arco es otra
 * operación: no se mueven `start`/`end` sino `startAngle`/`endAngle`, y hay que
 * decidir cuál de los dos extremos ANGULARES se mueve.
 *
 * LA CONVENCIÓN, que es lo que hace correcta la decisión. Un arco barre en
 * sentido antihorario desde `startAngle`; `arcSweepDeg` da su recorrido y
 * `norm360(ángulo − startAngle)` dice cuánto se ha avanzado por él. Ese avance
 * relativo hace aquí el mismo papel que el parámetro sobre la recta:
 *
 *   · TRIM conservando `start` corta en el PRIMER cruce avanzando por el
 *     barrido, y mueve `endAngle` hasta él.
 *   · TRIM conservando `end` corta en el ÚLTIMO, y mueve `startAngle`.
 *   · EXTEND `end` crece por delante hasta el cruce inmediatamente posterior al
 *     final; EXTEND `start` crece hacia atrás hasta el inmediatamente anterior
 *     al inicio. Pasar de largo daría la vuelta al arco entero.
 *
 * Y lo que NO puede pasar: un cruce que cae fuera del barrido no es un corte de
 * este arco, aunque esté sobre su circunferencia.
 */
import { strict as assert } from "node:assert";
import { computeCadArcTrim, computeCadArcExtend } from "./cad-line-edit";
import type { CadEntity } from "./cad-document";

type CadArc = Extract<CadEntity, { type: "arc" }>;
type CadLine = Extract<CadEntity, { type: "line" }>;
type CadCircle = Extract<CadEntity, { type: "circle" }>;

/** Arco de 0° a 180°, radio 100 en el origen: el semicírculo superior. */
const ARC: CadArc = {
  id: "arco",
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius: 100,
  startAngle: 0,
  endAngle: 180,
  layer: "0",
};

const vertical = (id: string, x: number): CadLine => ({
  id,
  type: "line",
  start: { x, y: -300, z: 0 },
  end: { x, y: 300, z: 0 },
  layer: "0",
});

const near = (value: number, expected: number, what: string) =>
  assert.ok(
    Math.abs(value - expected) < 1e-6,
    `${what}: se esperaba ${expected} y llegó ${value}`,
  );

// ---------------------------------------------------------------------------
// TRIM de un arco: cuál de los dos extremos ANGULARES se mueve
// ---------------------------------------------------------------------------

{
  // Una vertical por x=50 corta el semicírculo superior sólo en 60°.
  const cut = computeCadArcTrim(ARC, vertical("v", 50), "start");
  near(cut.startAngle, 0, "conservar el inicio no mueve `startAngle`");
  near(cut.endAngle, 60, "y recorta `endAngle` hasta el cruce");
  near(cut.radius, 100, "el radio no cambia: recortar no reescala");
  assert.deepEqual(cut.center, ARC.center, "ni el centro");
}

{
  const cut = computeCadArcTrim(ARC, vertical("v", 50), "end");
  near(cut.endAngle, 180, "conservar el fin no mueve `endAngle`");
  near(cut.startAngle, 60, "y recorta `startAngle` hasta el cruce");
}

{
  // Dos cruces: una horizontal por y=50 corta el semicírculo en 30° y 150°.
  const horizontal: CadLine = {
    id: "h",
    type: "line",
    start: { x: -300, y: 50, z: 0 },
    end: { x: 300, y: 50, z: 0 },
    layer: "0",
  };
  const keepStart = computeCadArcTrim(ARC, horizontal, "start");
  near(
    keepStart.endAngle,
    30,
    "conservando el inicio se corta en el PRIMER cruce del barrido, no en el segundo",
  );
  const keepEnd = computeCadArcTrim(ARC, horizontal, "end");
  near(keepEnd.startAngle, 150, "y conservando el fin, en el ÚLTIMO");
}

// ---------------------------------------------------------------------------
// El barrido manda: un cruce fuera de él no es un corte de ESTE arco
// ---------------------------------------------------------------------------

{
  // La vertical x=50 también corta la circunferencia en −60°, pero ese punto
  // no pertenece al semicírculo superior.
  const cut = computeCadArcTrim(ARC, vertical("v", 50), "start");
  assert.ok(
    cut.endAngle > 0 && cut.endAngle < 180,
    "el corte cae dentro del barrido original",
  );
}

{
  // Una vertical que no toca el arco.
  assert.throws(
    () => computeCadArcTrim(ARC, vertical("lejos", 500), "start"),
    /intersec|cruza|inside|dentro/i,
    "sin cruce dentro del barrido no hay recorte",
  );
}

// ---------------------------------------------------------------------------
// EXTEND de un arco: crecer por el extremo pedido, sin dar la vuelta
// ---------------------------------------------------------------------------

{
  // Un cuarto de arco 0°→90°. La horizontal y=50 corta en 30° y 150°: 30° cae
  // DENTRO, así que para alargar por delante sirve 150°.
  const quarter: CadArc = { ...ARC, startAngle: 0, endAngle: 90 };
  const horizontal: CadLine = {
    id: "h2",
    type: "line",
    start: { x: -300, y: 50, z: 0 },
    end: { x: 300, y: 50, z: 0 },
    layer: "0",
  };
  const grown = computeCadArcExtend(quarter, horizontal, "end");
  near(grown.startAngle, 0, "el inicio no se mueve");
  near(
    grown.endAngle,
    150,
    "EXTEND end crece hasta el cruce inmediatamente posterior al final",
  );
}

{
  // Hacia atrás: el arco 90°→180° crece por su inicio hasta 30°.
  const upper: CadArc = { ...ARC, startAngle: 90, endAngle: 180 };
  const horizontal: CadLine = {
    id: "h3",
    type: "line",
    start: { x: -300, y: 50, z: 0 },
    end: { x: 300, y: 50, z: 0 },
    layer: "0",
  };
  const grown = computeCadArcExtend(upper, horizontal, "start");
  near(grown.endAngle, 180, "el fin no se mueve");
  near(grown.startAngle, 30, "EXTEND start crece hasta el cruce anterior al inicio");
}

// ---------------------------------------------------------------------------
// Frontera curva: un arco se recorta contra un círculo
// ---------------------------------------------------------------------------

{
  // Círculo de radio 100 centrado en (100,0): corta al arco del origen en 60°.
  const circle: CadCircle = {
    id: "c",
    type: "circle",
    center: { x: 100, y: 0, z: 0 },
    radius: 100,
    layer: "0",
  };
  const cut = computeCadArcTrim(ARC, circle, "start");
  near(cut.endAngle, 60, "un arco también se recorta contra un círculo");
}

console.log(
  "trim/extend: un ARCO se recorta y se alarga moviendo el extremo angular correcto, y el barrido decide qué cruce cuenta",
);
