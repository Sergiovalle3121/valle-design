/**
 * BEDIT v1.
 *
 * Lo que se afirma es el CONTRATO de la puerta: que el INSERT designado (o
 * seleccionado de antemano) resuelve el nombre del bloque, que el nombre
 * tecleado se valida SÓLO cuando el anfitrión expone las definiciones, y que
 * la petición de interfaz lleva su texto de «no disponible» nombrando la
 * alternativa real (BLOCK redefine). El panel en sí es del anfitrión y se
 * prueba allí.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_BLOCK_EDIT_COMMANDS } from "./blocks-edit";

const bedit = CAD_BLOCK_EDIT_COMMANDS[0];
assert.equal(bedit.name, "BEDIT");
assert.deepEqual([...bedit.aliases], ["BE"], "BE es el alias de acad.pgp");
assert.equal(bedit.mutates, false, "v1 abre el panel; escribir va por BLOCK");

const PILAR: CadBlockDefinition = {
  id: "blk:pilar",
  name: "PILAR",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [],
};

const SCENE: CadEntity[] = [
  {
    id: "ins",
    type: "insert",
    block: "PILAR",
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "0",
  },
  { id: "muro", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" },
];

function makeContext(options: { selection?: string[]; withBlocks?: boolean } = {}): CadCommandContext {
  const entities = new Map(SCENE.map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    ...(options.withBlocks === false ? {} : { blocks: () => [PILAR] }),
    selection: options.selection ?? [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[], context = makeContext()) {
  let step = bedit.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = bedit.step(step.state, input, context);
  }
  return step.result;
}

function uiRequest(result: ReturnType<typeof run>) {
  assert.ok(result && result.kind === "ui", "BEDIT debe pedir interfaz");
  return result;
}

// --- El INSERT seleccionado de antemano resuelve el bloque sin preguntar --------
{
  const result = uiRequest(run([], makeContext({ selection: ["ins"] })));
  assert.equal(result.request.target, "block-editor");
  assert.deepEqual(result.request.params, { block: "PILAR" }, "el nombre viaja para prefiltrar");
  assert.ok(result.request.unavailable.includes("BLOCK"), "el fallback nombra la alternativa real");
}

// --- El nombre tecleado se valida contra las definiciones ------------------------
{
  const found = uiRequest(run([{ kind: "text", value: "PILAR" }]));
  assert.deepEqual(found.request.params, { block: "PILAR" });

  const missing = run([{ kind: "text", value: "COLUMNA" }]);
  assert.ok(
    missing && missing.kind === "message" && missing.text.includes("COLUMNA"),
    "un bloque inexistente se niega nombrándolo",
  );

  // Sin definiciones a la vista no se puede negar «no existe»: el nombre viaja.
  const blind = uiRequest(run([{ kind: "text", value: "COLUMNA" }], makeContext({ withBlocks: false })));
  assert.deepEqual(blind.request.params, { block: "COLUMNA" });
}

// --- El INSERT designado resuelve; lo que no es INSERT se niega con su tipo ------
{
  const picked = uiRequest(run([{ kind: "entityPick", entityId: "ins", point: { x: 0, y: 0 } }]));
  assert.deepEqual(picked.request.params, { block: "PILAR" });

  const wrong = run([{ kind: "entityPick", entityId: "muro", point: { x: 0, y: 0 } }]);
  assert.ok(wrong && wrong.kind === "message" && wrong.text.includes("LINE"), "una línea no es un INSERT y se dice");
}

// --- Enter abre el panel sin prefiltro; cancelar no hace nada --------------------
{
  const plain = uiRequest(run([{ kind: "enter" }]));
  assert.equal(plain.request.params, undefined);

  const cancelled = run([{ kind: "cancel" }]);
  assert.ok(cancelled && cancelled.kind === "none");
}

console.log("cad bedit command specs passed");
