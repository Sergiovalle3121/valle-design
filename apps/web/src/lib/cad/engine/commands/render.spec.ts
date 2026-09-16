/**
 * Render: los 13 comandos de la familia RENDER.
 */
import { strict as assert } from "node:assert";
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
    newEntityId() { return `r${++id}`; },
  };
  let step = descriptor.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
  }
  return step.result;
}

const cancel: CadCommandInput = { kind: "cancel" };
const enter: CadCommandInput = { kind: "enter" };
const keyword = (v: string): CadCommandInput => ({ kind: "keyword", keyword: v });
const distance = (v: number): CadCommandInput => ({ kind: "distance", value: v });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const pick = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });

const RENDER_NAMES = [
  "RENDER", "RENDERCROP", "RENDERWIN", "RENDERPRESETS", "RENDEREXPOSURE",
  "RENDERENVIRONMENT", "MATERIALS", "MATERIALMAP", "MATERIALATTACH",
  "POINTLIGHT", "SPOTLIGHT", "DISTANTLIGHT", "SUNPROPERTIES",
];

// --- Registro ---------------------------------------------------------------
for (const name of RENDER_NAMES) {
  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} en el registro`);
}

// --- Cancelación limpia -----------------------------------------------------
for (const name of RENDER_NAMES) {
  const result = run(name, [cancel]);
  // Algunos comandos aceptan 0 en begin() y no necesitan cancel.
  assert.ok(result?.kind === "message", `${name} responde con mensaje`);
}

// --- RENDER flujo -----------------------------------------------------------
{
  const result = run("RENDER", [enter]);
  assert.ok(result?.kind === "message", "RENDER produce mensaje");
}

// --- RENDERCROP flujo -------------------------------------------------------
{
  const result = run("RENDERCROP", [point(0, 0)]);
  // RENDERCROP acepta un punto y pide el segundo; con un solo input no produce resultado final.
  assert.ok(result === undefined || result?.kind === "message", "RENDERCROP acepta punto");
}

// --- RENDERPRESETS ----------------------------------------------------------
{
  const result = run("RENDERPRESETS", [keyword("Alto")]);
  assert.ok(result?.kind === "message", "RENDERPRESETS produce mensaje");
}

// --- RENDEREXPOSURE ---------------------------------------------------------
{
  const result = run("RENDEREXPOSURE", [distance(1.5)]);
  assert.ok(result?.kind === "message", "RENDEREXPOSURE produce mensaje");
}

// --- MATERIALS --------------------------------------------------------------
{
  const result = run("MATERIALS", [keyword("Madera")]);
  assert.ok(result?.kind === "message", "MATERIALS produce mensaje");
}

// --- POINTLIGHT flujo -------------------------------------------------------
{
  const result = run("POINTLIGHT", [point(0, 0), distance(0.8)]);
  assert.ok(result?.kind === "message", "POINTLIGHT produce mensaje");
}

// --- SUNPROPERTIES ----------------------------------------------------------
{
  const result = run("SUNPROPERTIES", [keyword("Activar")]);
  assert.ok(result?.kind === "message", "SUNPROPERTIES produce mensaje");
}

console.log(`✅ render.spec: ${RENDER_NAMES.length} comandos verificados — ${RENDER_NAMES.length + 7} comprobaciones`);
