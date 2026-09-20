/**
 * MESHSPLIT — ejecuta la orden real por el motor de comandos y mide: cara de
 * más, vértices de más, volumen EXACTAMENTE igual (partir una cara no mueve
 * nada, sólo añade topología). El caso de negación honesta también se mide:
 * el documento sale igual que entró.
 */
import { strict as assert } from "node:assert";
import { cadFaceRefFromBody } from "../../pick3d/solid-face-ref";
import { migrateCadDocument, serializeCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { BrepBody } from "../../../brep";
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

function drive(name: string, inputs: readonly CadCommandInput[], document: CadDocument): CadCommandResult | undefined {
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

function buildMeshBox(): { doc: CadDocument; meshId: string } {
  let doc = emptyDocument();
  const result = drive("MESH", [point(0, 0), point(100, 100), distance(50)], doc);
  if (result?.kind !== "document") throw new Error("MESH no produjo documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const meshId = doc.entities.find((e) => e.type === "solid3d")?.id;
  assert.ok(meshId, "hay una malla");
  return { doc, meshId: meshId! };
}

function topFaceIndex(body: BrepBody): number {
  for (let face = 0; face < body.faces.length; face++) {
    if (cadFaceRefFromBody(body as never, face).plane.nz > 0.9) return face;
  }
  return -1;
}

assert.ok(CAD_COMMAND_REGISTRY_V2.get("MESHSPLIT"), "MESHSPLIT está en el registro");

// --- Cuerda entre los puntos medios de dos aristas opuestas de la cara de
//     arriba: una cara de más, dos vértices de más, MISMO volumen -----------
{
  const { doc, meshId } = buildMeshBox();
  const body = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const top = topFaceIndex(body);
  assert.ok(top >= 0, "hay una cara hacia arriba");
  const face = cadFaceRefFromBody(body as never, top);
  const originalVolume = solid3dMassProperties(doc.entities.find((e) => e.id === meshId) as never).volume;

  const result = drive(
    "MESHSPLIT",
    [
      { kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } },
      { kind: "facePick", entityId: meshId, face, point: { x: 50, y: 0, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
      { kind: "facePick", entityId: meshId, face, point: { x: 50, y: 100, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
    ],
    doc,
  );
  assert.ok(result?.kind === "document", `MESHSPLIT produce documento: ${result?.kind === "message" ? result.text : ""}`);
  if (result?.kind !== "document") throw new Error("sin documento");
  const after = executeCadEntityCommandBatch(doc, result.commands, result.label).document;

  assert.ok(
    !after.entities.some((e) => e.id === meshId),
    "MESHSPLIT BORRA la malla de origen — si no, quedarían dos sólidos ocupando el mismo volumen",
  );
  const meshes = after.entities.filter((e) => e.type === "solid3d");
  assert.equal(meshes.length, 1, "MESHSPLIT deja UNA sola malla en el documento, no un duplicado fantasma");

  const splitBody = solid3dBody(meshes[0] as never);
  assert.equal(splitBody.faces.length, 7, `una cara de más: 6 → 7 (${splitBody.faces.length})`);
  assert.equal(splitBody.vertices.length, 10, `dos vértices de más: 8 → 10 (${splitBody.vertices.length})`);

  const splitVolume = solid3dMassProperties(meshes[0] as never).volume;
  assert.ok(Math.abs(splitVolume - originalVolume) < 1e-6, `partir una cara NO cambia el volumen (${originalVolume} ≈ ${splitVolume})`);
}

// --- El segundo punto en OTRA cara: se niega, documento intacto -------------
{
  const { doc, meshId } = buildMeshBox();
  const body = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const top = topFaceIndex(body);
  const topFace = cadFaceRefFromBody(body as never, top);
  const otherIndex = top === 0 ? 1 : 0;
  const otherFace = cadFaceRefFromBody(body as never, otherIndex);

  const antes = serializeCadDocument(doc);
  const result = drive(
    "MESHSPLIT",
    [
      { kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } },
      { kind: "facePick", entityId: meshId, face: topFace, point: { x: 50, y: 0, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
      { kind: "facePick", entityId: meshId, face: otherFace, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } },
    ],
    doc,
  );
  assert.ok(
    result?.kind === "message" && result.text.includes("MISMA cara"),
    `el segundo punto en otra cara se niega: ${result?.kind === "message" ? result.text : result?.kind}`,
  );
  assert.equal(serializeCadDocument(doc), antes, "el documento no cambió");
}

// --- Los dos puntos en la MISMA arista: se niega con el motivo del núcleo ---
{
  const { doc, meshId } = buildMeshBox();
  const body = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const top = topFaceIndex(body);
  const face = cadFaceRefFromBody(body as never, top);

  const result = drive(
    "MESHSPLIT",
    [
      { kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } },
      { kind: "facePick", entityId: meshId, face, point: { x: 20, y: 0, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
      { kind: "facePick", entityId: meshId, face, point: { x: 80, y: 0, z: 50 }, normal: { x: 0, y: 0, z: 1 } },
    ],
    doc,
  );
  assert.ok(
    result?.kind === "message" && result.text.includes("misma arista"),
    `los dos puntos en la misma arista se niegan con el motivo del núcleo: ${result?.kind === "message" ? result.text : result?.kind}`,
  );
}

// --- Cancelación -------------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("MESHSPLIT")!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "MESHSPLIT se cancela limpiamente",
  );
}

console.log(
  "✅ mesh-split.spec: registro (1) + cuerda entre aristas opuestas (4) + otra cara se niega (2) + " +
    "misma arista se niega (1) + cancelación (1) — 9 comprobaciones",
);
