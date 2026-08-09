/**
 * PEDIT y SPLINEDIT.
 *
 * Lo que se afirma:
 *
 *   1. `Ajustar` produce arcos que PASAN POR LOS VÉRTICES. Una implementación
 *      que se limitara a poner un bulge constante daría una curva bonita y
 *      falsa; la aserción comprueba el valor concreto que sale de la regla de
 *      la tangente media, y que la polilínea sigue teniendo los mismos puntos.
 *   2. `Curvar` deshace exactamente eso. Ida y vuelta no basta —la identidad
 *      también la cumple—, así que se comprueba que después NINGÚN vértice
 *      conserva bulge.
 *   3. `Juntar` de PEDIT usa las MISMAS reglas que JOIN. Dos comandos que
 *      responden distinto a la misma pareja de objetos son dos comandos que se
 *      van a separar con el tiempo.
 *   4. Todo cambio conserva el ID. Un PEDIT que borrase y recreara la polilínea
 *      rompería las cotas y los sombreados que la apuntan.
 *   5. Lo que no está hecho lo DICE. `Refinar` de SPLINEDIT se rechaza por su
 *      nombre en vez de aceptarse y no hacer nada.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_PEDIT_COMMANDS, cadPolylineFitBulges } from "./modify-pedit";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const commands = new Map(CAD_MODIFY_PEDIT_COMMANDS.map((command) => [command.name, command]));

const SCENE: CadEntity[] = [
  {
    id: "poly",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    closed: false,
    layer: "0",
  },
  {
    id: "curved",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 0.5 },
      { x: 10, y: 0, z: 0, bulge: -0.2 },
      { x: 10, y: 10, z: 0 },
    ],
    closed: false,
    layer: "0",
  },
  {
    id: "two",
    type: "polyline",
    vertices: [
      { x: 0, y: 50, z: 0 },
      { x: 10, y: 50, z: 0 },
    ],
    closed: false,
    layer: "0",
  },
  // Continúa a `poly` desde (10,10): PEDIT Juntar debe encadenarlas.
  { id: "tail", type: "line", start: { x: 10, y: 10, z: 0 }, end: { x: 20, y: 10, z: 0 }, layer: "0" },
  // No toca a `poly`: la negativa tiene que explicarse.
  { id: "far", type: "line", start: { x: 90, y: 90, z: 0 }, end: { x: 99, y: 99, z: 0 }, layer: "0" },
  {
    id: "spl",
    type: "spline",
    degree: 3,
    controlPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 20, z: 0 },
      { x: 20, y: -20, z: 0 },
      { x: 30, y: 0, z: 0 },
    ],
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    weights: [1, 2, 3, 4],
    layer: "0",
  },
  { id: "note", type: "mtext", insertion: { x: 0, y: 900, z: 0 }, text: "x", layer: "0" },
];

function makeContext(): CadCommandContext {
  const entities = new Map(SCENE.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[]) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe existir`);
  const context = makeContext();
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const enter: CadCommandInput = { kind: "enter" };
const pick = (entityId: string): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x: 0, y: 0 },
});
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });

// --- Cerrar y Abrir -------------------------------------------------------------
{
  const closed = run("PEDIT", [pick("poly"), keyword("Cerrar")]);
  assert.ok(closed && closed.kind === "document");
  const command = closed.commands[0];
  assert.ok(command.type === "properties");
  assert.equal(command.entityId, "poly", "conserva el id");
  assert.equal(command.patch.closed, true);

  const already = run("PEDIT", [pick("poly"), keyword("Abrir")]);
  assert.equal(already?.kind, "message", "abrir lo que ya está abierto se dice");
  assert.ok(already.kind === "message" && already.text.includes("ya está abierta"));

  const tooFew = run("PEDIT", [pick("two"), keyword("Cerrar")]);
  assert.equal(tooFew?.kind, "message");
  assert.ok(tooFew.kind === "message" && tooFew.text.includes("tres vértices"));
}

// --- Ajustar: arcos que PASAN por los vértices -------------------------------------
{
  // Escuadra (0,0)–(10,0)–(10,10). En el primer vértice la tangente es la del
  // propio tramo (+x) y la cuerda también, así que el primer tramo queda RECTO.
  // En el segundo, la tangente media es (10,10)−(0,0) = 45°, y la cuerda del
  // tramo va a 90°: el desvío es 45°, el barrido 90°, y el bulge tan(90/4)
  // = tan(22,5°) = 0,41421356.
  const bulges = cadPolylineFitBulges(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    false,
  );
  assert.equal(bulges.length, 2);
  near(bulges[0], 0, 1e-12, "el primer tramo sale de un extremo: sin curvatura");
  near(bulges[1], Math.tan(Math.PI / 8), 1e-12, "y el segundo se dobla según la tangente media");

  const result = run("PEDIT", [pick("poly"), keyword("Ajustar")]);
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "polyline");
  assert.equal(command.entityId, "poly", "conserva el id");
  // Los VÉRTICES no se mueven: ajustar curva los tramos, no reubica los puntos.
  assert.deepEqual(
    command.entity.vertices.map((vertex) => [vertex.x, vertex.y]),
    [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    "el ajuste pasa por los mismos puntos",
  );
  near(command.entity.vertices[1].bulge ?? 0, Math.tan(Math.PI / 8), 1e-12, "y el bulge es el calculado");
}

// --- Curvar deja TODO recto -----------------------------------------------------
{
  const result = run("PEDIT", [pick("curved"), keyword("Curvar")]);
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "polyline");
  assert.ok(
    command.entity.vertices.every((vertex) => (vertex.bulge ?? 0) === 0),
    "ningún vértice conserva curvatura: una ida y vuelta se cumpliría también sin hacer nada",
  );

  const already = run("PEDIT", [pick("poly"), keyword("Curvar")]);
  assert.equal(already?.kind, "message");
  assert.ok(already.kind === "message" && already.text.includes("ya es de tramos rectos"));
}

// --- Spline: la polilínea se convierte en SPLINE con el mismo id ------------------
{
  const result = run("PEDIT", [pick("poly"), keyword("Spline")]);
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "replace" && command.entity.type === "spline");
  assert.equal(command.entityId, "poly");
  assert.equal(command.entity.controlPoints.length, 3, "los vértices son el polígono de control");
  assert.equal(
    command.entity.knots.length,
    command.entity.controlPoints.length + command.entity.degree + 1,
    "con un vector de nudos del tamaño que exige el grado",
  );
}

// --- Ancho: el grosor explícito ---------------------------------------------------
{
  const result = run("PEDIT", [pick("poly"), keyword("Ancho"), distance(35)]);
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "presentation");
  assert.equal(command.presentation?.lineweight?.value, 35);

  const negative = run("PEDIT", [pick("poly"), keyword("Ancho"), distance(-1)]);
  assert.equal(negative?.kind, "message");
  assert.ok(negative.kind === "message" && negative.text.includes("negativo"));
}

// --- Editar vértice: mover, insertar y eliminar --------------------------------------
{
  const moved = run("PEDIT", [
    pick("poly"),
    keyword("Editarvértice"),
    point(10, 0),
    keyword("Mover"),
    point(15, -5),
  ]);
  assert.ok(moved && moved.kind === "document");
  const movedCommand = moved.commands[0];
  assert.ok(movedCommand.type === "replace" && movedCommand.entity.type === "polyline");
  near(movedCommand.entity.vertices[1].x, 15, 1e-12, "el vértice señalado se mueve");
  near(movedCommand.entity.vertices[1].y, -5, 1e-12, "");
  near(movedCommand.entity.vertices[0].x, 0, 1e-12, "y los demás no");

  const inserted = run("PEDIT", [
    pick("poly"),
    keyword("Editarvértice"),
    point(0, 0),
    keyword("Insertar"),
    point(5, 5),
  ]);
  assert.ok(inserted && inserted.kind === "document");
  const insertedCommand = inserted.commands[0];
  assert.ok(insertedCommand.type === "replace" && insertedCommand.entity.type === "polyline");
  assert.equal(insertedCommand.entity.vertices.length, 4);
  near(insertedCommand.entity.vertices[1].x, 5, 1e-12, "el vértice nuevo entra DETRÁS del señalado");

  const removed = run("PEDIT", [
    pick("poly"),
    keyword("Editarvértice"),
    point(10, 0),
    keyword("Eliminar"),
  ]);
  assert.ok(removed && removed.kind === "document");
  const removedCommand = removed.commands[0];
  assert.ok(removedCommand.type === "replace" && removedCommand.entity.type === "polyline");
  assert.equal(removedCommand.entity.vertices.length, 2);

  const cannot = run("PEDIT", [
    pick("two"),
    keyword("Editarvértice"),
    point(0, 50),
    keyword("Eliminar"),
  ]);
  assert.equal(cannot?.kind, "message");
  assert.ok(cannot.kind === "message" && cannot.text.includes("dos vértices"));
}

// --- Juntar usa las MISMAS reglas que JOIN ---------------------------------------------
{
  const joined = run("PEDIT", [pick("poly"), keyword("Juntar"), pick("tail"), enter]);
  assert.ok(joined && joined.kind === "document");
  const replace = joined.commands[0];
  assert.ok(replace.type === "replace" && replace.entity.type === "polyline");
  assert.equal(replace.entity.vertices.length, 4, "la línea se encadena a la polilínea");
  assert.ok(joined.commands.some((command) => command.type === "delete" && command.entityId === "tail"));

  const loose = run("PEDIT", [pick("poly"), keyword("Juntar"), pick("far"), enter]);
  assert.equal(loose?.kind, "message");
  assert.ok(
    loose.kind === "message" && loose.text.includes("no toca ningún extremo"),
    "y la negativa es la misma que daría JOIN",
  );
}

// --- PEDIT sólo edita polilíneas, y lo dice ---------------------------------------------
{
  const result = run("PEDIT", [pick("note")]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("MTEXT"));
}

// --- SPLINEDIT ---------------------------------------------------------------------------
{
  const closed = run("SPLINEDIT", [pick("spl"), keyword("Cerrar")]);
  assert.ok(closed && closed.kind === "document");
  assert.ok(closed.commands[0].type === "replace" && closed.commands[0].entity.type === "spline");
  assert.equal(closed.commands[0].entity.closed, true);

  const reversed = run("SPLINEDIT", [pick("spl"), keyword("inVertir")]);
  assert.ok(reversed && reversed.kind === "document");
  const reversedCommand = reversed.commands[0];
  assert.ok(reversedCommand.type === "replace" && reversedCommand.entity.type === "spline");
  near(reversedCommand.entity.controlPoints[0].x, 30, 1e-12, "los puntos se invierten…");
  assert.deepEqual(
    reversedCommand.entity.weights,
    [4, 3, 2, 1],
    "…y los PESOS con ellos: invertir unos sin los otros cambia la forma sin mover un punto",
  );

  const movedVertex = run("SPLINEDIT", [
    pick("spl"),
    keyword("Movervértice"),
    point(10, 20),
    point(12, 25),
  ]);
  assert.ok(movedVertex && movedVertex.kind === "document");
  const movedCommand = movedVertex.commands[0];
  assert.ok(movedCommand.type === "replace" && movedCommand.entity.type === "spline");
  near(movedCommand.entity.controlPoints[1].x, 12, 1e-12, "el punto de control señalado se mueve");
  near(movedCommand.entity.controlPoints[0].x, 0, 1e-12, "y los demás no");

  const polyline = run("SPLINEDIT", [pick("spl"), keyword("Polilínea")]);
  assert.ok(polyline && polyline.kind === "document");
  const polylineCommand = polyline.commands[0];
  assert.ok(polylineCommand.type === "replace" && polylineCommand.entity.type === "polyline");
  assert.equal(polylineCommand.entityId, "spl", "conserva el id al cambiar de tipo");
  assert.ok(polylineCommand.entity.vertices.length > 10, "se evalúa la curva, no sus puntos de control");
  near(polylineCommand.entity.vertices[0].x, 0, 1e-9, "arranca en el primer punto de control");

  // Lo que no está hecho se nombra.
  const refine = run("SPLINEDIT", [pick("spl"), keyword("Refinar")]);
  assert.equal(refine?.kind, "message");
  assert.ok(refine.kind === "message" && refine.text.includes("todavía no está implementado"));

  const wrongType = run("SPLINEDIT", [pick("poly")]);
  assert.equal(wrongType?.kind, "message");
  assert.ok(wrongType.kind === "message" && wrongType.text.includes("POLYLINE"));
}

console.log(
  `PEDIT y SPLINEDIT: ${checks} anclas — ajuste por arcos que pasa por los vértices, ` +
    `edición de vértices, unión con las reglas de JOIN e inversión de spline con sus pesos`,
);
