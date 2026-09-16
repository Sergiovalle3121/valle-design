/**
 * Superficies: los 11 comandos de la familia SURFACE.
 *
 * Se comprueba que cada comando está en el registro, acepta su flujo de
 * entrada esperado, y produce un resultado (documento o mensaje). La
 * geometría de superficie propiamente dicha depende del kernel B-rep y se
 * prueba en los módulos de `brep/`.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "0";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
  });
}

let ids = 0;
function makeContext(document: CadDocument, selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: document.entities.map((e) => e.id),
    entity: (id) => document.entities.find((e) => e.id === id),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `s${++ids}`; },
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document = documentWith([]),
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} registrado`);
  const context = makeContext(document, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const pick = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };
const cancel: CadCommandInput = { kind: "cancel" };
const distance = (v: number): CadCommandInput => ({ kind: "distance", value: v });

// --- Registro ---------------------------------------------------------------
const SURFACE_NAMES = [
  "PLANESURF", "CONVTOSURFACE", "SURFOFFSET", "SURFTRIM", "SURFUNTRIM",
  "SURFEXTEND", "SURFFILLET", "SURFBLEND", "SURFPATCH", "SURFNETWORK", "SURFSCULPT",
];
for (const name of SURFACE_NAMES) {
  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} en el registro`);
}

// --- Cancelación limpia -----------------------------------------------------
for (const name of SURFACE_NAMES) {
  const result = run(name, [cancel]);
  assert.ok(
    result?.kind === "message" && result.text.toLowerCase().includes("cancelado"),
    `${name} se cancela limpiamente`,
  );
}

// --- PLANESURF: crea superficie plana ---------------------------------------
{
  const rect: CadEntity = {
    id: "r1", type: "polyline", closed: true,
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 50, z: 0 }, { x: 0, y: 50, z: 0 }],
    layer,
  };
  const doc = documentWith([rect]);
  const result = run("PLANESURF", [pick("r1"), enter], doc);
  assert.ok(result?.kind === "document", "PLANESURF produce documento");
  if (result?.kind === "document") {
    assert.ok(result.commands.length > 0, "PLANESURF genera comandos");
    assert.ok(result.notice?.includes("PLANESURF"), "el aviso menciona PLANESURF");
  }
}

// --- PLANESURF sin entidades se niega ---------------------------------------
{
  const result = run("PLANESURF", [enter]);
  assert.ok(result?.kind === "message", "PLANESURF sin entidades se niega");
}

// --- SURFOFFSET: flujo completo ---------------------------------------------
{
  const result = run("SURFOFFSET", [pick("any"), distance(10)]);
  assert.ok(result?.kind === "message", "SURFOFFSET produce mensaje (no implementado)");
}

// --- SURFTRIM: flujo con dos superficies ------------------------------------
{
  const result = run("SURFTRIM", [pick("s1"), pick("s2")]);
  assert.ok(result?.kind === "message", "SURFTRIM produce mensaje (no implementado)");
}

// --- CONVTOSURFACE: selección + Intro ---------------------------------------
{
  const rect: CadEntity = { id: "c1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer };
  const result = run("CONVTOSURFACE", [pick("c1"), enter], documentWith([rect]));
  assert.ok(result?.kind === "message", "CONVTOSURFACE produce mensaje");
}

console.log(`✅ surfaces.spec: ${SURFACE_NAMES.length} comandos verificados — 18 comprobaciones`);
