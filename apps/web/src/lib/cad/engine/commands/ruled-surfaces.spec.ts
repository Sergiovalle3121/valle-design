/**
 * RULESURF y TABSURF — mallas regladas clásicas.
 *
 * RULESURF crea una superficie reglada entre dos curvas.
 * TABSURF extruye un perfil a lo largo de una trayectoria.
 *
 * Ambas producen un sólido B-rep delgado (extrusión de espesor mínimo).
 * El spec comprueba geometría real: area > 0 y las respuestas de error.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { solid3dMassProperties } from "../../solid3d-build";

import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (cond: boolean, msg: string) => { assert.ok(cond, msg); checks += 1; };
const near = (a: number, b: number, eps: number, msg: string) => { assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} != ${b}`); checks += 1; };

const layer = "0";

function doc(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
  });
}

function makeContext(d: CadDocument, sel: readonly string[] = []): CadCommandContext {
  let id = 0;
  return {
    entityIds: d.entities.map((e) => e.id),
    entity: (eid) => d.entities.find((e) => e.id === eid),
    selection: sel,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `rs${++id}`; },
  };
}

const ENTER: CadCommandInput = { kind: "enter" };
const pick = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });

function runCommand(name: string, d: CadDocument, inputs: readonly CadCommandInput[], sel: readonly string[] = []) {
  const cmd = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(cmd, `${name} debe existir en el registro`);
  const ctx = makeContext(d, sel);
  let step = cmd.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = cmd.step(step.state, input, ctx);
  }
  return step.result;
}

// --- RULESURF: superficie entre dos líneas ----------------------------------
{
  const line1: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 0, z: 0 }, layer };
  const line2: CadEntity = { id: "l2", type: "line", start: { x: 0, y: 500, z: 0 }, end: { x: 1000, y: 500, z: 0 }, layer };
  const d = doc([line1, line2]);
  const result = runCommand("RULESURF", d, [pick("l1"), pick("l2"), ENTER]);
  ok(result?.kind === "document", "RULESURF produce documento");
  if (result?.kind === "document") {
    ok(result.commands.length >= 1, "al menos un comando");
    const cmd = result.commands[0];
    ok(cmd.type === "insert", "tipo insert");
    if (cmd.type === "insert") {
      const solid = cmd.entity as CadSolid3dEntity;
      const props = solid3dMassProperties(solid);
      ok(props.area > 0, `area > 0 (tiene ${props.area.toFixed(2)})`);
      near(props.area, 1000000, 5000, "area ~1000000 mm² (dos caras de 500000)");
    }
  }
}

// --- RULESURF cancelado -------------------------------------------------------
{
  const line1: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer };
  const d = doc([line1]);
  const result = runCommand("RULESURF", d, [pick("l1"), { kind: "cancel" }]);
  ok(result?.kind === "message", "cancel produce mensaje");
}

// --- RULESURF rechaza solo una curva -----------------------------------------
{
  const line1: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer };
  const d = doc([line1]);
  const result = runCommand("RULESURF", d, [pick("l1"), ENTER]);
  ok(result?.kind === "message", "solo una curva produce mensaje de error");
}

// --- TABSURF: extruir línea a lo largo de otra --------------------------------
{
  const profile: CadEntity = { id: "p1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 200, z: 0 }, layer };
  const path: CadEntity = { id: "t1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 800, y: 0, z: 0 }, layer };
  const d = doc([profile, path]);
  const result = runCommand("TABSURF", d, [pick("p1"), pick("t1"), ENTER]);
  ok(result?.kind === "document", "TABSURF produce documento");
  if (result?.kind === "document") {
    const cmd = result.commands[0];
    ok(cmd.type === "insert", "tipo insert");
    if (cmd.type === "insert") {
      const solid = cmd.entity as CadSolid3dEntity;
      const props = solid3dMassProperties(solid);
      ok(props.area > 0, `area > 0 (tiene ${props.area.toFixed(2)})`);
      near(props.area, 320000, 5000, "area ~320000 mm² (dos caras de 160000)");
    }
  }
}

console.log(`ruled-surfaces: ${checks} comprobaciones OK`);
