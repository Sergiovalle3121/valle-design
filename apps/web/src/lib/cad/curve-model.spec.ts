/**
 * Corpus de la curva canónica y sus intersecciones.
 *
 * Este spec existe ANTES de que ningún comando use el módulo, y por un motivo
 * concreto: una propiedad de ida y vuelta se cumple de forma VACÍA si el código
 * nunca toca el campo. Aplicar la identidad dos veces también devuelve el
 * original. Por eso aquí casi todo son ANCLAS ABSOLUTAS —qué punto sale, qué
 * parámetro sale, cuántos cruces hay— calculadas a mano y no derivadas de la
 * propia implementación.
 *
 * Las tres cosas que se afirman y que un fallo silencioso rompería:
 *
 *   1. El PARÁMETRO, no sólo el punto. Sin él TRIM no sabe qué trozo conservar,
 *      y un módulo que devuelve los puntos correctos con parámetros mal
 *      ordenados recorta la mitad equivocada sin dar un solo error.
 *   2. Extender es intersecar SIN acotar. Un cruce más allá del final debe
 *      salir con t > 1; si se filtrara, EXTEND no encontraría nunca nada.
 *   3. Nada sale NaN. Es el modo de fallo que este repositorio ya sufrió: una
 *      coordenada no finita se escribe en el documento y se exporta a DXF sin
 *      que nadie se entere.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import {
  cadEntityCurves,
  curveExtensionPeriod,
  curveIntersections,
  curveIntersectionsWithAll,
  curveBounds,
  curveBoundsOverlap,
  curveBoundsUnion,
  curveIsClosed,
  curveParamAt,
  curvePointAt,
  type CadCurve,
} from "./curve-model";
import type { CadVec2 } from "./primitives";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}
function pointNear(actual: CadVec2, expected: CadVec2, tolerance: number, what: string) {
  near(actual.x, expected.x, tolerance, `${what}.x`);
  near(actual.y, expected.y, tolerance, `${what}.y`);
}
function hasPoint(points: readonly CadVec2[], expected: CadVec2, tolerance = 1e-6): boolean {
  return points.some(
    (point) => Math.abs(point.x - expected.x) <= tolerance && Math.abs(point.y - expected.y) <= tolerance,
  );
}

const line = (x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id: "l",
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer: "0",
});

// --- conversión desde el documento --------------------------------------------
{
  const [segment] = cadEntityCurves(line(0, 0, 10, 0))!;
  assert.equal(segment.kind, "segment");

  const [circle] = cadEntityCurves({
    id: "c",
    type: "circle",
    center: { x: 1, y: 2, z: 0 },
    radius: 5,
    layer: "0",
  })!;
  assert.equal(circle.kind, "arc");
  assert.ok(circle.kind === "arc" && circle.sweep === 360, "un círculo es un arco de 360");
  assert.ok(curveIsClosed(circle), "y está cerrado");

  // Un arco que CRUZA el origen de ángulos: 350° → 10° barre 20°, no −340°.
  const [wrapped] = cadEntityCurves({
    id: "a",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 10,
    startAngle: 350,
    endAngle: 10,
    layer: "0",
  })!;
  assert.ok(wrapped.kind === "arc");
  near(wrapped.sweep, 20, 1e-9, "barrido del arco que cruza el origen");
  assert.ok(!curveIsClosed(wrapped), "un arco de 20° no está cerrado");

  // SPLINE no se modela y se dice con `null`, no con una lista vacía.
  assert.equal(
    cadEntityCurves({
      id: "s",
      type: "spline",
      degree: 3,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 1, z: 0 },
      ],
      knots: [0, 0, 0, 0, 1, 1, 1, 1],
      layer: "0",
    }),
    null,
    "un SPLINE no se convierte: quien lo pida debe rechazarlo nombrándolo",
  );
}

// --- polilínea con `bulge`: el arco REAL, no la cuerda -------------------------
{
  // bulge 0.5 entre (0,0) y (10,0): θ = 4·atan(0.5) = 106.26020470831°,
  // R = 10/(2·sin(θ/2)) = 6.25, centro = (5, 3.75). Números cerrados a
  // propósito: el triángulo 3-4-5 hace que sin(θ/2)=0.8 y cos(θ/2)=0.6.
  const curves = cadEntityCurves({
    id: "p",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 0.5 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    closed: false,
    layer: "0",
  })!;
  assert.equal(curves.length, 2, "dos tramos: el del bulge y el recto");
  const arc = curves[0];
  assert.ok(arc.kind === "arc", "el tramo con bulge es un ARCO, no su cuerda");
  pointNear(arc.center, { x: 5, y: 3.75 }, 1e-9, "centro del arco de bulge");
  near(arc.radius, 6.25, 1e-9, "radio del arco de bulge");
  near(arc.sweep, 106.26020470831196, 1e-9, "barrido del arco de bulge");
  pointNear(curvePointAt(arc, 0), { x: 0, y: 0 }, 1e-9, "el arco arranca en el vértice");
  pointNear(curvePointAt(arc, 1), { x: 10, y: 0 }, 1e-9, "y termina en el siguiente");
  // Un bulge POSITIVO es antihorario: viajando hacia +x, el arco pasa por
  // DEBAJO. Si el signo se perdiera, este punto saldría en (5, +2.5).
  pointNear(curvePointAt(arc, 0.5), { x: 5, y: -2.5 }, 1e-9, "el arco pasa por debajo de la cuerda");
  assert.equal(curves[1].kind, "segment");
}

// --- parametrización: anclas absolutas -----------------------------------------
{
  const segment: CadCurve = { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 20 } };
  pointNear(curvePointAt(segment, 0.25), { x: 2.5, y: 5 }, 1e-12, "punto a un cuarto");
  near(curveParamAt(segment, { x: 2.5, y: 5 }), 0.25, 1e-12, "parámetro a un cuarto");
  // Más allá del extremo: el parámetro PASA de 1. Es lo que EXTEND necesita.
  near(curveParamAt(segment, { x: 20, y: 40 }), 2, 1e-12, "parámetro más allá del final");
  near(curveParamAt(segment, { x: -10, y: -20 }), -1, 1e-12, "y antes del inicio");
  assert.equal(curveExtensionPeriod(segment), null, "una recta infinita no tiene periodo");

  const quarter: CadCurve = { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweep: 90 };
  pointNear(curvePointAt(quarter, 0), { x: 10, y: 0 }, 1e-9, "arranque del cuadrante");
  pointNear(curvePointAt(quarter, 1), { x: 0, y: 10 }, 1e-9, "final del cuadrante");
  near(curveParamAt(quarter, { x: -10, y: 0 }), 2, 1e-9, "180° es dos cuadrantes de avance");
  near(curveExtensionPeriod(quarter)!, 4, 1e-12, "la circunferencia son cuatro cuadrantes");

  // Barrido NEGATIVO (el que produce un bulge horario): el avance se mide en su
  // sentido, así que t=1 sigue siendo el final.
  const clockwise: CadCurve = { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweep: -90 };
  pointNear(curvePointAt(clockwise, 1), { x: 0, y: -10 }, 1e-9, "un barrido negativo baja");
  near(curveParamAt(clockwise, { x: 0, y: -10 }), 1, 1e-9, "y su parámetro final vale 1");

  // Elipse GIRADA: semieje mayor 20 sobre +y, menor 10 sobre x.
  const ellipse: CadCurve = {
    kind: "ellipse",
    center: { x: 0, y: 0 },
    major: { x: 0, y: 20 },
    ratio: 0.5,
    startParam: 0,
    sweep: 360,
  };
  pointNear(curvePointAt(ellipse, 0), { x: 0, y: 20 }, 1e-9, "parámetro 0 es el extremo del eje mayor");
  pointNear(curvePointAt(ellipse, 0.25), { x: -10, y: 0 }, 1e-9, "un cuarto de vuelta cae en el eje menor");
}

// --- segmento × segmento: punto Y parámetros ------------------------------------
{
  const hits = curveIntersections(
    { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    { kind: "segment", a: { x: 4, y: -5 }, b: { x: 4, y: 5 } },
  );
  assert.equal(hits.length, 1);
  pointNear(hits[0].point, { x: 4, y: 0 }, 1e-12, "cruce");
  near(hits[0].tA, 0.4, 1e-12, "parámetro sobre el primero");
  near(hits[0].tB, 0.5, 1e-12, "parámetro sobre el segundo");

  // Paralelas: ningún cruce, y no una excepción.
  assert.equal(
    curveIntersections(
      { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { kind: "segment", a: { x: 0, y: 1 }, b: { x: 10, y: 1 } },
    ).length,
    0,
    "dos paralelas no se cortan",
  );

  // Cruce fuera del segundo segmento: acotado no cuenta.
  assert.equal(
    curveIntersections(
      { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { kind: "segment", a: { x: 4, y: 5 }, b: { x: 4, y: 9 } },
    ).length,
    0,
    "el cruce cae fuera del segundo",
  );
}

// --- segmento × círculo, y la elección de los DOS cortes ------------------------
{
  const hits = curveIntersections(
    { kind: "segment", a: { x: -20, y: 0 }, b: { x: 20, y: 0 } },
    { kind: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweep: 360 },
  );
  assert.equal(hits.length, 2, "una secante corta en dos");
  // Ordenados por tA: primero el de −5.
  pointNear(hits[0].point, { x: -5, y: 0 }, 1e-9, "primer corte");
  pointNear(hits[1].point, { x: 5, y: 0 }, 1e-9, "segundo corte");
  near(hits[0].tA, 0.375, 1e-9, "parámetro del primer corte");
  near(hits[1].tA, 0.625, 1e-9, "parámetro del segundo corte");
}

// --- arco × arco: sólo dentro de los dos barridos --------------------------------
{
  const full = curveIntersections(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweep: 360 },
    { kind: "arc", center: { x: 6, y: 0 }, radius: 5, startAngle: 0, sweep: 360 },
  );
  assert.equal(full.length, 2);
  assert.ok(hasPoint(full.map((hit) => hit.point), { x: 3, y: 4 }), "cruce superior");
  assert.ok(hasPoint(full.map((hit) => hit.point), { x: 3, y: -4 }), "cruce inferior");

  // El mismo par, pero el segundo recortado al semiplano superior: uno solo.
  const half = curveIntersections(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweep: 360 },
    { kind: "arc", center: { x: 6, y: 0 }, radius: 5, startAngle: 0, sweep: 180 },
  );
  assert.equal(half.length, 1, "el barrido del segundo descarta el cruce inferior");
  pointNear(half[0].point, { x: 3, y: 4 }, 1e-9, "queda el de arriba");
}

// --- segmento × elipse: exacto, incluso girada -----------------------------------
{
  const rotated: CadCurve = {
    kind: "ellipse",
    center: { x: 0, y: 0 },
    major: { x: 0, y: 20 },
    ratio: 0.5,
    startParam: 0,
    sweep: 360,
  };
  const hits = curveIntersections(
    { kind: "segment", a: { x: -30, y: 0 }, b: { x: 30, y: 0 } },
    rotated,
  );
  assert.equal(hits.length, 2, "el eje x corta la elipse girada en dos");
  // Si el giro se ignorara saldrían ±20 en vez de ±10.
  assert.ok(hasPoint(hits.map((hit) => hit.point), { x: -10, y: 0 }), "corte en −10");
  assert.ok(hasPoint(hits.map((hit) => hit.point), { x: 10, y: 0 }), "corte en +10");

  // Una elipse RECORTADA sólo corta dentro de su tramo. Media elipse (0°→180°)
  // de la girada recorre x negativo, así que sólo queda un corte.
  const halfHits = curveIntersections(
    { kind: "segment", a: { x: -30, y: 0 }, b: { x: 30, y: 0 } },
    { ...rotated, sweep: 180 },
  );
  assert.equal(halfHits.length, 1, "media elipse sólo alcanza uno de los dos cortes");
  pointNear(halfHits[0].point, { x: -10, y: 0 }, 1e-6, "el del lado que recorre");
}

// --- círculo × elipse: la vía numérica, con anclas calculadas a mano -------------
{
  // Elipse x²/400 + y²/100 = 1 contra circunferencia x² + y² = 225.
  // ⇒ y² = 175/3, x² = 500/3.
  const hits = curveIntersections(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 15, startAngle: 0, sweep: 360 },
    {
      kind: "ellipse",
      center: { x: 0, y: 0 },
      major: { x: 20, y: 0 },
      ratio: 0.5,
      startParam: 0,
      sweep: 360,
    },
  );
  assert.equal(hits.length, 4, "cuatro cruces por simetría");
  const x = Math.sqrt(500 / 3);
  const y = Math.sqrt(175 / 3);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      assert.ok(
        hasPoint(hits.map((hit) => hit.point), { x: sx * x, y: sy * y }, 1e-6),
        `cruce en (${sx * x}, ${sy * y})`,
      );
}

// --- tangencia: el cruce que NO cambia de signo -----------------------------------
{
  // x²/400 + y²/100 = 1 y x² + y² = 100 se tocan exactamente en (0, ±10).
  // Sin la búsqueda de mínimos locales, esta pareja saldría con CERO cruces.
  const hits = curveIntersections(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweep: 360 },
    {
      kind: "ellipse",
      center: { x: 0, y: 0 },
      major: { x: 20, y: 0 },
      ratio: 0.5,
      startParam: 0,
      sweep: 360,
    },
  );
  assert.equal(hits.length, 2, "dos tangencias");
  assert.ok(hasPoint(hits.map((hit) => hit.point), { x: 0, y: 10 }, 1e-4), "tangencia superior");
  assert.ok(hasPoint(hits.map((hit) => hit.point), { x: 0, y: -10 }, 1e-4), "tangencia inferior");
}

// --- elipse × elipse ---------------------------------------------------------------
{
  // Dos elipses iguales giradas 90°: x²/400+y²/100=1 y x²/100+y²/400=1 ⇒ x²=y²=80.
  const hits = curveIntersections(
    { kind: "ellipse", center: { x: 0, y: 0 }, major: { x: 20, y: 0 }, ratio: 0.5, startParam: 0, sweep: 360 },
    { kind: "ellipse", center: { x: 0, y: 0 }, major: { x: 0, y: 20 }, ratio: 0.5, startParam: 0, sweep: 360 },
  );
  assert.equal(hits.length, 4, "cuatro cruces");
  const k = Math.sqrt(80);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      assert.ok(hasPoint(hits.map((hit) => hit.point), { x: sx * k, y: sy * k }, 1e-5), "cruce simétrico");
}

// --- extender es intersecar SIN acotar ----------------------------------------------
{
  const stub: CadCurve = { kind: "segment", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
  const circle: CadCurve = { kind: "arc", center: { x: 5, y: 0 }, radius: 1, startAngle: 0, sweep: 360 };
  assert.equal(curveIntersections(stub, circle).length, 0, "acotado, el muñón no llega");
  const beyond = curveIntersections(stub, circle, { extendA: true });
  assert.equal(beyond.length, 2, "extendido, alcanza los dos cortes");
  near(beyond[0].tA, 4, 1e-9, "el cercano queda en t=4");
  near(beyond[1].tA, 6, 1e-9, "y el lejano en t=6");

  // Lo mismo con un ARCO: un cuadrante extendido es la circunferencia entera.
  const quarter: CadCurve = { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweep: 90 };
  const cutter: CadCurve = { kind: "segment", a: { x: 0, y: 0 }, b: { x: -20, y: 0 } };
  assert.equal(curveIntersections(quarter, cutter).length, 0, "el cuadrante no llega a 180°");
  const extended = curveIntersections(quarter, cutter, { extendA: true });
  assert.equal(extended.length, 1);
  pointNear(extended[0].point, { x: -10, y: 0 }, 1e-9, "el corte está en 180°");
  near(extended[0].tA, 2, 1e-9, "que son dos cuadrantes de avance");
}

// --- contra TODAS las curvas de una polilínea, sin duplicar el vértice común --------
{
  const polyline = cadEntityCurves({
    id: "p",
    type: "polyline",
    vertices: [
      { x: 5, y: -5, z: 0 },
      { x: 5, y: 5, z: 0 },
      { x: 15, y: 5, z: 0 },
    ],
    closed: false,
    layer: "0",
  })!;
  const hits = curveIntersectionsWithAll(
    { kind: "segment", a: { x: 0, y: 0 }, b: { x: 20, y: 0 } },
    polyline,
  );
  assert.equal(hits.length, 1, "sólo el tramo vertical cruza la horizontal");
  pointNear(hits[0].point, { x: 5, y: 0 }, 1e-12, "en (5,0)");

  // Una horizontal que pasa por el VÉRTICE compartido lo ve UNA sola vez: los
  // dos tramos lo tocan, y contarlo dos veces dejaría a TRIM un intervalo de
  // longitud cero — el objeto desaparecería.
  const atVertex = curveIntersectionsWithAll(
    { kind: "segment", a: { x: 0, y: 5 }, b: { x: 20, y: 5 } },
    polyline,
  );
  assert.equal(atVertex.length, 1, "el vértice compartido cuenta una vez");
  pointNear(atVertex[0].point, { x: 5, y: 5 }, 1e-9, "en el vértice");
}

// --- nada sale NaN -------------------------------------------------------------------
{
  // Casos degenerados que en este repositorio ya produjeron NaN persistido:
  // longitud cero, radio cero, elipse aplastada.
  const degenerate: CadCurve[] = [
    { kind: "segment", a: { x: 3, y: 3 }, b: { x: 3, y: 3 } },
    { kind: "arc", center: { x: 0, y: 0 }, radius: 0, startAngle: 0, sweep: 360 },
    { kind: "ellipse", center: { x: 0, y: 0 }, major: { x: 0, y: 0 }, ratio: 0.5, startParam: 0, sweep: 360 },
    { kind: "ellipse", center: { x: 0, y: 0 }, major: { x: 10, y: 0 }, ratio: 0, startParam: 0, sweep: 360 },
  ];
  const sane: CadCurve[] = [
    { kind: "segment", a: { x: -50, y: 0 }, b: { x: 50, y: 1 } },
    { kind: "arc", center: { x: 1, y: 1 }, radius: 7, startAngle: 20, sweep: 200 },
    { kind: "ellipse", center: { x: 2, y: -1 }, major: { x: 9, y: 4 }, ratio: 0.4, startParam: 10, sweep: 300 },
  ];
  for (const a of [...degenerate, ...sane])
    for (const b of [...degenerate, ...sane])
      for (const extendA of [false, true])
        for (const hit of curveIntersections(a, b, { extendA, extendB: extendA })) {
          checks += 1;
          assert.ok(
            Number.isFinite(hit.point.x) &&
              Number.isFinite(hit.point.y) &&
              Number.isFinite(hit.tA) &&
              Number.isFinite(hit.tB),
            `un cruce no finito: ${JSON.stringify(hit)}`,
          );
        }
}

// --- la caja envolvente es un SUPERCONJUNTO, nunca falta ------------------------------
{
  // Se usa para descartar bordes baratos en TRIM con `Todos`: si se quedara
  // corta, descartaría un corte real. Un arco devuelve la caja de su
  // CIRCUNFERENCIA entera a propósito.
  const quarter: CadCurve = { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweep: 90 };
  const box = curveBounds(quarter);
  near(box.minX, -10, 1e-12, "aunque el cuadrante no baja de x=0, la caja sí");
  near(box.maxY, 10, 1e-12, "");

  // Y para cualquier curva, todo punto muestreado cae DENTRO de su caja.
  const samples: CadCurve[] = [
    { kind: "segment", a: { x: -3, y: 7 }, b: { x: 11, y: -2 } },
    { kind: "arc", center: { x: 4, y: -1 }, radius: 6, startAngle: 200, sweep: 130 },
    { kind: "ellipse", center: { x: 2, y: 2 }, major: { x: 9, y: 4 }, ratio: 0.4, startParam: 10, sweep: 300 },
  ];
  for (const curve of samples) {
    const bounds = curveBounds(curve);
    for (let step = 0; step <= 64; step += 1) {
      const point = curvePointAt(curve, step / 64);
      checks += 1;
      assert.ok(
        point.x >= bounds.minX - 1e-9 &&
          point.x <= bounds.maxX + 1e-9 &&
          point.y >= bounds.minY - 1e-9 &&
          point.y <= bounds.maxY + 1e-9,
        `${curve.kind}: el punto (${point.x}, ${point.y}) se sale de su propia caja`,
      );
    }
  }

  // Dos cajas que no se tocan no se solapan, y una margen las junta.
  const left = curveBounds({ kind: "segment", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
  const right = curveBounds({ kind: "segment", a: { x: 2, y: 0 }, b: { x: 3, y: 0 } });
  checks += 1;
  assert.ok(!curveBoundsOverlap(left, right), "separadas");
  checks += 1;
  assert.ok(curveBoundsOverlap(left, right, 1.5), "con margen, se tocan");
  assert.equal(curveBoundsUnion([]), null, "sin curvas no hay caja");
}

console.log(
  `curva canónica: conversión, parametrización y ${checks} anclas absolutas de intersección ` +
    `(segmento, arco, elipse girada, tangencia y extensión) verificadas`,
);
