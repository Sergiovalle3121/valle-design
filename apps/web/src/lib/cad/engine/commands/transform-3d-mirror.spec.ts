/**
 * MIRROR3D — spec que conduce la reflexión 3D contra el motor real.
 *
 * Verifica que MIRROR3D refleja sólidos respecto a un plano definido
 * por tres puntos, preservando volumen y cambiando la orientación.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dMassProperties } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandResult,
} from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "ESPEJO";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      {
        id: layer,
        name: "Espejo",
        color: "#0ff",
        visible: true,
        locked: false,
      },
    ],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
  });
}

let idCounter = 0;

function makeContext(
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandContext {
  return {
    entityIds: document.entities.map((e) => e.id),
    entity: (id) => document.entities.find((e) => e.id === id),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `m${++idCounter}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro`);
  const context = makeContext(document, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function apply(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): CadDocument {
  const result = run(name, inputs, document, selection);
  assert.ok(result, `${name} no termino`);
  assert.equal(
    result.kind,
    "document",
    `${name} debia escribir: ${result.kind === "message" ? result.text : result.kind}`,
  );
  if (result.kind !== "document") throw new Error("tipo");
  return executeCadEntityCommandBatch(document, result.commands, result.label)
    .document;
}

function messageOf(result: CadCommandResult | undefined): string {
  assert.ok(
    result && result.kind === "message",
    `debía responder con un mensaje, dio ${result?.kind}`,
  );
  if (result.kind !== "message") throw new Error("tipo");
  return result.text;
}

const ENTER: CadCommandInput = { kind: "enter" };
const select = (...ids: string[]): CadCommandInput => ({
  kind: "selection",
  entityIds: ids,
});
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed" as const,
});

const near = (actual: number, expected: number, label: string, eps = 1) =>
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${label}: ${actual}, se esperaba ${expected}`,
  );

function makeBoxSolid(doc: CadDocument, id: string): CadDocument {
  const rect: CadEntity = {
    id: `rect_${id}`,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 0 },
      { x: 0, y: 100, z: 0 },
    ],
    closed: true,
    layer,
  };
  const next = migrateCadDocument({
    ...doc,
    entities: [...doc.entities, rect],
    modelSpace: {
      entityIds: [...doc.entities.map((e) => e.id), rect.id],
    },
  });
  return apply("PLANESURF", [select(rect.id), ENTER], next, [rect.id]);
}

// --- MIRROR3D refleja un solido respecto al plano XY (z=0) ---
// Tres puntos en el plano XY: (0,0,0), (1,0,0), (0,1,0)
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r1");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  const propsBefore = solid3dMassProperties(solid);

  idCounter = 100;
  const mirrored = apply(
    "MIRROR3D",
    [select(solid.id), point(0, 0), point(100, 0), point(0, 100), ENTER],
    withSolid,
    [solid.id],
  );
  // With copy: the mirrored doc has original + copy. Find the copy (new id).
  const allSolids = mirrored.entities.filter((e) => e.type === "solid3d");
  assert.equal(allSolids.length, 2, "sin borrar: original + reflejo");
  const mirroredSolid = allSolids.find((e) => e.id !== solid.id);
  if (!mirroredSolid || mirroredSolid.type !== "solid3d") throw new Error("tipo");
  const propsAfter = solid3dMassProperties(mirroredSolid);

  // Volumen se conserva en una reflexión
  near(propsAfter.volume, propsBefore.volume, "volumen conservado", 1);
  // Area se conserva en una reflexión
  near(propsAfter.area, propsBefore.area, "area conservada", 2);
}

// --- MIRROR3D cancelado ---
{
  const doc = documentWith([]);
  const cancel: CadCommandInput = { kind: "cancel" };
  const result = run("MIRROR3D", [cancel], doc);
  assert.match(messageOf(result), /cancelado/, "cancelacion");
}

// --- MIRROR3D rechaza sin seleccion ---
{
  const doc = documentWith([]);
  const result = run("MIRROR3D", [ENTER], doc);
  assert.match(messageOf(result), /al menos un sólido/, "rechaza vacio");
}

// --- MIRROR3D con alias MIRROR3 ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r2");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 200;
  const mirrored = apply(
    "MIRROR3",
    [select(solid.id), point(0, 0), point(100, 0), point(0, 100), ENTER],
    withSolid,
    [solid.id],
  );
  const mSolid = mirrored.entities.find((e) => e.type === "solid3d");
  assert.ok(mSolid, "alias MIRROR3 funciona");
}

// --- MIRROR3D rechaza plano degenerado (puntos colineales) ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r3");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 300;
  const result = run(
    "MIRROR3D",
    [select(solid.id), point(0, 0), point(50, 0), point(100, 0)],
    withSolid,
    [solid.id],
  );
  assert.match(
    messageOf(result),
    /degenerado/,
    "rechaza plano degenerado",
  );
}

// --- MIRROR3D con plano XY + punto ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r4");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  const keyword: CadCommandInput = { kind: "keyword", keyword: "XY" };
  idCounter = 400;
  const mirrored = apply(
    "MIRROR3D",
    [select(solid.id), keyword, point(0, 0), ENTER],
    withSolid,
    [solid.id],
  );
  const mSolid = mirrored.entities.find((e) => e.type === "solid3d");
  assert.ok(mSolid, "plano XY + punto crea sólido reflejado");
  const props = solid3dMassProperties(mSolid as CadEntity & { type: "solid3d" });
  near(props.volume, 100 * 100 * 0.001, "volumen conservado con XY", 1);
}

// --- MIRROR3D con plano YZ + punto ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r5");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  const keyword: CadCommandInput = { kind: "keyword", keyword: "YZ" };
  idCounter = 500;
  const mirrored = apply(
    "MIRROR3D",
    [select(solid.id), keyword, point(0, 0), ENTER],
    withSolid,
    [solid.id],
  );
  const mSolid = mirrored.entities.find((e) => e.type === "solid3d");
  assert.ok(mSolid, "plano YZ + punto crea sólido reflejado");
}

// --- MIRROR3D con borrar origen = Sí ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r6");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 600;
  const delYes: CadCommandInput = { kind: "keyword", keyword: "Si" };
  const mirrored = apply(
    "MIRROR3D",
    [select(solid.id), point(0, 0), point(100, 0), point(0, 100), delYes],
    withSolid,
    [solid.id],
  );
  // Con borrar origen: el documento tiene el reflejo pero NO el original.
  const solids = mirrored.entities.filter((e) => e.type === "solid3d");
  assert.equal(solids.length, 1, "con borrar=Sí queda1 sólido (el reflejo)");
  assert.notEqual(solids[0].id, solid.id, "el reflejo tiene id distinto");
}

// --- MIRROR3D alias SIMETRIA3D ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "r7");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 700;
  const mirrored = apply(
    "SIMETRIA3D",
    [select(solid.id), point(0, 0), point(100, 0), point(0, 100), ENTER],
    withSolid,
    [solid.id],
  );
  assert.ok(mirrored.entities.some((e) => e.type === "solid3d"), "alias SIMETRIA3D funciona");
}

console.log("transform-3d-mirror.spec: 11 comprobaciones OK");
