import { strict as assert } from "node:assert";
import { computeCadLineFillet } from "../cad-fillet";
import { computeCadLineChamfer } from "../cad-chamfer";
import { polarArray, rectangularArray } from "../cad-array";
import { offsetPath } from "../geom-edit";
import {
  breakSegmentBetween,
  extendSegment,
  trimSegment,
} from "../geom-trim";
import {
  cadAffineApply,
  cadAffineCompose,
  cadAffineReflection,
  cadAffineRotation,
  cadAffineScaling,
} from "../transform2d";
import { computeCadCurveTrim } from "../curve-edit";
import type { CadEntity } from "../cad-document";
import {
  angleGap,
  bruteDistanceToSegment,
  dist,
  norm360,
  rad,
  rotatePoint,
  type P,
} from "./oracle";

/**
 * 1.2 — MODIFICACIÓN, VERIFICADA POR PROPIEDADES QUE NO SE PUEDEN FINGIR.
 *
 * La trampa de probar TRIM, FILLET u OFFSET es afirmar la forma («devuelve un
 * arco», «sigue teniendo cuatro vértices») en vez del NÚMERO. Esta suite
 * comprueba, para cada operación, la propiedad geométrica que la define y que
 * sólo se cumple si la matemática está bien:
 *
 * · FILLET  → el arco es TANGENTE a las dos rectas. Se verifica midiendo la
 *   distancia del centro a cada recta con un oráculo por búsqueda: tiene que
 *   valer exactamente el radio. Un arco «casi tangente» falla aquí.
 * · OFFSET  → la distancia del resultado al original es CONSTANTE, medida en
 *   N puntos repartidos, no sólo en los vértices.
 * · ARRAY   → los ángulos son exactos y el radio se conserva.
 * · MIRROR  → cada punto y su reflejo equidistan del eje y su punto medio cae
 *   sobre él.
 * · ROTATE/SCALE → la ruta MATRICIAL del producto se compara con el cálculo
 *   directo con senos y cosenos del oráculo.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const TOL = {
  /** Álgebra cerrada: redondeo del doble. */
  analytic: 1e-9,
  /** Oráculo por ternaria sobre un mínimo NO degenerado. */
  brute: 1e-8,
} as const;

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: P, b: P, tolerance: number) => dist(a, b) <= tolerance;

function line(id: string, a: P, b: P): CadEntity {
  return {
    id,
    type: "line",
    start: { x: a.x, y: a.y, z: 0 },
    end: { x: b.x, y: b.y, z: 0 },
    layer: "0",
  } as CadEntity;
}

/* ══════════════════════════════════════════════════════════════════════════
   TRIM / EXTEND / BREAK — el lado correcto
   ══════════════════════════════════════════════════════════════════════════ */

// El segmento de (0,0) a (10,0) cortado por la vertical x=4. Pinchando en x=1
// se conserva... el trozo que contiene el clic. La convención importa y aquí
// se fija con el número: `trimSegment` conserva el lado de `keepPoint`.
{
  const kept = trimSegment(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 4, y: -5 },
    { x: 4, y: 5 },
    { x: 1, y: 0 },
  );
  ok(!!kept, "un corte interior sí recorta");
  ok(
    nearPoint(kept!.a, { x: 0, y: 0 }, TOL.analytic) &&
      nearPoint(kept!.b, { x: 4, y: 0 }, TOL.analytic),
    "y conserva EXACTAMENTE el lado del punto designado: (0,0)–(4,0)",
  );
  const other = trimSegment(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 4, y: -5 },
    { x: 4, y: 5 },
    { x: 9, y: 0 },
  );
  ok(
    nearPoint(other!.a, { x: 4, y: 0 }, TOL.analytic) &&
      nearPoint(other!.b, { x: 10, y: 0 }, TOL.analytic),
    "designar el otro lado conserva el otro trozo: (4,0)–(10,0)",
  );
}

// Un borde que NO cruza no recorta nada — y no devuelve el segmento entero
// como si hubiera hecho algo.
ok(
  trimSegment(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 40, y: -5 },
    { x: 40, y: 5 },
    { x: 1, y: 0 },
  ) === null,
  "un borde fuera de alcance no recorta: null, no un «hecho» vacío",
);

// EXTEND alarga el extremo que apunta al borde, y sólo ese.
{
  const extended = extendSegment(
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 12, y: -5 },
    { x: 12, y: 5 },
  );
  ok(
    nearPoint(extended!.b, { x: 12, y: 0 }, TOL.analytic) &&
      nearPoint(extended!.a, { x: 0, y: 0 }, TOL.analytic),
    "EXTEND alarga el extremo b hasta x=12 y deja a donde estaba",
  );
  const backwards = extendSegment(
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: -3, y: -5 },
    { x: -3, y: 5 },
  );
  ok(
    nearPoint(backwards!.a, { x: -3, y: 0 }, TOL.analytic),
    "y hacia atrás alarga el extremo a, no el b",
  );
}

// BREAK entre dos puntos deja DOS tramos y quita exactamente el hueco pedido.
{
  const pieces = breakSegmentBetween(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 3, y: 0 },
    { x: 7, y: 0 },
  );
  ok(!!pieces, "BREAK entre dos puntos interiores parte el segmento");
  const [first, second] = pieces!;
  ok(
    near(dist(first.a, first.b), 3, TOL.analytic) &&
      near(dist(second.a, second.b), 3, TOL.analytic),
    "los dos trozos miden 3 cada uno…",
  );
  ok(
    near(dist(first.b, second.a), 4, TOL.analytic),
    "…y el hueco quitado mide exactamente los 4 pedidos",
  );
}

// TRIM sobre una CURVA (círculo), por la ruta que usa el editor. Un círculo de
// radio 10 cortado por dos verticales en x=±6: los cortes están en y=±8
// (porque √(100−36) = 8), y el resultado es un arco, no un círculo con un
// atributo cambiado.
{
  const circle = {
    id: "c1",
    type: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 10,
    layer: "0",
  } as CadEntity;
  const result = computeCadCurveTrim({
    target: circle as never,
    boundaries: [
      line("b1", { x: 6, y: -20 }, { x: 6, y: 20 }),
      line("b2", { x: -6, y: -20 }, { x: -6, y: 20 }),
    ],
    pick: { x: 0, y: 10 },
  });
  ok(!("error" in result), `TRIM del círculo debe resolverse (${JSON.stringify(result)})`);
  if (!("error" in result)) {
    const replaced = result.replace as { type?: string; startAngle?: number; endAngle?: number } | undefined;
    ok(replaced?.type === "arc", "un círculo recortado deja de ser un círculo: es un arco");
    // Los cortes, en papel: la vertical x=6 corta donde cos θ = 0.6, o sea a
    // θ = arccos(0.6) = 53.130102…°; la vertical x=−6 donde cos θ = −0.6, o sea
    // a 126.869898…°. Son los mismos 53.13 del triángulo 6-8-10.
    //
    // El clic va en (0, 10) —el punto MÁS ALTO— y TRIM elimina lo pinchado
    // (convención de AutoCAD, ver la cabecera de `computeCadCurveTrim`), así
    // que desaparece el sector superior entre esos dos cortes y el arco que
    // QUEDA recorre el resto: empieza en 126.87°, pasa por 180° y 270°, y
    // termina en 53.13°. Que `startAngle` sea el ángulo MAYOR no es un error de
    // signo: es la única forma de nombrar el arco que va por abajo.
    const cut = (Math.acos(6 / 10) * 180) / Math.PI;
    const start = norm360(replaced!.startAngle ?? 0);
    const end = norm360(replaced!.endAngle ?? 0);
    ok(
      angleGap(start, 180 - cut) < 1e-6,
      `el arco conservado empieza en 180°−arccos(0.6) = ${(180 - cut).toFixed(6)}° (obtenido ${start.toFixed(6)})`,
    );
    ok(
      angleGap(end, cut) < 1e-6,
      `y termina en arccos(0.6) = ${cut.toFixed(6)}° (obtenido ${end.toFixed(6)})`,
    );
    // Y la comprobación que de verdad importa: los dos extremos del arco están
    // sobre las verticales de corte, en x = ∓6 con |y| = 8.
    for (const [angle, expectedX] of [[start, -6], [end, 6]] as const) {
      const point = { x: 10 * Math.cos(rad(angle)), y: 10 * Math.sin(rad(angle)) };
      ok(
        near(point.x, expectedX, 1e-6) && near(Math.abs(point.y), 8, 1e-6),
        `el extremo del arco cae en (${expectedX}, ±8), el triángulo 6-8-10`,
      );
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FILLET — el arco es TANGENTE, medido con oráculo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Esquina recta: horizontal de (0,0) a (10,0) y vertical de (0,0) a (0,10),
 * con radio 3.
 *
 * En papel, para un ángulo de 90° la distancia del vértice al punto de
 * tangencia es r/tan(45°) = r = 3, y el centro está en (3, 3), a distancia
 * r·√2 del vértice. Se comprueban las tres cosas, y además la TANGENCIA de
 * verdad: la distancia del centro a cada recta, medida con el oráculo por
 * búsqueda, tiene que valer exactamente 3.
 */
{
  const fillet = computeCadLineFillet(
    line("la", { x: 0, y: 0 }, { x: 10, y: 0 }) as never,
    line("lb", { x: 0, y: 0 }, { x: 0, y: 10 }) as never,
    3,
    "arc-1",
  );
  const center = { x: fillet.arc.center.x, y: fillet.arc.center.y };
  ok(nearPoint(center, { x: 3, y: 3 }, TOL.analytic), "el centro del acuerdo de 90° cae en (r, r)");
  ok(near(fillet.arc.radius, 3, TOL.analytic), "y su radio es el pedido");

  // LA PROPIEDAD QUE DEFINE UN FILLET, con oráculo independiente.
  const toHorizontal = bruteDistanceToSegment(center, { x: 0, y: 0 }, { x: 10, y: 0 });
  const toVertical = bruteDistanceToSegment(center, { x: 0, y: 0 }, { x: 0, y: 10 });
  ok(
    near(toHorizontal, 3, TOL.brute),
    `distancia centro→recta horizontal = radio (${toHorizontal.toFixed(9)})`,
  );
  ok(
    near(toVertical, 3, TOL.brute),
    `distancia centro→recta vertical = radio (${toVertical.toFixed(9)})`,
  );

  // Los puntos de tangencia están a distancia r del vértice y a exactamente r
  // del centro.
  const [tangentA, tangentB] = fillet.tangentPoints;
  ok(
    near(dist(center, tangentA), 3, TOL.analytic) && near(dist(center, tangentB), 3, TOL.analytic),
    "los dos puntos de tangencia están sobre el arco",
  );
  ok(
    nearPoint(tangentA, { x: 3, y: 0 }, TOL.analytic) &&
      nearPoint(tangentB, { x: 0, y: 3 }, TOL.analytic),
    "y en (3,0) y (0,3), que es r/tan(45°) desde el vértice",
  );
}

/**
 * Esquina de 60°, donde la fórmula deja de ser «r = distancia» y se ve si
 * alguien la simplificó. Rectas desde el origen a 0° y a 60°; radio 2.
 * Papel: distancia de tangencia = r/tan(30°) = 2·√3 ≈ 3.4641016…
 *         distancia al centro   = r/sen(30°) = 4 exacto.
 */
{
  const far = { x: 20 * Math.cos(rad(60)), y: 20 * Math.sin(rad(60)) };
  const fillet = computeCadLineFillet(
    line("la", { x: 0, y: 0 }, { x: 20, y: 0 }) as never,
    line("lb", { x: 0, y: 0 }, far) as never,
    2,
    "arc-2",
  );
  const center = { x: fillet.arc.center.x, y: fillet.arc.center.y };
  ok(
    near(dist({ x: 0, y: 0 }, center), 4, TOL.analytic),
    "en una esquina de 60°, el centro está a r/sen(30°) = 4 del vértice",
  );
  const tangentDistance = dist({ x: 0, y: 0 }, fillet.tangentPoints[0]);
  ok(
    near(tangentDistance, 2 * Math.sqrt(3), TOL.analytic),
    `y la tangencia a r/tan(30°) = 2√3 = ${(2 * Math.sqrt(3)).toFixed(9)} (obtenido ${tangentDistance.toFixed(9)})`,
  );
  // Tangencia real a las DOS rectas, con oráculo.
  ok(
    near(bruteDistanceToSegment(center, { x: 0, y: 0 }, { x: 20, y: 0 }), 2, TOL.brute) &&
      near(bruteDistanceToSegment(center, { x: 0, y: 0 }, far), 2, TOL.brute),
    "el arco de 60° es tangente a las dos rectas, medido por búsqueda",
  );
}

// Radio imposible: no se inventa un acuerdo que no cabe.
assert.throws(
  () =>
    computeCadLineFillet(
      line("la", { x: 0, y: 0 }, { x: 1, y: 0 }) as never,
      line("lb", { x: 0, y: 0 }, { x: 0, y: 1 }) as never,
      50,
      "arc-x",
    ),
  /too large/iu,
);
checks += 1;

/* ══════════════════════════════════════════════════════════════════════════
   CHAMFER — el bisel de 3 y 4 mide 5
   ══════════════════════════════════════════════════════════════════════════ */

{
  const chamfer = computeCadLineChamfer(
    line("la", { x: 0, y: 0 }, { x: 10, y: 0 }) as never,
    line("lb", { x: 0, y: 0 }, { x: 0, y: 10 }) as never,
    3,
    4,
    "ch-1",
  );
  const a = chamfer.chamfer.start;
  const b = chamfer.chamfer.end;
  const points = [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
  ];
  const onHorizontal = points.find((point) => Math.abs(point.y) < 1e-9)!;
  const onVertical = points.find((point) => Math.abs(point.x) < 1e-9)!;
  ok(
    near(onHorizontal.x, 3, TOL.analytic) && near(onVertical.y, 4, TOL.analytic),
    "el chaflán retrocede 3 por una recta y 4 por la otra, no 3.5 por ambas",
  );
  ok(
    near(dist(onHorizontal, onVertical), 5, TOL.analytic),
    "y el bisel resultante mide 5, el triángulo 3-4-5 de toda la vida",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   OFFSET — distancia CONSTANTE medida en N puntos, no sólo en los vértices
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La comprobación que separa un offset correcto de uno que «parece bien»: se
 * recorren 400 puntos repartidos por el contorno desplazado y se mide la
 * distancia de cada uno al contorno ORIGINAL con el oráculo. Todas tienen que
 * valer lo mismo salvo en las esquinas, donde el inglete se sale por diseño.
 */
{
  const square: P[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const distance = 12;
  // LA CONVENCIÓN, fijada con números en vez de dada por supuesta: `dist > 0`
  // desplaza a la IZQUIERDA del sentido de recorrido (`offsetSegment`). El
  // rectángulo se declara en sentido antihorario, así que el positivo va hacia
  // DENTRO y el negativo hacia fuera. Se comprueban los dos, porque un signo
  // invertido en OFFSET es el defecto que un arquitecto descubre cuando su
  // muro sale del lado equivocado.
  const inward = offsetPath(square, distance, { closed: true });
  const outward = offsetPath(square, -distance, { closed: true });
  ok(!!inward && inward.length === 4, "el offset interior de un rectángulo tiene sus cuatro esquinas");
  ok(!!outward && outward.length === 4, "y el exterior también");

  for (const corner of [
    { x: 12, y: 12 },
    { x: 88, y: 12 },
    { x: 88, y: 68 },
    { x: 12, y: 68 },
  ] as P[]) {
    ok(
      inward!.some((point) => nearPoint(point, corner, TOL.analytic)),
      `la esquina interior (${corner.x}, ${corner.y}) está donde debe`,
    );
  }
  for (const corner of [
    { x: -12, y: -12 },
    { x: 112, y: -12 },
    { x: 112, y: 92 },
    { x: -12, y: 92 },
  ] as P[]) {
    ok(
      outward!.some((point) => nearPoint(point, corner, 1e-9)),
      `la esquina exterior (${corner.x}, ${corner.y}) está donde debe`,
    );
  }
  const offset = outward;

  // DISTANCIA CONSTANTE en 400 muestras del recorrido desplazado, midiendo al
  // original con el oráculo. En las esquinas la distancia sube hasta 12·√2
  // (la diagonal del inglete), así que sólo se exige en los TRAMOS: se
  // descartan las muestras a menos de 12 de un vértice desplazado.
  const samples = 400;
  let measured = 0;
  for (let index = 0; index < samples; index += 1) {
    const t = (index / samples) * offset!.length;
    const segmentIndex = Math.floor(t);
    const local = t - segmentIndex;
    const from = offset![segmentIndex % offset!.length];
    const to = offset![(segmentIndex + 1) % offset!.length];
    const point = {
      x: from.x + (to.x - from.x) * local,
      y: from.y + (to.y - from.y) * local,
    };
    const nearCorner = offset!.some((corner) => dist(point, corner) < distance * 1.05);
    if (nearCorner) continue;
    let best = Infinity;
    for (let edge = 0; edge < square.length; edge += 1) {
      best = Math.min(
        best,
        bruteDistanceToSegment(point, square[edge], square[(edge + 1) % square.length]),
      );
    }
    ok(
      near(best, distance, 1e-7),
      `la muestra ${index} del offset está a ${best.toFixed(9)} del original, no a ${distance}`,
    );
    measured += 1;
  }
  ok(measured > 250, `se midieron ${measured} puntos del recorrido, no sólo los cuatro vértices`);
}

// OFFSET IMPOSIBLE: hacia dentro más que el radio interior. Un contorno que se
// da la vuelta no es un offset, es un defecto — y el producto lo rechaza en vez
// de devolver un cuadrado invertido.
ok(
  offsetPath(
    [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    // Positivo = hacia dentro en un contorno antihorario (ver arriba). 600
    // supera el radio interior de 500 del cuadrado de 1000.
    600,
    { closed: true },
  ) === null,
  "un offset interior mayor que el radio del contorno se RECHAZA, no se inventa",
);
// Y el mismo valor hacia FUERA sí tiene solución: la que se rechaza es la
// geometría imposible, no la distancia grande.
ok(
  offsetPath(
    [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    -600,
    { closed: true },
  ) !== null,
  "y ese mismo desplazamiento hacia fuera sí es posible",
);

/* ══════════════════════════════════════════════════════════════════════════
   ARRAY POLAR — ángulos exactos
   ══════════════════════════════════════════════════════════════════════════ */

{
  // 8 copias en 360° alrededor del origen, empezando en (10, 0): los ángulos
  // son múltiplos exactos de 45° y todas están a radio 10.
  const items = polarArray({ x: 0, y: 0 }, { x: 10, y: 0 }, { count: 8 });
  ok(items.length === 8, "ocho copias en la vuelta completa (sin duplicar la del cierre)");
  for (let index = 0; index < 8; index += 1) {
    const expectedAngle = index * 45;
    const point = items[index].point;
    ok(near(dist({ x: 0, y: 0 }, point), 10, TOL.analytic), `la copia ${index} conserva el radio`);
    const actualAngle = norm360((Math.atan2(point.y, point.x) * 180) / Math.PI);
    ok(
      angleGap(actualAngle, expectedAngle) < 1e-9,
      `la copia ${index} está a ${expectedAngle}° exactos (obtenido ${actualAngle.toFixed(9)})`,
    );
    // Y la posición coincide con la del oráculo, que rota el punto de partida
    // con senos y cosenos directos.
    const oracle = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, expectedAngle);
    ok(nearPoint(point, oracle, TOL.analytic), `y coincide con la rotación directa del oráculo`);
  }
}

{
  // Span PARCIAL: 5 copias en 90° reparten inclusive — 0, 22.5, 45, 67.5, 90.
  // La diferencia entre dividir por `count` y por `count − 1` es exactamente
  // este caso, y es el que un usuario nota al acotar.
  const items = polarArray({ x: 0, y: 0 }, { x: 4, y: 0 }, { count: 5, angleSpanDeg: 90 });
  const angles = items.map((item) => norm360((Math.atan2(item.point.y, item.point.x) * 180) / Math.PI));
  for (const [index, expected] of [0, 22.5, 45, 67.5, 90].entries()) {
    ok(
      angleGap(angles[index], expected) < 1e-9,
      `el reparto parcial coloca la copia ${index} en ${expected}°`,
    );
  }
}

// ARRAY rectangular: la rejilla es exacta, sin acumulación de error.
{
  const items = rectangularArray({ x: 0, y: 0 }, { rows: 3, cols: 4, dx: 2.5, dy: 1.75 });
  ok(items.length === 12, "3×4 son doce copias");
  const last = items[items.length - 1].point;
  ok(
    nearPoint(last, { x: 3 * 2.5, y: 2 * 1.75 }, TOL.analytic),
    "y la última cae en (3·dx, 2·dy) SIN error acumulado por sumar en bucle",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MIRROR — simetría verificada punto a punto
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Eje oblicuo: por (1,1) en dirección (2,1). Para cada punto de prueba se
  // comprueban las DOS propiedades que definen una reflexión, sin usar la
  // matriz para comprobarse a sí misma:
  //   a) el punto medio entre original y reflejo cae sobre el eje;
  //   b) el segmento original-reflejo es perpendicular al eje.
  const origin = { x: 1, y: 1 };
  const direction = { x: 2, y: 1 };
  const mirror = cadAffineReflection(origin, direction);
  const probes: P[] = [
    { x: 0, y: 0 },
    { x: 5, y: -3 },
    { x: -7, y: 12 },
    { x: 1000.25, y: -0.5 },
  ];
  for (const probe of probes) {
    const reflected = cadAffineApply(mirror, probe);
    const mid = { x: (probe.x + reflected.x) / 2, y: (probe.y + reflected.y) / 2 };
    // (a) el medio está sobre el eje: su vector desde el origen es paralelo a
    // la dirección, o sea, producto vectorial nulo.
    const cross =
      (mid.x - origin.x) * direction.y - (mid.y - origin.y) * direction.x;
    ok(
      Math.abs(cross) < 1e-9,
      `el punto medio de (${probe.x}, ${probe.y}) y su reflejo cae sobre el eje`,
    );
    // (b) perpendicularidad.
    const dot =
      (reflected.x - probe.x) * direction.x + (reflected.y - probe.y) * direction.y;
    ok(Math.abs(dot) < 1e-9, "y el segmento que los une es perpendicular al eje");
    // (c) reflejar dos veces devuelve el punto: la reflexión es involutiva.
    const back = cadAffineApply(mirror, reflected);
    ok(nearPoint(back, probe, 1e-9), "y reflejar dos veces devuelve el original");
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ROTATE / SCALE — la matriz contra el cálculo directo
   ══════════════════════════════════════════════════════════════════════════ */

{
  // 37.5° es el ángulo que la campaña exige por no ser trivial: no es múltiplo
  // de 45, su seno y coseno no son «bonitos» y cualquier confusión de unidades
  // o de signo lo delata.
  const pivot = { x: 3, y: -2 };
  const matrix = cadAffineRotation(37.5, pivot);
  const probes: P[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: -4, y: 7.25 },
    { x: 500_000, y: 2_150_000 },
  ];
  for (const probe of probes) {
    const viaMatrix = cadAffineApply(matrix, probe);
    const viaOracle = rotatePoint(probe, pivot, 37.5);
    // Tolerancia RELATIVA al tamaño: en coordenadas UTM el redondeo del doble
    // vale ~1e-10 en absoluto, y exigir 1e-9 absoluto ahí sería exigirle al
    // doble más precisión de la que tiene.
    const scaleOf = Math.max(1, Math.abs(probe.x), Math.abs(probe.y));
    ok(
      dist(viaMatrix, viaOracle) <= 1e-12 * scaleOf,
      `la rotación matricial de (${probe.x}, ${probe.y}) coincide con el cálculo directo`,
    );
  }
  // Cuatro rotaciones de 90° vuelven al punto de partida EXACTO.
  const quarter = cadAffineRotation(90, pivot);
  let composed = quarter;
  for (let index = 0; index < 3; index += 1) composed = cadAffineCompose(quarter, composed);
  const roundTrip = cadAffineApply(composed, { x: 12.5, y: -8.25 });
  ok(
    nearPoint(roundTrip, { x: 12.5, y: -8.25 }, 1e-12),
    "cuatro giros de 90° devuelven el punto EXACTO: la composición no acumula deriva",
  );
}

{
  // SCALE con base distinta del origen. Papel: un punto a distancia d de la
  // base queda a distancia d·k, en la misma dirección.
  const base = { x: 10, y: 10 };
  const factor = 2.5;
  const matrix = cadAffineScaling(factor, factor, base);
  const probe = { x: 14, y: 13 };
  const scaled = cadAffineApply(matrix, probe);
  ok(
    nearPoint(scaled, { x: 20, y: 17.5 }, TOL.analytic),
    "escalar ×2.5 desde (10,10) lleva (14,13) a (20, 17.5)",
  );
  ok(
    near(dist(base, scaled), dist(base, probe) * factor, TOL.analytic),
    "y la distancia a la base se multiplica exactamente por el factor",
  );
  // Escala NO uniforme: un CAD debe poder, y el ángulo NO se conserva. Se
  // comprueba que efectivamente cambia, para que nadie «arregle» la escala
  // anisótropa convirtiéndola en isótropa en silencio.
  const anisotropic = cadAffineScaling(2, 1, { x: 0, y: 0 });
  const p1 = cadAffineApply(anisotropic, { x: 1, y: 0 });
  const p2 = cadAffineApply(anisotropic, { x: 1, y: 1 });
  ok(
    near(p1.x, 2, TOL.analytic) && near(p2.x, 2, TOL.analytic) && near(p2.y, 1, TOL.analytic),
    "la escala no uniforme estira sólo el eje pedido",
  );
}

console.log(
  `verificación 1.2 (modificación): ${checks} comprobaciones de propiedades geométricas, no de forma`,
);
