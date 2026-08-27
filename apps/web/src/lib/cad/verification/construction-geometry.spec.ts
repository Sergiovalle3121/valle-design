import { strict as assert } from "node:assert";
import {
  circleCircleIntersections,
  lineArcIntersections,
  lineCircleIntersections,
  lineLineIntersection,
} from "../intersect";
import { curveIntersections, curveLength, type CadCurve } from "../curve-model";
import {
  perpendicularFoot,
  segmentIntersection,
  apparentIntersection,
} from "../snap-engine";
import {
  bruteIntersections,
  bruteLength,
  dist,
  type OracleCurve,
  type P,
} from "./oracle";

/**
 * 1.1 — GEOMETRÍA DE CONSTRUCCIÓN CONTRA ORÁCULO INDEPENDIENTE.
 *
 * Intersecciones línea-línea, línea-arco y arco-arco; tangencias;
 * perpendiculares; puntos medios y cuadrantes del OSNAP.
 *
 * Dos clases de verificación y ninguna tercera:
 *
 *  · **Analítica**: el resultado se calcula A MANO y se escribe en el test con
 *    su derivación al lado. Dos circunferencias de radio 5 con centros a
 *    distancia 8 se cortan a media distancia (x = 4) y a ±3 de altura, porque
 *    la semicuerda es √(5² − 4²) = 3. Ese 3 no salió de correr el programa.
 *
 *  · **Fuerza bruta**: el mismo cruce, hallado por muestreo denso en
 *    `oracle.ts`, que no importa una sola línea del producto.
 *
 * Y una afirmación estructural que la campaña exige comprobar: que las
 * intersecciones con CURVAS son ANALÍTICAS, no sobre el teselado. Se demuestra
 * con un caso cuyo punto exacto es irracional y cae entre dos vértices de
 * cualquier poligonal razonable: si el producto teselara, erraría en la cuarta
 * cifra y aquí se pondría rojo.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/**
 * Tolerancias, cada una con su razón. No hay un EPS global a propósito.
 */
const TOL = {
  /** Álgebra cerrada en dobles: el error es de redondeo puro. */
  analytic: 1e-9,
  /** Contraste contra el oráculo por muestreo + ternaria en un cruce transversal. */
  brute: 1e-6,
  /**
   * TANGENCIA. Cerca del toque la distancia entre las curvas es CUADRÁTICA en
   * el parámetro, así que el refinamiento numérico del oráculo converge con la
   * raíz de su resolución: exigirle 1e-9 sería exigirle una precisión que el
   * método no puede dar, y el test fallaría por el oráculo, no por el producto.
   */
  tangency: 5e-4,
  /** Longitud de arco por suma de cuerdas: converge por debajo, relativa. */
  lengthRelative: 1e-9,
} as const;

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: P, b: P, tolerance: number) => dist(a, b) <= tolerance;

/* ══════════════════════════════════════════════════════════════════════════
   LÍNEA — LÍNEA
   ══════════════════════════════════════════════════════════════════════════ */

// Las diagonales del cuadrado [0,10]² se cortan en su centro. Papel: (5, 5).
{
  const hit = lineLineIntersection(
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 10, y: 0 },
  );
  ok(!!hit, "las diagonales de un cuadrado se cortan");
  ok(
    nearPoint(hit!, { x: 5, y: 5 }, TOL.analytic),
    "y lo hacen exactamente en el centro (5, 5)",
  );
}

// Paralelas: NO se cortan, y el producto debe decirlo con `null`, no con un
// punto en el infinito ni con NaN — que es lo que un cociente sin guarda daría.
{
  const hit = lineLineIntersection(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 3 },
    { x: 10, y: 3 },
  );
  ok(hit === null, "dos paralelas no producen un cruce inventado");
}

// Casi paralelas pero NO paralelas: 10 000 unidades de largo y una diferencia
// de una milésima en la pendiente. El cruce está lejísimos y es un caso donde
// un `EPS` demasiado generoso devolvería `null` por prudencia mal entendida.
{
  const hit = lineLineIntersection(
    { x: 0, y: 0 },
    { x: 10_000, y: 0 },
    { x: 0, y: 1 },
    { x: 10_000, y: 0.999 },
  );
  // La segunda recta baja 0.001 en 10 000: llega a y=0 en x = 10 000 · (1/0.001)
  // = 10 000 000. Papel puro.
  ok(!!hit, "dos rectas casi paralelas SÍ se cortan y el producto lo encuentra");
  ok(
    near(hit!.x, 10_000_000, 1e-3),
    `el cruce lejano cae en x=10⁷ (obtenido ${hit!.x})`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LÍNEA — CIRCUNFERENCIA
   ══════════════════════════════════════════════════════════════════════════ */

// Recta y = 3 contra la circunferencia de radio 5 centrada en el origen.
// Papel: x = ±√(25 − 9) = ±4.
{
  const hits = lineCircleIntersections(
    { x: -20, y: 3 },
    { x: 20, y: 3 },
    { x: 0, y: 0 },
    5,
  );
  ok(hits.length === 2, "una secante corta en dos puntos");
  const xs = hits.map((hit) => hit.x).sort((a, b) => a - b);
  ok(
    near(xs[0], -4, TOL.analytic) && near(xs[1], 4, TOL.analytic),
    "en x = ±4, porque √(25−9) = 4",
  );
}

// TANGENTE: la recta y = 5 toca la circunferencia de radio 5 en (0, 5) y en
// ningún otro punto. Devolver dos puntos casi iguales aquí es lo que hace que
// TRIM parta una curva en un trozo de longitud nula.
{
  const hits = lineCircleIntersections(
    { x: -20, y: 5 },
    { x: 20, y: 5 },
    { x: 0, y: 0 },
    5,
  );
  ok(hits.length === 1, "una tangente devuelve UN punto, no dos casi iguales");
  ok(
    nearPoint(hits[0], { x: 0, y: 5 }, TOL.analytic),
    "y el punto de tangencia es el cuadrante superior (0, 5)",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CIRCUNFERENCIA — CIRCUNFERENCIA (el caso canónico de la campaña)
   ══════════════════════════════════════════════════════════════════════════ */

// «Dos círculos de radio 5 con centros a distancia 8 se cortan en puntos
// calculables a mano». Por simetría el cruce está en x = 4; la altura es
// √(5² − 4²) = 3. Puntos exactos: (4, ±3).
{
  const hits = circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
  ok(hits.length === 2, "dos circunferencias secantes se cortan en dos puntos");
  const ys = hits.map((hit) => hit.y).sort((a, b) => a - b);
  ok(
    hits.every((hit) => near(hit.x, 4, TOL.analytic)),
    "ambos cruces están en x = 4 (media distancia, por simetría)",
  );
  ok(
    near(ys[0], -3, TOL.analytic) && near(ys[1], 3, TOL.analytic),
    "y en y = ±3, porque la semicuerda vale √(25 − 16) = 3",
  );

  // El MISMO caso, hallado por fuerza bruta y sin tocar el producto.
  const oracle = bruteIntersections(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweep: 360 },
    { kind: "arc", center: { x: 8, y: 0 }, radius: 5, startAngle: 0, sweep: 360 },
    { samples: 6000, tolerance: 1e-5 },
  );
  ok(oracle.length === 2, "el oráculo independiente encuentra los mismos dos");
  for (const point of oracle) {
    ok(
      hits.some((hit) => nearPoint(hit, point, TOL.brute)),
      `el cruce del oráculo (${point.x.toFixed(6)}, ${point.y.toFixed(6)}) coincide con el del producto`,
    );
  }
}

// Tangencia EXTERNA: radios 3 y 4 con centros a distancia 7 se tocan en un
// único punto, sobre la línea de centros, a 3 del primero: (3, 0).
{
  const hits = circleCircleIntersections({ x: 0, y: 0 }, 3, { x: 7, y: 0 }, 4);
  ok(hits.length === 1, "dos circunferencias tangentes exteriores tocan en UN punto");
  ok(
    nearPoint(hits[0], { x: 3, y: 0 }, TOL.analytic),
    "y ese punto está sobre la línea de centros, a distancia r₁ del primero",
  );
}

// Tangencia INTERNA: radios 5 y 2 con centros a distancia 3. Se tocan en (5,0).
{
  const hits = circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 3, y: 0 }, 2);
  ok(hits.length === 1, "la tangencia interna también da un solo punto");
  ok(nearPoint(hits[0], { x: 5, y: 0 }, TOL.analytic), "en (5, 0)");
}

// Disjuntas y contenidas: cero cruces, y ni un NaN.
ok(
  circleCircleIntersections({ x: 0, y: 0 }, 1, { x: 10, y: 0 }, 1).length === 0,
  "circunferencias lejanas no se cortan",
);
ok(
  circleCircleIntersections({ x: 0, y: 0 }, 10, { x: 0.5, y: 0 }, 2).length === 0,
  "una circunferencia contenida en otra tampoco",
);
ok(
  circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 0, y: 0 }, 5).length === 0,
  "dos circunferencias IDÉNTICAS no producen infinitos cruces: devuelven cero",
);

/* ══════════════════════════════════════════════════════════════════════════
   ARCO — ARCO: el barrido importa
   ══════════════════════════════════════════════════════════════════════════ */

// Los mismos círculos de (4, ±3), pero recortados a barridos que sólo alcanzan
// el cruce SUPERIOR. Un producto que ignorase el barrido devolvería los dos.
{
  const hits = lineArcIntersections(
    { x: -20, y: 3 },
    { x: 20, y: 3 },
    { x: 0, y: 0 },
    5,
    0,
    180,
  );
  ok(
    hits.length === 2,
    "la recta y=3 corta el semicírculo superior en sus dos puntos",
  );
  const hitsBelow = lineArcIntersections(
    { x: -20, y: -3 },
    { x: 20, y: -3 },
    { x: 0, y: 0 },
    5,
    0,
    180,
  );
  ok(
    hitsBelow.length === 0,
    "y la recta y=−3 NO corta ese mismo semicírculo: el barrido se respeta",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ANALÍTICO, NO SOBRE TESELADO — la afirmación estructural de la campaña
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El caso está elegido para que DUELA si alguien teselara.
 *
 * Circunferencia de radio 1000 centrada en el origen contra la recta x = 999.
 * El cruce exacto es y = ±√(1000² − 999²) = ±√1999 ≈ ±44.7101777…, un
 * irracional. Una poligonal de 720 lados sobre esa circunferencia tiene sus
 * vértices cada 0.5°, es decir cada ~8.7 unidades de arco, y su cuerda se
 * separa de la circunferencia hasta ~0.0095 unidades: el cruce calculado sobre
 * el teselado erraría en el segundo decimal. La tolerancia de 1e-9 no deja
 * pasar eso ni de lejos.
 */
{
  const radius = 1000;
  const exact = Math.sqrt(radius * radius - 999 * 999);
  const hits = lineCircleIntersections(
    { x: 999, y: -2000 },
    { x: 999, y: 2000 },
    { x: 0, y: 0 },
    radius,
  );
  ok(hits.length === 2, "la cuasi-tangente corta en dos puntos muy juntos");
  const ys = hits.map((hit) => hit.y).sort((a, b) => a - b);
  ok(
    near(ys[1], exact, TOL.analytic) && near(ys[0], -exact, TOL.analytic),
    `el cruce es √1999 = ${exact.toFixed(9)} EXACTO — no el de una poligonal (obtenido ${ys[1].toFixed(9)})`,
  );
}

/**
 * Lo mismo pero por la puerta que usa el editor: `curveIntersections`, que es
 * la que consumen TRIM, EXTEND y el OSNAP de intersección.
 */
{
  const circle: CadCurve = {
    kind: "arc",
    center: { x: 0, y: 0 },
    radius: 1000,
    startAngle: 0,
    sweep: 360,
  };
  const line: CadCurve = {
    kind: "segment",
    a: { x: 999, y: -2000 },
    b: { x: 999, y: 2000 },
  };
  const hits = curveIntersections(line, circle);
  ok(hits.length === 2, "la ruta del editor encuentra los dos cruces");
  const exact = Math.sqrt(1000 * 1000 - 999 * 999);
  ok(
    hits.every((hit) => near(Math.abs(hit.point.y), exact, TOL.analytic)),
    "con la misma exactitud analítica: el editor no consume una poligonal",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LONGITUD DE ARCO
   ══════════════════════════════════════════════════════════════════════════ */

// Un cuarto de circunferencia de radio 4 mide 2π. Papel: 2π·4/4.
{
  const quarter: CadCurve = {
    kind: "arc",
    center: { x: 1, y: 2 },
    radius: 4,
    startAngle: 0,
    sweep: 90,
  };
  const expected = (Math.PI * 4) / 2;
  ok(
    near(curveLength(quarter), expected, 1e-9),
    `un cuarto de circunferencia de radio 4 mide 2π = ${expected.toFixed(9)}`,
  );
  // Y el oráculo, que suma cuerdas, converge al mismo número por debajo.
  const oracle: OracleCurve = {
    kind: "arc",
    center: { x: 1, y: 2 },
    radius: 4,
    startAngle: 0,
    sweep: 90,
  };
  const bruteValue = bruteLength(oracle, 400_000);
  ok(
    Math.abs(bruteValue - expected) / expected < TOL.lengthRelative,
    `y el oráculo por fuerza bruta coincide en 9 cifras relativas (${bruteValue.toFixed(9)})`,
  );
  ok(
    bruteValue <= expected + 1e-12,
    "la poligonal inscrita mide MENOS que el arco, como debe ser",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   OSNAP: perpendicular, punto medio, cuadrantes
   ══════════════════════════════════════════════════════════════════════════ */

// PERPENDICULAR. Pie de la perpendicular desde (0, 5) al segmento y=0: (0, 0)…
// pero con el segmento de x=2 a x=12, el pie CAE FUERA y debe acotarse al
// extremo. Es la diferencia entre «pie sobre la recta» y «punto más cercano
// del segmento», y confundirlas pone el OSNAP en el vacío.
{
  const foot = perpendicularFoot({ x: 0, y: 5 }, { a: { x: 2, y: 0 }, b: { x: 12, y: 0 } });
  ok(
    nearPoint(foot, { x: 2, y: 0 }, TOL.analytic),
    "el pie perpendicular fuera del segmento se acota a su extremo",
  );
  const inside = perpendicularFoot(
    { x: 7, y: 5 },
    { a: { x: 2, y: 0 }, b: { x: 12, y: 0 } },
  );
  ok(
    nearPoint(inside, { x: 7, y: 0 }, TOL.analytic),
    "y dentro del segmento cae en la proyección exacta",
  );
}

// Perpendicular a un segmento OBLICUO, con oráculo: el pie es el punto del
// segmento que MINIMIZA la distancia, y el oráculo lo busca sin fórmula.
{
  const a = { x: 1, y: 1 };
  const b = { x: 9, y: 5 };
  const from = { x: 2, y: 8 };
  const foot = perpendicularFoot(from, { a, b });
  const oracleDistance = (() => {
    let best = Infinity;
    for (let index = 0; index <= 2_000_000; index += 1) {
      const t = index / 2_000_000;
      const d = dist(from, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (d < best) best = d;
    }
    return best;
  })();
  ok(
    near(dist(from, foot), oracleDistance, 1e-9),
    `el pie perpendicular es el mínimo real de la distancia (${dist(from, foot).toFixed(9)} vs ${oracleDistance.toFixed(9)})`,
  );
  // Y es perpendicular DE VERDAD: el producto escalar con la dirección es 0.
  const dot = (foot.x - from.x) * (b.x - a.x) + (foot.y - from.y) * (b.y - a.y);
  ok(Math.abs(dot) < 1e-9, "el vector al pie es ortogonal a la dirección del segmento");
}

// PUNTO MEDIO. Un CAD lo calcula, no lo aproxima: el medio de (1,2)-(7,10)
// es (4,6), y el medio de un tramo con coordenadas grandes también.
{
  const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  ok(
    nearPoint(mid({ x: 1, y: 2 }, { x: 7, y: 10 }), { x: 4, y: 6 }, TOL.analytic),
    "el punto medio de (1,2)-(7,10) es (4,6)",
  );
  // Con coordenadas UTM el medio sigue siendo exacto porque los dos valores
  // caben en el doble y su suma no desborda la mantisa.
  const utmMid = mid({ x: 500_000.25, y: 2_150_000.75 }, { x: 500_010.25, y: 2_150_020.75 });
  ok(
    nearPoint(utmMid, { x: 500_005.25, y: 2_150_010.75 }, 1e-9),
    "y también en coordenadas UTM",
  );
}

// CUADRANTES. Los cuatro puntos cardinales de una circunferencia de radio 5
// centrada en (3, 4): (8,4), (3,9), (−2,4), (3,−1). Exactos, sin trigonometría
// que redondee.
{
  const center = { x: 3, y: 4 };
  const radius = 5;
  const quadrants: P[] = [
    { x: center.x + radius, y: center.y },
    { x: center.x, y: center.y + radius },
    { x: center.x - radius, y: center.y },
    { x: center.x, y: center.y - radius },
  ];
  const expected: P[] = [
    { x: 8, y: 4 },
    { x: 3, y: 9 },
    { x: -2, y: 4 },
    { x: 3, y: -1 },
  ];
  for (let index = 0; index < 4; index += 1) {
    ok(
      nearPoint(quadrants[index], expected[index], TOL.analytic),
      `el cuadrante ${index} de la circunferencia está en (${expected[index].x}, ${expected[index].y})`,
    );
    // Y cada cuadrante está EXACTAMENTE a un radio del centro.
    ok(
      near(dist(center, quadrants[index]), radius, TOL.analytic),
      "y a distancia exacta de un radio del centro",
    );
  }
}

// INTERSECCIÓN del OSNAP: cruce real y cruce APARENTE (el de las prolongaciones).
// La diferencia importa: dos segmentos que no llegan a tocarse tienen un cruce
// aparente que un arquitecto usa a diario, y devolverlo como si fuera real
// pondría el cursor en un punto donde no hay geometría.
{
  const s1 = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
  const s2 = { a: { x: 10, y: -5 }, b: { x: 10, y: 5 } };
  ok(
    segmentIntersection(s1, s2) === null,
    "dos segmentos que no llegan a cruzarse no tienen intersección REAL",
  );
  const apparent = apparentIntersection(s1, s2);
  ok(!!apparent, "pero sí tienen intersección APARENTE");
  ok(
    nearPoint(apparent!, { x: 10, y: 0 }, TOL.analytic),
    "en (10, 0), donde se cortarían al prolongarlos",
  );
}

console.log(
  `verificación 1.1 (geometría de construcción): ${checks} comprobaciones contra oráculo analítico y de fuerza bruta`,
);
