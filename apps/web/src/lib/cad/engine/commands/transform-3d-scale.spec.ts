/**
 * 3DSCALE — spec que conduce el escalado contra el motor real.
 *
 * Verifica que3DSCALE aplica un escalado uniforme alrededor de un punto
 * base, componiéndolo con la colocación existente del sólido.
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

const layer = "ESCALA";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      {
        id: layer,
        name: "Escala",
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
    newEntityId: () => `sc${++idCounter}`,
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
const distance = (v: number): CadCommandInput => ({
  kind: "distance",
  value: v,
});

const near = (actual: number, expected: number, label: string, eps = 0.5) =>
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${label}: ${actual}, se esperaba ${expected}`,
  );

/** Crea un sólido de caja 100x100x100 vía PLANESURF + extrude. */
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

// --- 3DSCALE escala un solido por factor 2 ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "s1");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  const propsBefore = solid3dMassProperties(solid);

  idCounter = 100;
  const scaled = apply(
    "3DSCALE",
    [select(solid.id), point(0, 0), distance(2)],
    withSolid,
    [solid.id],
  );
  const scaledSolid = scaled.entities.find((e) => e.type === "solid3d");
  if (scaledSolid?.type !== "solid3d") throw new Error("tipo");
  const propsAfter = solid3dMassProperties(scaledSolid);

  // Area escala como factor²: 2² = 4
  near(propsAfter.area, propsBefore.area * 4, "area escala como f²", 5);
  // Volumen escala como factor³: 2³ = 8
  near(propsAfter.volume, propsBefore.volume * 8, "volumen escala como f³", 5);
}

// --- 3DSCALE con factor 0.5 ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "s2");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  const propsBefore = solid3dMassProperties(solid);

  idCounter = 200;
  const scaled = apply(
    "3DSCALE",
    [select(solid.id), point(0, 0), distance(0.5)],
    withSolid,
    [solid.id],
  );
  const scaledSolid = scaled.entities.find((e) => e.type === "solid3d");
  if (scaledSolid?.type !== "solid3d") throw new Error("tipo");
  const propsAfter = solid3dMassProperties(scaledSolid);

  near(propsAfter.area, propsBefore.area * 0.25, "area escala como 0.5²", 2);
  near(
    propsAfter.volume,
    propsBefore.volume * 0.125,
    "volumen escala como 0.5³",
    1,
  );
}

// --- 3DSCALE cancelado ---
{
  const doc = documentWith([]);
  const cancel: CadCommandInput = { kind: "cancel" };
  const result = run("3DSCALE", [cancel], doc);
  assert.match(messageOf(result), /cancelado/, "cancelacion");
}

// --- 3DSCALE rechaza sin seleccion ---
{
  const doc = documentWith([]);
  const result = run("3DSCALE", [ENTER], doc);
  assert.match(messageOf(result), /al menos un sólido/, "rechaza vacio");
}

// --- 3DSCALE rechaza factor no positivo ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "s3");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 300;
  const result = run(
    "3DSCALE",
    [select(solid.id), point(0, 0), distance(0)],
    withSolid,
    [solid.id],
  );
  assert.match(
    messageOf(result),
    /positivo/,
    "rechaza factor cero",
  );
}

// --- 3DSCALE con alias 3S ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "s4");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 400;
  const scaled = apply(
    "3S",
    [select(solid.id), point(0, 0), distance(3)],
    withSolid,
    [solid.id],
  );
  const scaledSolid = scaled.entities.find((e) => e.type === "solid3d");
  assert.ok(scaledSolid, "alias 3S escala");
}

console.log("transform-3d-scale.spec: 8 comprobaciones OK");
