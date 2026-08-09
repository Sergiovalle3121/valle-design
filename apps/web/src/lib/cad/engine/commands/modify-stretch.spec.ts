/**
 * STRETCH y LENGTHEN.
 *
 * Lo que se afirma, y por qué:
 *
 *   1. STRETCH mueve SÓLO los vértices de dentro de la ventana. Es la
 *      diferencia entre STRETCH y MOVE, y una implementación que mueva el
 *      objeto entero pasaría cualquier prueba que sólo mirase «se movió algo».
 *   2. Un objeto ENTERO dentro se traslada; uno entero fuera no se toca. La
 *      segunda mitad es la que se olvida: STRETCH no debe ser un MOVE global.
 *   3. Un CÍRCULO no se estira. Se mueve si su centro cae dentro, y no cambia
 *      de radio: estirarlo produciría elipses que nadie pidió.
 *   4. Los cuatro modos de LENGTHEN dan longitudes DISTINTAS y calculadas a
 *      mano. Sin ancla absoluta, tres de los cuatro podrían no estar
 *      implementados y la spec seguiría verde.
 *   5. Designar sin modo MIDE, que es la consulta que uno hace antes de decidir
 *      cuánto alargar.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_STRETCH_COMMANDS } from "./modify-stretch";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const commands = new Map(CAD_MODIFY_STRETCH_COMMANDS.map((command) => [command.name, command]));

const SCENE: CadEntity[] = [
  // Cruza la ventana [40,-10]-[200,30]: su extremo derecho está dentro.
  { id: "wall", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0" },
  // Entera dentro de la ventana.
  { id: "in", type: "line", start: { x: 50, y: 0, z: 0 }, end: { x: 60, y: 5, z: 0 }, layer: "0" },
  // Entera fuera.
  { id: "out", type: "line", start: { x: -50, y: 0, z: 0 }, end: { x: -40, y: 0, z: 0 }, layer: "0" },
  { id: "hole", type: "circle", center: { x: 70, y: 0, z: 0 }, radius: 5, layer: "0" },
  {
    id: "run",
    type: "polyline",
    vertices: [
      { x: 0, y: 20, z: 0 },
      { x: 50, y: 20, z: 0 },
      { x: 100, y: 20, z: 0 },
    ],
    closed: false,
    layer: "0",
  },
  { id: "arc", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 10, startAngle: 0, endAngle: 90, layer: "0" },
  { id: "note", type: "mtext", insertion: { x: 0, y: 500, z: 0 }, text: "x", layer: "0" },
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

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });
const pickAt = (entityId: string, x: number, y: number): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x, y },
});

// --- STRETCH: sólo lo de dentro se mueve -------------------------------------------
{
  // Ventana [40,-10]–[200,30]; desplazamiento (+30, 0).
  const result = run("STRETCH", [point(40, -10), point(200, 30), point(0, 0), point(30, 0)]);
  assert.ok(result && result.kind === "document");
  const byId = new Map(
    result.commands.map((command) => [command.type === "insert" ? "" : command.entityId, command]),
  );

  const wall = byId.get("wall");
  assert.ok(wall && wall.type === "properties", "el muro se estira, no se mueve");
  near(wall.patch.startX as number, 0, 1e-12, "el extremo de FUERA no se mueve");
  near(wall.patch.endX as number, 130, 1e-12, "y el de dentro sí");

  const whole = byId.get("in");
  assert.ok(whole && whole.type === "transform", "lo que está entero dentro se traslada");
  near(whole.transform.translation!.x, 30, 1e-12, "");

  assert.equal(byId.get("out"), undefined, "lo que está entero fuera NO se toca");
  assert.equal(byId.get("note"), undefined, "ni lo que está lejos");

  const circle = byId.get("hole");
  assert.ok(circle && circle.type === "transform", "un círculo con el centro dentro se mueve entero");
  assert.equal(circle.transform.scale, undefined, "y no cambia de tamaño");

  const arc = byId.get("arc");
  assert.equal(arc, undefined, "el arco tiene el centro en (0,0), fuera de la ventana");

  const polyline = byId.get("run");
  assert.ok(polyline && polyline.type === "replace" && polyline.entity.type === "polyline");
  near(polyline.entity.vertices[0].x, 0, 1e-12, "el vértice de fuera se queda");
  near(polyline.entity.vertices[1].x, 80, 1e-12, "el del medio, dentro de la ventana, se mueve");
  near(polyline.entity.vertices[2].x, 130, 1e-12, "y el último también");
}

// --- STRETCH que no coge nada lo dice ------------------------------------------------
{
  const result = run("STRETCH", [point(-500, -500), point(-490, -490), point(0, 0), point(1, 0)]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("no toca ningún objeto"));
}

// --- LENGTHEN: los cuatro modos, con longitudes calculadas a mano -----------------------
{
  // `wall` mide 100. Incremento +25 por el extremo designado (el derecho).
  const delta = run("LENGTHEN", [keyword("Incremento"), distance(25), pickAt("wall", 95, 0)]);
  assert.ok(delta && delta.kind === "document");
  const deltaPatch = delta.commands[0];
  assert.ok(deltaPatch.type === "properties");
  near(deltaPatch.patch.endX as number, 125, 1e-9, "Incremento suma al extremo designado");
  near(deltaPatch.patch.startX as number, 0, 1e-9, "sin tocar el otro");

  // Designando por el extremo IZQUIERDO crece hacia atrás.
  const backwards = run("LENGTHEN", [keyword("Incremento"), distance(25), pickAt("wall", 5, 0)]);
  assert.ok(backwards && backwards.kind === "document");
  const backPatch = backwards.commands[0];
  assert.ok(backPatch.type === "properties");
  near(backPatch.patch.startX as number, -25, 1e-9, "crece por el extremo que se designó");
  near(backPatch.patch.endX as number, 100, 1e-9, "");

  const percent = run("LENGTHEN", [keyword("Porcentaje"), distance(150), pickAt("wall", 95, 0)]);
  assert.ok(percent && percent.kind === "document" && percent.commands[0].type === "properties");
  near(percent.commands[0].patch.endX as number, 150, 1e-9, "150 % de 100 son 150");

  const total = run("LENGTHEN", [keyword("Total"), distance(40), pickAt("wall", 95, 0)]);
  assert.ok(total && total.kind === "document" && total.commands[0].type === "properties");
  near(total.commands[0].patch.endX as number, 40, 1e-9, "Total ENCOGE si el número es menor");

  const dynamic = run("LENGTHEN", [keyword("DInámico"), pickAt("wall", 95, 0), point(70, 0)]);
  assert.ok(dynamic && dynamic.kind === "document" && dynamic.commands[0].type === "properties");
  near(dynamic.commands[0].patch.endX as number, 70, 1e-9, "Dinámico lleva el extremo al punto");
}

// --- LENGTHEN sobre un ARCO cambia ÁNGULOS -------------------------------------------
{
  // Cuadrante de radio 10: longitud 10·π/2 ≈ 15,708. Al 200 % barre 180°.
  const result = run("LENGTHEN", [keyword("Porcentaje"), distance(200), pickAt("arc", 0, 10)]);
  assert.ok(result && result.kind === "document");
  const patch = result.commands[0];
  assert.ok(patch.type === "properties");
  near(patch.patch.startAngle as number, 0, 1e-9, "el arranque no se mueve");
  near(patch.patch.endAngle as number, 180, 1e-9, "y el barrido se duplica");
}

// --- designar sin modo MIDE ------------------------------------------------------------
{
  const result = run("LENGTHEN", [pickAt("wall", 50, 0)]);
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.includes("Longitud actual = 100"),
    `debía medir: "${result.kind === "message" ? result.text : ""}"`,
  );
}

// --- los rechazos de LENGTHEN explican --------------------------------------------------
{
  const closed = run("LENGTHEN", [keyword("Total"), distance(10), pickAt("hole", 75, 0)]);
  assert.equal(closed?.kind, "message");
  assert.ok(closed.kind === "message" && closed.text.includes("cerrada"), closed.kind === "message" ? closed.text : "");

  const text = run("LENGTHEN", [keyword("Total"), distance(10), pickAt("note", 0, 500)]);
  assert.equal(text?.kind, "message");
  assert.ok(text.kind === "message" && text.text.includes("MTEXT"), "nombra el tipo que no sirve");

  const negative = run("LENGTHEN", [keyword("Incremento"), distance(-500), pickAt("wall", 95, 0)]);
  assert.equal(negative?.kind, "message");
  assert.ok(
    negative.kind === "message" && negative.text.includes("no es positiva"),
    "encoger más de lo que mide no deja una línea de longitud negativa",
  );
}

console.log(
  `STRETCH y LENGTHEN: ${checks} anclas — vértices dentro/fuera de la ventana, círculo que se mueve ` +
    `sin deformarse, y los cuatro modos de longitud con sus rechazos`,
);
