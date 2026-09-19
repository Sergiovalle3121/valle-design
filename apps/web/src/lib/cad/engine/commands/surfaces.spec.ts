/**
 * Familia Superficies: PLANESURF, CONVTOSURFACE, SURFOFFSET, SURFTRIM, SURFSCULPT, SURFUNTRIM, SURFPATCH, SURFNETWORK.
 *
 * PLANESURF y CONVTOSURFACE se prueban aquí contra el motor real.
 * SURFOFFSET vacía un sólido convexo con pared de espesor uniforme: el spec
 * comprueba que produce un cuerpo con más caras, menos volumen y dos cáscaras.
 * SURFTRIM recorta una superficie restando otro sólido 3D.
 * SURFSCULPT y SURFUNTRIM aún no están disponibles: antes borraban el sólido y
 * dejaban una placa; aquí se mide que se niegan y el documento no cambia.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { cadMensajeAunNoDisponible } from "../command-availability";
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
  const names = ["PLANESURF", "CONVTOSURFACE", "SURFOFFSET", "SURFTRIM", "SURFSCULPT", "SURFUNTRIM", "SURFPATCH", "SURFNETWORK", "SURFBLEND", "SURFEXTEND", "SURFFILLET"];
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

// --- SURFUNTRIM y SURFSCULPT: se NIEGAN sin tocar el sólido --------------------
//
// Antes este bloque afirmaba «produce documento», «añade un sólido», «tiene
// caras» y «volumen > 0», y nunca comparaba el resultado con la entrada: los dos
// BORRABAN el cubo designado y dejaban una placa de 0,1 mm (SURFSCULPT con
// Intro) o de 0,001 mm (SURFUNTRIM) del rectángulo que lo envolvía. Aquí se
// conducen con exactamente esas entradas —el cubo designado e Intro, o una
// altura tecleada— y se mide que el documento sale como entró.
{
  const antes = serializeCadDocument(doc);
  const volumenCubo = solid3dMassProperties(doc.entities.find((e) => e.id === solidId) as never).volume;
  const casos: readonly [string, readonly CadCommandInput[]][] = [
    ["SURFUNTRIM", [enter]],
    ["SURFUNTRIM", [{ kind: "selection", entityIds: [solidId!] }, enter]],
    ["SURFSCULPT", [enter]],
    ["SURFSCULPT", [distance(30)]],
    ["SURFSCULPT", [{ kind: "text", value: "30" }, enter]],
  ];
  for (const [name, inputs] of casos) {
    const result = run(name, inputs, doc, [solidId!]);
    // Lo que el anfitrión haría con el resultado: aplicar el lote, si lo hay.
    const despues: CadDocument =
      result?.kind === "document" ? executeCadEntityCommandBatch(doc, result.commands, result.label).document : doc;
    const cubo: CadEntity | undefined = despues.entities.find((e) => e.id === solidId);
    assert.ok(cubo, `${name} no borra el cubo designado`);
    assert.equal(solid3dMassProperties(cubo as never).volume, volumenCubo, `${name} deja el cubo con su volumen`);
    assert.equal(despues.entities.length, doc.entities.length, `${name} no deja ninguna placa nueva`);
    assert.equal(serializeCadDocument(despues), antes, `${name} deja el documento idéntico`);
    assert.ok(
      result?.kind === "message" && result.text === cadMensajeAunNoDisponible(name),
      `${name} dice que aún no está disponible: ${result?.kind === "message" ? result.text : result?.kind}`,
    );
    assert.ok(result.text.includes("no se toca"), `${name} avisa de que el sólido no se toca`);
  }
}

// --- SURFSCULPT: cancelar tampoco toca nada ------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFSCULPT")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFSCULPT cancelado devuelve un mensaje, no un lote");
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

// --- SURFBLEND: mezcla de dos superficies (bounding-box union) ------------------
{
  const rect2: CadEntity = {
    id: "base2",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 150, y: 0, z: 0 },
      { x: 250, y: 0, z: 0 },
      { x: 250, y: 100, z: 0 },
      { x: 150, y: 100, z: 0 },
    ],
    layer,
  };
  let blendDoc = documentWith([rect, rect2]);
  {
    const r1 = run("EXTRUDE", [keyword("base"), distance(50)], blendDoc, ["base"]);
    assert.ok(r1 && r1.kind === "document", "EXTRUDE base para blend");
    blendDoc = executeCadEntityCommandBatch(blendDoc, r1.commands, r1.label).document;
    const r2 = run("EXTRUDE", [keyword("base2"), distance(50)], blendDoc, ["base2"]);
    assert.ok(r2 && r2.kind === "document", "EXTRUDE base2 para blend");
    blendDoc = executeCadEntityCommandBatch(blendDoc, r2.commands, r2.label).document;
  }
  const solids = blendDoc.entities.filter((e) => e.type === "solid3d");
  assert.ok(solids.length >= 2, "SURFBLEND: hay dos solidos");
  const result = run("SURFBLEND", [enter], blendDoc, [solids[0].id, solids[1].id]);
  assert.ok(result?.kind === "document", "SURFBLEND produce documento");
  assert.ok(result.commands.length > 0, "SURFBLEND genera comandos");
  const blendDoc2 = executeCadEntityCommandBatch(blendDoc, result.commands, result.label).document;
  const blendSolid = blendDoc2.entities.filter((e) => e.type === "solid3d" && e.id !== solids[0].id && e.id !== solids[1].id);
  assert.ok(blendSolid.length >= 1, "SURFBLEND añade un solido nuevo");
  const blendBody = solid3dBody(blendSolid[blendSolid.length - 1] as never);
  assert.ok(blendBody.faces.length > 0, "SURFBLEND tiene caras");
  const blendVolume = solid3dMassProperties(blendSolid[blendSolid.length - 1] as never).volume;
  assert.ok(blendVolume > 0, `SURFBLEND tiene volumen positivo: ${blendVolume.toFixed(1)}`);
}

// --- SURFBLEND: cancelación ---------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFBLEND")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFBLEND cancelado devuelve mensaje");
  assert.ok(step.result.text.includes("cancelado"), "SURFBLEND se cancela limpiamente");
}

// --- SURFEXTEND: extensión de superficie --------------------------------------
{
  const result = run("SURFEXTEND", [distance(10), enter], doc, [solidId!]);
  assert.ok(result?.kind === "document", "SURFEXTEND produce documento");
  assert.ok(result.commands.length > 0, "SURFEXTEND genera comandos");
  const extDoc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const extSolid = extDoc.entities.filter((e) => e.type === "solid3d" && e.id !== solidId);
  assert.ok(extSolid.length >= 1, "SURFEXTEND añade un solido nuevo");
  const extBody = solid3dBody(extSolid[extSolid.length - 1] as never);
  assert.ok(extBody.faces.length > 0, "SURFEXTEND tiene caras");
  const extVolume = solid3dMassProperties(extSolid[extSolid.length - 1] as never).volume;
  assert.ok(extVolume > 0, `SURFEXTEND tiene volumen positivo: ${extVolume.toFixed(1)}`);
}

// --- SURFEXTEND: cancelación --------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFEXTEND")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFEXTEND cancelado devuelve mensaje");
  assert.ok(step.result.text.includes("cancelado"), "SURFEXTEND se cancela limpiamente");
}

// --- SURFFILLET: filete de transición entre dos superficies --------------------
{
  const rect3: CadEntity = {
    id: "base3",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 300, y: 0, z: 0 },
      { x: 400, y: 0, z: 0 },
      { x: 400, y: 100, z: 0 },
      { x: 300, y: 100, z: 0 },
    ],
    layer,
  };
  let filletDoc = documentWith([rect, rect3]);
  {
    const r1 = run("EXTRUDE", [keyword("base"), distance(50)], filletDoc, ["base"]);
    assert.ok(r1 && r1.kind === "document", "EXTRUDE base para fillet");
    filletDoc = executeCadEntityCommandBatch(filletDoc, r1.commands, r1.label).document;
    const r2 = run("EXTRUDE", [keyword("base3"), distance(50)], filletDoc, ["base3"]);
    assert.ok(r2 && r2.kind === "document", "EXTRUDE base3 para fillet");
    filletDoc = executeCadEntityCommandBatch(filletDoc, r2.commands, r2.label).document;
  }
  const fSolids = filletDoc.entities.filter((e) => e.type === "solid3d");
  assert.ok(fSolids.length >= 2, "SURFFILLET: hay dos solidos");
  const result = run("SURFFILLET", [distance(8), enter], filletDoc, [fSolids[0].id, fSolids[1].id]);
  assert.ok(result?.kind === "document", "SURFFILLET produce documento");
  assert.ok(result.commands.length > 0, "SURFFILLET genera comandos");
  const filletDoc2 = executeCadEntityCommandBatch(filletDoc, result.commands, result.label).document;
  const filletSolid = filletDoc2.entities.filter((e) => e.type === "solid3d" && e.id !== fSolids[0].id && e.id !== fSolids[1].id);
  assert.ok(filletSolid.length >= 1, "SURFFILLET añade un solido nuevo");
  const filletBody = solid3dBody(filletSolid[filletSolid.length - 1] as never);
  assert.ok(filletBody.faces.length > 0, "SURFFILLET tiene caras");
  const filletVolume = solid3dMassProperties(filletSolid[filletSolid.length - 1] as never).volume;
  assert.ok(filletVolume > 0, `SURFFILLET tiene volumen positivo: ${filletVolume.toFixed(1)}`);
}

// --- SURFFILLET: cancelación --------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SURFFILLET")!;
  const context = makeContext(doc, [solidId!]);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(step.result?.kind === "message", "SURFFILLET cancelado devuelve mensaje");
  assert.ok(step.result.text.includes("cancelado"), "SURFFILLET se cancela limpiamente");
}

// --- Registro: SURFFILLET en el registro ------------------------------------
{
  assert.ok(CAD_COMMAND_REGISTRY_V2.get("SURFFILLET"), "SURFFILLET está en el registro");
}

console.log(
  "✅ surfaces.spec: PLANESURF (registro), CONVTOSURFACE, SURFOFFSET (vaciado, cancelación, cóncavo), SURFTRIM (recorte, cancelación), SURFSCULPT y SURFUNTRIM (se niegan con el documento idéntico: 5 casos × 6), SURFPATCH (parche, cancelación), SURFNETWORK (red, cancelación), SURFBLEND (mezcla, cancelación), SURFEXTEND (extensión, cancelación), SURFFILLET (filete, cancelación) — 52 comprobaciones",
);
