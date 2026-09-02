import { strict as assert } from "node:assert";
import type { CadEntityCommand } from "../entity-commands";
import { createCadVariableAccess } from "../system-variables";
import { CAD_COMMAND_REGISTRY_V2 } from "./index";
import { cadCommandEngineReduce, EMPTY_CAD_COMMAND_ENGINE } from "./command-engine";
import type { CadCommandContext } from "./command-types";
import { cadCurrentPresentation, cadWithCurrentPresentation } from "./current-presentation";

/**
 * CECOLOR, CELTYPE y CELWEIGHT llegan a lo que se DIBUJA (Ola D, 2026-09-02).
 *
 * Medido antes: `grep CECOLOR` sobre el motor sólo encontraba a COLOR
 * escribiéndola; ninguna orden de dibujo la leía. Aquí se fija la regla
 * entera contra el motor real: LINE con COLOR 1 sale con color 1; con las
 * variables de fábrica el lote es EL MISMO array; COPY (modificación) no toca
 * nada; y una entidad con aspecto propio no se pisa.
 */
let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/* ── La lectura de las variables ─────────────────────────────────────────── */
{
  eq(cadCurrentPresentation(undefined), null, "sin variables no hay aspecto actual");
  eq(cadCurrentPresentation(createCadVariableAccess()), null, "de fábrica todo es PorCapa: null");
  eq(
    cadCurrentPresentation(createCadVariableAccess({ CECOLOR: "1" })),
    { color: { source: "explicit", value: "1" } },
    "COLOR 1 → color explícito 1 (ACI)",
  );
  eq(
    cadCurrentPresentation(createCadVariableAccess({ CECOLOR: "BYBLOCK", CELTYPE: "DASHED", CELTSCALE: 0.5, CELWEIGHT: 35 })),
    {
      color: { source: "byBlock" },
      linetype: { source: "explicit", value: "DASHED", scale: 0.5 },
      lineweight: { source: "explicit", value: 35 },
    },
    "PorBloque, tipo de línea con su escala y grosor 0,35 mm",
  );
  eq(
    cadCurrentPresentation(createCadVariableAccess({ CELWEIGHT: -2 })),
    { lineweight: { source: "byBlock" } },
    "CELWEIGHT -2 es PorBloque",
  );
}

/* ── La decoración del lote ──────────────────────────────────────────────── */
{
  const commands: CadEntityCommand[] = [
    { type: "insert", entity: { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" } },
    { type: "insert", entity: { id: "b", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 1, layer: "0", context: { presentation: { color: { source: "explicit", value: "#ff0000" } } } } },
    { type: "delete", entityId: "c" },
  ];
  ok(cadWithCurrentPresentation(commands, null) === commands, "sin aspecto actual vuelve EL MISMO array");
  const decorated = cadWithCurrentPresentation(commands, { color: { source: "explicit", value: "3" } });
  ok(decorated !== commands, "con aspecto actual es otro array");
  const [line, circle, deletion] = decorated;
  ok(line.type === "insert" && line.entity.context?.presentation?.color?.value === "3", "la línea sin aspecto recibe el actual");
  ok(circle.type === "insert" && circle.entity.context?.presentation?.color?.value === "#ff0000", "el círculo con aspecto propio no se pisa");
  ok(deletion === commands[2], "lo que no es inserción pasa intacto");
  ok(commands[0].type === "insert" && commands[0].entity.context === undefined, "y el lote original no se mutó");
}

/* ── Contra el motor: LINE con COLOR 1, COPY sin tocar ───────────────────── */
{
  const variables = createCadVariableAccess({ CECOLOR: "1", CELTYPE: "DASHED" });
  let ids = 0;
  const line = { id: "l1", type: "line" as const, start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0" };
  const context: CadCommandContext = {
    entityIds: ["l1"],
    entity: (id) => (id === "l1" ? line : undefined),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
    variables,
  };
  let state = cadCommandEngineReduce(EMPTY_CAD_COMMAND_ENGINE, { kind: "invoke", command: "LINE" }, context, CAD_COMMAND_REGISTRY_V2).state;
  state = cadCommandEngineReduce(state, { kind: "input", input: { kind: "point", point: { x: 0, y: 0 }, source: "typed" } }, context, CAD_COMMAND_REGISTRY_V2).state;
  state = cadCommandEngineReduce(state, { kind: "input", input: { kind: "point", point: { x: 500, y: 0 }, source: "typed" } }, context, CAD_COMMAND_REGISTRY_V2).state;
  const finished = cadCommandEngineReduce(state, { kind: "input", input: { kind: "enter" } }, context, CAD_COMMAND_REGISTRY_V2);
  const execute = finished.effects.find((effect) => effect.kind === "execute");
  assert.ok(execute?.kind === "execute", "LINE escribió un lote");
  checks += 1;
  const inserted = execute.commands.find((command) => command.type === "insert");
  assert.ok(inserted?.type === "insert");
  eq(
    inserted.entity.context?.presentation,
    { color: { source: "explicit", value: "1" }, linetype: { source: "explicit", value: "DASHED" } },
    "la línea nueva lleva el color y el tipo de línea actuales",
  );

  // COPY es modificación: la copia conserva lo suyo (PorCapa), no recibe CECOLOR.
  let copyState = cadCommandEngineReduce(EMPTY_CAD_COMMAND_ENGINE, { kind: "invoke", command: "COPY" }, { ...context, selection: ["l1"] }, CAD_COMMAND_REGISTRY_V2).state;
  copyState = cadCommandEngineReduce(copyState, { kind: "input", input: { kind: "point", point: { x: 0, y: 0 }, source: "typed" } }, { ...context, selection: ["l1"] }, CAD_COMMAND_REGISTRY_V2).state;
  copyState = cadCommandEngineReduce(copyState, { kind: "input", input: { kind: "point", point: { x: 0, y: 300 }, source: "typed" } }, { ...context, selection: ["l1"] }, CAD_COMMAND_REGISTRY_V2).state;
  // COPY es múltiple: Intro cierra la serie y escribe el lote.
  const copied = cadCommandEngineReduce(copyState, { kind: "input", input: { kind: "enter" } }, { ...context, selection: ["l1"] }, CAD_COMMAND_REGISTRY_V2);
  const copyExecute = copied.effects.find((effect) => effect.kind === "execute");
  assert.ok(copyExecute?.kind === "execute", "COPY escribió un lote");
  checks += 1;
  ok(
    copyExecute.commands.every((command) => !(command.type === "insert" && command.entity.context?.presentation)),
    "COPY no pinta la copia con el color actual: lo copiado conserva lo suyo",
  );
}

console.log(`current-presentation: ${checks} comprobaciones · CECOLOR/CELTYPE/CELWEIGHT → aspecto de lo dibujado, mismo array de fábrica, lo propio no se pisa, COPY no lo hereda`);
