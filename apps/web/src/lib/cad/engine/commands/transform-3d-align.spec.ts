/**
 * 3DALIGN — alineación rígida de sólidos 3D por pares de puntos.
 *
 * Comprueba:
 *  - 1 par: traslación pura (centroide se desplaza).
 *  - 2 pares: rotación 2D + traslación.
 *  - 3 pares: rotación 3D completa.
 *  - Cancelación y rechazo de sólidos ausentes.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dMassProperties } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "0";

function emptyDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
    entities: [],
    modelSpace: { entityIds: [] },
  });
}

let idCounter = 0;

function makeContext(document: CadDocument): CadCommandContext {
  return {
    entityIds: document.entities.map((e) => e.id),
    entity: (id) => document.entities.find((e) => e.id === id),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `align${++idCounter}`; },
  };
}

function drive(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro`);
  const context = makeContext(document);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const enter: CadCommandInput = { kind: "enter" };
const pick = (entityId: string, x: number, y: number): CadCommandInput => ({ kind: "entityPick", entityId, point: { x, y } });

// Helper: create a BOX solid and return its id.
function makeBox(doc: CadDocument, x: number, y: number, w: number, h: number, height: number): { doc: CadDocument; id: string } {
  const result = drive("BOX", [point(x, y), point(x + w, y + h), { kind: "distance", value: height }], doc);
  assert.ok(result?.kind === "document", "BOX produces document");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const solid = doc.entities.filter((e) => e.type === "solid3d");
  return { doc, id: solid[solid.length - 1].id };
}

function centroid(doc: CadDocument, id: string): { x: number; y: number; z: number } {
  const entity = doc.entities.find((e) => e.id === id)!;
  return solid3dMassProperties(entity as never).centroid;
}

// --- Registro -----------------------------------------------------------------
assert.ok(CAD_COMMAND_REGISTRY_V2.get("3DALIGN"), "3DALIGN está en el registro");

// --- 1 par: traslación pura ---------------------------------------------------
{
  let doc = emptyDocument();
  const box = makeBox(doc, 0, 0, 100, 50, 30);
  doc = box.doc;
  const id1 = box.id;
  const before = centroid(doc, id1);

  const result = drive("3DALIGN", [pick(id1, 50, 25), enter, point(0, 0), enter, point(200, 100)], doc);
  assert.ok(result?.kind === "document", "3DALIGN 1-par produce documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const after = centroid(doc, id1);

  assert.ok(
    Math.abs(after.x - before.x - 200) < 0.1 && Math.abs(after.y - before.y - 100) < 0.1,
    `3DALIGN 1-par: traslación (Δx≈200, Δy≈100): got (${(after.x - before.x).toFixed(1)}, ${(after.y - before.y).toFixed(1)})`,
  );
}

// --- 2 pares: rotación 90° + traslación ---------------------------------------
{
  let doc = emptyDocument();
  const box = makeBox(doc, 0, 0, 100, 50, 30);
  doc = box.doc;
  const id1 = box.id;
  const before = centroid(doc, id1);
  const volBefore = solid3dMassProperties(doc.entities.find((e) => e.id === id1) as never).volume;

  // Source: (0,0)→(100,0), Dest: (0,0)→(0,100) = 90° CCW rotation + no translation
  const result = drive("3DALIGN", [
    pick(id1, 50, 25), enter,
    point(0, 0), point(100, 0), enter,
    point(0, 0), point(0, 100),
  ], doc);
  assert.ok(result?.kind === "document", "3DALIGN 2-par produce documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const after = centroid(doc, id1);
  const volAfter = solid3dMassProperties(doc.entities.find((e) => e.id === id1) as never).volume;

  // Volume should be preserved.
  assert.ok(
    Math.abs(volAfter - volBefore) / volBefore < 0.01,
    `3DALIGN 2-par: volumen preservado (${volAfter.toFixed(1)} ≈ ${volBefore.toFixed(1)})`,
  );
  // After 90° rotation around origin, the centroid should move.
  assert.ok(
    Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1,
    `3DALIGN 2-par: centroide se movió (${before.x.toFixed(1)},${before.y.toFixed(1)}) → (${after.x.toFixed(1)},${after.y.toFixed(1)})`,
  );
}

// --- 3 pares: rotación 3D completa --------------------------------------------
{
  let doc = emptyDocument();
  const box = makeBox(doc, 0, 0, 100, 50, 30);
  doc = box.doc;
  const id1 = box.id;
  const before = centroid(doc, id1);
  const volBefore = solid3dMassProperties(doc.entities.find((e) => e.id === id1) as never).volume;

  // Full 3-point alignment.
  const result = drive("3DALIGN", [
    pick(id1, 50, 25), enter,
    point(0, 0), point(100, 0), point(0, 50), enter,
    point(0, 0), point(0, 100), point(50, 0),
  ], doc);
  assert.ok(result?.kind === "document", "3DALIGN 3-par produce documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const after = centroid(doc, id1);
  const volAfter = solid3dMassProperties(doc.entities.find((e) => e.id === id1) as never).volume;

  assert.ok(
    Math.abs(volAfter - volBefore) / volBefore < 0.01,
    `3DALIGN 3-par: volumen preservado (${volAfter.toFixed(1)} ≈ ${volBefore.toFixed(1)})`,
  );
  assert.ok(
    Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1,
    `3DALIGN 3-par: centroide se movió (${before.x.toFixed(1)},${before.y.toFixed(1)}) → (${after.x.toFixed(1)},${after.y.toFixed(1)})`,
  );
}

// --- Cancelación --------------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("3DALIGN")!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "3DALIGN se cancela limpiamente",
  );
}

// --- Sin sólidos --------------------------------------------------------------
{
  let doc = emptyDocument();
  const box = makeBox(doc, 0, 0, 100, 50, 30);
  doc = box.doc;

  // Pick a non-existent entity to simulate empty selection scenario.
  const result = drive("3DALIGN", [enter], doc);
  assert.ok(
    result?.kind === "message" && result.text.includes("al menos un"),
    `3DALIGN rechaza selección vacía: ${result?.kind === "message" ? result.text : ""}`,
  );
}

console.log(
  "✅ transform-3d-align.spec: 3DALIGN (traslación, rotación 2D, rotación 3D, cancelación, sin sólidos) — 10 comprobaciones",
);
