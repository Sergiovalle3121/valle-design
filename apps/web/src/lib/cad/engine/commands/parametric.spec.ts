/**
 * Los comandos paramétricos, de la tecla al DOCUMENTO.
 *
 * No basta con que el comando emita el lote correcto: lo que importa es que al
 * aplicarlo el dibujo se mueva a donde debe y que todo ello sea UN paso de
 * deshacer. Por eso este spec no se queda en los efectos del motor — aplica el
 * lote con `executeCadEntityCommandBatch` y mide la geometría resultante.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
} from "../command-engine";
import type { CadCommandContext } from "../command-types";
import { createCadCommandRegistry } from "../registry";
import { CAD_PARAMETRIC_DIMENSION_COMMANDS, parseConstraintValue } from "./parametric-dimensions";
import { CAD_PARAMETRIC_GEOMETRY_COMMANDS } from "./parametric-geometry";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const close = (actual: number, expected: number, tolerance: number, message: string) =>
  ok(Math.abs(actual - expected) <= tolerance, `${message} (${actual} vs ${expected})`);

const registry = createCadCommandRegistry([
  ...CAD_PARAMETRIC_GEOMETRY_COMMANDS,
  ...CAD_PARAMETRIC_DIMENSION_COMMANDS,
]);

const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity => ({
  id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer: "0",
});

function documentOf(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
}

/** Rectángulo de cuatro líneas sueltas, como sale de dibujarlo con LINE. */
const rectangle = () => [
  line("bottom", 0, 0, 1000, 0),
  line("right", 1000, 0, 1000, 600),
  line("top", 1000, 600, 0, 600),
  line("left", 0, 600, 0, 0),
];

function contextOf(document: CadDocument, selection: readonly string[] = []): CadCommandContext {
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    selection,
    activeLayer: "0",
    constraints: document.constraints,
    parameters: document.parameters ?? [],
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "nuevo",
  };
}

/**
 * Un paso de la sesión: texto tecleado, o la designación de un objeto (que en
 * el producto llega del puntero y aquí se inyecta tal cual).
 */
type Step = string | { pick: string };

/** Teclea una secuencia y devuelve los lotes que el motor mandó ejecutar. */
function type(
  document: CadDocument,
  steps: readonly Step[],
  selection: readonly string[] = [],
): { batches: Extract<CadCommandEffect, { kind: "execute" }>[]; messages: string[] } {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  const effects: CadCommandEffect[] = [];
  for (const step of steps) {
    const action: CadCommandAction =
      typeof step === "string"
        ? { kind: "token", value: step }
        : { kind: "input", input: { kind: "entityPick", entityId: step.pick, point: { x: 0, y: 0 } } };
    const reduction = cadCommandEngineReduce(state, action, contextOf(document, selection), registry);
    state = reduction.state;
    effects.push(...reduction.effects);
  }
  return {
    batches: effects.filter((effect): effect is Extract<CadCommandEffect, { kind: "execute" }> => effect.kind === "execute"),
    messages: effects.filter((effect) => effect.kind === "message").map((effect) => effect.text),
  };
}

/** Aplica un lote por la ruta canónica y devuelve el documento resultante. */
function apply(document: CadDocument, commands: readonly CadEntityCommand[], label: string): CadDocument {
  return executeCadEntityCommandBatch(document, commands, label).document;
}

const lengthOf = (document: CadDocument, id: string): number => {
  const entity = document.entities.find((candidate) => candidate.id === id);
  return entity?.type === "line" ? Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) : Number.NaN;
};

// ---------------------------------------------------------------------------
// El recorrido completo: restringir, parametrizar y cambiar el parámetro
// ---------------------------------------------------------------------------

let document = documentOf(rectangle());

// AUTOCONSTRAIN sobre el perfil ya dibujado.
{
  const { batches } = type(document, ["AUTOCONSTRAIN"], document.entities.map((entity) => entity.id));
  ok(batches.length === 1, "AUTOCONSTRAIN emite UN lote");
  ok(batches[0].commands.length >= 8, "con las restricciones que deduce del rectángulo");
  ok(
    batches[0].commands.every((command) => command.type === "constraint"),
    "y todas son comandos de sección, no de entidad",
  );
  const before = document.meta.version;
  document = apply(document, batches[0].commands, batches[0].label);
  ok(document.meta.version === before + 1, "un lote, UN paso de deshacer, aunque lleve diez restricciones");
  ok(document.constraints.length >= 8, "las restricciones quedan en el documento");
  close(lengthOf(document, "bottom"), 1000, 1e-6, "y la geometría no se movió: ya cumplía");
}

// GCEQUAL entre los dos lados verticales: la altura pasa a ser una sola medida.
{
  const { batches } = type(document, ["GCEQUAL"], ["right", "left"]);
  ok(batches.length === 1, "GCEQUAL con dos objetos designados actúa de inmediato");
  const command = batches[0].commands[0];
  ok(
    command.type === "constraint" && command.op === "upsert" && command.constraint.kind === "equalLength",
    "entre dos rectas, IGual significa longitud igual",
  );
  document = apply(document, batches[0].commands, batches[0].label);
}

// DCLINEAR sobre el lado inferior, atado a un parámetro nuevo.
{
  const { batches } = type(document, ["DCLINEAR", { pick: "bottom" }, "ancho = 1200"], []);
  ok(batches.length === 1, "DCLINEAR emite un lote");
  const commands = batches[0].commands;
  ok(commands.length === 2, "que crea el parámetro Y la cota que lo referencia");
  ok(commands[0].type === "parameter" && commands[0].op === "set", "primero el parámetro");
  ok(
    commands[1].type === "constraint" && commands[1].op === "upsert" && commands[1].constraint.parameter === "ancho",
    "y la cota apunta al parámetro por nombre, no a un número copiado",
  );
  document = apply(document, commands, batches[0].label);
  close(lengthOf(document, "bottom"), 1200, 1e-6, "el lado inferior pasa a medir 1200");
  close(lengthOf(document, "top"), 1200, 1e-6, "y el superior le sigue, porque el perfil está restringido");
  ok(document.parameters?.length === 1, "el documento gana su sección de parámetros");
  close(document.parameters?.[0].value ?? 0, 1200, 0, "con el valor ya evaluado");
}

// Y ahora lo que justifica todo: cambiar el parámetro desde la línea de comandos.
{
  const versionBefore = document.meta.version;
  const { batches } = type(document, ["PARAMETERS", "F", "ancho = 2000"]);
  ok(batches.length === 1, "PARAMETERS Fijar emite un lote");
  document = apply(document, batches[0].commands, batches[0].label);
  ok(document.meta.version === versionBefore + 1, "cambiar el parámetro es UN paso de deshacer");
  close(lengthOf(document, "bottom"), 2000, 1e-6, "el perfil entero se reajusta al nuevo ancho");
  close(lengthOf(document, "top"), 2000, 1e-6, "arriba y abajo a la vez");
  close(lengthOf(document, "left"), lengthOf(document, "right"), 1e-6, "y los verticales siguen siendo iguales");
  close(document.parameters?.[0].value ?? 0, 2000, 0, "el parámetro persistido vale 2000");
  // El rectángulo sigue cerrado: las esquinas no se despegaron al estirarlo.
  const corner = document.entities.find((entity) => entity.id === "bottom");
  const next = document.entities.find((entity) => entity.id === "right");
  if (corner?.type === "line" && next?.type === "line")
    close(Math.hypot(corner.end.x - next.start.x, corner.end.y - next.start.y), 0, 1e-6, "la esquina sigue unida");
}

// Un parámetro derivado, y su reevaluación en cadena.
{
  const { batches } = type(document, ["PARAMETERS", "Fijar", "alto = ancho * 0.5"]);
  document = apply(document, batches[0].commands, batches[0].label);
  const { batches: dimension } = type(document, ["DCLINEAR", { pick: "left" }, "alto"], []);
  const command = dimension[0].commands[0];
  ok(
    command.type === "constraint" && command.constraint.parameter === "alto",
    "un identificador suelto se interpreta como referencia a un parámetro existente",
  );
  document = apply(document, dimension[0].commands, dimension[0].label);
  close(lengthOf(document, "left"), 1000, 1e-6, "alto = ancho * 0.5 = 1000");
  const { batches: changed } = type(document, ["PARAMETERS", "F", "ancho = 3000"]);
  document = apply(document, changed[0].commands, changed[0].label);
  close(lengthOf(document, "bottom"), 3000, 1e-6, "cambiar ancho estira el largo");
  close(lengthOf(document, "left"), 1500, 1e-6, "y el alto derivado le sigue solo");
}

// ---------------------------------------------------------------------------
// Rechazos honestos
// ---------------------------------------------------------------------------

{
  const { messages } = type(document, ["DCRADIUS", { pick: "bottom" }, "250"], []);
  ok(messages.length === 0, "el comando no rechaza por adelantado: quien decide es el solucionador");
  const { batches } = type(document, ["DCRADIUS", { pick: "bottom" }, "250"], []);
  let failure = "";
  try {
    apply(document, batches[0].commands, batches[0].label);
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }
  ok(failure.includes("radius"), `una cota de radio sobre una recta se rechaza con su motivo: ${failure}`);
  ok(document.constraints.every((constraint) => constraint.kind !== "radius"), "y el documento no cambia");
}

{
  const { messages } = type(document, ["PARAMETERS", "F", "1200"]);
  ok(
    messages.some((message) => message.includes("nombre = expresión")),
    "un valor suelto en PARAMETERS explica qué falta",
  );
}

{
  const { batches } = type(document, ["PARAMETERS", "F", "ciclo = ciclo + 1"]);
  let failure = "";
  try {
    apply(document, batches[0].commands, batches[0].label);
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }
  ok(failure.length > 0, "un parámetro que se referencia a sí mismo se rechaza");
  ok(failure.toLowerCase().includes("ciclo"), `nombrando el ciclo: ${failure}`);
}

// ---------------------------------------------------------------------------
// DELCONSTRAINT
// ---------------------------------------------------------------------------

{
  const before = document.constraints.length;
  ok(before > 0, "hay restricciones que quitar");
  const { batches } = type(document, ["DELCONSTRAINT"], ["bottom"]);
  ok(batches.length === 1, "DELCONSTRAINT con selección previa actúa de inmediato");
  const cleared = apply(document, batches[0].commands, batches[0].label);
  ok(cleared.constraints.length < before, "quedan menos restricciones");
  ok(
    cleared.constraints.every((constraint) => !constraint.entityIds.includes("bottom")),
    "ninguna sigue apuntando al objeto designado",
  );
  ok(
    cleared.constraints.some((constraint) => !constraint.entityIds.includes("bottom")),
    "y las que no lo tocaban siguen ahí",
  );
}

// ---------------------------------------------------------------------------
// El analizador del valor de una cota
// ---------------------------------------------------------------------------

{
  assert.deepEqual(parseConstraintValue("1200"), { kind: "literal", value: 1200 });
  assert.deepEqual(parseConstraintValue("-3.5"), { kind: "literal", value: -3.5 });
  assert.deepEqual(parseConstraintValue("ancho"), { kind: "parameter", name: "ancho" });
  assert.deepEqual(parseConstraintValue("alto = ancho * 0.618"), {
    kind: "definition", name: "alto", expression: "ancho * 0.618",
  });
  checks += 4;
  ok(parseConstraintValue("2 mal").kind === "error", "lo que no es ninguna de las tres se rechaza");
  ok(parseConstraintValue("").kind === "error", "y el vacío también");
}

// GEOMCONSTRAINT genérico: la palabra clave elige el tipo.
{
  const fresh = documentOf(rectangle());
  const { batches } = type(fresh, ["GEOMCONSTRAINT", "PE"], ["bottom", "right"]);
  ok(batches.length === 1, "GEOMCONSTRAINT + PE actúa sobre lo designado");
  const command = batches[0].commands[0];
  ok(
    command.type === "constraint" && command.op === "upsert" && command.constraint.kind === "perpendicular",
    "PE resuelve a perpendicular, no a paralela",
  );
  const applied = apply(fresh, batches[0].commands, batches[0].label);
  ok(applied.constraints.length === 1, "y queda una restricción en el documento");
  ok(applied.constraints[0].id === "gc:perpendicular:bottom+right", "con un id determinista");
}

console.log(`cad parametric commands spec: ${checks} comprobaciones verdes`);
