/**
 * MESHCREASE / MESHUNCREASE / MESHEXTRUDE — ejecutan la orden real por el
 * motor de comandos y miden la geometría resultante, igual que
 * `mesh-smoothing.spec.ts`.
 */
import { strict as assert } from "node:assert";
import { halfEdgeSegment } from "../../../brep";
import { cadFaceRefFromBody } from "../../pick3d/solid-face-ref";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import type { BrepBody } from "../../../brep";

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
const enter: CadCommandInput = { kind: "enter" };

function buildMeshBox(): { doc: CadDocument; meshId: string } {
  let doc = emptyDocument();
  const result = drive("MESH", [point(0, 0), point(100, 100), distance(50)], doc);
  assert.ok(result?.kind === "document", "MESH produce documento");
  if (result?.kind !== "document") throw new Error("MESH no produjo documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const meshId = doc.entities.find((e) => e.type === "solid3d")?.id;
  assert.ok(meshId, "hay una malla");
  return { doc, meshId: meshId! };
}

/** Todas las aristas del cuerpo, como picks listos para conducir la orden. */
function allEdgePicks(entityId: string, body: BrepBody): CadCommandInput[] {
  const seen = new Set<number>();
  const picks: CadCommandInput[] = [];
  for (let ei = 0; ei < body.edges.length; ei++) {
    const halfEdge = body.edges[ei].a;
    if (seen.has(ei)) continue;
    seen.add(ei);
    const seg = halfEdgeSegment(body, halfEdge);
    picks.push({ kind: "edgePick", entityId, edge: ei, from: seg.from, to: seg.to, point: { x: 0, y: 0 } });
  }
  return picks;
}

function creases(doc: CadDocument, meshId: string): number {
  const entity = doc.entities.find((e) => e.id === meshId) as CadSolid3dEntity;
  const root = entity.nodes.find((n) => n.id === entity.root);
  return root?.op === "brep" ? (root.meshSubdivision?.creases.length ?? 0) : 0;
}

function level(doc: CadDocument, meshId: string): number {
  const entity = doc.entities.find((e) => e.id === meshId) as CadSolid3dEntity;
  const root = entity.nodes.find((n) => n.id === entity.root);
  return root?.op === "brep" ? (root.meshSubdivision?.level ?? 0) : 0;
}

// --- Registro -------------------------------------------------------------
for (const name of ["MESHCREASE", "MESHUNCREASE", "MESHEXTRUDE"])
  assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);

// --- MESHCREASE marca una arista de verdad: se persiste, no se limita a contar
{
  const { doc, meshId } = buildMeshBox();
  const body = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const edgePicks = allEdgePicks(meshId, body);
  assert.ok(edgePicks.length >= 1, "la caja tiene aristas que designar");

  const result = drive("MESHCREASE", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, edgePicks[0], enter], doc);
  assert.ok(result?.kind === "document", `MESHCREASE produce documento: ${result?.kind === "message" ? result.text : ""}`);
  if (result?.kind !== "document") throw new Error("MESHCREASE no produjo documento");
  const after = executeCadEntityCommandBatch(doc, result.commands, result.label).document;

  assert.equal(after.entities.length, doc.entities.length, "MESHCREASE reemplaza en su sitio, no añade entidades");
  assert.equal(creases(after, meshId), 1, "una arista de pliegue persistida");
  assert.equal(level(after, meshId), 0, "MESHCREASE no cambia el nivel de suavizado");
}

// --- Con TODAS las aristas plegadas, suavizar NO mueve las esquinas ----------
// (calca el caso de `mesh/subdivision.spec.ts` pero pasando por la orden real)
{
  const { doc, meshId } = buildMeshBox();
  const originalBody = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const edgePicks = allEdgePicks(meshId, originalBody);
  assert.equal(edgePicks.length, 12, `una caja tiene 12 aristas (${edgePicks.length})`);

  const creaseResult = drive("MESHCREASE", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, ...edgePicks, enter], doc);
  assert.ok(creaseResult?.kind === "document", "MESHCREASE con las 12 aristas produce documento");
  if (creaseResult?.kind !== "document") throw new Error("sin documento");
  const creased = executeCadEntityCommandBatch(doc, creaseResult.commands, creaseResult.label).document;
  assert.equal(creases(creased, meshId), 12, "las 12 aristas quedaron plegadas");

  const smoothResult = drive("MESHSMOOTH", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, enter], creased);
  assert.ok(smoothResult?.kind === "document", "MESHSMOOTH sobre la malla plegada produce documento");
  if (smoothResult?.kind !== "document") throw new Error("sin documento");
  const smoothed = executeCadEntityCommandBatch(creased, smoothResult.commands, smoothResult.label).document;

  const smoothBody = solid3dBody(smoothed.entities.find((e) => e.id === meshId) as never);
  let pinned = 0;
  for (let i = 0; i < originalBody.vertices.length; i++) {
    const p = smoothBody.vertices[i]?.point;
    const q = originalBody.vertices[i].point;
    if (p && Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && Math.abs(p.z - q.z) < 1e-9) pinned++;
  }
  assert.equal(pinned, originalBody.vertices.length, `con las 12 aristas plegadas, las ${originalBody.vertices.length} esquinas NO se mueven al suavizar (${pinned})`);

  // --- MESHUNCREASE (sin designar aristas: quita TODAS) redondea de verdad ---
  const uncreaseResult = drive("MESHUNCREASE", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, enter], smoothed);
  assert.ok(uncreaseResult?.kind === "document", `MESHUNCREASE produce documento: ${uncreaseResult?.kind === "message" ? uncreaseResult.text : ""}`);
  if (uncreaseResult?.kind !== "document") throw new Error("sin documento");
  const uncreased = executeCadEntityCommandBatch(smoothed, uncreaseResult.commands, uncreaseResult.label).document;

  assert.equal(creases(uncreased, meshId), 0, "MESHUNCREASE quitó los 12 pliegues");
  assert.equal(level(uncreased, meshId), 1, "MESHUNCREASE conserva el nivel de suavizado (sólo cambia el pliegue)");

  const uncreasedVolume = solid3dMassProperties(uncreased.entities.find((e) => e.id === meshId) as never).volume;
  const creasedVolume = solid3dMassProperties(smoothed.entities.find((e) => e.id === meshId) as never).volume;
  assert.ok(
    uncreasedVolume < creasedVolume,
    `sin los pliegues la malla se redondea MÁS: volumen ${uncreasedVolume} < ${creasedVolume} (con pliegue)`,
  );
}

// --- MESHCREASE sin aristas designadas: detecta automáticamente (bordes y
//     ángulos > 30°) en vez de negarse — una caja los tiene los 12 a 90° -----
{
  const { doc, meshId } = buildMeshBox();
  const result = drive("MESHCREASE", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, enter], doc);
  assert.ok(result?.kind === "document", `MESHCREASE sin picks detecta automáticamente: ${result?.kind === "message" ? result.text : ""}`);
  if (result?.kind !== "document") throw new Error("sin documento");
  const after = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  assert.equal(creases(after, meshId), 12, `las 12 aristas de la caja (todas a 90°) se detectan solas (${creases(after, meshId)})`);
}

// --- MESHCREASE se niega en un nivel > 0: los índices ya no son de la base --
{
  const { doc, meshId } = buildMeshBox();
  const smoothResult = drive("MESHSMOOTH", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, enter], doc);
  if (smoothResult?.kind !== "document") throw new Error("sin documento");
  const smoothed = executeCadEntityCommandBatch(doc, smoothResult.commands, smoothResult.label).document;
  const body = solid3dBody(smoothed.entities.find((e) => e.id === meshId) as never);
  const edgePicks = allEdgePicks(meshId, body);

  const result = drive("MESHCREASE", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, edgePicks[0], enter], smoothed);
  assert.ok(
    result?.kind === "message" && /nivel/i.test(result.text) && /MESHSMOOTHLESS/.test(result.text),
    `MESHCREASE se niega honestamente en nivel > 0: ${result?.kind === "message" ? result.text : result?.kind}`,
  );
  assert.equal(creases(smoothed, meshId), 0, "el documento no cambió: sigue sin pliegues");
}

// --- MESHUNCREASE sin pliegues que quitar: mensaje, no mutación ---------------
{
  const { doc, meshId } = buildMeshBox();
  const result = drive("MESHUNCREASE", [{ kind: "entityPick", entityId: meshId, point: { x: 50, y: 50 } }, enter], doc);
  assert.ok(
    result?.kind === "message" && result.text.includes("ningún pliegue"),
    `MESHUNCREASE sin pliegues informa en vez de mutar: ${result?.kind === "message" ? result.text : result?.kind}`,
  );
}

// --- MESHEXTRUDE: empujar la cara de arriba cambia el volumen EXACTAMENTE ----
function topFaceIndex(body: BrepBody): number {
  for (let face = 0; face < body.faces.length; face++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (cadFaceRefFromBody(body as any, face).plane.nz > 0.9) return face;
  }
  return -1;
}

{
  const { doc, meshId } = buildMeshBox();
  const body = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const top = topFaceIndex(body);
  assert.ok(top >= 0, "la caja tiene una cara hacia arriba");
  const originalVolume = solid3dMassProperties(doc.entities.find((e) => e.id === meshId) as never).volume;
  const topArea = Math.abs(cadFaceRefFromBody(body as never, top).area);

  const face = cadFaceRefFromBody(body as never, top);
  const result = drive(
    "MESHEXTRUDE",
    [{ kind: "facePick", entityId: meshId, face, point: { x: 50, y: 50, z: 50 }, normal: { x: 0, y: 0, z: 1 } }, distance(20)],
    doc,
  );
  assert.ok(result?.kind === "document", `MESHEXTRUDE produce documento: ${result?.kind === "message" ? result.text : ""}`);
  if (result?.kind !== "document") throw new Error("sin documento");
  const after = executeCadEntityCommandBatch(doc, result.commands, result.label).document;

  assert.equal(after.entities.length, doc.entities.length, "MESHEXTRUDE reemplaza en su sitio, no añade entidades");
  assert.ok(after.entities.some((e) => e.id === meshId), "la malla extruida conserva su id");

  const newVolume = solid3dMassProperties(after.entities.find((e) => e.id === meshId) as never).volume;
  const expected = originalVolume + topArea * 20;
  assert.ok(
    Math.abs(newVolume - expected) < 1,
    `MESHEXTRUDE: el volumen creció EXACTAMENTE área×altura (${originalVolume} + ${topArea}×20 = ${expected} ≈ ${newVolume})`,
  );
}

// --- MESHEXTRUDE: altura cero se niega, sin tocar el documento ---------------
{
  const { doc, meshId } = buildMeshBox();
  const body = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const top = topFaceIndex(body);
  const face = cadFaceRefFromBody(body as never, top);
  const result = drive(
    "MESHEXTRUDE",
    [{ kind: "facePick", entityId: meshId, face, point: { x: 50, y: 50, z: 50 }, normal: { x: 0, y: 0, z: 1 } }, distance(0)],
    doc,
  );
  assert.ok(
    result?.kind === "message" && result.text.includes("no puede ser cero"),
    `MESHEXTRUDE rechaza altura cero: ${result?.kind === "message" ? result.text : result?.kind}`,
  );
}

// --- Cancelación ----------------------------------------------------------
for (const name of ["MESHCREASE", "MESHUNCREASE", "MESHEXTRUDE"]) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name)!;
  const doc = emptyDocument();
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    `${name} se cancela limpiamente`,
  );
}

console.log(
  "✅ mesh-crease-extrude.spec: registro (3) + MESHCREASE persiste (3) + 12 pliegues fijan esquinas + MESHUNCREASE redondea (8) + " +
    "detección automática (2) + nivel>0 se niega (2) + sin pliegues (1) + MESHEXTRUDE exacto (4) + altura cero (1) + cancelación (3) — 27 comprobaciones",
);
