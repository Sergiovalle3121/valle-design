/**
 * WALL contra el REGISTRO REAL del producto.
 *
 * Las specs de familia prueban su geometría contra registros que ellas mismas
 * montan; ésta va al registro que decide qué pasa cuando alguien teclea `WA`.
 * Lo que se fija:
 *
 *   1. `WALL`, `WA` y `MURO` resuelven por la tabla `acad.pgp` — que es la que
 *      consulta el pipeline de entrada, no los alias del descriptor.
 *   2. Encadenar puntos emite UN lote con un `wall` por tramo, cada uno con la
 *      RECETA (eje, grosor, altura), no con un contorno expandido.
 *   3. `Grosor`/`Altura` cambian los tramos SIGUIENTES; los colocados
 *      conservan lo suyo.
 *   4. Los defaults se atan a la unidad del documento: 200 mm no son 200 m.
 */
import { strict as assert } from "node:assert";
import type { CadWallEntity } from "../../cad-entities-v6";
import { resolveCadCommandAlias } from "../alias-table";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { defaultWallHeight, defaultWallThickness } from "./draw-wall";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const known = new Set(CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name));
const descriptor = CAD_COMMAND_REGISTRY_V2.get("WALL");
assert.ok(descriptor, "WALL llegó al registro del producto");

// --- resolución por la tabla acad.pgp, que es la que usa el pipeline ----------
{
  assert.equal(resolveCadCommandAlias("WALL", known), "WALL");
  assert.equal(resolveCadCommandAlias("wa", known), "WALL", "el alias corto se teclea en minúsculas");
  assert.equal(resolveCadCommandAlias("MURO", known), "WALL", "la memoria muscular en español");
  assert.equal(CAD_COMMAND_REGISTRY_V2.get("WA")?.name, "WALL");
}

function makeContext(unit = "mm"): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: "MUROS",
    unit,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `w${++ids}`,
  };
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

function run(inputs: readonly CadCommandInput[], unit = "mm") {
  const context = makeContext(unit);
  let step = descriptor!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
  }
  return step;
}

function walls(step: ReturnType<typeof run>): CadWallEntity[] {
  const result = step.result;
  assert.ok(result && result.kind === "document", `debía producir documento, dio ${result?.kind}`);
  assert.equal(result.label, "WALL", "la frontera de deshacer lleva el nombre del comando");
  return result.commands.map((command) => {
    assert.ok(command.type === "insert" && command.entity.type === "wall");
    if (command.type !== "insert" || command.entity.type !== "wall") throw new Error("tipo");
    return command.entity;
  });
}

// --- dos clics y Enter: un muro con la receta y los defaults en mm ------------
{
  const [wall] = walls(run([point(0, 0), point(3000, 0), enter]));
  assert.deepEqual(wall.start, { x: 0, y: 0, z: 0 });
  assert.deepEqual(wall.end, { x: 3000, y: 0, z: 0 });
  assert.equal(wall.thickness, 200, "tabique de 200 mm por defecto");
  assert.equal(wall.height, 2400, "planta de 2400 mm por defecto");
  assert.equal(wall.layer, "MUROS");
}

// --- los defaults viven en la unidad del documento ----------------------------
{
  const [wall] = walls(run([point(0, 0), point(3, 0), enter], "m"));
  assert.equal(wall.thickness, 0.2, "en metros, el tabique es 0,2");
  assert.equal(wall.height, 2.4);
  assert.equal(defaultWallThickness("cm"), 20);
  assert.equal(defaultWallHeight("in"), 2400 / 25.4);
  assert.equal(defaultWallThickness(undefined), 200, "sin unidad, milímetros");
}

// --- Grosor y Altura cambian los tramos SIGUIENTES ----------------------------
{
  const step = run([
    point(0, 0),
    point(3000, 0),
    keyword("Grosor"),
    distance(300),
    keyword("Altura"),
    distance(2700),
    point(3000, 2000),
    enter,
  ]);
  const [first, second] = walls(step);
  assert.equal(first.thickness, 200, "el tramo ya colocado conserva su grosor");
  assert.equal(first.height, 2400);
  assert.equal(second.thickness, 300, "el tramo nuevo lleva el grosor pedido");
  assert.equal(second.height, 2700);
  assert.deepEqual(second.start, { x: 3000, y: 0, z: 0 }, "los tramos encadenan");
}

// --- Grosor antes del primer punto vale para todos ----------------------------
{
  const [wall] = walls(run([keyword("Grosor"), distance(115), point(0, 0), point(1000, 0), enter]));
  assert.equal(wall.thickness, 115);
}

// --- Enter sobre la petición de grosor acepta el vigente ----------------------
{
  const [wall] = walls(run([keyword("Grosor"), enter, point(0, 0), point(1000, 0), enter]));
  assert.equal(wall.thickness, 200, "Enter conserva el default que el prompt enseñaba");
}

// --- un grosor cero no fabrica un muro degenerado -----------------------------
{
  const [wall] = walls(run([keyword("Grosor"), distance(0), point(0, 0), point(1000, 0), enter]));
  assert.equal(wall.thickness, 200, "el cero se ignora y se conserva el vigente");
}

// --- Cerrar produce el tramo de cierre; desHacer retira vértice y tramo -------
{
  const closed = walls(
    run([point(0, 0), point(3000, 0), point(3000, 2000), keyword("Cerrar")]),
  );
  assert.equal(closed.length, 3, "tres vértices cerrados son tres muros");
  assert.deepEqual(closed[2].start, { x: 3000, y: 2000, z: 0 });
  assert.deepEqual(closed[2].end, { x: 0, y: 0, z: 0 }, "el cierre vuelve al arranque");

  const undone = walls(
    run([point(0, 0), point(3000, 0), point(3000, 2000), keyword("desHacer"), enter]),
  );
  assert.equal(undone.length, 1, "desHacer retiró el segundo tramo");
}

// --- la previsualización enseña la doble línea real, no el eje ----------------
{
  const context = makeContext();
  context.cursor = { x: 2000, y: 0 };
  let step = descriptor!.begin(context);
  step = descriptor!.step(step.state, point(0, 0), context);
  assert.ok(step.preview && step.preview.length === 1, "un contorno bajo el cursor");
  assert.equal(step.preview[0].closed, true);
  assert.equal(step.preview[0].points.length, 4, "las cuatro esquinas del grosor real");
  const ys = step.preview[0].points.map((corner) => corner.y);
  assert.ok(ys.includes(100) && ys.includes(-100), "media anchura del default a cada lado");
}

// --- Esc no deja nada a medias -------------------------------------------------
{
  const step = run([point(0, 0), point(1000, 0), { kind: "cancel" }]);
  assert.ok(step.result && step.result.kind === "none", "cancelar no emite lote");
}

console.log("draw-wall: registro real, alias acad.pgp, receta, encadenado y unidades verificados");
