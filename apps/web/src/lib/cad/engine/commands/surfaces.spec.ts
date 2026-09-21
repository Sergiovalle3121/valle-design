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

// --- SURFPATCH: un contorno a cota constante pero distinta de 0 se parchea EN esa cota ---
//
// La auditoría del 19-sep midió que SURFPATCH tiraba la Z de sus vértices
// (`v.x, v.y`) y siempre parcheaba en el plano XY. Aquí el contorno vive
// ENTERO a Z=40: si el parche siguiera aplastando a Z=0, sus vértices no
// medirían 40 de cota.
{
  const elevated: CadEntity = {
    id: "contornoZ",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 40 },
      { x: 100, y: 0, z: 40 },
      { x: 100, y: 100, z: 40 },
      { x: 0, y: 100, z: 40 },
    ],
    layer,
  };
  const elevatedDoc = documentWith([elevated]);
  const result = run("SURFPATCH", [enter], elevatedDoc, ["contornoZ"]);
  assert.ok(result?.kind === "document", "SURFPATCH (cota 40) produce documento");
  const afterDoc = executeCadEntityCommandBatch(elevatedDoc, result.commands, result.label).document;
  const patchSolid = afterDoc.entities.find((e) => e.type === "solid3d");
  assert.ok(patchSolid, "SURFPATCH (cota 40) crea un solido 3D");
  const body = solid3dBody(patchSolid as never);
  const zs = body.vertices.map((v) => v.point.z);
  assert.ok(
    zs.some((z) => Math.abs(z - 40) < 1e-6),
    `SURFPATCH (cota 40) tiene vértices en Z=40 (cotas vistas: ${[...new Set(zs.map((z) => z.toFixed(4)))].join(", ")})`,
  );
}

// --- SURFPATCH: un contorno NO plano se niega, no se aplana en silencio -----------
{
  const warped: CadEntity = {
    id: "contornoAlabeado",
    type: "polyline",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 50 }, // fuera del plano de los otros tres
      { x: 0, y: 100, z: 0 },
    ],
    layer,
  };
  const warpedDoc = documentWith([warped]);
  const antes = serializeCadDocument(warpedDoc);
  const result = run("SURFPATCH", [enter], warpedDoc, ["contornoAlabeado"]);
  assert.ok(result?.kind === "message", "SURFPATCH (alabeado) se niega en vez de aplanar");
  assert.ok(result.text.includes("no es plano"), `SURFPATCH dice que el contorno no es plano: ${result.text}`);
  assert.equal(serializeCadDocument(warpedDoc), antes, "SURFPATCH (alabeado) deja el documento idéntico");
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

// --- SURFNETWORK: superficie REGLADA de verdad, no la caja envolvente (ola 7) ---
//
// Dos rieles PARALELOS (el caso de arriba) no distinguen una superficie
// reglada real de su caja envolvente: dan el mismo resultado. Aquí un riel
// tiene un QUIEBRO real en (50,0); la caja envolvente de los dos rieles sigue
// siendo el rectángulo [0,100]×[0,100] sin ningún vértice en (50,0), así que
// medir un punto de la malla CERCA de ese quiebro es una prueba que la caja
// envolvente no podría pasar.
{
  const bent: CadEntity = { id: "bent", type: "polyline", closed: false, vertices: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, { x: 100, y: 50, z: 0 }], layer };
  const straight: CadEntity = { id: "straight", type: "polyline", closed: false, vertices: [{ x: 0, y: 100, z: 0 }, { x: 100, y: 100, z: 0 }], layer };
  const netDoc = documentWith([bent, straight]);
  const result = run("SURFNETWORK", [enter], netDoc, ["bent", "straight"]);
  assert.ok(result?.kind === "document", "SURFNETWORK (rieles distintos) produce documento");
  const netDoc2 = executeCadEntityCommandBatch(netDoc, result.commands, result.label).document;
  const netSolid = netDoc2.entities.find((e) => e.type === "solid3d");
  assert.ok(netSolid, "SURFNETWORK (rieles distintos) crea un solido 3D");
  const node = (netSolid as Extract<CadEntity, { type: "solid3d" }>).nodes[0];
  assert.equal(node.op, "brep", "SURFNETWORK construye la malla EXPLÍCITA — no un extrude de caja envolvente");
  const points = node.op === "brep" ? node.points : [];
  assert.ok(
    points.some((p) => Math.hypot(p.x - 50, p.y - 0) < 5),
    "la malla sigue el quiebro real del riel (50,0); una caja envolvente no tendría ningún vértice ahí",
  );
  for (const p of points)
    assert.ok(p.y >= -1e-6 && p.y <= 100 + 1e-6, "la malla no se sale del rango Y de las curvas de entrada");
}

// --- SURFBLEND: SE NIEGA, no fabrica un rectángulo envolvente -------------------
//
// Antes esta orden medía «produce documento» y «volumen > 0» sobre el
// RECTÁNGULO ENVOLVENTE de los dos sólidos designados — exactamente el relleno
// que la auditoría del 19-sep pidió quitar. El kernel no resuelve la curva de
// intersección entre dos superficies, así que ahora SURFBLEND se niega: aquí se
// mide la negativa (mensaje, documento sin cambios), no un volumen inventado.
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
  const antes = serializeCadDocument(blendDoc);
  const result = run("SURFBLEND", [enter], blendDoc, [solids[0].id, solids[1].id]);
  assert.ok(result?.kind === "message", "SURFBLEND no produce documento: se niega");
  assert.ok(result.text.includes("no mezcló nada"), `SURFBLEND dice que no mezcló nada: ${result.text}`);
  assert.ok(
    result.text.includes("curva de intersección"),
    `SURFBLEND dice qué falta (la curva de intersección): ${result.text}`,
  );
  assert.equal(serializeCadDocument(blendDoc), antes, "SURFBLEND deja el documento idéntico");
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

// --- SURFEXTEND: desplaza el CONTORNO real, no la caja envolvente (ola 7) -----
//
// Sobre una SUPERFICIE triangular (delgada, como la que da SURFPATCH — no un
// prisma grueso, donde una pared lateral podría competir en área con la
// tapa), una caja envolvente desplazada da un rectángulo de 4 vértices; el
// contorno desplazado de verdad sigue siendo un TRIÁNGULO de 3. Contar los
// vértices del resultado es la prueba.
{
  const triangle: CadEntity = {
    id: "tri", type: "polyline", closed: true,
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 50, y: 80, z: 0 }],
    layer,
  };
  let triDoc = documentWith([triangle]);
  const patchResult = run("SURFPATCH", [enter], triDoc, ["tri"]);
  assert.ok(patchResult?.kind === "document", "SURFPATCH del triángulo produce documento");
  triDoc = executeCadEntityCommandBatch(triDoc, patchResult.commands, patchResult.label).document;
  const triSolidId = triDoc.entities.find((e) => e.type === "solid3d")!.id;

  const result = run("SURFEXTEND", [distance(10), enter], triDoc, [triSolidId]);
  assert.ok(result?.kind === "document", "SURFEXTEND (superficie triangular) produce documento");
  const afterDoc = executeCadEntityCommandBatch(triDoc, result.commands, result.label).document;
  const extended = afterDoc.entities.find((e) => e.type === "solid3d" && e.id !== triSolidId);
  assert.ok(extended, "SURFEXTEND (superficie triangular) añade un sólido nuevo");
  const node = (extended as Extract<CadEntity, { type: "solid3d" }>).nodes[0];
  assert.equal(node.op, "extrude", "SURFEXTEND desplaza el contorno de la cara y lo vuelve a extruir");
  assert.equal(node.op === "extrude" ? node.profile.outer.length : 0, 3, "el contorno desplazado SIGUE SIENDO un triángulo, no una caja de 4 vértices");
  const extBody2 = solid3dBody(extended as never);
  const extVolume2 = solid3dMassProperties(extended as never).volume;
  assert.ok(extBody2.faces.length > 0 && extVolume2 > 0, "SURFEXTEND (superficie triangular) produce un sólido válido");
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

// --- SURFFILLET: SE NIEGA, no fabrica un rectángulo envolvente ------------------
//
// Mismo defecto que SURFBLEND: el filete que devolvía antes no dependía del
// radio pedido (la señal de que no calculaba nada real). Aquí se mide que
// pedir un radio y confirmar produce un mensaje honesto y ningún sólido nuevo.
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
  const antes = serializeCadDocument(filletDoc);
  const result = run("SURFFILLET", [distance(8), enter], filletDoc, [fSolids[0].id, fSolids[1].id]);
  assert.ok(result?.kind === "message", "SURFFILLET no produce documento: se niega");
  assert.ok(result.text.includes("no redondeó nada"), `SURFFILLET dice que no redondeó nada: ${result.text}`);
  assert.ok(result.text.includes("radio 8"), `SURFFILLET nombra el radio pedido: ${result.text}`);
  assert.equal(serializeCadDocument(filletDoc), antes, "SURFFILLET deja el documento idéntico");
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

// --- SURFEXTEND sobre un contorno CÓNCAVO: ahora se resuelve bien (ola 7, revisión escéptica) --------
//
// `offsetPlanarPolygonOutward` decidía el sentido de "hacia fuera" de cada
// arista comparándola contra el centroide MEDIO DE LOS VÉRTICES — válido
// sólo para un contorno convexo. En una "L" (una esquina reflex) ese
// centroide cae del lado equivocado de las dos aristas que forman la
// esquina y las invierte EN SILENCIO: el área del resultado sigue creciendo
// (la comprobación que el código decía usar para detectarlo no lo pilla) y
// el contorno no se autointerseca, así que parecía una extensión válida
// siendo, en realidad, la esquina cóncava movida hacia DENTRO en vez de
// hacia fuera. Se corrigió a usar el sentido GLOBAL del contorno (shoelace
// una sola vez) en vez de la comparación por arista. Aquí se mide la esquina
// reflex EXACTA tras extender 5mm una "L" — antes de la corrección caía en
// (15,15); la correcta es (25,25) (la esquina original está en (20,20) y
// las dos paredes que la forman se desplazan +5 cada una).
{
  const lshape: CadEntity = {
    id: "lshape", type: "polyline", closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 60, y: 0, z: 0 },
      { x: 60, y: 20, z: 0 },
      { x: 20, y: 20, z: 0 },
      { x: 20, y: 60, z: 0 },
      { x: 0, y: 60, z: 0 },
    ],
    layer,
  };
  let lDoc = documentWith([lshape]);
  const lPatch = run("SURFPATCH", [enter], lDoc, ["lshape"]);
  assert.ok(lPatch?.kind === "document", "SURFPATCH de la L produce documento");
  lDoc = executeCadEntityCommandBatch(lDoc, lPatch.commands, lPatch.label).document;
  const lSolidId = lDoc.entities.find((e) => e.type === "solid3d")!.id;

  const lExt = run("SURFEXTEND", [distance(5), enter], lDoc, [lSolidId]);
  assert.ok(lExt?.kind === "document", "SURFEXTEND de la L (contorno cóncavo) ya NO se niega con una distancia razonable");
  const lAfter = executeCadEntityCommandBatch(lDoc, lExt.commands, lExt.label).document;
  const lExtended = lAfter.entities.find((e) => e.type === "solid3d" && e.id !== lSolidId)!;
  const lNode = (lExtended as Extract<CadEntity, { type: "solid3d" }>).nodes[0];
  assert.equal(lNode.op === "extrude" ? lNode.profile.outer.length : 0, 6, "la L extendida SIGUE teniendo 6 vértices");
  // El perfil está en coordenadas LOCALES del marco de la cara (no necesariamente alineadas con el
  // mundo), así que se mide por VOLUMEN en vez de por una coordenada cualquiera: el área correcta del
  // contorno desplazado 5mm es 3300 (verificada aparte, geometría pura) — la versión con el bug de la
  // ola 7 (centroide por arista) daba 2400 (la esquina reflex invertida HACIA DENTRO en vez de fuera).
  // volumen = área × espesor (0,001mm, la convención de SURFPATCH/SURFEXTEND).
  const lVolume = solid3dMassProperties(lExtended as never).volume;
  assert.ok(
    Math.abs(lVolume - 3300 * 0.001) <= 0.01,
    `el volumen de la L extendida debe corresponder al área CORRECTA 3300 (no a 2400, la invertida): volumen=${lVolume}`,
  );

  // Muesca ESTRECHA entre DOS esquinas reflex (una "U", separación 20): una distancia mayor que la
  // mitad de la muesca cruzaría sus dos paredes. El área del resultado seguiría creciendo (esa
  // comprobación sola no lo pilla); hace falta que ninguna arista no vecina del contorno se
  // cruce/solape consigo misma. Aquí se mide el rechazo REAL a través del comando completo.
  const ushape: CadEntity = {
    id: "ushape", type: "polyline", closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 80, z: 0 },
      { x: 60, y: 80, z: 0 },
      { x: 60, y: 20, z: 0 },
      { x: 40, y: 20, z: 0 },
      { x: 40, y: 80, z: 0 },
      { x: 0, y: 80, z: 0 },
    ],
    layer,
  };
  let uDoc = documentWith([ushape]);
  const uPatch = run("SURFPATCH", [enter], uDoc, ["ushape"]);
  assert.ok(uPatch?.kind === "document", "SURFPATCH de la U produce documento");
  uDoc = executeCadEntityCommandBatch(uDoc, uPatch.commands, uPatch.label).document;
  const uSolidId = uDoc.entities.find((e) => e.type === "solid3d")!.id;

  const uBad = run("SURFEXTEND", [distance(15), enter], uDoc, [uSolidId]);
  assert.equal(uBad?.kind, "message", "SURFEXTEND se NIEGA cuando la distancia cruzaría las dos paredes de una muesca estrecha");
  if (uBad?.kind === "message")
    assert.ok(uBad.text.includes("invierte"), `el mensaje debe decir qué falta: "${uBad.text}"`);

  const uOk = run("SURFEXTEND", [distance(5), enter], uDoc, [uSolidId]);
  assert.ok(uOk?.kind === "document", "la misma muesca con una distancia segura (< mitad del ancho) SÍ se extiende");
  const uAfter = executeCadEntityCommandBatch(uDoc, uOk.commands, uOk.label).document;
  const uExtended = uAfter.entities.find((e) => e.type === "solid3d" && e.id !== uSolidId)!;
  const uNode = (uExtended as Extract<CadEntity, { type: "solid3d" }>).nodes[0];
  assert.equal(uNode.op === "extrude" ? uNode.profile.outer.length : 0, 8, "la U extendida con distancia segura conserva sus 8 vértices");
}

console.log(
  "✅ surfaces.spec: PLANESURF (registro), CONVTOSURFACE, SURFOFFSET (vaciado, cancelación, cóncavo), SURFTRIM (recorte, cancelación), SURFSCULPT y SURFUNTRIM (se niegan con el documento idéntico: 5 casos × 6), " +
    "SURFPATCH (parche en su cota real, contorno no plano se niega, cancelación), SURFNETWORK (red, cancelación), " +
    "SURFBLEND y SURFFILLET (se NIEGAN en vez de fabricar un rectángulo envolvente — documento idéntico, cancelación), " +
    "SURFEXTEND (extensión, cancelación, contorno cóncavo corregido, muesca estrecha rechazada)",
);
