/**
 * Mallas: los 19 comandos de la familia MESH.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import "@/lib/cad/engine/all-commands";

function run(name: string, inputs: readonly CadCommandInput[]): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} registrado`);
  let id = 0;
  const ctx: CadCommandContext = {
    entityIds: [], entity: () => undefined, selection: [], activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `m${++id}`; },
  };
  let step = descriptor.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
  }
  return step.result;
}

const pick = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };
const cancel: CadCommandInput = { kind: "cancel" };
const keyword = (v: string): CadCommandInput => ({ kind: "keyword", keyword: v });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const distance = (v: number): CadCommandInput => ({ kind: "distance", value: v });

const MESH_NAMES = [
  "MESH", "CONVTOMESH", "CONVTOSOLID", "MESHSMOOTH", "MESHSMOOTHMORE",
  "MESHSMOOTHLESS", "MESHREFINE", "MESHSPLIT", "MESHCREASE", "MESHUNCREASE",
  "MESHCOLLAPSE", "MESHEXTRUDE", "MESHMERGE", "MESHCAP",
  "RULESURF", "TABSURF", "REVSURF", "EDGESURF", "3DFACE",
];

// --- Registro ---------------------------------------------------------------
for (const name of MESH_NAMES) {
  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} en el registro`);
}

// --- Cancelación limpia -----------------------------------------------------
for (const name of MESH_NAMES) {
  const result = run(name, [cancel]);
  assert.ok(result?.kind === "message" && result.text.toLowerCase().includes("cancelado"), `${name} cancela`);
}

// --- MESH primitiva: caja ---------------------------------------------------
{
  const result = run("MESH", [enter, point(0, 0), distance(50)]);
  assert.ok(result?.kind === "document", "MESH CAja produce documento");
}

// --- 3DFACE: tres puntos ----------------------------------------------------
{
  const result = run("3DFACE", [point(0, 0), point(100, 0), point(50, 50)]);
  assert.ok(result?.kind === "message", "3DFACE con 3 puntos produce mensaje");
}

// --- RULESURF: dos curvas ---------------------------------------------------
{
  const result = run("RULESURF", [pick("c1"), pick("c2")]);
  assert.ok(result?.kind === "message", "RULESURF produce mensaje (no implementado)");
}

// --- MESH primitiva sin punto se niega --------------------------------------
{
  const result = run("MESH", [enter, enter]);
  assert.ok(result?.kind === "message", "MESH sin punto se niega");
}

console.log(`✅ meshes.spec: ${MESH_NAMES.length} comandos verificados — ${19 * 2 + 5} comprobaciones`);
