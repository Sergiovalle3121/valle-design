/**
 * Familia Mallas: MESH.
 *
 * MESH crea una primitiva de malla (caja) a partir de dos esquinas y una
 * altura. El spec comprueba que produce un sólido B-rep con geometría real:
 * vértices con coordenadas, caras planas, volumen positivo.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "MUROS";

function emptyDocument(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities: [],
    modelSpace: { entityIds: [] },
  });
}

let idCounter = 0;

function makeContext(document: CadDocument): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `mesh${++idCounter}`; },
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
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

// --- Registro: MESH existe ----------------------------------------------------
assert.ok(CAD_COMMAND_REGISTRY_V2.get("MESH"), "MESH está en el registro");

// --- MESH: caja de 200×150×100 ------------------------------------------------
{
  let doc = emptyDocument();
  const result = drive("MESH", [point(0, 0), point(200, 150), distance(100)], doc);
  assert.ok(result?.kind === "document", "MESH produce documento");
  assert.ok(result.commands.length > 0, "MESH genera comandos de inserción");

  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const solids = doc.entities.filter((e) => e.type === "solid3d");
  assert.ok(solids.length === 1, "MESH añade un sólido 3D");

  const body = solid3dBody(solids[0] as never);
  assert.ok(body.vertices.length >= 8, `MESH: ${body.vertices.length} vértices (≥8)`);
  assert.ok(body.faces.length >= 6, `MESH: ${body.faces.length} caras (≥6)`);

  const props = solid3dMassProperties(solids[0] as never);
  assert.ok(props.volume > 0, `MESH: volumen positivo (${props.volume.toFixed(1)})`);
  assert.ok(props.area > 0, `MESH: área positiva (${props.area.toFixed(1)})`);
}

// --- MESH: cancelación --------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("MESH")!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "MESH se cancela limpiamente",
  );
}

// --- MESH: altura cero se rechaza ---------------------------------------------
{
  const doc = emptyDocument();
  const result = drive("MESH", [point(0, 0), point(100, 100), distance(0)], doc);
  assert.ok(
    result?.kind === "message" && result.text.includes("no puede ser cero"),
    `MESH rechaza altura cero: ${result?.kind === "message" ? result.text : ""}`,
  );
}

// --- MESH: esquinas iguales se rechazan ---------------------------------------
{
  const doc = emptyDocument();
  const result = drive("MESH", [point(50, 50), point(50, 50), distance(100)], doc);
  assert.ok(
    result?.kind === "message" && result.text.includes("misma posicion"),
    `MESH rechaza esquinas iguales: ${result?.kind === "message" ? result.text : ""}`,
  );
}

// --- CONVTOMESH: convertir sólido a malla ------------------------------------
{
  assert.ok(CAD_COMMAND_REGISTRY_V2.get("CONVTOMESH"), "CONVTOMESH está en el registro");

  let doc = emptyDocument();
  const boxResult = drive("BOX", [point(0, 0), point(100, 100), distance(50)], doc);
  assert.ok(boxResult?.kind === "document", "BOX produce documento");
  doc = executeCadEntityCommandBatch(doc, boxResult.commands, boxResult.label).document;
  const solidId = doc.entities.find((e) => e.type === "solid3d")?.id;
  assert.ok(solidId, "Hay un sólido");

  const originalBody = solid3dBody(doc.entities.find((e) => e.id === solidId!) as never);
  const originalVolume = solid3dMassProperties(doc.entities.find((e) => e.id === solidId!) as never).volume;

  const cvtResult = drive("CONVTOMESH", [{ kind: "entityPick", entityId: solidId!, point: { x: 50, y: 50 } }, enter], doc);
  assert.ok(cvtResult?.kind === "document", "CONVTOMESH produce documento");

  doc = executeCadEntityCommandBatch(doc, cvtResult.commands, cvtResult.label).document;
  const meshes = doc.entities.filter((e) => e.type === "solid3d" && e.id !== solidId);
  assert.ok(meshes.length >= 1, "CONVTOMESH añade una entidad");

  const meshBody = solid3dBody(meshes[meshes.length - 1] as never);
  const meshVolume = solid3dMassProperties(meshes[meshes.length - 1] as never).volume;
  assert.ok(
    Math.abs(meshVolume - originalVolume) / originalVolume < 0.01,
    `CONVTOMESH: volumen preservado (${meshVolume.toFixed(1)} ≈ ${originalVolume.toFixed(1)})`,
  );
  assert.ok(
    meshBody.faces.length === originalBody.faces.length,
    `CONVTOMESH: caras preservadas (${meshBody.faces.length})`,
  );
}

// --- CONVTOMESH: cancelación -------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("CONVTOMESH")!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "CONVTOMESH se cancela limpiamente",
  );
}

// --- CONVTOSOLID: convertir malla a sólido -----------------------------------
{
  assert.ok(CAD_COMMAND_REGISTRY_V2.get("CONVTOSOLID"), "CONVTOSOLID está en el registro");

  let doc = emptyDocument();
  const meshResult = drive("MESH", [point(0, 0), point(200, 150), distance(100)], doc);
  assert.ok(meshResult?.kind === "document", "MESH produce documento");
  doc = executeCadEntityCommandBatch(doc, meshResult.commands, meshResult.label).document;
  const meshId = doc.entities.find((e) => e.type === "solid3d")?.id;
  assert.ok(meshId, "Hay una malla");

  const meshBody = solid3dBody(doc.entities.find((e) => e.id === meshId!) as never);
  const meshVolume = solid3dMassProperties(doc.entities.find((e) => e.id === meshId!) as never).volume;

  const solResult = drive("CONVTOSOLID", [{ kind: "entityPick", entityId: meshId!, point: { x: 100, y: 75 } }, enter], doc);
  assert.ok(solResult?.kind === "document", "CONVTOSOLID produce documento");

  doc = executeCadEntityCommandBatch(doc, solResult.commands, solResult.label).document;
  const solids = doc.entities.filter((e) => e.type === "solid3d" && e.id !== meshId);
  assert.ok(solids.length >= 1, "CONVTOSOLID añade una entidad");

  const solBody = solid3dBody(solids[solids.length - 1] as never);
  const solVolume = solid3dMassProperties(solids[solids.length - 1] as never).volume;
  assert.ok(
    Math.abs(solVolume - meshVolume) / meshVolume < 0.01,
    `CONVTOSOLID: volumen preservado (${solVolume.toFixed(1)} ≈ ${meshVolume.toFixed(1)})`,
  );
  assert.ok(
    solBody.faces.length === meshBody.faces.length,
    `CONVTOSOLID: caras preservadas (${solBody.faces.length})`,
  );
}

// --- CONVTOSOLID: cancelación ------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("CONVTOSOLID")!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "CONVTOSOLID se cancela limpiamente",
  );
}

// --- 3DFACE: registro -----------------------------------------------------------
assert.ok(CAD_COMMAND_REGISTRY_V2.get("3DFACE"), "3DFACE está en el registro");

// --- 3DFACE: triángulo (3 puntos + Intro) --------------------------------------
{
  let doc = emptyDocument();
  const result = drive("3DFACE", [point(0, 0), point(100, 0), point(50, 80), enter], doc);
  assert.ok(result?.kind === "document", "3DFACE triángulo produce documento");
  assert.ok(result.commands.length > 0, "3DFACE genera comandos de inserción");

  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const solids = doc.entities.filter((e) => e.type === "solid3d");
  assert.ok(solids.length === 1, "3DFACE triángulo añade un sólido 3D");

  const body = solid3dBody(solids[0] as never);
  assert.ok(body.vertices.length >= 3, `3DFACE triángulo: ${body.vertices.length} vértices (≥3)`);

  const props = solid3dMassProperties(solids[0] as never);
  assert.ok(props.volume > 0, `3DFACE triángulo: volumen positivo (${props.volume.toFixed(6)})`);
  assert.ok(props.area > 0, `3DFACE triángulo: área positiva (${props.area.toFixed(1)})`);
}

// --- 3DFACE: cuadrilátero (4 puntos) -------------------------------------------
{
  let doc = emptyDocument();
  const result = drive("3DFACE", [point(0, 0), point(100, 0), point(100, 80), point(0, 80)], doc);
  assert.ok(result?.kind === "document", "3DFACE cuadrilátero produce documento");

  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const solids = doc.entities.filter((e) => e.type === "solid3d");
  assert.ok(solids.length === 1, "3DFACE cuadrilátero añade un sólido 3D");

  const body = solid3dBody(solids[0] as never);
  assert.ok(body.vertices.length >= 4, `3DFACE cuadrilátero: ${body.vertices.length} vértices (≥4)`);

  const props = solid3dMassProperties(solids[0] as never);
  assert.ok(props.volume > 0, `3DFACE cuadrilátero: volumen positivo (${props.volume.toFixed(6)})`);
}

// --- 3DFACE: cancelación -------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("3DFACE")!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "3DFACE se cancela limpiamente",
  );
}

// --- 3DFACE: puntos colineales se rechazan -------------------------------------
{
  const doc = emptyDocument();
  const result = drive("3DFACE", [point(0, 0), point(50, 0), point(100, 0), enter], doc);
  assert.ok(
    result?.kind === "message" && result.text.includes("colineales"),
    `3DFACE rechaza colineales: ${result?.kind === "message" ? result.text : ""}`,
  );
}

console.log(
  "✅ meshes.spec: MESH (10) + CONVTOMESH (7) + CONVTOSOLID (7) + 3DFACE (8) — 32 comprobaciones",
);
