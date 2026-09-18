/**
 * RENDER, RENDERPRESETS, RENDEREXPOSURE conducidos contra el motor real.
 *
 * Cada comando emite una petición de anfitrión declarativa; aquí se comprueba
 * que teclear la orden produce la petición correcta, que los formatos y
 * presets son los esperados y que cancelar no emite nada.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import type { CadHostRequest } from "../host-requests";

import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

let idCounter = 0;

function context(): CadCommandContext {
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `r${++idCounter}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
): CadCommandResult | undefined {
  const descriptor = registry.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro`);
  const ctx = context();
  let step = descriptor.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
  }
  return step.result;
}

function hostReq(result: CadCommandResult | undefined): CadHostRequest | undefined {
  if (result?.kind === "host") return result.request;
  return undefined;
}

const keyword = (v: string): CadCommandInput => ({ kind: "keyword", keyword: v });
const distance = (v: number): CadCommandInput => ({ kind: "distance", value: v });
const enter: CadCommandInput = { kind: "enter" };
const cancel: CadCommandInput = { kind: "cancel" };

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

{
  // RENDER + Enter → default PNG
  const r = hostReq(run("RENDER", [enter]));
  assert.ok(r, "RENDER emite petición");
  assert.equal(r.kind, "render-capture");
  if (r.kind === "render-capture") assert.equal(r.format, "png", "default PNG");
}

{
  // RENDER + keyword JPEG
  const r = hostReq(run("RENDER", [keyword("JPEG")]));
  assert.ok(r, "RENDER JPEG emite petición");
  if (r.kind === "render-capture") assert.equal(r.format, "jpeg");
}

{
  // RENDER + keyword BMP
  const r = hostReq(run("RENDER", [keyword("BMP")]));
  assert.ok(r, "RENDER BMP emite petición");
  if (r.kind === "render-capture") assert.equal(r.format, "bmp");
}

{
  // RENDER cancelado
  const r = run("RENDER", [cancel]);
  assert.equal(r?.kind, "message", "cancelado produce mensaje");
  if (r?.kind === "message") assert.ok(r.text.includes("cancelado"));
}

// ---------------------------------------------------------------------------
// RENDERPRESETS
// ---------------------------------------------------------------------------

{
  // RENDERPRESETS + Enter → default Normal
  const r = hostReq(run("RENDERPRESETS", [enter]));
  assert.ok(r, "RENDERPRESETS emite petición");
  assert.equal(r.kind, "render-setting");
  if (r.kind === "render-setting") {
    assert.equal(r.setting, "quality");
    assert.equal(r.value, "Normal", "default Normal");
  }
}

{
  // RENDERPRESETS + keyword Alta
  const r = hostReq(run("RENDERPRESETS", [keyword("Alta")]));
  assert.ok(r, "RENDERPRESETS Alta emite petición");
  if (r.kind === "render-setting") assert.equal(r.value, "Alta");
}

{
  // RENDERPRESETS + keyword Rapido
  const r = hostReq(run("RENDERPRESETS", [keyword("Rapido")]));
  assert.ok(r);
  if (r.kind === "render-setting") assert.equal(r.value, "Rapido");
}

{
  // RENDERPRESETS + keyword Produccion
  const r = hostReq(run("RENDERPRESETS", [keyword("Produccion")]));
  assert.ok(r);
  if (r.kind === "render-setting") assert.equal(r.value, "Produccion");
}

{
  // RENDERPRESETS cancelado
  const r = run("RENDERPRESETS", [cancel]);
  assert.equal(r?.kind, "message");
  if (r?.kind === "message") assert.ok(r.text.includes("cancelado"));
}

// ---------------------------------------------------------------------------
// RENDEREXPOSURE
// ---------------------------------------------------------------------------

{
  // RENDEREXPOSURE + distance 1.5
  const r = hostReq(run("RENDEREXPOSURE", [distance(1.5)]));
  assert.ok(r, "RENDEREXPOSURE emite petición");
  assert.equal(r.kind, "render-setting");
  if (r.kind === "render-setting") {
    assert.equal(r.setting, "exposure");
    assert.equal(r.value, 1.5);
  }
}

{
  // RENDEREXPOSURE valor fuera de rango alto → recorte a +3
  const r = hostReq(run("RENDEREXPOSURE", [distance(5)]));
  assert.ok(r);
  if (r.kind === "render-setting") assert.equal(r.value, 3, "recortado a +3");
}

{
  // RENDEREXPOSURE valor fuera de rango bajo → recorte a -3
  const r = hostReq(run("RENDEREXPOSURE", [distance(-10)]));
  assert.ok(r);
  if (r.kind === "render-setting") assert.equal(r.value, -3, "recortado a -3");
}

{
  // RENDEREXPOSURE cancelado
  const r = run("RENDEREXPOSURE", [cancel]);
  assert.equal(r?.kind, "message");
  if (r?.kind === "message") assert.ok(r.text.includes("cancelado"));
}

{
  // RENDEREXPOSURE Enter (consulta sin cambiar)
  const r = run("RENDEREXPOSURE", [enter]);
  assert.equal(r?.kind, "message", "Enter da un mensaje");
  if (r?.kind === "message") assert.ok(r.text.includes("actual"));
}

// ---------------------------------------------------------------------------
// RENDERENVIRONMENT
// ---------------------------------------------------------------------------

{
  // RENDERENVIRONMENT + Enter → default Solido
  const r = hostReq(run("RENDERENVIRONMENT", [enter]));
  assert.ok(r, "RENDERENVIRONMENT emite petición");
  assert.equal(r.kind, "render-environment");
  if (r.kind === "render-environment") assert.equal(r.background, "Solido");
}

{
  // RENDERENVIRONMENT + keyword Imagen
  const r = hostReq(run("RENDERENVIRONMENT", [keyword("Imagen")]));
  assert.ok(r);
  if (r.kind === "render-environment") assert.equal(r.background, "Imagen");
}

{
  // RENDERENVIRONMENT cancelado
  const r = run("RENDERENVIRONMENT", [cancel]);
  assert.equal(r?.kind, "message");
  if (r?.kind === "message") assert.ok(r.text.includes("cancelado"));
}

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------

{
  // MATERIALS + Enter → abre explorador
  const r = hostReq(run("MATERIALS", [enter]));
  assert.ok(r, "MATERIALS emite petición");
  assert.equal(r.kind, "material-browser");
}

{
  // MATERIALS cancelado
  const r = run("MATERIALS", [cancel]);
  assert.equal(r?.kind, "message");
  if (r?.kind === "message") assert.ok(r.text.includes("cancelado"));
}

// ---------------------------------------------------------------------------
// MATERIALATTACH
// ---------------------------------------------------------------------------

{
  // MATERIALATTACH con selección y nombre de material
  const r = hostReq(run("MATERIALATTACH", [
    { kind: "selection", entityIds: ["e1", "e2"] },
    { kind: "text", value: "Acero" },
  ]));
  assert.ok(r, "MATERIALATTACH emite petición");
  assert.equal(r.kind, "material-attach");
  if (r.kind === "material-attach") {
    assert.equal(r.materialName, "Acero");
    assert.deepEqual([...r.entityIds], ["e1", "e2"]);
  }
}

{
  // MATERIALATTACH cancelado
  const r = run("MATERIALATTACH", [cancel]);
  assert.equal(r?.kind, "message");
  if (r?.kind === "message") assert.ok(r.text.includes("cancelado"));
}

console.log("render.spec: todas las comprobaciones pasaron.");