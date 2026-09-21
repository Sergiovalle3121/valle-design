/**
 * T12 · Estilo de cota vigente (DIMSTYLE).
 *
 * La variable de sistema DIMSTYLE se propaga a las cotas nuevas.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import type { CadDimensionEntity } from "../../associative-dimension";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => { assert.ok(condition, message); checks += 1; };
const eq = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });

function makeDoc(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities: [{ id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 3450, y: 0, z: 0 }, layer: "0" }],
    modelSpace: { entityIds: ["l1"] },
  });
}

function makeContext(document: CadDocument, dimstyle?: string): CadCommandContext {
  let ids = 0;
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (id) => document.entities.find((entity) => entity.id === id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `dim${++ids}`,
    ...(dimstyle !== undefined ? {
      variables: {
        get: (name: string) => name === "DIMSTYLE" ? dimstyle : undefined,
        set: () => ({ ok: true as const, value: "" }),
        publish: () => ({ ok: true as const, value: "" }),
      },
    } : {}),
  };
}

function drive(name: string, inputs: readonly CadCommandInput[], context: CadCommandContext): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} en registro`);
  let step = descriptor.begin(context);
  for (const input of inputs) { if (step.result) break; step = descriptor.step(step.state, input, context); }
  return step.result;
}

function dimensionOf(result: CadCommandResult | undefined): CadDimensionEntity | undefined {
  if (result?.kind !== "document") return undefined;
  const cmd = result.commands.find((c) => c.type === "insert" && c.entity.type === "dimension");
  return cmd?.type === "insert" ? (cmd.entity as CadDimensionEntity) : undefined;
}

// --- 0 · DIMLINEAR funciona sin variables (línea base) --------------------------------
{
  const doc = makeDoc();
  const c = makeContext(doc);
  const result = drive("DIMLINEAR", [point(0, 0), point(3450, 0), point(1725, 400)], c);
  const dim = dimensionOf(result);
  ok(dim !== undefined, "DIMLINEAR crea cota (baseline)");
}

// --- 1 · DIMLINEAR con DIMSTYLE="COTA 1:50" -------------------------------------------
{
  const doc = makeDoc();
  const c = makeContext(doc, "COTA 1:50");
  const result = drive("DIMLINEAR", [point(0, 0), point(3450, 0), point(1725, 400)], c);
  const dim = dimensionOf(result);
  ok(dim !== undefined, "DIMLINEAR con DIMSTYLE crea cota");
  if (dim) eq(dim.style, "COTA 1:50", "DIMLINEAR hereda DIMSTYLE='COTA 1:50'");
}

// --- 2 · DIMALIGNED con DIMSTYLE -------------------------------------------------------
{
  const doc = makeDoc();
  const c = makeContext(doc, "COTA 1:50");
  const result = drive("DIMALIGNED", [point(0, 0), point(1000, 1000), point(1500, 500)], c);
  const dim = dimensionOf(result);
  ok(dim !== undefined, "DIMALIGNED crea cota");
  if (dim) eq(dim.style, "COTA 1:50", "DIMALIGNED hereda DIMSTYLE");
}

// --- 3 · DIMSTYLE vacío → cota sin estilo ----------------------------------------------
{
  const doc = makeDoc();
  const c = makeContext(doc, "");
  const result = drive("DIMLINEAR", [point(0, 0), point(2000, 0), point(1000, 400)], c);
  const dim = dimensionOf(result);
  ok(dim !== undefined, "DIMLINEAR sin DIMSTYLE crea cota");
  if (dim) ok(!dim.style, "sin DIMSTYLE la cota no lleva estilo explícito");
}

console.log(`T12 estilo-de-cota-vigente: ${checks} comprobaciones verdes`);