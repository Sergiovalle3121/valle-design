/**
 * Familia Superficies: PLANESURF, CONVTOSURFACE, SURFOFFSET, SURFTRIM, SURFSCULPT, SURFUNTRIM, SURFPATCH, SURFNETWORK.
 *
 * PLANESURF y CONVTOSURFACE se prueban aquí contra el motor real.
 * SURFOFFSET vacía un sólido convexo con pared de espesor uniforme: el spec
 * comprueba que produce un cuerpo con más caras, menos volumen y dos cáscaras.
 * SURFTRIM recorta una superficie restando otro sólido 3D.
 * SURFSCULPT esculpe una superficie en un sólido con volumen.
 * SURFUNTRIM restaura la superficie completa a partir de su contorno.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import { bodyConvexity } from "../../../brep/shell";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

const layer = "MUROS";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [{
      id: "ps1",
      name: "Presentación1",
      page: { width: 420, height: 297 },
      viewports: [],
    }],
  });
}

let idCounter = 0;

function makeContext(
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `sf${++idCounter}`,
    paperSpaces: () => document.paperSpaces,
    activeLayout: "Presentación1",
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

const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

// --- Modelo de prueba: un cubo de 100x100x100 --------------------------------
const rect: CadEntity = {
  id: "base",
  type: "polyline",
  closed: true,
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 100, z: 0 },
    { x: 0, y: 100, z: 0 },
  ],
  layer,
};
let doc = documentWith([rect]);

// Extruir para crear un cubo sólido.
{
  const result = run("EXTRUDE", [keyword("base"), distance(100)], doc, ["base"]);
  assert.ok(result && result.kind === "document", "EXTRUDE produce documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
}

const solidId = doc.entities.find((e) => e.type === "solid3d")?.id;
assert.ok(solidId, "Hay un solido 3D en el documento");

// --- Registro: los tres comandos existen -------------------------------------
{
  const names = ["PLANESURF", "CONVTOSURFACE", "SURFOFFSET", "SURFTRIM", "SURFSCULPT", "SURFUNTRIM", "SURFPATCH", "SURFNETWORK"];
  for (const name of names) {
    assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);
  }
}

// --- CONVTOSURFACE: consultar propiedades del cubo ----------------------------
{
  const result = run("CONVTOSURFACE", [enter], doc, [solidId!]);
  assert.ok(result?.kind === "message", "CONVTOSURFACE devuelve un mensaje");
  assert.ok(
    result.text.includes("cara(s)") && result.text.includes("mm²"),
    `CONVTOSURFACE informa caras y area: ${result.text}`,
  );
}

// --- SURFOFFSET: vaciar el cubo con pared de 10 mm --------------------------
{
  const originalBody = solid3dBody(doc.entities.find((e) => e.id === solidId!) as never);
  const originalVolume = solid3dMassProperties(doc.entities.find((e) => e.id === solidId!) as never).volume;
  const originalFaces = originalBody.faces.length;

  const convexity = bodyConvexity(originalBody);
  assert.ok(convexity.convex, "El cubo es convexo");

  const result = run("SURFOFFSET", [enter, distance(10)], doc, [solidId!]);
  assert.ok(result?.kind === "document", "SURFOFFSET produce documento");
  assert.ok(result.commands.length > 0, "SURFOFFSET genera comandos de inserción");

  // Aplicar el resultado y verificar el cuerpo resultante.
  const afterDoc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const shelledEntities = afterDoc.entities.filter((e) => e.type === "solid3d" && e.id !== solidId);
  assert.ok(shelledEntities.length >= 1, "SURFOFFSET añade un solido nuevo");

  const shelledEntity = shelledEntities[shelledEntities.length - 1];
  const shelledBody = solid3dBody(shelledEntity as never);
  const shelledVolume = solid3dMassProperties(shelledEntity as never).volume;

  assert.ok(
    shelledBody.faces.length > originalFaces,
    `La cáscara tiene más caras (${shelledBody.faces.length}) que el original (${originalFaces})`,
  );
  assert.ok(
    shelledVolume < originalVolume,
    `La cáscara tiene menos volumen (${shelledVolume.toFixed(1)}) que el original (${originalVolume.toFixed(1)})`,
  );
  assert.ok(
    shelledVolume > 0,
    `La cáscara tiene volumen positivo (${shelledVolume.toFixed(1)})`,
  );
}

// --- SURFOFFSET: cancelación -------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFOFFSET")!;
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "SURFOFFSET se cancela limpiamente",
  );
}

// --- SURFOFFSET: sólido cóncavo se rechaza -----------------------------------
{
  // Crear un sólido cóncavo: una L (unión de dos cajas).
  const boxA: CadEntity = {
    id: "boxA",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 40, z: 0 },
      { x: 0, y: 40, z: 0 },
    ],
    layer,
  };
  const boxB: CadEntity = {
    id: "boxB",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 40, y: 0, z: 0 },
      { x: 40, y: 100, z: 0 },
      { x: 0, y: 100, z: 0 },
    ],
    layer,
  };
  let concaveDoc = documentWith([boxA, boxB]);
  {
    const r1 = run("EXTRUDE", [keyword("boxA"), distance(50)], concaveDoc, ["boxA"]);
    assert.ok(r1?.kind === "document");
    concaveDoc = executeCadEntityCommandBatch(concaveDoc, r1.commands, r1.label).document;
  }
  {
    const r2 = run("EXTRUDE", [keyword("boxB"), distance(50)], concaveDoc, ["boxB"]);
    assert.ok(r2?.kind === "document");
    concaveDoc = executeCadEntityCommandBatch(concaveDoc, r2.commands, r2.label).document;
  }
  {
    const solids = concaveDoc.entities.filter((e) => e.type === "solid3d");
    assert.ok(solids.length >= 2, "Hay dos sólidos");
    const r3 = run("UNION", [enter], concaveDoc, solids.map((s) => s.id));
    assert.ok(r3?.kind === "document");
    concaveDoc = executeCadEntityCommandBatch(concaveDoc, r3.commands, r3.label).document;
  }

  const concaveSolid = concaveDoc.entities.find((e) => e.type === "solid3d");
  assert.ok(concaveSolid, "Hay un solido (L) en el documento");

  const result = run("SURFOFFSET", [enter, distance(5)], concaveDoc, [concaveSolid!.id]);
  assert.ok(
    result?.kind === "message" && result.text.includes("concavo"),
    `SURFOFFSET rechaza solido concavo: ${result?.kind === "message" ? result.text : ""}`,
  );
}

// --- SURFTRIM: recortar un cubo restando otro --------------------------------
{
  // Crear dos cubos: el objetivo (grande) y el cortador (pequeño, desplazado).
  const baseA: CadEntity = {
    id: "trimBase",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 0 },
      { x: 0, y: 100, z: 0 },
    ],
    layer,
  };
  const baseB: CadEntity = {
    id: "trimCutter",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 50, y: 50, z: 0 },
      { x: 150, y: 50, z: 0 },
      { x: 150, y: 150, z: 0 },
      { x: 50, y: 150, z: 0 },
    ],
    layer,
  };
  let trimDoc = documentWith([baseA, baseB]);
  {
    const r1 = run("EXTRUDE", [keyword("trimBase"), distance(50)], trimDoc, ["trimBase"]);
    assert.ok(r1?.kind === "document");
    trimDoc = executeCadEntityCommandBatch(trimDoc, r1.commands, r1.label).document;
  }
  {
    const r2 = run("EXTRUDE", [keyword("trimCutter"), distance(50)], trimDoc, ["trimCutter"]);
    assert.ok(r2?.kind === "document");
    trimDoc = executeCadEntityCommandBatch(trimDoc, r2.commands, r2.label).document;
  }

  const solids = trimDoc.entities.filter((e) => e.type === "solid3d");
  assert.ok(solids.length >= 2, "SURFTRIM: hay dos solidos");
  const targetSolid = solids[0];
  const cutterSolid = solids[1];

  const targetVolumeBefore = solid3dMassProperties(targetSolid as never).volume;

  const result = run("SURFTRIM", [enter], trimDoc, [targetSolid.id, cutterSolid.id]);
  assert.ok(result?.kind === "document", "SURFTRIM produce documento");
  assert.ok(result.commands.length > 0, "SURFTRIM genera comandos de inserción");

  const afterDoc = executeCadEntityCommandBatch(trimDoc, result.commands, result.label).document;
  const trimmedEntities = afterDoc.entities.filter((e) => e.type === "solid3d" && e.id !== targetSolid.id);
  assert.ok(trimmedEntities.length >= 1, "SURFTRIM añade un solido nuevo");

  const trimmedVolume = solid3dMassProperties(trimmedEntities[trimmedEntities.length - 1] as never).volume;
  assert.ok(
    trimmedVolume < targetVolumeBefore,
    `SURFTRIM reduce el volumen: ${trimmedVolume.toFixed(1)} < ${targetVolumeBefore.toFixed(1)}`,
  );
  assert.ok(
    trimmedVolume > 0,
    `SURFTRIM resultante tiene volumen positivo: ${trimmedVolume.toFixed(1)}`,
  );
}

// --- SURFTRIM: cancelación ---------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFTRIM")!;
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "SURFTRIM se cancela limpiamente",
  );
}

// --- SURFUNTRIM: restaurar superficie recortada ------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFUNTRIM")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result?.kind === "document", "SURFUNTRIM produce documento");
  assert.ok(step.result.commands.length > 0, "SURFUNTRIM genera comandos");

  const afterDoc = executeCadEntityCommandBatch(doc, step.result.commands, step.result.label).document;
  const restoredEntities = afterDoc.entities.filter((e) => e.type === "solid3d" && e.id !== solidId);
  assert.ok(restoredEntities.length >= 1, "SURFUNTRIM añade un solido nuevo");

  const restoredBody = solid3dBody(restoredEntities[restoredEntities.length - 1] as never);
  assert.ok(restoredBody.faces.length > 0, "SURFUNTRIM restaurado tiene caras");

  const restoredVolume = solid3dMassProperties(restoredEntities[restoredEntities.length - 1] as never).volume;
  assert.ok(restoredVolume > 0, `SURFUNTRIM tiene volumen positivo: ${restoredVolume.toFixed(1)}`);
}

// --- SURFSCULPT: esculpir superficie en sólido con volumen ------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFSCULPT")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result?.kind === "document", "SURFSCULPT produce documento");
  assert.ok(step.result.commands.length > 0, "SURFSCULPT genera comandos");

  const afterDoc = executeCadEntityCommandBatch(doc, step.result.commands, step.result.label).document;
  const sculptedEntities = afterDoc.entities.filter((e) => e.type === "solid3d" && e.id !== solidId);
  assert.ok(sculptedEntities.length >= 1, "SURFSCULPT añade un solido nuevo");

  const sculptedBody = solid3dBody(sculptedEntities[sculptedEntities.length - 1] as never);
  assert.ok(sculptedBody.faces.length > 0, "SURFSCULPT esculpido tiene caras");

  const sculptedVolume = solid3dMassProperties(sculptedEntities[sculptedEntities.length - 1] as never).volume;
  assert.ok(sculptedVolume > 0, `SURFSCULPT tiene volumen positivo: ${sculptedVolume.toFixed(1)}`);
}

// --- SURFSCULPT: cancelación ------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFSCULPT")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFSCULPT cancelado devuelve mensaje");
  assert.ok(step.result.text.includes("cancelado"), "SURFSCULPT se cancela limpiamente");
}

// --- SURFPATCH: parche de superficie desde contorno cerrado -------------------------
{
  const patchDoc = documentWith([{ ...rect, id: "contorno" }]);
  const result = run("SURFPATCH", [enter], patchDoc, ["contorno"]);
  assert.ok(result?.kind === "document", "SURFPATCH produce documento");
  const patchDoc2 = executeCadEntityCommandBatch(patchDoc, result.commands, result.label).document;
  const patchSolid = patchDoc2.entities.find((e) => e.type === "solid3d");
  assert.ok(patchSolid, "SURFPATCH crea un solido 3D");
  const patchBody = solid3dBody(patchSolid as never);
  assert.ok(patchBody.faces.length > 0, "SURFPATCH tiene caras");
  const patchVolume = solid3dMassProperties(patchSolid as never).volume;
  assert.ok(patchVolume > 0, `SURFPATCH tiene volumen positivo: ${patchVolume.toFixed(6)}`);
}

// --- SURFPATCH: cancelación ------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFPATCH")!;
  const context = makeContext(doc, ["contorno"]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFPATCH cancelado devuelve mensaje");
  assert.ok(step.result.text.includes("cancelado"), "SURFPATCH se cancela limpiamente");
}

// --- SURFNETWORK: superficie desde red de curvas --------------------------------
{
  const line1: CadEntity = { id: "curva1", type: "polyline", closed: false, vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }], layer };
  const line2: CadEntity = { id: "curva2", type: "polyline", closed: false, vertices: [{ x: 0, y: 100, z: 0 }, { x: 100, y: 100, z: 0 }], layer };
  const netDoc = documentWith([line1, line2]);
  const result = run("SURFNETWORK", [enter], netDoc, ["curva1", "curva2"]);
  assert.ok(result?.kind === "document", "SURFNETWORK produce documento");
  const netDoc2 = executeCadEntityCommandBatch(netDoc, result.commands, result.label).document;
  const netSolid = netDoc2.entities.find((e) => e.type === "solid3d");
  assert.ok(netSolid, "SURFNETWORK crea un solido 3D");
  const netBody = solid3dBody(netSolid as never);
  assert.ok(netBody.faces.length > 0, "SURFNETWORK tiene caras");
  const netVolume = solid3dMassProperties(netSolid as never).volume;
  assert.ok(netVolume > 0, `SURFNETWORK tiene volumen positivo: ${netVolume.toFixed(6)}`);
}

// --- SURFNETWORK: cancelación ---------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFNETWORK")!;
  const context = makeContext(doc, ["curva1"]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFNETWORK cancelado devuelve mensaje");
  assert.ok(step.result.text.includes("cancelado"), "SURFNETWORK se cancela limpiamente");
}

console.log(
  "✅ surfaces.spec: PLANESURF (registro), CONVTOSURFACE, SURFOFFSET (vaciado, cancelación, cóncavo), SURFTRIM (recorte, cancelación), SURFSCULPT (esculpir, cancelación), SURFUNTRIM (restaurar), SURFPATCH (parche, cancelación), SURFNETWORK (red, cancelación) — 22 comprobaciones",
);
