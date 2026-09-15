/**
 * SLICE y SECTION con planos coordenados (XY, YZ, ZX).
 *
 * Ejecuta los comandos SLICE y SECTION a través de la canalización real
 * (begin/step) usando las palabras clave XY, YZ y ZX, distancia y lado.
 * Verifica que el volumen resultante sea la mitad y que SECTION produzca
 * una región.
 */
import { check, report } from "../brep/spec-support";
import type { CadEntity, CadDocument } from "./cad-document";
import { migrateCadDocument } from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";
import { clearSolidCache, solid3dMassProperties } from "./solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine/index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "./engine/command-types";

// Cargar todos los comandos del motor (el runner de specs no soporta lazy).
import "@/lib/cad/engine/all-commands";

const layer = "MUROS";

// ---------------------------------------------------------------------------
// Infraestructura de prueba (solids.spec.ts, adaptada a check/report)
// ---------------------------------------------------------------------------

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

let idCounter = 0;

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
  if (!descriptor) throw new Error(`${name} no está en el registro`);
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
  if (!result || result.kind !== "document")
    throw new Error(`${name} no produjo documento: ${result?.kind ?? "undefined"}`);
  return executeCadEntityCommandBatch(document, result.commands, result.label).document;
}

function messageOf(result: CadCommandResult | undefined): string {
  if (!result || result.kind !== "message")
    throw new Error(`Se esperaba mensaje, se obtuvo ${result?.kind ?? "undefined"}`);
  return result.text;
}

function soleSolid(document: CadDocument) {
  const solids = document.entities.filter((entity) => entity.type === "solid3d");
  if (solids.length !== 1) throw new Error(`Se esperaba 1 sólido, hay ${solids.length}`);
  const solid = solids[0];
  if (solid.type !== "solid3d") throw new Error("tipo");
  return solid;
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const ENTER: CadCommandInput = { kind: "enter" };
const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });

function rectangle(id: string, x: number, y: number, w: number, h: number): CadEntity {
  return {
    id,
    type: "polyline",
    vertices: [
      { x, y, z: 0 },
      { x: x + w, y, z: 0 },
      { x: x + w, y: y + h, z: 0 },
      { x, y: y + h, z: 0 },
    ],
    closed: true,
    layer,
  };
}

// ---------------------------------------------------------------------------
// Preparar un sólido base: prisma 200 × 300 × 400
// ---------------------------------------------------------------------------
const W = 200, D = 300, H = 400;
const fullVolume = W * D * H;

function makeDocument() {
  clearSolidCache();
  let document = documentWith([rectangle("base", 0, 0, W, D)]);
  document = apply("EXTRUDE", [select("base"), distance(H)], document, ["base"]);
  return document;
}

// ---------------------------------------------------------------------------
// 1. SLICE XY a la mitad: el volumen se reduce a la mitad
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const sliced = apply(
    "SLICE",
    [select(solidId), keyword("XY"), distance(H / 2), keyword("Izquierda")],
    document,
    [solidId],
  );
  const volume = solid3dMassProperties(soleSolid(sliced)).volume;
  check("SLICE XY: volumen ≈ mitad", Math.abs(volume - fullVolume / 2) < 1,
    `volumen=${volume}, esperado=${fullVolume / 2}`);
}

// ---------------------------------------------------------------------------
// 2. SLICE YZ a la mitad: el volumen se reduce a la mitad
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const sliced = apply(
    "SLICE",
    [select(solidId), keyword("YZ"), distance(W / 2), keyword("Izquierda")],
    document,
    [solidId],
  );
  const volume = solid3dMassProperties(soleSolid(sliced)).volume;
  check("SLICE YZ: volumen ≈ mitad", Math.abs(volume - fullVolume / 2) < 1,
    `volumen=${volume}, esperado=${fullVolume / 2}`);
}

// ---------------------------------------------------------------------------
// 3. SLICE ZX a la mitad: el volumen se reduce a la mitad
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const sliced = apply(
    "SLICE",
    [select(solidId), keyword("ZX"), distance(D / 2), keyword("Izquierda")],
    document,
    [solidId],
  );
  const volume = solid3dMassProperties(soleSolid(sliced)).volume;
  check("SLICE ZX: volumen ≈ mitad", Math.abs(volume - fullVolume / 2) < 1,
    `volumen=${volume}, esperado=${fullVolume / 2}`);
}

// ---------------------------------------------------------------------------
// 4. SLICE XY con «Ambos»: las dos mitades suman el volumen original
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const sliced = apply(
    "SLICE",
    [select(solidId), keyword("XY"), distance(H / 2), keyword("Ambos")],
    document,
    [solidId],
  );
  const halves = sliced.entities.filter((entity) => entity.type === "solid3d");
  check("SLICE XY Ambos: dos mitades", halves.length === 2, `encontrados=${halves.length}`);
  const total = halves.reduce(
    (sum, half) => sum + (half.type === "solid3d" ? solid3dMassProperties(half).volume : 0),
    0,
  );
  check("SLICE XY Ambos: las mitades suman el original", Math.abs(total - fullVolume) < 1,
    `total=${total}, esperado=${fullVolume}`);
}

// ---------------------------------------------------------------------------
// 5. SECTION XY: produce una región
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const result = run(
    "SECTION",
    [select(solidId), keyword("XY"), distance(H / 2), ENTER],
    document,
    [solidId],
  );
  if (!result || result.kind !== "document") throw new Error("SECTION no produjo documento");
  const afterSection = executeCadEntityCommandBatch(document, result.commands, result.label).document;
  const regions = afterSection.entities.filter((entity) => entity.type === "region");
  check("SECTION XY: produce una región", regions.length === 1, `encontradas=${regions.length}`);
  if (regions.length > 0 && regions[0].type === "region") {
    check("SECTION XY: la sección de un prisma recto es un rectángulo",
      regions[0].outer.length === 4, `vértices=${regions[0].outer.length}`);
  }
}

// ---------------------------------------------------------------------------
// 6. SECTION YZ: produce una región
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const result = run(
    "SECTION",
    [select(solidId), keyword("YZ"), distance(W / 2), ENTER],
    document,
    [solidId],
  );
  if (!result || result.kind !== "document") throw new Error("SECTION no produjo documento");
  const afterSection = executeCadEntityCommandBatch(document, result.commands, result.label).document;
  const regions = afterSection.entities.filter((entity) => entity.type === "region");
  check("SECTION YZ: produce una región", regions.length === 1, `encontradas=${regions.length}`);
  if (regions.length > 0 && regions[0].type === "region") {
    check("SECTION YZ: la sección de un prisma recto es un rectángulo",
      regions[0].outer.length === 4, `vértices=${regions[0].outer.length}`);
  }
}

// ---------------------------------------------------------------------------
// 7. SECTION ZX: produce una región
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const result = run(
    "SECTION",
    [select(solidId), keyword("ZX"), distance(D / 2), ENTER],
    document,
    [solidId],
  );
  if (!result || result.kind !== "document") throw new Error("SECTION no produjo documento");
  const afterSection = executeCadEntityCommandBatch(document, result.commands, result.label).document;
  const regions = afterSection.entities.filter((entity) => entity.type === "region");
  check("SECTION ZX: produce una región", regions.length === 1, `encontradas=${regions.length}`);
  if (regions.length > 0 && regions[0].type === "region") {
    check("SECTION ZX: la sección de un prisma recto es un rectángulo",
      regions[0].outer.length === 4, `vértices=${regions[0].outer.length}`);
  }
}

// ---------------------------------------------------------------------------
// 8. SECTION con plano que no toca la pieza: mensaje de error
// ---------------------------------------------------------------------------
{
  const document = makeDocument();
  const solidId = soleSolid(document).id;
  const result = run(
    "SECTION",
    [select(solidId), point(500, 0), point(500, 100), ENTER],
    document,
    [solidId],
  );
  const msg = messageOf(result);
  check("SECTION plano lejano: responde con mensaje de no-atraviesa",
    msg.includes("no atraviesa"), `mensaje="${msg}"`);
}

report("slice-coordinate-planes");
