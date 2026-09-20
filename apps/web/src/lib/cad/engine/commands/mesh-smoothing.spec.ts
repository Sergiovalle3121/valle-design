/**
 * MESHSMOOTH / MESHSMOOTHMORE / MESHSMOOTHLESS — la regla de aceptación de la
 * ola: cada spec EJECUTA la orden real por el motor de comandos
 * (`descriptor.step`, vía `drive`) y MIDE la geometría resultante —vértices,
 * volumen, caras, ida y vuelta— contra la malla de entrada. Nada de «salió un
 * sólido» o «volumen > 0»: eso es justo lo que dejó pasar el relleno que
 * midió la auditoría del 19-sep.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
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

/** Levanta una caja MESH de 200×150×50 y devuelve el documento y su id. */
function buildMeshBox(): { doc: CadDocument; meshId: string } {
  let doc = emptyDocument();
  const result = drive("MESH", [point(0, 0), point(200, 150), distance(50)], doc);
  assert.ok(result?.kind === "document", "MESH produce documento");
  if (result?.kind !== "document") throw new Error("MESH no produjo documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  const meshId = doc.entities.find((e) => e.type === "solid3d")?.id;
  assert.ok(meshId, "hay una malla");
  return { doc, meshId: meshId! };
}

function meshLevel(doc: CadDocument, meshId: string): number {
  const entity = doc.entities.find((e) => e.id === meshId) as CadSolid3dEntity;
  const root = entity.nodes.find((n) => n.id === entity.root);
  if (root?.op !== "brep") return 0;
  return root.meshSubdivision?.level ?? 0;
}

function applySmooth(name: string, doc: CadDocument, meshId: string): CadDocument {
  const result = drive(name, [{ kind: "entityPick", entityId: meshId, point: { x: 100, y: 75 } }, enter], doc);
  assert.ok(result?.kind === "document", `${name} produce documento`);
  if (result?.kind !== "document") throw new Error(`${name} no produjo documento`);
  return executeCadEntityCommandBatch(doc, result.commands, result.label).document;
}

// --- Registro -----------------------------------------------------------------
assert.ok(CAD_COMMAND_REGISTRY_V2.get("MESHSMOOTH"), "MESHSMOOTH registrado");
assert.ok(CAD_COMMAND_REGISTRY_V2.get("MESHSMOOTHMORE"), "MESHSMOOTHMORE registrado");
assert.ok(CAD_COMMAND_REGISTRY_V2.get("MESHSMOOTHLESS"), "MESHSMOOTHLESS registrado");

// --- MESHSMOOTH reemplaza LA MISMA entidad, no añade otra ---------------------
{
  const { doc, meshId } = buildMeshBox();
  const before = doc.entities.length;
  const after = applySmooth("MESHSMOOTH", doc, meshId);
  assert.equal(after.entities.length, before, "MESHSMOOTH no añade entidades: reemplaza la malla en su sitio");
  assert.ok(after.entities.some((e) => e.id === meshId), "la malla conserva su id tras suavizar");
}

// --- Nivel 1: los vértices de la caja SE MUEVEN, caras ×4 desde la base
//     triangulada, volumen baja (se redondea) pero sigue siendo un sólido ------
{
  const { doc, meshId } = buildMeshBox();
  const originalBody = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const originalVolume = solid3dMassProperties(doc.entities.find((e) => e.id === meshId) as never).volume;
  assert.equal(originalBody.faces.length, 6, "la caja de MESH tiene 6 caras");
  assert.ok(Math.abs(originalVolume - 200 * 150 * 50) < 1, `volumen de la caja: 1 500 000 (${originalVolume})`);

  const smoothed = applySmooth("MESHSMOOTH", doc, meshId);
  assert.equal(meshLevel(smoothed, meshId), 1, "MESHSMOOTH sube al nivel 1");

  const smoothBody = solid3dBody(smoothed.entities.find((e) => e.id === meshId) as never);
  assert.equal(smoothBody.faces.length, 48, `nivel 1: 6 cuadriláteros → 12 triángulos base × 4 = 48 (${smoothBody.faces.length})`);

  let moved = 0;
  for (let i = 0; i < originalBody.vertices.length; i++) {
    const p = smoothBody.vertices[i]?.point;
    const q = originalBody.vertices[i].point;
    if (!p) continue;
    if (Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6 || Math.abs(p.z - q.z) > 1e-6) moved++;
  }
  assert.equal(moved, originalBody.vertices.length, `los ${originalBody.vertices.length} vértices originales se movieron al suavizar (${moved})`);

  const smoothVolume = solid3dMassProperties(smoothed.entities.find((e) => e.id === meshId) as never).volume;
  assert.ok(smoothVolume > 0, `nivel 1: volumen sigue positivo (${smoothVolume})`);
  assert.ok(smoothVolume < originalVolume, `nivel 1: volumen MENOR que el original — se redondeó (${smoothVolume} < ${originalVolume})`);
}

// --- El volumen CONVERGE: cada nivel se acerca más al límite que el anterior --
{
  const { doc, meshId } = buildMeshBox();
  let current = doc;
  const volumes: number[] = [solid3dMassProperties(doc.entities.find((e) => e.id === meshId) as never).volume];
  for (let i = 0; i < 3; i++) {
    current = applySmooth("MESHSMOOTH", current, meshId);
    volumes.push(solid3dMassProperties(current.entities.find((e) => e.id === meshId) as never).volume);
  }
  for (let i = 1; i < volumes.length; i++) {
    assert.ok(volumes[i] < volumes[i - 1], `volumen decrece del nivel ${i - 1} al ${i}: ${volumes[i - 1]} → ${volumes[i]}`);
  }
  const deltas = volumes.slice(1).map((v, i) => volumes[i] - v);
  for (let i = 1; i < deltas.length; i++) {
    assert.ok(deltas[i] < deltas[i - 1], `el paso de volumen se achica (converge) en el nivel ${i + 1}`);
  }
}

// --- MESHSMOOTHMORE también sube el nivel (mismo mecanismo) -------------------
{
  const { doc, meshId } = buildMeshBox();
  const more = applySmooth("MESHSMOOTHMORE", doc, meshId);
  assert.equal(meshLevel(more, meshId), 1, "MESHSMOOTHMORE sube al nivel 1");
  const body = solid3dBody(more.entities.find((e) => e.id === meshId) as never);
  assert.equal(body.faces.length, 48, "MESHSMOOTHMORE también triangula y ×4 al primer nivel");
}

// --- Ida y vuelta EXACTA: subir a nivel 2, bajar a 1, volver a subir a 2 ------
{
  const { doc, meshId } = buildMeshBox();
  let lvl1 = applySmooth("MESHSMOOTH", doc, meshId);
  let lvl2 = applySmooth("MESHSMOOTH", lvl1, meshId);
  const bodyAt2First = solid3dBody(lvl2.entities.find((e) => e.id === meshId) as never);
  const volAt2First = solid3dMassProperties(lvl2.entities.find((e) => e.id === meshId) as never).volume;

  const backTo1 = applySmooth("MESHSMOOTHLESS", lvl2, meshId);
  assert.equal(meshLevel(backTo1, meshId), 1, "MESHSMOOTHLESS baja del nivel 2 al 1");
  const bodyAt1 = solid3dBody(backTo1.entities.find((e) => e.id === meshId) as never);
  const volAt1 = solid3dMassProperties(backTo1.entities.find((e) => e.id === meshId) as never).volume;
  const bodyAt1Original = solid3dBody(lvl1.entities.find((e) => e.id === meshId) as never);
  assert.equal(bodyAt1.faces.length, bodyAt1Original.faces.length, "nivel 1 recalculado tiene el MISMO número de caras que la primera vez");
  assert.ok(Math.abs(volAt1 - solid3dMassProperties(lvl1.entities.find((e) => e.id === meshId) as never).volume) < 1e-6, "nivel 1 recalculado tiene el MISMO volumen que la primera vez");

  const upTo2Again = applySmooth("MESHSMOOTH", backTo1, meshId);
  assert.equal(meshLevel(upTo2Again, meshId), 2, "vuelve a subir al nivel 2");
  const bodyAt2Again = solid3dBody(upTo2Again.entities.find((e) => e.id === meshId) as never);
  const volAt2Again = solid3dMassProperties(upTo2Again.entities.find((e) => e.id === meshId) as never).volume;
  assert.equal(bodyAt2Again.faces.length, bodyAt2First.faces.length, "subir → bajar → subir: MISMO número de caras que la primera vez en nivel 2");
  assert.ok(Math.abs(volAt2Again - volAt2First) < 1e-6, `subir → bajar → subir: MISMO volumen exacto que la primera vez (${volAt2Again} ≈ ${volAt2First})`);
  void lvl2;
}

// --- Bajar hasta el fondo devuelve EXACTAMENTE la malla original --------------
{
  const { doc, meshId } = buildMeshBox();
  const originalBody = solid3dBody(doc.entities.find((e) => e.id === meshId) as never);
  const originalVolume = solid3dMassProperties(doc.entities.find((e) => e.id === meshId) as never).volume;

  let current = applySmooth("MESHSMOOTH", doc, meshId);
  current = applySmooth("MESHSMOOTH", current, meshId);
  assert.equal(meshLevel(current, meshId), 2, "subió dos niveles");

  current = applySmooth("MESHSMOOTHLESS", current, meshId);
  current = applySmooth("MESHSMOOTHLESS", current, meshId);
  assert.equal(meshLevel(current, meshId), 0, "bajó de vuelta a nivel 0");

  const backBody = solid3dBody(current.entities.find((e) => e.id === meshId) as never);
  const backVolume = solid3dMassProperties(current.entities.find((e) => e.id === meshId) as never).volume;
  assert.equal(backBody.faces.length, originalBody.faces.length, `nivel 0: MISMAS 6 caras que la malla original (${backBody.faces.length})`);
  assert.ok(Math.abs(backVolume - originalVolume) < 1e-6, `nivel 0: MISMO volumen exacto que la malla original (${backVolume} ≈ ${originalVolume})`);

  // Y un MESHSMOOTHLESS más en el fondo: mensaje, no mutación.
  const bottomOut = drive("MESHSMOOTHLESS", [{ kind: "entityPick", entityId: meshId, point: { x: 100, y: 75 } }, enter], current);
  assert.ok(
    bottomOut?.kind === "message" && bottomOut.text.includes("nivel minimo"),
    `en el nivel 0, MESHSMOOTHLESS informa el mínimo: ${bottomOut?.kind === "message" ? bottomOut.text : bottomOut?.kind}`,
  );
}

// --- Cancelación ---------------------------------------------------------------
for (const name of ["MESHSMOOTH", "MESHSMOOTHMORE", "MESHSMOOTHLESS"]) {
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
  "✅ mesh-smoothing.spec: registro (3) + reemplaza en el sitio (2) + nivel 1 mueve vértices (7) + " +
    "convergencia (6) + MESHSMOOTHMORE (2) + ida y vuelta exacta (7) + fondo exacto + mínimo (4) + cancelación (3) — 34 comprobaciones",
);
