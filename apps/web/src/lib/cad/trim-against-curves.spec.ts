/**
 * TRIM y EXTEND sólo sabían recortar una línea contra OTRA LÍNEA.
 *
 * EL HUECO. `cad-line-edit.ts` resolvía dos rectas paramétricas a mano y
 * rechazaba todo lo demás con «TRIM/EXTEND requires non-parallel LINE
 * entities». En cualquier CAD 2D se recorta una línea contra un arco o un
 * círculo sin pensarlo —un muro contra una rotonda, un carril contra un radio
 * de giro— y aquí sencillamente no se podía.
 *
 * Y NO ERA POR FALTA DE MATEMÁTICA: `intersect.ts` ya tenía
 * `lineCircleIntersections`, `lineArcIntersections` y `arcArcIntersections`,
 * correctas y probadas, incluido el arco que cruza el origen de ángulos. Nadie
 * las había cableado.
 *
 * LA DECISIÓN QUE IMPORTA, y por la que este spec existe. Una recta corta a un
 * círculo en DOS puntos. Elegir mal el corte es lo que separa un TRIM que se
 * siente correcto de uno que sorprende:
 *
 *   · TRIM conservando `start` recorta en el PRIMER cruce que encuentra
 *     avanzando desde el inicio — no en el más lejano, que se comería trabajo
 *     que el usuario quería conservar.
 *   · TRIM conservando `end` recorta en el ÚLTIMO cruce, por simetría.
 *   · EXTEND alarga hasta el cruce MÁS CERCANO al extremo que se estira; pasarse
 *     al segundo cruce atravesaría la frontera, que es justo lo que EXTEND no
 *     debe hacer.
 */
import { strict as assert } from "node:assert";
import { computeCadLineTrim, computeCadLineExtend } from "./cad-line-edit";
import type { CadEntity } from "./cad-document";

type CadLine = Extract<CadEntity, { type: "line" }>;

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadLine => ({
  id,
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer: "0",
});

/** Círculo de radio 100 centrado en el origen: corta el eje X en ±100. */
const CIRCLE: CadEntity = {
  id: "rotonda",
  type: "circle",
  center: { x: 0, y: 0, z: 0 },
  radius: 100,
  layer: "0",
};

/** Semicírculo superior: sólo existe entre 0° y 180°. */
const ARC_TOP: CadEntity = {
  id: "arco-sup",
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius: 100,
  startAngle: 0,
  endAngle: 180,
  layer: "0",
};

const near = (value: number, expected: number, what: string) =>
  assert.ok(
    Math.abs(value - expected) < 1e-6,
    `${what}: se esperaba ${expected} y llegó ${value}`,
  );

// ---------------------------------------------------------------------------
// TRIM contra un CÍRCULO: cuál de los dos cortes
// ---------------------------------------------------------------------------

{
  // La recta va de (-300,0) a (300,0) y cruza el círculo en x=-100 y x=+100.
  const target = line("via", -300, 0, 300, 0);

  const keepStart = computeCadLineTrim(target, CIRCLE, "start");
  near(keepStart.start.x, -300, "conservar el inicio no mueve el inicio");
  near(
    keepStart.end.x,
    -100,
    "conservando el inicio se recorta en el PRIMER cruce, no en el más lejano",
  );

  const keepEnd = computeCadLineTrim(target, CIRCLE, "end");
  near(keepEnd.end.x, 300, "conservar el fin no mueve el fin");
  near(keepEnd.start.x, 100, "y por simetría se recorta en el ÚLTIMO cruce");
}

// ---------------------------------------------------------------------------
// TRIM contra un ARCO: el barrido angular manda
// ---------------------------------------------------------------------------

{
  // Una recta vertical por x=50 cruza el círculo completo dos veces, pero el
  // semicírculo SUPERIOR sólo una: el corte de abajo no existe como frontera.
  const target = line("poste", 50, -300, 50, 300);
  const trimmed = computeCadLineTrim(target, ARC_TOP, "start");
  const y = Math.sqrt(100 * 100 - 50 * 50);
  near(trimmed.end.y, y, "sólo cuenta el cruce que cae DENTRO del barrido del arco");
  near(trimmed.start.y, -300, "el inicio se conserva");
}

{
  // Y si la recta sólo cruza por donde el arco NO existe, no hay recorte.
  const below = line("bajo", 50, -300, 50, -10);
  assert.throws(
    () => computeCadLineTrim(below, ARC_TOP, "start"),
    /no.*cruza|does not|intersec/i,
    "sin cruce dentro del barrido, TRIM tiene que fallar en vez de inventar un punto",
  );
}

// ---------------------------------------------------------------------------
// EXTEND contra una curva: el cruce MÁS CERCANO al extremo que se estira
// ---------------------------------------------------------------------------

{
  // La recta acaba en x=-200, antes del círculo. Estirando el final llega
  // primero a x=-100; pasar a +100 la atravesaría de lado a lado.
  const short = line("acceso", -400, 0, -200, 0);
  const extended = computeCadLineExtend(short, CIRCLE, "end");
  near(extended.start.x, -400, "el otro extremo no se mueve");
  near(
    extended.end.x,
    -100,
    "EXTEND llega al cruce MÁS CERCANO: pasarse al segundo atravesaría la frontera",
  );
}

{
  // Simétrico por el inicio.
  const short = line("acceso2", 200, 0, 400, 0);
  const extended = computeCadLineExtend(short, CIRCLE, "start");
  near(extended.start.x, 100, "estirando el inicio se llega al cruce más cercano");
  near(extended.end.x, 400, "el otro extremo no se mueve");
}

// ---------------------------------------------------------------------------
// Lo que no puede pasar
// ---------------------------------------------------------------------------

{
  // Una recta que no toca el círculo no se puede recortar contra él.
  const away = line("lejos", -300, 500, 300, 500);
  assert.throws(
    () => computeCadLineTrim(away, CIRCLE, "start"),
    /no.*cruza|does not|intersec/i,
    "sin intersección no hay recorte",
  );
}

{
  // TRIM exige que el corte caiga DENTRO del segmento: si el círculo queda
  // fuera del tramo, recortar no significa nada.
  const before = line("previa", -400, 0, -200, 0);
  assert.throws(
    () => computeCadLineTrim(before, CIRCLE, "start"),
    /dentro|inside|intersec/i,
    "un corte fuera del segmento es EXTEND, no TRIM",
  );
}

// Y la línea contra línea de siempre sigue funcionando igual.
{
  const target = line("t", 0, 0, 200, 0);
  const cutter = line("c", 100, -50, 100, 50);
  const trimmed = computeCadLineTrim(target, cutter, "start");
  near(trimmed.end.x, 100, "el caso línea-línea no cambia");
}

console.log(
  "trim/extend: una línea se recorta y se alarga contra círculos y arcos, eligiendo el cruce correcto de los dos",
);
