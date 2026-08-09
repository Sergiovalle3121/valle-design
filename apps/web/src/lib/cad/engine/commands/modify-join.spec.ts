/**
 * JOIN y EXPLODE.
 *
 * El foco de este spec son los RECHAZOS tanto como los aciertos, porque en JOIN
 * es donde se pierde el tiempo: dos líneas casi colineales se ven exactamente
 * igual que dos colineales, y un JOIN que se calla deja al dibujante probando
 * cosas sin saber qué está mal. Se afirma que cada negativa nombra su causa.
 *
 * En EXPLODE, la afirmación que más importa: un tramo de polilínea con `bulge`
 * sale como ARC, no como su cuerda. Sacarlo como cuerda cambiaría el dibujo en
 * silencio, que es justo lo que EXPLODE no debe hacer nunca.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_JOIN_COMMANDS } from "./modify-join";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const commands = new Map(CAD_MODIFY_JOIN_COMMANDS.map((command) => [command.name, command]));

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer: "0",
});
const arc = (id: string, startAngle: number, endAngle: number, radius = 10): CadEntity => ({
  id,
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius,
  startAngle,
  endAngle,
  layer: "0",
});

const BLOCK: CadBlockDefinition = {
  id: "blk",
  name: "PILAR",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [line("blk:entity:0", 0, 0, 2, 0), line("blk:entity:1", 2, 0, 2, 2)],
};

const SCENE: CadEntity[] = [
  // Dos trozos colineales con un HUECO entre 40 y 60.
  line("a", 0, 0, 40, 0),
  line("b", 60, 0, 100, 0),
  // Paralela pero desplazada: se ve casi igual y NO se puede unir.
  line("parallel", 0, 5, 40, 5),
  // Gira y no toca a ninguna: no es paralela y tampoco encadena.
  line("askew", 0, 10, 40, 11),
  // Encadenables extremo con extremo, uno de ellos al revés.
  line("c1", 0, 100, 10, 100),
  // Perpendicular a `c1` y dibujada HACIA ATRÁS: toca en (10,100).
  line("c2", 10, 120, 10, 100),
  arc("arcA", 0, 90),
  arc("arcB", 90, 200),
  arc("arcC", 200, 360),
  // Ni toca a `arcA` ni lo continúa: el hueco de verdad.
  arc("arcGap", 180, 270),
  // Concéntrico pero de otro radio.
  arc("wide", 90, 180, 20),
  {
    id: "poly",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0, bulge: 0.5 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    closed: false,
    layer: "0",
  },
  {
    id: "ins",
    type: "insert",
    block: "PILAR",
    insertion: { x: 100, y: 100, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "0",
  },
  {
    id: "dim",
    type: "dimension",
    a: { x: 0, y: -50 },
    b: { x: 100, y: -50 },
    dimensionKind: "aligned",
    layer: "0",
  },
  { id: "note", type: "mtext", insertion: { x: 0, y: 900, z: 0 }, text: "x", layer: "0" },
];

function makeContext(withBlocks = true): CadCommandContext {
  const entities = new Map(SCENE.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    ...(withBlocks ? { blocks: () => [BLOCK] } : {}),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe existir`);
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

// --- JOIN de líneas colineales rellena el hueco ------------------------------------
{
  const result = run("JOIN", [pick("a"), pick("b"), enter]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 2, "una línea se estira y la otra se borra");
  const patch = result.commands[0];
  assert.ok(patch.type === "properties");
  assert.equal(patch.entityId, "a", "el primer designado CONSERVA su id");
  near(patch.patch.startX as number, 0, 1e-9, "abarca de un extremo…");
  near(patch.patch.endX as number, 100, 1e-9, "…al otro, rellenando el hueco");
  assert.ok(result.commands[1].type === "delete" && result.commands[1].entityId === "b");
}

// --- y dice POR QUÉ cuando no puede -------------------------------------------------
{
  const parallel = run("JOIN", [pick("a"), pick("parallel"), enter]);
  assert.equal(parallel?.kind, "message");
  assert.ok(
    parallel.kind === "message" && parallel.text.includes("no está sobre la misma recta"),
    `paralela desplazada: "${parallel.kind === "message" ? parallel.text : ""}"`,
  );

  const askew = run("JOIN", [pick("a"), pick("askew"), enter]);
  assert.equal(askew?.kind, "message");
  assert.ok(askew.kind === "message" && askew.text.includes("no es paralela"));

  const alone = run("JOIN", [pick("a"), enter]);
  assert.equal(alone?.kind, "message");
  assert.ok(alone.kind === "message" && alone.text.includes("al menos dos"));
}

// --- JOIN de arcos concéntricos ------------------------------------------------------
{
  const two = run("JOIN", [pick("arcA"), pick("arcB"), enter]);
  assert.ok(two && two.kind === "document");
  const patch = two.commands[0];
  assert.ok(patch.type === "properties");
  near(patch.patch.startAngle as number, 0, 1e-9, "el barrido unido va de 0°…");
  near(patch.patch.endAngle as number, 200, 1e-9, "…a 200°");

  // Los tres juntos dan la vuelta: el resultado es un CÍRCULO, no un arco de 360.
  const full = run("JOIN", [pick("arcA"), pick("arcB"), pick("arcC"), enter]);
  assert.ok(full && full.kind === "document");
  assert.ok(full.commands[0].type === "replace" && full.commands[0].entity.type === "circle");
  assert.equal(full.commands[0].entityId, "arcA", "conservando el id del primero");

  const wrongRadius = run("JOIN", [pick("arcA"), pick("wide"), enter]);
  assert.equal(wrongRadius?.kind, "message");
  assert.ok(wrongRadius.kind === "message" && wrongRadius.text.includes("mismo radio"));

  // Dos arcos que se tocan en el ORIGEN DE ÁNGULOS sí se unen: el hueco de
  // 90°→200° no está entre ellos, está fuera del tramo que cubren juntos.
  const wrapped = run("JOIN", [pick("arcA"), pick("arcC"), enter]);
  assert.ok(wrapped && wrapped.kind === "document", "cruzar 0° no es un hueco");
  assert.ok(wrapped.commands[0].type === "properties");
  near(wrapped.commands[0].patch.startAngle as number, 200, 1e-9, "el tramo unido arranca en 200°…");
  near(wrapped.commands[0].patch.endAngle as number, 90, 1e-9, "…y termina en 90° pasando por 0°");

  const gap = run("JOIN", [pick("arcA"), pick("arcGap"), enter]);
  assert.equal(gap?.kind, "message");
  assert.ok(gap.kind === "message" && gap.text.includes("hueco"), gap.kind === "message" ? gap.text : "");
}

// --- JOIN encadena en polilínea, aunque un tramo esté dibujado al revés -----------------
{
  // `c1` va de (0,100) a (10,100); `c2` va de (10,120) a (10,100), o sea HACIA
  // ATRÁS. Se tocan en (10,100) y deben encadenar igual. No son colineales, así
  // que la unión especializada falla y el encadenado toma el relevo.
  const result = run("JOIN", [pick("c1"), pick("c2"), enter]);
  assert.ok(result && result.kind === "document");
  const replace = result.commands[0];
  assert.ok(replace.type === "replace" && replace.entity.type === "polyline");
  assert.equal(replace.entity.vertices.length, 3);
  near(replace.entity.vertices[0].x, 0, 1e-9, "arranca en el extremo libre de `c1`");
  near(replace.entity.vertices[0].y, 100, 1e-9, "");
  near(replace.entity.vertices[2].x, 10, 1e-9, "y llega al extremo libre de `c2`");
  near(replace.entity.vertices[2].y, 120, 1e-9, "aunque estuviera dibujada al revés");
  assert.equal(replace.entity.closed, false);

  const loose = run("JOIN", [pick("c1"), pick("b"), enter]);
  assert.equal(loose?.kind, "message");
  assert.ok(
    loose.kind === "message" && loose.text.includes("no toca ningún extremo"),
    "JOIN no rellena huecos entre objetos que no se tocan",
  );
}

// --- EXPLODE de polilínea: el tramo con bulge sale como ARCO ------------------------------
{
  const result = run("EXPLODE", [pick("poly"), enter]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 3, "dos piezas más el borrado del original");
  const [first, second, removed] = result.commands;
  assert.ok(first.type === "insert" && first.entity.type === "arc", "el bulge NO sale como cuerda");
  near(first.entity.center.x, 5, 1e-9, "con el centro real del arco");
  near(first.entity.center.y, 3.75, 1e-9, "");
  near(first.entity.radius, 6.25, 1e-9, "y su radio real");
  assert.ok(second.type === "insert" && second.entity.type === "line", "el tramo recto sale como línea");
  assert.ok(removed.type === "delete" && removed.entityId === "poly", "y el original desaparece");
}

// --- EXPLODE de INSERT necesita los bloques -----------------------------------------------
{
  const result = run("EXPLODE", [pick("ins"), enter]);
  assert.ok(result && result.kind === "document");
  const inserted = result.commands.filter((command) => command.type === "insert");
  assert.equal(inserted.length, 2, "las dos entidades del bloque");
  assert.ok(inserted[0].type === "insert" && inserted[0].entity.type === "line");
  near(inserted[0].entity.start.x, 100, 1e-9, "ya COLOCADAS en la inserción, no en el origen del bloque");
  near(inserted[0].entity.start.y, 100, 1e-9, "");
  assert.ok(
    inserted.every((command) => command.type === "insert" && command.entity.id.startsWith("n")),
    "con identidad propia: los ids del bloque se repiten entre inserciones y chocarían",
  );

  // Sin bloques expuestos, EXPLODE se niega diciéndolo en vez de vaciar el INSERT.
  const blind = run("EXPLODE", [pick("ins"), enter], makeContext(false));
  assert.equal(blind?.kind, "message");
  assert.ok(blind.kind === "message" && blind.text.includes("definiciones de bloque"));
}

// --- EXPLODE de una COTA da su geometría y su texto ------------------------------------------
{
  const result = run("EXPLODE", [pick("dim"), enter]);
  assert.ok(result && result.kind === "document");
  const inserted = result.commands.filter((command) => command.type === "insert");
  assert.ok(inserted.length > 1, "la cota tiene varias líneas");
  const text = inserted.find((command) => command.type === "insert" && command.entity.type === "mtext");
  assert.ok(text && text.type === "insert" && text.entity.type === "mtext");
  assert.ok(text.entity.text.length > 0, "y el texto medido viaja con ellas");
}

// --- lo que no se explota se cuenta ------------------------------------------------------------
{
  const result = run("EXPLODE", [pick("note"), enter]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("MTEXT"), "nombra el tipo");
}

console.log(
  `JOIN y EXPLODE: ${checks} anclas — colineales con hueco, arcos que cierran el círculo, ` +
    `encadenado con un tramo invertido, y descomposición de polilínea, bloque y cota`,
);
