/**
 * TABLEDIT contra el registro del PRODUCTO: texto de celda, fórmulas y su
 * recálculo al tocar la celda de origen, aplicados por la ÚNICA ruta de
 * mutación y comparados contra la tabla de entrada.
 */
import { strict as assert } from "node:assert";
import {
  executeCadEntityCommandBatch,
  type CadEntityCommand,
} from "../../entity-commands";
import type { CadDocument, CadEntity } from "../../cad-document";
import { migrateCadDocument, parseCadDocument, serializeCadDocument } from "../../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

let checks = 0;
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const layer = "TABLAS";

function tableEntity(id: string): CadEntity {
  return {
    id,
    type: "table",
    insertion: { x: 0, y: 0, z: 0 },
    rows: 4,
    columns: 2,
    rowHeights: [200, 200, 200, 200],
    columnWidths: [1_000, 1_000],
    cells: [
      { row: 0, column: 0, text: "10" },
      { row: 1, column: 0, text: "20" },
      { row: 2, column: 0, text: "30" },
    ],
    layer,
  } as unknown as CadEntity;
}

function document(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "Tablas", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(doc: CadDocument, selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(doc, selection);
  let step = descriptor!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
  }
  return step.result;
}

function commandsOf(result: CadCommandResult | undefined): readonly CadEntityCommand[] {
  assert.ok(result?.kind === "document", `debía escribir; dio ${result?.kind}`);
  if (result?.kind !== "document") throw new Error("tipo");
  checks += 1;
  return result.commands;
}

function cellsOfReplace(commands: readonly CadEntityCommand[]) {
  const replace = commands.find((c) => c.type === "replace");
  assert.ok(replace?.type === "replace", "TABLEDIT reemplaza la entidad entera");
  if (replace?.type !== "replace") throw new Error("tipo");
  const table = replace.entity as unknown as { cells: { row: number; column: number; text: string; formula?: string }[] };
  return table.cells;
}

const pick = (entityId: string): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x: 0, y: 0 },
});
const text = (value: string): CadCommandInput => ({ kind: "text", value });

// --- camino feliz: fila, columna, texto -------------------------------------------------
{
  const doc = document([tableEntity("t1")]);
  const result = run("TABLEDIT", [pick("t1"), text("1"), text("1"), text("Partida")], doc);
  const cells = cellsOfReplace(commandsOf(result));
  const edited = cells.find((c) => c.row === 0 && c.column === 0);
  eq(edited?.text, "Partida", "la celda 1,1 lleva el texto tecleado");
  eq(edited?.formula, undefined, "texto llano no deja fórmula");
}

// --- fórmula: SUMA de un rango, medida sobre el documento aplicado ---------------------
{
  const doc = document([tableEntity("t1")]);
  const result = run("TABLEDIT", [pick("t1"), text("4"), text("1"), text("=SUMA(A1:A3)")], doc);
  const commands = commandsOf(result);
  const cells = cellsOfReplace(commands);
  const total = cells.find((c) => c.row === 3 && c.column === 0);
  eq(total?.formula, "=SUMA(A1:A3)", "la fórmula se guarda tal cual");
  eq(total?.text, "60", "10+20+30, calculado de verdad");

  // Y sobrevive a guardar y reabrir.
  const applied = executeCadEntityCommandBatch(doc, commands, "TABLEDIT");
  const reopened = parseCadDocument(serializeCadDocument(applied.document));
  const table = reopened.entities.find((e) => e.id === "t1");
  ok(table?.type === "table", "la tabla sigue siendo una tabla tras el guardado");
  if (table?.type !== "table") throw new Error("tipo");
  const survivor = table.cells.find((c) => c.row === 3 && c.column === 0);
  eq(survivor?.formula, "=SUMA(A1:A3)", "la fórmula sobrevive al guardado");
  eq(survivor?.text, "60", "y su valor calculado también");
}

// --- recálculo: cambiar la celda de origen mueve el total, en dos pasos reales ---------
{
  const doc = document([tableEntity("t1")]);
  const withFormula = commandsOf(
    run("TABLEDIT", [pick("t1"), text("4"), text("1"), text("=SUMA(A1:A3)")], doc),
  );
  const afterFormula = executeCadEntityCommandBatch(doc, withFormula, "TABLEDIT").document;

  const withEdit = commandsOf(
    run("TABLEDIT", [pick("t1"), text("2"), text("1"), text("99")], afterFormula),
  );
  const cells = cellsOfReplace(withEdit);
  eq(cells.find((c) => c.row === 1 && c.column === 0)?.text, "99", "la celda de origen cambió");
  eq(
    cells.find((c) => c.row === 3 && c.column === 0)?.text,
    "139",
    "10+99+30: el total se recalculó SOLO, sin tocarlo",
  );
}

// --- reeditar una celda con fórmula ofrece la fórmula, no el valor ---------------------
{
  const doc = document([tableEntity("t1")]);
  const withFormula = commandsOf(
    run("TABLEDIT", [pick("t1"), text("4"), text("1"), text("=SUMA(A1:A3)")], doc),
  );
  const afterFormula = executeCadEntityCommandBatch(doc, withFormula, "TABLEDIT").document;
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("TABLEDIT")!;
  const context = makeContext(afterFormula);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, pick("t1"), context);
  step = descriptor.step(step.state, text("4"), context);
  step = descriptor.step(step.state, text("1"), context);
  eq(step.prompt.defaultValue, "=SUMA(A1:A3)", "el prompt ofrece la fórmula para reeditarla, no «60»");
}

// --- escribir texto llano sobre una fórmula la retira -----------------------------------
{
  const doc = document([tableEntity("t1")]);
  const withFormula = commandsOf(
    run("TABLEDIT", [pick("t1"), text("4"), text("1"), text("=SUMA(A1:A3)")], doc),
  );
  const afterFormula = executeCadEntityCommandBatch(doc, withFormula, "TABLEDIT").document;
  const overwritten = cellsOfReplace(
    commandsOf(run("TABLEDIT", [pick("t1"), text("4"), text("1"), text("Ver nota")], afterFormula)),
  );
  const cell = overwritten.find((c) => c.row === 3 && c.column === 0);
  eq(cell?.text, "Ver nota", "texto llano gana");
  eq(cell?.formula, undefined, "y la fórmula desaparece, no queda huérfana");
}

console.log(
  `annotate-table-edit: ${checks} comprobaciones · texto de celda, fórmulas, recálculo y round-trip`,
);
