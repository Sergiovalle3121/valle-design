/**
 * Transformación 3D y Visualización: 12 comandos nuevos.
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
    newEntityId() { return `v${++id}`; },
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

const NAMES = [
  "3DALIGN", "3DSCALE", "MIRROR3D", "3DARRAY",
  "3DWALK", "3DFLY", "3DSWIVEL", "CAMERA", "DVIEW", "NAVVCUBE", "NAVBAR", "VISUALSTYLES",
];

// --- Registro ---------------------------------------------------------------
for (const name of NAMES) {
  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} en el registro`);
}

// --- Cancelación limpia -----------------------------------------------------
for (const name of NAMES) {
  const result = run(name, [cancel]);
  assert.ok(
    result?.kind === "message" && result.text.toLowerCase().includes("cancelado"),
    `${name} cancela`,
  );
}

// --- 3DALIGN flujo ----------------------------------------------------------
{
  const result = run("3DALIGN", [pick("s1"), point(0, 0), point(100, 100)]);
  assert.ok(result?.kind === "message", "3DALIGN produce mensaje");
}

// --- 3DSCALE flujo ----------------------------------------------------------
{
  const result = run("3DSCALE", [pick("s1"), distance(2)]);
  assert.ok(result?.kind === "message", "3DSCALE produce mensaje");
}

// --- MIRROR3D flujo ---------------------------------------------------------
{
  const result = run("MIRROR3D", [pick("s1"), keyword("XY")]);
  assert.ok(result?.kind === "message", "MIRROR3D produce mensaje");
}

// --- 3DARRAY flujo ----------------------------------------------------------
{
  const result = run("3DARRAY", [pick("s1"), keyword("Rectangular")]);
  assert.ok(result?.kind === "message", "3DARRAY produce mensaje");
}

// --- CAMERA flujo -----------------------------------------------------------
{
  const result = run("CAMERA", [point(0, 0), point(100, 100)]);
  assert.ok(result?.kind === "message", "CAMERA produce mensaje");
}

// --- VISUALSTYLES -----------------------------------------------------------
{
  const result = run("VISUALSTYLES", [keyword("Realista")]);
  assert.ok(result?.kind === "message", "VISUALSTYLES produce mensaje");
}

// --- NAVVCUBE ---------------------------------------------------------------
{
  const result = run("NAVVCUBE", [keyword("ON")]);
  assert.ok(result?.kind === "message", "NAVVCUBE produce mensaje");
}

console.log(`✅ transform-3d-viz.spec: ${NAMES.length} comandos verificados — ${NAMES.length * 2 + 7} comprobaciones`);
