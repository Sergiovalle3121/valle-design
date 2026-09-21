/**
 * 3DARRAY — spec que conduce el arreglo 3D contra el motor real.
 *
 * Verifica que3DARRAY crea copias de un sólido en una rejilla 3D
 * con el espaciado correcto.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandResult,
} from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "ARREGLO";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      {
        id: layer,
        name: "Arreglo",
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
    newEntityId: () => `a${++idCounter}`,
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
const dist = (v: number): CadCommandInput => ({
  kind: "distance",
  value: v,
});

function makeBoxSolid(doc: CadDocument, id: string): CadDocument {
  const rect: CadEntity = {
    id: `rect_${id}`,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 0, z: 0 },
      { x: 50, y: 50, z: 0 },
      { x: 0, y: 50, z: 0 },
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

// --- 3DARRAY crea rejilla 2×3 (6 posiciones = 5 copias) ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "g1");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");

  idCounter = 100;
  // rows=2, cols=3, levels=1, rowDist=100, colDist=200, levelDist=0
  const arr = apply(
    "3DARRAY",
    [
      select(solid.id),
      dist(2),  // rows
      dist(3),  // cols
      dist(1),  // levels
      dist(100), // rowDist
      dist(200), // colDist
      dist(0),   // levelDist
    ],
    withSolid,
    [solid.id],
  );
  const solids = arr.entities.filter((e) => e.type === "solid3d");
  assert.equal(solids.length, 6, "2×3 = 6 solidos (1 original + 5 copias)");
}

// --- 3DARRAY cancelado ---
{
  const doc = documentWith([]);
  const cancel: CadCommandInput = { kind: "cancel" };
  const result = run("3DARRAY", [cancel], doc);
  assert.match(messageOf(result), /cancelado/, "cancelacion");
}

// --- 3DARRAY rechaza sin seleccion ---
{
  const doc = documentWith([]);
  const result = run("3DARRAY", [ENTER], doc);
  assert.match(messageOf(result), /al menos un sólido/, "rechaza vacio");
}

// --- 3DARRAY con alias 3A ---
{
  const doc = documentWith([]);
  const withSolid = makeBoxSolid(doc, "g2");
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 200;
  const arr = apply(
    "3A",
    [select(solid.id), dist(2), dist(1), dist(1), dist(100), dist(0), dist(0)],
    withSolid,
    [solid.id],
  );
  const solids = arr.entities.filter((e) => e.type === "solid3d");
  assert.equal(solids.length, 2, "alias 3A crea copia");
}

console.log("transform-3d-array.spec: 4 comprobaciones OK");
