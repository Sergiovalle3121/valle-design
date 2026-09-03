/**
 * BEDIT v2 (Ola 7): el editor EN SITIO, y el panel cuando no se puede.
 *
 * La v1 abría siempre el panel de bloques, y la rúbrica lo decía en su sitio:
 * «BEDIT v1 es la puerta tecleable al panel; el editor en sitio todavía no
 * existe». Ya existe (`blocks/reference-edit.ts`), así que BEDIT hace lo que
 * hace en AutoCAD: con una REFERENCIA delante, la abre en sitio.
 *
 * Lo que se afirma aquí es el contrato nuevo COMPLETO, incluidas las tres
 * puertas al panel que siguen existiendo y el motivo que cada una dice: sin
 * motivo, un usuario no puede saber por qué esta vez fue distinto.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../../cad-document";
import { CAD_REFEDIT_BLOCK } from "../../blocks/reference-edit";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_BLOCK_EDIT_COMMANDS } from "./blocks-edit";

const bedit = CAD_BLOCK_EDIT_COMMANDS[0];
assert.equal(bedit.name, "BEDIT");
assert.deepEqual([...bedit.aliases], ["BE"], "BE es el alias de acad.pgp");
assert.equal(bedit.mutates, true, "v2 escribe: abrir en sitio saca la geometría al dibujo");

/** Sin geometría: no hay nada que sacar, así que cae al panel. */
const PILAR: CadBlockDefinition = {
  id: "blk:pilar",
  name: "PILAR",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [],
};

/** Con geometría: éste sí se edita en sitio. */
const MARCA: CadBlockDefinition = {
  id: "MARCA",
  name: "MARCA",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [
    {
      id: "m-1",
      type: "line",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
      layer: "0",
    } as CadEntity,
  ],
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
  {
    id: "marca",
    type: "insert",
    block: "MARCA",
    insertion: { x: 4_000, y: 1_000, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "0",
  },
  {
    id: "marca-girada",
    type: "insert",
    block: "MARCA",
    insertion: { x: 8_000, y: 1_000, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 30,
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
    ...(options.withBlocks === false ? {} : { blocks: () => [PILAR, MARCA] }),
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

function documentResult(result: ReturnType<typeof run>) {
  assert.ok(result && result.kind === "document", "BEDIT debe escribir la copia de trabajo");
  return result;
}

// --- Una referencia SELECCIONADA se abre EN SITIO --------------------------
{
  const result = documentResult(run([], makeContext({ selection: ["marca"] })));
  assert.equal(result.commands.length, 1, "sale la única entidad de la definición");
  const command = result.commands[0] as { type: string; entity: CadEntity };
  assert.equal(command.type, "insert");
  assert.equal(
    (command.entity as Extract<CadEntity, { type: "line" }>).start.x,
    4_000,
    "trasladada al punto de inserción de la referencia, no al origen",
  );
  assert.equal(
    command.entity.context?.metadata?.[CAD_REFEDIT_BLOCK],
    "MARCA",
    "y marcada como copia de trabajo del bloque",
  );
  assert.ok(
    result.notice?.includes("EN SITIO") && result.notice.includes("REFCLOSE"),
    `el renglón dice qué se abrió y cómo se cierra: ${result.notice}`,
  );
}

// --- Una referencia DESIGNADA también ---------------------------------------
{
  const picked = documentResult(
    run([{ kind: "entityPick", entityId: "marca", point: { x: 0, y: 0 } }]),
  );
  assert.equal(picked.commands.length, 1);
}

// --- Las tres puertas al panel, cada una con su MOTIVO ----------------------
{
  // 1. Sin geometría que sacar.
  const vacio = uiRequest(run([], makeContext({ selection: ["ins"] })));
  assert.deepEqual(vacio.request.params, { block: "PILAR" }, "el nombre viaja para prefiltrar");
  assert.ok(
    vacio.text?.includes("no tiene geometría"),
    `dice por qué cayó al panel: ${vacio.text}`,
  );
  assert.ok(vacio.request.unavailable.includes("BLOCK"), "el fallback nombra la alternativa real");

  // 2. Referencia girada: editarla en sitio la torcería.
  const girada = uiRequest(run([], makeContext({ selection: ["marca-girada"] })));
  assert.ok(
    girada.text?.includes("girada 30°"),
    `dice el giro que lo impide: ${girada.text}`,
  );

  // 3. Un NOMBRE tecleado no ancla ninguna referencia en el dibujo.
  const found = uiRequest(run([{ kind: "text", value: "PILAR" }]));
  assert.deepEqual(found.request.params, { block: "PILAR" });
}

// --- El nombre tecleado se sigue validando contra las definiciones -----------
{
  const missing = run([{ kind: "text", value: "COLUMNA" }]);
  assert.ok(
    missing && missing.kind === "message" && missing.text.includes("COLUMNA"),
    "un bloque inexistente se niega nombrándolo",
  );

  // Sin definiciones a la vista no se puede negar «no existe»: el nombre viaja.
  const blind = uiRequest(run([{ kind: "text", value: "COLUMNA" }], makeContext({ withBlocks: false })));
  assert.deepEqual(blind.request.params, { block: "COLUMNA" });
}

// --- Lo que no es una referencia se niega con su tipo -----------------------
{
  const wrong = run([{ kind: "entityPick", entityId: "muro", point: { x: 0, y: 0 } }]);
  assert.ok(wrong && wrong.kind === "message" && wrong.text.includes("LINE"), "una línea no es un INSERT y se dice");
}

// --- Enter abre el panel sin prefiltro; cancelar no hace nada ---------------
{
  const plain = uiRequest(run([{ kind: "enter" }]));
  assert.equal(plain.request.params, undefined);

  const cancelled = run([{ kind: "cancel" }]);
  assert.ok(cancelled && cancelled.kind === "none");
}

console.log(
  "BEDIT v2: la referencia designada o seleccionada se abre EN SITIO sobre su punto de inserción; sin geometría, girada o por nombre cae al panel Y DICE POR QUÉ",
);
