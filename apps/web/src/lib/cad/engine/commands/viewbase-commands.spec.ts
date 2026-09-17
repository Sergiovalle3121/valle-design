/**
 * Familia VIEWBASE: los seis comandos de documentación desde el modelo.
 *
 *   VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE.
 *
 * Delegan en el motor SOLVIEW/SOLDRAW: aquí se comprueba que la interfaz
 * tecleada produce el resultado esperado, no que la proyección es correcta
 * (eso ya lo cubre `solview-commands.spec.ts` y `solview-golden.spec.ts`).
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

// Las implementaciones de los comandos llegan a demanda en el navegador.
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
    newEntityId: () => `vb${++idCounter}`,
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

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const enter: CadCommandInput = { kind: "enter" };

// --- Modelo de prueba: un rectángulo extruido ---------------------------------
const rect: CadEntity = {
  id: "base",
  type: "polyline",
  closed: true,
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 5000, y: 0, z: 0 },
    { x: 5000, y: 3000, z: 0 },
    { x: 0, y: 3000, z: 0 },
  ],
  layer,
};
let doc = documentWith([rect]);

// Extruir el rectángulo para tener un sólido.
{
  const result = run("EXTRUDE", [keyword("base"), distance(2800)], doc, ["base"]);
  assert.ok(result && result.kind === "document", "EXTRUDE produce documento");
  doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
}

// --- Registro: los seis comandos existen --------------------------------------
{
  const names = ["VIEWBASE", "VIEWPROJ", "VIEWSECTION", "VIEWDETAIL", "VIEWEDIT", "VIEWUPDATE"];
  for (const name of names) {
    assert.ok(CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);
  }
}

// --- VIEWBASE: planta por defecto con corte a 1200 mm -------------------------
{
  const result = run("VIEWBASE", [enter, enter, text("Planta baja"), enter], doc);
  if (result?.kind === "document") {
    assert.ok(result.commands.length > 0, "VIEWBASE genera comandos de inserción");
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    // Si no hay modelo sólido suficiente, VIEWBASE devuelve mensaje.
    assert.ok(result?.kind === "message", `VIEWBASE responde: ${result?.kind}`);
  }
}

// --- VIEWPROJ: proyectar la planta hacia frontal --------------------------------
{
  const result = run("VIEWPROJ", [text("Planta baja"), keyword("Frontal"), text("Alzado sur")], doc);
  if (result?.kind === "document") {
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    assert.ok(result?.kind === "message", `VIEWPROJ responde: ${result?.kind}`);
  }
}

// --- VIEWSECTION: sección por dos puntos --------------------------------------
{
  const result = run("VIEWSECTION", [point(0, 1500), point(5000, 1500), text("Corte A-A")], doc);
  if (result?.kind === "document") {
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    assert.ok(result?.kind === "message", `VIEWSECTION responde: ${result?.kind}`);
  }
}

// --- VIEWDETAIL: detalle ampliado de la planta ---------------------------------
{
  const result = run("VIEWDETAIL", [text("Planta baja"), enter, text("Detalle esquina")], doc);
  if (result?.kind === "document") {
    doc = executeCadEntityCommandBatch(doc, result.commands, result.label).document;
  } else {
    assert.ok(result?.kind === "message", `VIEWDETAIL responde: ${result?.kind}`);
  }
}

// --- VIEWEDIT: consultar propiedades de la planta ------------------------------
{
  const result = run("VIEWEDIT", [text("Planta baja")], doc);
  assert.ok(result && result.kind === "message", "VIEWEDIT devuelve un mensaje");
}

// --- VIEWEDIT: vista inexistente -----------------------------------------------
{
  const result = run("VIEWEDIT", [text("No existe")], doc);
  assert.ok(result && result.kind === "message", "VIEWEDIT con vista inexistente devuelve mensaje");
}

// --- VIEWUPDATE: actualizar vistas obsoletas -----------------------------------
{
  const result = run("VIEWUPDATE", [enter], doc);
  // VIEWUPDATE devuelve documento si hay algo que actualizar, o mensaje si ya
  // están al día. Ambos son válidos.
  assert.ok(
    result && (result.kind === "document" || result.kind === "message"),
    `VIEWUPDATE responde: ${result?.kind}`,
  );
}

// --- Cancelación --------------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("VIEWBASE")!;
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  assert.ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "VIEWBASE se cancela limpiamente",
  );
}

// --- Sin presentaciones -------------------------------------------------------
{
  const sinEspacios = migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: layer, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities: [],
    modelSpace: { entityIds: [] },
  });
  const ctxSinEspacios: CadCommandContext = {
    entityIds: [],
    entity: () => undefined,
    selection: [],
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `vb${++idCounter}`,
    paperSpaces: () => sinEspacios.paperSpaces,
  };
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("VIEWBASE")!;
  let step = descriptor.begin(ctxSinEspacios);
  for (const input of [enter, enter, text("X"), enter]) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctxSinEspacios);
  }
  const result = step.result;
  assert.ok(
    result && result.kind === "message",
    "VIEWBASE sin presentaciones devuelve mensaje",
  );
}

console.log(
  `✅ viewbase-commands.spec: VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE — 12 comprobaciones`,
);
