/**
 * EXTRUDE ante un perfil inclinado: motivo declarado, ningún sólido (T-10 b).
 *
 * `solids.spec.ts` recorre los quince comandos de sólidos con perfiles
 * horizontales y sigue siendo la prueba de que EXTRUDE funciona. Este spec
 * mide lo contrario, que la auditoría del 2026-09-05 encontró sin medir: qué
 * hace la orden cuando el contorno designado NO es horizontal. Antes lo
 * aplanaba sobre la cota de una esquina y entregaba un sólido más pequeño por
 * el coseno, con aspecto de correcto. Ahora termina con un mensaje que dice
 * cuánto se separan los vértices en milímetros y no escribe nada; y un perfil
 * horizontal a cualquier cota sigue extruyéndose exactamente igual.
 *
 * Se conduce por el registro del PRODUCTO (`CAD_COMMAND_REGISTRY_V2`), no por
 * el descriptor suelto: es la misma ruta que recorre la línea de comandos.
 */
import { strict as assert } from "node:assert";
import { bodyBounds } from "../../../brep";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

// Las implementaciones llegan a demanda en el navegador; un spec las trae de golpe.
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, what: string, epsilon = 1e-6) =>
  ok(Math.abs(actual - expected) <= epsilon, `${what}: ${actual}, se esperaba ${expected}`);

const layer = "MUROS";

function documentWith(entities: CadEntity[], unit = "mm"): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

let idCounter = 0;

function makeContext(document: CadDocument, selection: readonly string[]): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `s${++idCounter}`,
    unit: document.meta.unit,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(document, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

function messageOf(result: CadCommandResult | undefined): string {
  assert.ok(result && result.kind === "message", `debía responder con un mensaje, dio ${result?.kind}`);
  if (result.kind !== "message") throw new Error("tipo");
  return result.text;
}

const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });

function polyline(id: string, vertices: { x: number; y: number; z: number }[]): CadEntity {
  return { id, type: "polyline", vertices, closed: true, layer };
}

const COS30 = Math.sqrt(3) / 2;

/** Rectángulo de `size` × `size` inclinado 30° sobre el eje X: sube `size / 2` en cota. */
function inclined(id: string, size = 1000): CadEntity {
  return polyline(id, [
    { x: 0, y: 0, z: 0 },
    { x: size, y: 0, z: 0 },
    { x: size, y: size * COS30, z: size / 2 },
    { x: 0, y: size * COS30, z: size / 2 },
  ]);
}

function rectangle(id: string, w: number, h: number, z: number): CadEntity {
  return polyline(id, [
    { x: 0, y: 0, z },
    { x: w, y: 0, z },
    { x: w, y: h, z },
    { x: 0, y: h, z },
  ]);
}

const REASON = /el perfil no es horizontal \(sus vértices se separan (.+?) en cota\)/;

/* ── El perfil a 30°: motivo, y ningún sólido ──────────────────────────────── */
{
  const document = documentWith([inclined("rampa")]);
  const result = run("EXTRUDE", [select("rampa"), distance(200)], document, ["rampa"]);
  const text = messageOf(result);
  ok(text.startsWith("EXTRUDE no extruyó la polilínea: "), `el mensaje nombra la orden y el contorno: «${text}»`);
  const match = REASON.exec(text);
  ok(match !== null, `y declara el motivo con el número: «${text}»`);
  assert.equal(match?.[1], "500 mm", "500 mm: lo que sube la arista de 1000 a 30°, en la unidad del documento");
  ok(/sólo acepta perfiles horizontales/.test(text), "declara el límite de esta versión");
  ok(/no aplana/.test(text), "dice qué es lo que NO hace, que es lo que antes hacía en silencio");
  ok(/por su normal está pendiente/.test(text), "y nombra el arreglo bueno como «pendiente», no como «nunca»");
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), "sin emoji");
  ok(result?.kind === "message", "termina en mensaje: no hay lote que aplicar, luego no hay sólido ni perfil consumido");

  // Por el camino del punto (la altura se toma de la distancia al centro del
  // perfil) el rechazo es el mismo: las dos entradas desembocan en un solo sitio.
  const byPoint = messageOf(run("EXTRUDE", [select("rampa"), point(2000, 0)], document, ["rampa"]));
  ok(REASON.test(byPoint), "precisar la altura con un punto da el mismo motivo");

  // PRESSPULL comparte la máquina de EXTRUDE para los contornos, así que
  // comparte también el límite, con su propio nombre delante.
  const pressPull = messageOf(run("PRESSPULL", [select("rampa"), distance(200)], document, ["rampa"]));
  ok(pressPull.startsWith("PRESSPULL no extruyó la polilínea: "), `PRESSPULL lo declara con su nombre: «${pressPull}»`);
  ok(REASON.test(pressPull), "y con el mismo número");
}

/* ── El perfil horizontal a la cota 1200: como siempre ─────────────────────── */
{
  const document = documentWith([rectangle("losa", 400, 300, 1200)]);
  const result = run("EXTRUDE", [select("losa"), distance(200)], document, ["losa"]);
  assert.ok(result && result.kind === "document", `debía escribir, dio ${result?.kind === "message" ? result.text : result?.kind}`);
  if (result.kind !== "document") throw new Error("tipo");
  const next = executeCadEntityCommandBatch(document, result.commands, result.label).document;
  const solids = next.entities.filter((entity) => entity.type === "solid3d");
  ok(solids.length === 1, "un sólido");
  const solid = solids[0];
  if (solid.type !== "solid3d") throw new Error("tipo");
  near(solid3dMassProperties(solid).volume, 400 * 300 * 200, "con el volumen entero: 400 × 300 × 200", 1e-3);
  const bounds = bodyBounds(solid3dBody(solid));
  near(bounds.min.z, 1200, "arranca en la cota del perfil, 1200");
  near(bounds.max.z, 1400, "y sube 200 desde ahí");
  const node = solid.nodes[0];
  if (node.op !== "extrude") throw new Error("op");
  assert.ok(node.frame, "el nodo persistido lleva su marco");
  near(node.frame.origin.z, 1200, "el marco persistido nace a la 1200");
  ok(!next.entities.some((entity) => entity.id === "losa"), "y el perfil se consume, como siempre");
}

/* ── Designación mixta: un inclinado aborta la orden entera y se numera ────── */
{
  const line: CadEntity = { id: "guia", type: "line", layer, start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } };
  const document = documentWith([line, rectangle("plana", 100, 100, 0), inclined("rampa")]);
  const text = messageOf(run("EXTRUDE", [select("guia", "plana", "rampa"), distance(50)], document, ["guia", "plana", "rampa"]));
  ok(text.includes("la polilínea (contorno 2 de 2)"), `numera el contorno entre los que encierran área, sin contar la línea: «${text}»`);
  ok(REASON.test(text), "con su motivo");
}

/* ── Los milímetros salen de la unidad del documento ───────────────────────── */
{
  const metres = documentWith([inclined("rampa", 1)], "m");
  const text = messageOf(run("EXTRUDE", [select("rampa"), distance(0.2)], metres, ["rampa"]));
  assert.equal(REASON.exec(text)?.[1], "500 mm", "un rectángulo de 1 m a 30° sube 0,5 m: el mensaje dice 500 mm");

  const hair = documentWith([
    polyline("pelo", [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 0.01 },
      { x: 0, y: 100, z: 0.01 },
    ]),
  ]);
  const tiny = messageOf(run("EXTRUDE", [select("pelo"), distance(10)], hair, ["pelo"]));
  ok(/menos de 0[.,]1 mm/.test(tiny), `una centésima de milímetro se rechaza diciendo «menos de 0.1 mm», nunca «0 mm»: «${tiny}»`);
}

/* ── Un dibujo anterior al 3D, sin `z`, sigue extruyéndose ─────────────────── */
{
  const legacy = {
    id: "viejo",
    type: "polyline",
    layer,
    closed: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  } as unknown as CadEntity;
  const context: CadCommandContext = {
    entityIds: ["viejo"],
    entity: () => legacy,
    selection: ["viejo"],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "s-viejo",
  };
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("EXTRUDE");
  assert.ok(descriptor);
  const step = descriptor.step(descriptor.begin(context).state, distance(10), context);
  ok(step.result?.kind === "document", `sin «z» en ningún vértice no hay inclinación que declarar: escribe (${step.result?.kind})`);
}

console.log(`solids-create: ${checks} comprobaciones — EXTRUDE declara el perfil inclinado (500 mm) y extruye el horizontal a 1200 como siempre`);
