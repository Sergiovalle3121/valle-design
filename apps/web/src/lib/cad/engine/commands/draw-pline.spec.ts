/**
 * PLINE con arco y con grosor.
 *
 * Lo que se comprueba no es que emita una polilínea, sino las cuatro decisiones
 * que si se equivocan producen un dibujo plausible y falso:
 *
 *   1. El `bulge` de un arco de 90° vale `tan(22,5°)`, no cualquier número que
 *      «se parezca»: es el que hace que el arco pase por donde se ve.
 *   2. Los arcos EMPALMAN. La tangente de salida de un tramo es la de entrada
 *      del siguiente; usar la cuerda anterior da un pico en cada unión.
 *   3. `Media-anchura` es la MITAD del ancho. Confundirlos dibuja el doble de
 *      grueso, y nada avisa.
 *   4. El último vértice de una polilínea ABIERTA no arranca ningún tramo, así
 *      que no lleva ni bulge ni grosor.
 */
import { strict as assert } from "node:assert";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_DRAW_PLINE_COMMANDS } from "./draw-pline";

const descriptor = CAD_DRAW_PLINE_COMMANDS[0];

function makeContext(): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "MUROS",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `id${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[]) {
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const ENTER: CadCommandInput = { kind: "enter" };

function polyline(result: ReturnType<typeof run>) {
  assert.ok(result && result.kind === "document", "debía producir documento");
  const command = result.commands[0];
  assert.ok(command && command.type === "insert");
  if (command.type !== "insert" || command.entity.type !== "polyline") throw new Error("tipo");
  return command.entity;
}

const near = (actual: number, expected: number, what: string, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

/** `tan(22,5°)`: el bulge de un cuarto de vuelta. */
const QUARTER = Math.tan(Math.PI / 8);

// --- sigue trazando rectas como siempre --------------------------------------
{
  const entity = polyline(run([point(0, 0), point(100, 0), point(100, 100), ENTER]));
  assert.equal(entity.vertices.length, 3);
  assert.equal(entity.closed, false);
  for (const vertex of entity.vertices)
    assert.equal(vertex.bulge, undefined, "un tramo recto no escribe bulge");
  assert.equal(entity.layer, "MUROS");
}

// --- Arco: el primer tramo curvo sale tangente al eje +X ----------------------
{
  // Sin tramo previo no hay tangente a la que empalmar; el motor usa 0 rad, que
  // es el valor por defecto de AutoCAD. Yendo de (0,0) a (100,100), la cuerda
  // va a 45° y el ángulo incluido es 2·45° = 90°.
  const entity = polyline(run([point(0, 0), keyword("Arco"), point(100, 100), ENTER]));
  assert.equal(entity.vertices.length, 2);
  near(entity.vertices[0].bulge ?? 0, QUARTER, "arco de 90° = tan(22,5°)", 1e-12);
  assert.equal(entity.vertices[1].bulge, undefined, "el vértice final no arranca tramo");
}

// --- Arco por ÁNGULO incluido explícito ---------------------------------------
{
  const entity = polyline(
    run([point(0, 0), keyword("Arco"), keyword("Ángulo"), distance(180), point(200, 0), ENTER]),
  );
  // Media vuelta: `tan(180/4°)` = tan(45°) = 1. Es el mismo número que usa un
  // donut, y por la misma razón.
  near(entity.vertices[0].bulge ?? 0, 1, "media vuelta = bulge 1", 1e-12);
}

// --- los arcos EMPALMAN: la tangente de salida es la de entrada ---------------
{
  const entity = polyline(
    run([point(0, 0), keyword("Arco"), point(100, 100), point(200, 100), ENTER]),
  );
  assert.equal(entity.vertices.length, 3);
  // Primer arco: 90°, así que su tangente de SALIDA está a 45° + 45° = 90°
  // (vertical hacia arriba). El segundo tramo va de (100,100) a (200,100), con
  // cuerda a 0°: θ = 2·(0 − 90) = −180°, es decir media vuelta en horario.
  near(entity.vertices[0].bulge ?? 0, QUARTER, "primer arco", 1e-12);
  near(entity.vertices[1].bulge ?? 0, -1, "el segundo arco empalma con el primero", 1e-12);
  // Si se hubiese tomado la CUERDA anterior (45°) en vez de la tangente (90°),
  // saldría tan(−22,5°) ≈ −0,414: la misma silueta general, con un pico en la
  // unión y sin ningún error por ninguna parte.
  assert.ok(
    Math.abs((entity.vertices[1].bulge ?? 0) + QUARTER) > 0.1,
    "no puede ser el bulge que daría usar la cuerda",
  );
}

// --- Ancho: se aplica a los tramos SIGUIENTES, no a los ya trazados ----------
{
  const entity = polyline(
    run([
      point(0, 0),
      point(100, 0),
      keyword("Ancho"),
      distance(20),
      distance(20),
      point(200, 0),
      ENTER,
    ]),
  );
  assert.equal(entity.vertices.length, 3);
  assert.equal(entity.vertices[0].startWidth, undefined, "el primer tramo se trazó fino");
  near(entity.vertices[1].startWidth ?? 0, 20, "el segundo tramo lleva el ancho pedido");
  near(entity.vertices[1].endWidth ?? 0, 20, "y su ancho final");
  assert.equal(entity.vertices[2].startWidth, undefined, "el vértice final no arranca tramo");
}

// --- Ancho cónico: inicial ≠ final -------------------------------------------
{
  const entity = polyline(
    run([point(0, 0), keyword("Ancho"), distance(0), distance(40), point(300, 0), ENTER]),
  );
  // Un ancho inicial de 0 se deja AUSENTE: en el modelo la ausencia significa
  // traza fina, y materializar ceros ensancharía el serializado de todas las
  // polilíneas que no usan la opción.
  assert.equal(entity.vertices[0].startWidth, undefined, "el cero no se escribe");
  near(entity.vertices[0].endWidth ?? 0, 40, "y el final sí");
}

// --- Media-anchura es la MITAD del ancho -------------------------------------
{
  const entity = polyline(
    run([point(0, 0), keyword("Media-anchura"), distance(10), distance(10), point(100, 0), ENTER]),
  );
  near(
    entity.vertices[0].startWidth ?? 0,
    20,
    "media-anchura 10 son 20 de ancho; confundirlos dibuja el doble de grueso",
  );
}

// --- Longitud continúa en la dirección del último tramo -----------------------
{
  const entity = polyline(
    run([point(0, 0), point(100, 0), keyword("Longitud"), distance(50), ENTER]),
  );
  assert.equal(entity.vertices.length, 3);
  near(entity.vertices[2].x, 150, "sigue recto hacia +X");
  near(entity.vertices[2].y, 0, "sin desviarse");
}

// --- Cerrar en modo arco cierra CON arco --------------------------------------
{
  const entity = polyline(
    run([point(0, 0), point(100, 0), keyword("Arco"), point(100, 100), keyword("Cerrar")]),
  );
  assert.equal(entity.closed, true);
  assert.equal(entity.vertices.length, 3);
  // En una CERRADA el último vértice sí arranca un tramo —el de cierre—, así
  // que sí lleva bulge.
  assert.ok(
    entity.vertices[2].bulge !== undefined && entity.vertices[2].bulge !== 0,
    "el tramo de cierre en modo arco es un arco, no una recta",
  );
}

// --- desHacer retira el último vértice ---------------------------------------
{
  const entity = polyline(
    run([point(0, 0), point(100, 0), point(200, 0), keyword("desHacer"), ENTER]),
  );
  assert.equal(entity.vertices.length, 2, "el vértice deshecho no llega al documento");
}

// --- degenerados no se escriben ----------------------------------------------
{
  assert.equal(run([point(0, 0), ENTER])?.kind, "none", "un solo punto no es una polilínea");
  const single = polyline(run([point(0, 0), point(0, 0), point(100, 0), ENTER]));
  assert.equal(single.vertices.length, 2, "el clic repetido en el mismo sitio se ignora");
}

console.log(
  "PLINE: rectas, arcos por tangente y por ángulo, empalme entre arcos, ancho y media-anchura, " +
    "Longitud, cierre con arco y rechazo de degenerados — verificados con bulges absolutos",
);
