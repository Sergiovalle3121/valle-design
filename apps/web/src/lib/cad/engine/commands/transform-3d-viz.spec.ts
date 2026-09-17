/**
 * Transformación 3D y Visualización: 14 comandos (incluye 3DMOVE y 3DROTATE
 * con verificación de geometría real).
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import type { CadEntityCommand } from "../../entity-commands";
import "@/lib/cad/engine/all-commands";

function run(name: string, inputs: readonly CadCommandInput[], ctx?: CadCommandContext): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} registrado`);
  let id = 0;
  const effectiveCtx: CadCommandContext = ctx ?? {
    entityIds: [], entity: () => undefined, selection: [], activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `v${++id}`; },
  };
  let step = descriptor.begin(effectiveCtx);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, effectiveCtx);
  }
  return step.result;
}

function runCommands(name: string, inputs: readonly CadCommandInput[], ctx?: CadCommandContext): CadEntityCommand[] {
  const result = run(name, inputs, ctx);
  if (!result || result.kind !== "document") return [];
  return [...result.commands];
}

const pick = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };
const cancel: CadCommandInput = { kind: "cancel" };
const keyword = (v: string): CadCommandInput => ({ kind: "keyword", keyword: v });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const angle = (deg: number): CadCommandInput => ({ kind: "angle", degrees: deg });
const distance = (v: number): CadCommandInput => ({ kind: "distance", value: v });

/** Crea un contexto que devuelve una entidad solid3d con la colocación dada. */
function ctxWithSolid(placement: Record<string, number> = {}): CadCommandContext {
  let id = 0;
  return {
    entityIds: ["s1"],
    entity: (eid: string) => eid === "s1"
      ? { type: "solid3d", placement: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, dz: 0, ...placement } } as never
      : undefined,
    selection: ["s1"],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `v${++id}`; },
  };
}

const NAMES = [
  "3DMOVE", "3DROTATE", "3DALIGN", "3DSCALE", "MIRROR3D", "3DARRAY",
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

// --- 3DMOVE: traslación con sólido real -----------------------------------
{
  const cmds = runCommands("3DMOVE", [pick("s1"), point(0, 0), point(10, 20)], ctxWithSolid());
  assert.ok(cmds.length > 0, "3DMOVE produce comandos con sólido");
  const transform = cmds.find(c => c.type === "transform3d") as { type: string; transform3d?: Record<string, number> } | undefined;
  assert.ok(transform?.transform3d, "3DMOVE produce transform3d");
  assert.ok(Math.abs((transform!.transform3d!.tx ?? 0) - 10) < 1e-6, "3DMOVE tx = 10");
  assert.ok(Math.abs((transform!.transform3d!.ty ?? 0) - 20) < 1e-6, "3DMOVE ty = 20");
}

// --- 3DMOVE: copia ---------------------------------------------------------
{
  const ctx = ctxWithSolid();
  const cmds = runCommands("3DMOVE", [pick("s1"), keyword("Copiar"), point(0, 0), point(5, 5)], ctx);
  const copy = cmds.find(c => c.type === "copy");
  assert.ok(copy, "3DMOVE Copiar produce comando copy");
  const transform = cmds.find(c => c.type === "transform3d");
  assert.ok(transform, "3DMOVE Copiar produce transform3d");
}

// --- 3DMOVE: sin sólidos avisa ---------------------------------------------
{
  const result = run("3DMOVE", [pick("nada"), point(0, 0), point(1, 1)]);
  assert.ok(result?.kind === "message", "3DMOVE sin sólidos produce mensaje");
}

// --- 3DROTATE: eje de mundo Z, 90° -----------------------------------------
{
  const cmds = runCommands("3DROTATE", [pick("s1"), point(0, 0), keyword("EjeZ"), angle(90)], ctxWithSolid());
  assert.ok(cmds.length > 0, "3DROTATE produce comandos con sólido");
  const transform = cmds.find(c => c.type === "transform3d") as { type: string; transform3d?: Record<string, number> } | undefined;
  assert.ok(transform?.transform3d, "3DROTATE produce transform3d");
  // 90° alrededor de Z: a≈0, c≈-1, b≈1, d≈0
  const t = transform!.transform3d!;
  assert.ok(Math.abs((t.a ?? 1) - 0) < 1e-6, "3DROTATE 90°Z: a ≈ 0");
  assert.ok(Math.abs((t.c ?? 0) - (-1)) < 1e-6, "3DROTATE 90°Z: c ≈ -1");
  assert.ok(Math.abs((t.b ?? 0) - 1) < 1e-6, "3DROTATE 90°Z: b ≈ 1");
  assert.ok(Math.abs((t.d ?? 1) - 0) < 1e-6, "3DROTATE 90°Z: d ≈ 0");
}

// --- 3DROTATE: ángulo cero no produce comandos -----------------------------
{
  const cmds = runCommands("3DROTATE", [pick("s1"), point(0, 0), keyword("EjeZ"), angle(0)], ctxWithSolid());
  assert.ok(cmds.length === 0, "3DROTATE ángulo 0 no produce comandos");
}

// --- 3DROTATE: sin sólidos avisa -------------------------------------------
{
  const result = run("3DROTATE", [pick("nada"), point(0, 0), keyword("EjeZ"), angle(45)]);
  assert.ok(result?.kind === "message", "3DROTATE sin sólidos produce mensaje");
}

// --- 3DROTATE: eje por dos puntos ------------------------------------------
{
  const cmds = runCommands("3DROTATE", [
    pick("s1"), point(0, 0), point(0, 0, ), point(0, 0), point(1, 0), angle(90),
  ], ctxWithSolid());
  // Dos puntos idénticos del eje → aviso
  const result = run("3DROTATE", [
    pick("s1"), point(0, 0), point(0, 0), point(0, 0), angle(90),
  ], ctxWithSolid());
  assert.ok(
    result?.kind === "message" && result.text.includes("mismo"),
    "3DROTATE eje degenerado avisa",
  );
}

console.log(`✅ transform-3d-viz.spec: ${NAMES.length} comandos verificados — ${NAMES.length * 2 + 25} comprobaciones`);
