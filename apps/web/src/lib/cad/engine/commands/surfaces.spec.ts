/**
 * PLANESURF — spec que conduce el comando contra el motor real.
 *
 * Verifica que PLANESURF crea un sólido B-rep válido (cerrado, área
 * positiva) a partir de una polilínea cerrada. Usa `finishedSolid`
 * para validar antes de escribir.
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

const layer = "SUPERFICIES";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [
      {
        id: layer,
        name: "Superficies",
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
    newEntityId: () => `surf${++idCounter}`,
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

/** Rectángulo cerrado como polilínea. */
function rectangle(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): CadEntity {
  return {
    id,
    type: "polyline",
    vertices: [
      { x, y, z: 0 },
      { x: x + w, y, z: 0 },
      { x: x + w, y: y + h, z: 0 },
      { x, y: y + h, z: 0 },
    ],
    closed: true,
    layer,
  };
}

const near = (actual: number, expected: number, label: string, eps = 0.1) =>
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${label}: ${actual}, se esperaba ${expected}`,
  );

// --- PLANESURF crea superficie real desde polilinea ---
{
  const rect = rectangle("r1", 0, 0, 400, 300);
  const document = documentWith([rect]);
  const next = apply("PLANESURF", [select("r1"), ENTER], document, ["r1"]);

  const solids = next.entities.filter((e) => e.type === "solid3d");
  assert.equal(solids.length, 1, "debe crear un solid3d");

  const solid = solids[0];
  if (solid.type !== "solid3d") throw new Error("tipo");
  assert.equal(solid.nodes.length, 1, "el arbol tiene un nodo");
  assert.equal(solid.nodes[0].op, "extrude", "el nodo es extrude");

  const props = solid3dMassProperties(solid);
  assert.ok(props.area > 0, "area positiva");
  // Area total = 2 caras (arriba + abajo) de 400*300 + caras laterales.
  near(props.area, 240_000, "area total de la superficie 400x300", 2);
  // Volumen = area_base * espesor = 120000 * 0.001 = 120.
  near(props.volume, 120, "volumen de la superficie delgada", 1);
}

// --- PLANESURF con triangulo ---
{
  const triangle: CadEntity = {
    id: "tri",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 50, y: 86.6, z: 0 },
    ],
    closed: true,
    layer,
  };
  const document = documentWith([triangle]);
  const next = apply("PLANESURF", [select("tri"), ENTER], document, ["tri"]);
  const solid = next.entities.find((e) => e.type === "solid3d");
  assert.ok(solid, "triangulo crea superficie");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  const props = solid3dMassProperties(solid);
  assert.ok(props.area > 0, "area del triangulo positiva");
  // Area total = 2 * (0.5 * 100 * 86.6) + laterales ≈ 8660
  near(props.area, 8_660, "area total del triangulo", 5);
}

// --- PLANESURF se niega sin entidades ---
{
  const document = documentWith([]);
  const result = run("PLANESURF", [ENTER], document);
  assert.match(
    messageOf(result),
    /al menos una entidad/,
    "rechaza sin seleccion",
  );
}

// --- PLANESURF cancelado ---
{
  const rect = rectangle("r2", 0, 0, 100, 100);
  const document = documentWith([rect]);
  const cancel: CadCommandInput = { kind: "cancel" };
  const result = run("PLANESURF", [cancel], document);
  assert.match(messageOf(result), /cancelado/, "cancelacion responde");
}

// --- PLANESURF con alias PLSURF ---
{
  const rect = rectangle("r3", 0, 0, 200, 200);
  const document = documentWith([rect]);
  const next = apply("PLSURF", [select("r3"), ENTER], document, ["r3"]);
  const solids = next.entities.filter((e) => e.type === "solid3d");
  assert.equal(solids.length, 1, "alias PLSURF crea superficie");
}

// --- PLANESURF rechaza entidad no soportada ---
{
  const line: CadEntity = {
    id: "ln1",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 100, y: 0, z: 0 },
    layer,
  };
  const document = documentWith([line]);
  const result = run("PLANESURF", [select("ln1"), ENTER], document, ["ln1"]);
  assert.match(
    messageOf(result),
    /requiere una polilinea/,
    "rechaza linea",
  );
}

// === CONVTOSURFACE ===

// --- CONVTOSURFACE informa propiedades de superficie de un solido ---
{
  const rect = rectangle("cs1", 0, 0, 400, 300);
  const document = documentWith([rect]);
  const withSolid = apply("PLANESURF", [select("cs1"), ENTER], document, [
    "cs1",
  ]);
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  assert.ok(solid, "debe existir un solido");
  if (solid?.type !== "solid3d") throw new Error("tipo");

  idCounter = 0;
  const result = run(
    "CONVTOSURFACE",
    [select(solid.id), ENTER],
    withSolid,
    [solid.id],
  );
  const msg = messageOf(result);
  assert.match(msg, /cara\(s\)/, "reporta caras");
  assert.match(msg, /area/, "reporta area");
  assert.match(msg, /volumen/, "reporta volumen");
  // El area debe ser positiva y consistente con PLANESURF
  const areaMatch = msg.match(/area ([\d.]+) mm/);
  assert.ok(areaMatch, "el mensaje contiene area numerica");
  assert.ok(parseFloat(areaMatch[1]) > 0, "area positiva");
}

// --- CONVTOSURFACE rechaza entidad que no es solido3d ---
{
  const rect = rectangle("cs2", 0, 0, 100, 100);
  const document = documentWith([rect]);
  const result = run("CONVTOSURFACE", [select("cs2"), ENTER], document, [
    "cs2",
  ]);
  assert.match(
    messageOf(result),
    /solo aplica a solidos 3D/,
    "rechaza polilinea",
  );
}

// --- CONVTOSURFACE cancelado ---
{
  const rect = rectangle("cs3", 0, 0, 200, 200);
  const document = documentWith([rect]);
  const cancel: CadCommandInput = { kind: "cancel" };
  const result = run("CONVTOSURFACE", [cancel], document);
  assert.match(messageOf(result), /cancelado/, "cancelacion");
}

// --- CONVTOSURFACE rechaza sin seleccion ---
{
  const document = documentWith([]);
  const result = run("CONVTOSURFACE", [ENTER], document);
  assert.match(messageOf(result), /al menos un solido/, "rechaza vacio");
}

// --- CONVTOSURFACE con alias CVTSURF ---
{
  const rect = rectangle("cs4", 0, 0, 200, 200);
  const document = documentWith([rect]);
  const withSolid = apply("PLANESURF", [select("cs4"), ENTER], document, [
    "cs4",
  ]);
  const solid = withSolid.entities.find((e) => e.type === "solid3d");
  if (solid?.type !== "solid3d") throw new Error("tipo");
  idCounter = 0;
  const result = run(
    "CVTSURF",
    [select(solid.id), ENTER],
    withSolid,
    [solid.id],
  );
  assert.match(
    messageOf(result),
    /cara\(s\)/,
    "alias CVTSURF funciona",
  );
}

console.log("surfaces.spec: 11 comprobaciones OK");