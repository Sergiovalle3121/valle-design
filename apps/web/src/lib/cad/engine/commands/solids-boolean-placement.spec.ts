/**
 * 3D-03: UNION, SUBTRACT e INTERSECT respetan la colocación de cada operando.
 *
 * Antes de este arreglo, la booleana sólo aplicaba la colocación del primer
 * operando; los demás se evaluaban en el origen. El resultado era plausible
 * pero incorrecto: un agujero que debía estar en x=500 aparecía en x=0.
 *
 * Correr: npx tsx src/lib/cad/engine/commands/solids-boolean-placement.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import {
  clearSolidCache,
  solid3dBody,
  solid3dMassProperties,
} from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "MUROS";
let idCounter = 0;

function box(
  id: string,
  w: number,
  d: number,
  h: number,
  placement?: CadSolid3dEntity["placement"],
): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    nodes: [
      {
        id: "perfil",
        op: "extrude",
        profile: {
          outer: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: d },
            { x: 0, y: d },
          ],
        },
        height: h,
      },
    ],
    root: "perfil",
    layer,
    ...(placement ? { placement } : {}),
  };
}

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(document: CadDocument, selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `s${++idCounter}`,
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
  assert.ok(result, `${name} no terminó`);
  assert.equal(result.kind, "document", `${name} debía escribir, dio ${result.kind === "message" ? result.text : result.kind}`);
  if (result.kind !== "document") throw new Error("tipo");
  return executeCadEntityCommandBatch(document, result.commands, result.label).document;
}

function soleSolid(document: CadDocument) {
  const solids = document.entities.filter((entity) => entity.type === "solid3d");
  assert.equal(solids.length, 1, `se esperaba UN sólido y hay ${solids.length}`);
  const solid = solids[0];
  if (solid.type !== "solid3d") throw new Error("tipo");
  return solid;
}

const ENTER: CadCommandInput = { kind: "enter" };
const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });

const near = (actual: number, expected: number, what: string, epsilon = 1e-3) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) throw new Error(`FAIL: ${label} ${detail}`);
  process.stderr.write(`  ✓ ${label}\n`);
}

// ==========================================================================
// 1. SUBTRACT: caja A (1000³) en el origen menos caja B (200³) desplazada
//    (500, 0, 300) por colocación afín. El hueco debe quedar en
//    x=500..700, z=300..500.
// ==========================================================================
{
  clearSolidCache();
  idCounter = 0;
  // A: 1000×1000×1000 en el origen.
  const solidA = box("a", 1000, 1000, 1000);
  // B: 200×200×200 desplazada a (500, 0, 300).
  const solidB = box("b", 200, 200, 200, {
    a: 1, b: 0, c: 0, d: 1,
    e: 500, f: 0, dz: 300,
  });

  let document = documentWith([solidA, solidB]);
  document = apply("SUBTRACT", [select("a", "b"), ENTER], document, ["a", "b"]);
  const result = soleSolid(document);
  const body = solid3dBody(result);
  const mass = solid3dMassProperties(result);

  // Volumen: 1000³ − 200³ = 1 000 000 000 − 8 000 000 = 992 000 000 mm³.
  near(mass.volume, 1_000_000_000 - 8_000_000, "SUBTRACT: volumen = A − B");

  // Los vértices del hueco deben estar en x ∈ [500, 700] y z ∈ [300, 500].
  // Sin el arreglo, el hueco queda en el origen (x∈[0,200], z∈[0,200]).
  const xs = body.vertices.map((v) => v.point.x);
  const zs = body.vertices.map((v) => v.point.z);
  const hasHoleX = xs.some((x) => x >= 499 && x <= 701);
  const hasHoleZ = zs.some((z) => z >= 299 && z <= 501);
  check("SUBTRACT: hueco en x ∈ [500, 700]", hasHoleX,
    `rango X=[${Math.min(...xs).toFixed(0)}, ${Math.max(...xs).toFixed(0)}]`);
  check("SUBTRACT: hueco en z ∈ [300, 500]", hasHoleZ,
    `rango Z=[${Math.min(...zs).toFixed(0)}, ${Math.max(...zs).toFixed(0)}]`);
}

// ==========================================================================
// 2. UNION de dos cajas SIN colocación: conserva subárboles (editabilidad).
// ==========================================================================
{
  clearSolidCache();
  idCounter = 100;
  // Dos cajas en distinto lugar, sin colocación: los subárboles deben sobrevivir.
  const solidC = box("c", 100, 100, 50);
  const solidD: CadSolid3dEntity = {
    id: "d", type: "solid3d",
    nodes: [{ id: "perfil", op: "extrude", profile: { outer: [{x:200,y:0},{x:300,y:0},{x:300,y:100},{x:200,y:100}] }, height: 50 }],
    root: "perfil", layer,
  };

  let document = documentWith([solidC, solidD]);
  document = apply("UNION", [select("c", "d"), ENTER], document, ["c", "d"]);
  const result = soleSolid(document);

  // Sin colocaciones conflictivas, los subárboles deben sobrevivir.
  const hasExtrudeNodes = result.nodes.filter((n) => n.op === "extrude").length;
  check("UNION: conserva nodos extrude (≥2)", hasExtrudeNodes >= 2,
    `nodos extrude=${hasExtrudeNodes}`);
  check("UNION: tiene nodo union", result.nodes.some((n) => n.op === "union"));

  const mass = solid3dMassProperties(result);
  near(mass.volume, 1_000_000, "UNION: volumen = 2 × 100×100×50");
}

// ==========================================================================
// 3. INTERSECT con operando desplazado. Dos cajas que se solapan: la
//    intersección debe tener el volumen esperado.
// ==========================================================================
{
  clearSolidCache();
  idCounter = 200;
  // Caja A: 200³ en el origen.
  const solidE = box("e", 200, 200, 200);
  // Caja B: 100³ desplazada a (50, 50, 50). Se solapa en [50,150]³ → volumen 100³.
  const solidF = box("f", 100, 100, 100, {
    a: 1, b: 0, c: 0, d: 1,
    e: 50, f: 50, dz: 50,
  });

  let document = documentWith([solidE, solidF]);
  document = apply("INTERSECT", [select("e", "f"), ENTER], document, ["e", "f"]);
  const result = soleSolid(document);
  const mass = solid3dMassProperties(result);

  // La intersección de dos cajas que se solapan en [50,150]³ da volumen 100³.
  near(mass.volume, 1_000_000, "INTERSECT: volumen de la zona de solape");
}

// ==========================================================================
console.error(`\n${checks} comprobaciones — boolean-placement: TODAS VERDES`);
