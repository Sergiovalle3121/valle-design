import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { CAD_ADDSELECTED_COMMANDS, cadAddSelectedVariables, cadSelectSimilar } from "./select-similar";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

/**
 * SELECTSIMILAR y ADDSELECTED (Ola D, 2026-09-02).
 *
 * SELECTSIMILAR designa lo del mismo TIPO y CAPA (y bloque en las
 * inserciones); ni el color ni el tipo de línea entran. ADDSELECTED pide al
 * anfitrión encadenar la orden que dibuja el tipo designado con CLAYER,
 * CECOLOR y CELTYPE del original, y dice con nombre qué tipo no sabe dibujar.
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

const SCENE: CadEntity[] = [
  { id: "eje", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "MUROS" },
  { id: "eje2", type: "line", start: { x: 0, y: 50, z: 0 }, end: { x: 100, y: 50, z: 0 }, layer: "MUROS", context: { presentation: { color: { source: "explicit", value: "#ff0000" } } } },
  { id: "otro", type: "line", start: { x: 0, y: 90, z: 0 }, end: { x: 100, y: 90, z: 0 }, layer: "0" },
  { id: "contorno", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], closed: false, layer: "MUROS" },
  { id: "silla1", type: "insert", block: "silla", insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "MOBILIARIO" },
  { id: "silla2", type: "insert", block: "silla", insertion: { x: 900, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "MOBILIARIO" },
  { id: "mesa", type: "insert", block: "mesa", insertion: { x: 400, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "MOBILIARIO" },
  { id: "muro", type: "wall", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thickness: 150, height: 2700, layer: "MUROS" } as unknown as CadEntity,
];

function context(selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: SCENE.map((entity) => entity.id),
    entity: (id) => SCENE.find((entity) => entity.id === id),
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "n",
  };
}

function drive(name: string, inputs: readonly CadCommandInput[], selection: readonly string[] = []) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const ctx = context(selection);
  let step = descriptor.begin(ctx);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
    prompts.push(step.prompt.message);
  }
  return { result: step.result as CadCommandResult | undefined, prompts };
}

const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };

/* ── SELECTSIMILAR ───────────────────────────────────────────────────────── */
{
  eq(cadSelectSimilar(["eje"], context()), ["eje", "eje2"], "mismo tipo y capa: las dos líneas de MUROS, no la de 0 ni la polilínea");
  eq(cadSelectSimilar(["silla1"], context()), ["silla1", "silla2"], "las inserciones se parecen por BLOQUE: la mesa no entra");
  eq(cadSelectSimilar(["eje", "silla2"], context()), ["eje", "eje2", "silla1", "silla2"], "varias referencias suman sus claves, en orden de dibujo");
  eq(cadSelectSimilar(["nadie"], context()), [], "una referencia que no existe no designa nada");

  const preselected = drive("SELECTSIMILAR", [], ["eje"]);
  ok(preselected.result?.kind === "selection", "con selección previa designa de inmediato");
  ok(preselected.result?.kind === "selection" && preselected.result.entityIds.join() === "eje,eje2", "eje y eje2");
  ok(preselected.result?.kind === "selection" && (preselected.result.text ?? "").includes("2 objeto(s) similares") && (preselected.result.text ?? "").includes("LINE"), `y lo dice: «${preselected.result?.kind === "selection" ? preselected.result.text : ""}»`);

  const asked = drive("SELECTSIMILAR", [pick("silla1"), enter]);
  ok(asked.prompts[0].includes("referencia"), "sin selección pide los objetos de referencia");
  ok(asked.result?.kind === "selection" && asked.result.entityIds.join() === "silla1,silla2", "designando una silla salen las dos");
  ok(drive("SELECTSIMILAR", [enter]).result?.kind === "message", "Intro sin nada lo dice");
  ok(CAD_COMMAND_REGISTRY_V2.get("SELECTSIMILAR")?.mutates === false, "no muta: es una designación");
}

/* ── ADDSELECTED ─────────────────────────────────────────────────────────── */
{
  eq(cadAddSelectedVariables(SCENE[0]), { CLAYER: "MUROS", CECOLOR: "BYLAYER", CELTYPE: "ByLayer" }, "sin aspecto propio: capa y PorCapa");
  eq(cadAddSelectedVariables(SCENE[1]), { CLAYER: "MUROS", CECOLOR: "#ff0000", CELTYPE: "ByLayer" }, "el color explícito viaja a CECOLOR");
  eq(
    cadAddSelectedVariables({ ...SCENE[0], context: { presentation: { color: { source: "byBlock" }, linetype: { source: "explicit", value: "DASHED" } } } }),
    { CLAYER: "MUROS", CECOLOR: "BYBLOCK", CELTYPE: "DASHED" },
    "PorBloque y tipo de línea explícito",
  );
  eq(CAD_ADDSELECTED_COMMANDS.line, "LINE", "una línea se añade con LINE");
  eq(CAD_ADDSELECTED_COMMANDS.insert, "INSERT", "una inserción con INSERT");
  eq(CAD_ADDSELECTED_COMMANDS.wall, undefined, "un muro heredado no tiene orden que lo dibuje");

  const chained = drive("ADDSELECTED", [], ["eje2"]);
  assert.ok(chained.result?.kind === "host" && chained.result.request.kind === "chain-command", "pide al anfitrión encadenar");
  checks += 1;
  eq(chained.result.request.command, "LINE", "la orden de una línea");
  eq(chained.result.request.variables, { CLAYER: "MUROS", CECOLOR: "#ff0000", CELTYPE: "ByLayer" }, "con la capa y el color del original");

  const picked = drive("ADDSELECTED", [pick("silla1")]);
  ok(picked.prompts[0].includes("Designe el objeto"), "sin selección pide uno");
  ok(picked.result?.kind === "host" && picked.result.request.kind === "chain-command" && picked.result.request.command === "INSERT", "una silla se añade con INSERT");

  const refused = drive("ADDSELECTED", [pick("muro")]);
  ok(refused.result?.kind === "message" && refused.result.text.includes("WALL"), `un tipo sin orden se dice con su nombre: «${refused.result?.kind === "message" ? refused.result.text : ""}»`);
  ok(drive("ADDSELECTED", [{ kind: "cancel" }]).result?.kind === "none", "Esc cancela");
}

console.log(`select-similar: ${checks} comprobaciones · SELECTSIMILAR por tipo, capa y bloque como designación; ADDSELECTED encadena la orden del tipo con CLAYER/CECOLOR/CELTYPE y nombra lo que no sabe dibujar`);
