/**
 * Una POLILÍNEA como frontera de TRIM/EXTEND.
 *
 * EL HUECO. Los PRs anteriores abrieron la frontera a círculos y arcos y el
 * objetivo a arcos, pero la polilínea seguía fuera en ambos papeles. Y es la
 * frontera más común de todas: un contorno de nave, el borde de una parcela, el
 * perímetro de una zona — casi nunca son una recta suelta.
 *
 * CÓMO SE RESUELVE. Una polilínea es una secuencia de tramos, así que sus
 * cruces con el objetivo son la unión de los cruces de cada tramo. Cada tramo se
 * respeta como SEGMENTO: un cruce que cae fuera de él no lo toca. Y a diferencia
 * de una línea suelta, que un tramo concreto no cruce es normal — sólo importa
 * que ALGUNO lo haga.
 *
 * LO QUE SE RECHAZA, y a propósito. Una polilínea con `bulge` describe ARCOS.
 * Tratarlos como cuerdas daría cortes en el sitio equivocado: la frontera se ve
 * cruzar el objetivo por un punto y el recorte cae en otro. Peor que negarse.
 * Se rechaza en bloque, igual que hace OFFSET con el mismo caso.
 */
import { strict as assert } from "node:assert";
import {
  computeCadLineTrim,
  computeCadLineExtend,
  computeCadArcTrim,
} from "./cad-line-edit";
import type { CadEntity } from "./cad-document";

type CadLine = Extract<CadEntity, { type: "line" }>;
type CadArc = Extract<CadEntity, { type: "arc" }>;
type CadPolyline = Extract<CadEntity, { type: "polyline" }>;

const near = (value: number, expected: number, what: string) =>
  assert.ok(
    Math.abs(value - expected) < 1e-6,
    `${what}: se esperaba ${expected} y llegó ${value}`,
  );

/**
 * Contorno en U: baja por x=100, cruza abajo, y sube por x=300. Una horizontal
 * a media altura lo corta DOS veces, una por cada brazo.
 */
const U: CadPolyline = {
  id: "contorno",
  type: "polyline",
  vertices: [
    { x: 100, y: 400, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 300, y: 0, z: 0 },
    { x: 300, y: 400, z: 0 },
  ],
  closed: false,
  layer: "0",
};

// ---------------------------------------------------------------------------
// TRIM de una línea contra una polilínea: cuál de los cruces
// ---------------------------------------------------------------------------

{
  // Horizontal por y=200, de x=0 a x=500: cruza los dos brazos, en 100 y 300.
  const target: CadLine = {
    id: "via",
    type: "line",
    start: { x: 0, y: 200, z: 0 },
    end: { x: 500, y: 200, z: 0 },
    layer: "0",
  };

  const keepStart = computeCadLineTrim(target, U, "start");
  near(keepStart.start.x, 0, "conservar el inicio no lo mueve");
  near(
    keepStart.end.x,
    100,
    "se recorta en el PRIMER cruce con la polilínea, sin importar de qué tramo venga",
  );

  const keepEnd = computeCadLineTrim(target, U, "end");
  near(keepEnd.end.x, 500, "conservar el fin no lo mueve");
  near(keepEnd.start.x, 300, "y por simetría, en el ÚLTIMO");
}

{
  // Que un tramo concreto no cruce es NORMAL en una polilínea: el tramo
  // inferior (y=0) no toca esta horizontal, y aun así el recorte funciona.
  const target: CadLine = {
    id: "via2",
    type: "line",
    start: { x: 0, y: 350, z: 0 },
    end: { x: 500, y: 350, z: 0 },
    layer: "0",
  };
  const cut = computeCadLineTrim(target, U, "start");
  near(cut.end.x, 100, "basta con que ALGÚN tramo cruce");
}

// ---------------------------------------------------------------------------
// Cada tramo se respeta como SEGMENTO
// ---------------------------------------------------------------------------

{
  // Por y=600 la horizontal está por encima del contorno: la prolongación de
  // los brazos la cruzaría, pero los tramos reales acaban en y=400.
  const above: CadLine = {
    id: "alta",
    type: "line",
    start: { x: 0, y: 600, z: 0 },
    end: { x: 500, y: 600, z: 0 },
    layer: "0",
  };
  assert.throws(
    () => computeCadLineTrim(above, U, "start"),
    /intersec|inside|dentro/i,
    "un cruce con la PROLONGACIÓN de un tramo no es un cruce con la polilínea",
  );
}

// ---------------------------------------------------------------------------
// EXTEND contra una polilínea
// ---------------------------------------------------------------------------

{
  // La línea acaba antes del contorno; estirando el final llega al brazo
  // izquierdo, en x=100 — no al derecho, que está más lejos.
  const short: CadLine = {
    id: "acceso",
    type: "line",
    start: { x: -200, y: 200, z: 0 },
    end: { x: 0, y: 200, z: 0 },
    layer: "0",
  };
  const grown = computeCadLineExtend(short, U, "end");
  near(grown.start.x, -200, "el otro extremo no se mueve");
  near(grown.end.x, 100, "EXTEND llega al cruce más cercano, no al del otro brazo");
}

// ---------------------------------------------------------------------------
// Un ARCO también se recorta contra una polilínea
// ---------------------------------------------------------------------------

{
  // Arco de radio 100 en el origen, de 0° a 180°. Un tramo vertical por x=50
  // lo corta en 60°.
  const arc: CadArc = {
    id: "curva",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 100,
    startAngle: 0,
    endAngle: 180,
    layer: "0",
  };
  const wall: CadPolyline = {
    id: "muro",
    type: "polyline",
    vertices: [
      { x: 50, y: -200, z: 0 },
      { x: 50, y: 200, z: 0 },
      { x: 400, y: 200, z: 0 },
    ],
    closed: false,
    layer: "0",
  };
  const cut = computeCadArcTrim(arc, wall, "start");
  near(cut.endAngle, 60, "el arco se recorta contra el tramo que de verdad lo cruza");
  near(cut.startAngle, 0, "y el otro extremo angular no se mueve");
}

// ---------------------------------------------------------------------------
// Los BULGES se rechazan: tratarlos como cuerdas cortaría en el sitio erróneo
// ---------------------------------------------------------------------------

{
  const curved: CadPolyline = {
    ...U,
    vertices: U.vertices.map((vertex, index) =>
      index === 1 ? { ...vertex, bulge: 0.5 } : vertex,
    ),
  };
  const target: CadLine = {
    id: "via3",
    type: "line",
    start: { x: 0, y: 200, z: 0 },
    end: { x: 500, y: 200, z: 0 },
    layer: "0",
  };
  assert.throws(
    () => computeCadLineTrim(target, curved, "start"),
    /bulge|arco/i,
    "una polilínea con arcos se rechaza en bloque: aplanarla cortaría en el sitio equivocado",
  );
}

console.log(
  "trim/extend: una polilínea sirve de frontera para líneas y arcos, tramo a tramo, y sus bulges se rechazan en vez de aplanarse",
);
