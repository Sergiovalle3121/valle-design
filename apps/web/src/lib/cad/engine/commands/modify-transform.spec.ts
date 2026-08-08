/**
 * ROTATE, SCALE, FILLET y CHAMFER.
 *
 * Lo que se comprueba son los rechazos y las composiciones, que es donde estos
 * comandos hacen daño si están mal:
 *
 *   - `Copiar` debe dejar el original INTACTO y transformar el duplicado. Si se
 *     transformara el original y se copiara después, el resultado sería el
 *     mismo objeto dos veces en el sitio equivocado.
 *   - FILLET sobre algo que no es una línea debe negarse ANTES de calcular.
 *     `computeCadLineFillet` leería `entity.start` de un arco, obtendría
 *     `undefined` y escribiría `NaN` en el documento sin un solo error visible.
 *   - Una escala de cero colapsa la geometría y una negativa es una reflexión
 *     disfrazada. Ambas se rechazan diciendo por qué.
 *   - El radio de FILLET es pegajoso entre invocaciones, como en AutoCAD.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_TRANSFORM_COMMANDS } from "./modify-transform";

const commands = new Map(CAD_MODIFY_TRANSFORM_COMMANDS.map((command) => [command.name, command]));

const LINE_A: CadEntity = {
  id: "a",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 1000, y: 0, z: 0 },
  layer: "0",
};
const LINE_B: CadEntity = {
  id: "b",
  type: "line",
  start: { x: 1000, y: 0, z: 0 },
  end: { x: 1000, y: 1000, z: 0 },
  layer: "0",
};
const ARC: CadEntity = {
  id: "arc",
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius: 100,
  startAngle: 0,
  endAngle: 90,
  layer: "0",
};

function makeContext(selection: readonly string[] = []): CadCommandContext {
  const entities = new Map([LINE_A, LINE_B, ARC].map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[], selection: readonly string[] = []) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe existir`);
  const context = makeContext(selection);
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
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const pick = (entityId: string): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x: 0, y: 0 },
});

// --- ROTATE sobre una selección previa ---------------------------------------
{
  const result = run("ROTATE", [point(0, 0), { kind: "angle", degrees: 45 }], ["a"]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 1, "un objeto, un comando");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  assert.equal(command.entityId, "a");
  assert.equal(command.transform.rotationDeg, 45);
  assert.deepEqual(command.transform.origin, { x: 0, y: 0 }, "gira alrededor del punto base");
}

// --- ROTATE con Copiar: el original NO se toca -------------------------------
{
  const result = run(
    "ROTATE",
    [keyword("Copiar"), point(0, 0), { kind: "angle", degrees: 90 }],
    ["a"],
  );
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 2, "copiar y transformar");
  const [copy, transform] = result.commands;
  assert.ok(copy.type === "copy" && transform.type === "transform");
  assert.equal(copy.entityId, "a", "se copia el original");
  assert.equal(
    transform.entityId,
    copy.newEntityId,
    "y se transforma el DUPLICADO, no el original: al revés dejaría dos objetos girados",
  );
  assert.notEqual(transform.entityId, "a");
}

// --- ROTATE sin objetos: se dice, no se ignora -------------------------------
{
  const result = run("ROTATE", [{ kind: "enter" }]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("designado"));
}

// --- ROTATE por referencia ----------------------------------------------------
{
  // Base en el origen, referencia de 0° a 90°: gira 90°.
  const result = run(
    "ROTATE",
    [keyword("Referencia"), point(0, 0), point(100, 0), point(0, 100)],
    ["a"],
  );
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  assert.ok(
    Math.abs((command.transform.rotationDeg ?? 0) - 90) < 1e-9,
    `giro ${command.transform.rotationDeg}`,
  );
}

// --- ROTATE de cero no escribe ------------------------------------------------
{
  const result = run("ROTATE", [point(0, 0), { kind: "angle", degrees: 0 }], ["a"]);
  assert.equal(result?.kind, "none", "un giro nulo no merece un paso de deshacer");
}

// --- SCALE: factor y rechazos --------------------------------------------------
{
  const result = run("SCALE", [point(0, 0), distance(2)], ["a"]);
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  assert.equal(command.transform.scale, 2);
}
{
  const zero = run("SCALE", [point(0, 0), distance(0)], ["a"]);
  assert.equal(zero?.kind, "message", "escala cero colapsaría la geometría");
  const negative = run("SCALE", [point(0, 0), distance(-2)], ["a"]);
  assert.equal(negative?.kind, "message", "escala negativa es una reflexión disfrazada");
  assert.ok(
    negative.kind === "message" && negative.text.includes("MIRROR"),
    "y el aviso dice dónde se hará eso de verdad",
  );
}
{
  const result = run("SCALE", [point(0, 0), distance(1)], ["a"]);
  assert.equal(result?.kind, "none", "escala 1 no cambia nada");
}

// --- SCALE por referencia ------------------------------------------------------
{
  // Lo que mide 100 debe pasar a medir 250: factor 2,5.
  const result = run(
    "SCALE",
    [keyword("Referencia"), point(0, 0), point(100, 0), point(250, 0)],
    ["a"],
  );
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  assert.ok(Math.abs((command.transform.scale ?? 0) - 2.5) < 1e-9);
}

// --- FILLET sobre dos líneas ---------------------------------------------------
{
  const result = run("FILLET", [keyword("Radio"), distance(100), pick("a"), pick("b")]);
  assert.ok(result && result.kind === "document", "dos líneas y un radio dan esquina");
  assert.equal(result.commands.length, 3, "recorta A, recorta B, inserta el arco");
  const inserted = result.commands.find((command) => command.type === "insert");
  assert.ok(inserted && inserted.type === "insert" && inserted.entity.type === "arc");
  assert.ok(
    Math.abs(inserted.entity.radius - 100) < 1e-6,
    `radio ${inserted.entity.radius}`,
  );
  // Nada de NaN: la comprobación que de verdad importa cuando se recorta
  // geometría a partir de números calculados.
  for (const command of result.commands)
    if (command.type === "properties")
      for (const [key, value] of Object.entries(command.patch))
        assert.ok(
          typeof value !== "number" || Number.isFinite(value),
          `${key} salió ${value}`,
        );
}

// --- FILLET sobre algo que no es una línea: se niega ANTES de calcular ---------
{
  const result = run("FILLET", [pick("a"), pick("arc")]);
  assert.equal(result?.kind, "message", "un arco no se acepta en silencio");
  assert.ok(
    result.kind === "message" && result.text.includes("ARC"),
    `el aviso debe nombrar lo designado: "${result.kind === "message" ? result.text : ""}"`,
  );
}

// --- FILLET sobre la misma línea dos veces ------------------------------------
{
  const result = run("FILLET", [pick("a"), pick("a")]);
  assert.equal(result?.kind, "message");
  assert.ok(result.kind === "message" && result.text.includes("distintas"));
}

// --- FILLET propaga el rechazo de la geometría, no lo sustituye ---------------
{
  // Radio imposible para el ángulo de estas dos líneas: la geometría revienta y
  // su explicación llega tal cual al usuario.
  const result = run("FILLET", [keyword("Radio"), distance(1e9), pick("a"), pick("b")]);
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.startsWith("FILLET:"),
    "prefijado con el comando para que se sepa quién habla",
  );
}

// --- CHAMFER con dos distancias ------------------------------------------------
{
  const result = run("CHAMFER", [
    keyword("Distancia"),
    distance(100),
    distance(200),
    pick("a"),
    pick("b"),
  ]);
  assert.ok(result && result.kind === "document");
  const inserted = result.commands.find((command) => command.type === "insert");
  assert.ok(inserted && inserted.type === "insert" && inserted.entity.type === "line");
}

// --- el radio es pegajoso entre esquinas ---------------------------------------
{
  const descriptor = commands.get("FILLET");
  assert.ok(descriptor);
  const context = makeContext();
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, keyword("Radio"), context);
  step = descriptor.step(step.state, distance(50), context);
  step = descriptor.step(step.state, pick("a"), context);
  step = descriptor.step(step.state, pick("b"), context);
  assert.ok(step.result?.kind === "document");
  // Tras terminar, el estado conserva el radio: repetir con Espacio no obliga a
  // teclearlo otra vez en cada esquina del contorno.
  const next = descriptor.step(step.state, pick("a"), context);
  assert.ok(
    next.prompt.message.includes("50") || (next.state as { primary: number }).primary === 50,
    "el radio sobrevive al comando",
  );
}

console.log(
  `modificación por transformación: ${CAD_MODIFY_TRANSFORM_COMMANDS.map((command) => command.name).join(", ")} verificados`,
);
