/**
 * TINSERT · Fusionar: una fusión que se CRUZA con una celda ya fusionada (sin
 * contenerla entera) se rechaza, en vez de dejar dos celdas fusionadas
 * reclamando la misma casilla de la rejilla.
 *
 * No es el spec de comando completo que le falta a TINSERT (ver el docstring
 * de `annotate-table-structure.ts`) — sólo fija, contra el motor real, el
 * defecto que encontró la revisión escéptica de esta rama: `mergeRegion`
 * comprobaba el ANCLA de cada celda contra la región objetivo, nunca su
 * `rowSpan`/`columnSpan`, así que una segunda `Fusionar` que sólo tocaba una
 * PARTE de una fusión existente la dejaba intacta y creaba una segunda celda
 * fusionada solapada con la primera.
 */
import { strict as assert } from "node:assert";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import type { CadDocument, CadEntity } from "../../cad-document";
import { migrateCadDocument } from "../../cad-document";
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
    rows: 2,
    columns: 3,
    rowHeights: [200, 200],
    columnWidths: [1_000, 1_000, 1_000],
    cells: [
      { row: 0, column: 0, text: "A" },
      { row: 0, column: 1, text: "B" },
      { row: 0, column: 2, text: "C" },
      { row: 1, column: 0, text: "D" },
      { row: 1, column: 1, text: "E" },
      { row: 1, column: 2, text: "F" },
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

const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });

function fusionar(doc: CadDocument, r1: number, c1: number, r2: number, c2: number): CadCommandResult | undefined {
  return run(
    "TINSERT",
    [pick("t1"), keyword("Fusionar"), text(String(r1)), text(String(c1)), text(String(r2)), text(String(c2))],
    doc,
  );
}

// --- una segunda fusión que se CRUZA con la primera se rechaza -------------------------
{
  const doc = document([tableEntity("t1")]);
  const first = fusionar(doc, 1, 1, 1, 2); // fila1, columnas 1-2 fusionadas
  assert.ok(first?.kind === "document", "la primera fusión debe escribir");
  if (first?.kind !== "document") throw new Error("tipo");
  const afterFirst = executeCadEntityCommandBatch(doc, first.commands, "TINSERT").document;

  // Columnas 2-3 se CRUZAN con la fusión anterior (columna 2 ya está tapada) sin contenerla.
  const overlapping = fusionar(afterFirst, 1, 2, 1, 3);
  eq(overlapping?.kind, "message", "una fusión que se cruza a medias con otra se rechaza, no se aplica muda");
  if (overlapping?.kind === "message")
    ok(/cruza/.test(overlapping.text), "el motivo dice que se cruza con una celda ya fusionada");

  // La tabla queda EXACTAMENTE como estaba tras el rechazo: sigue habiendo una
  // única celda en la fila 0 con columnSpan (la fusión original), no dos.
  const row0Merged = (afterFirst.entities.find((entity) => entity.id === "t1") as unknown as {
    cells: { row: number; column: number; columnSpan?: number }[];
  }).cells.filter((cell) => cell.row === 0 && (cell.columnSpan ?? 1) > 1);
  eq(row0Merged.length, 1, "sigue habiendo sólo UNA celda fusionada en la fila 0, no dos");
  eq(row0Merged[0]?.columnSpan, 2, "y su columnSpan sigue siendo 2, sin tocar tras el rechazo");
}

// --- agrandar una fusión existente hasta que la incluya entera SÍ se permite -----------
{
  const doc = document([tableEntity("t1")]);
  const first = fusionar(doc, 1, 1, 1, 2);
  assert.ok(first?.kind === "document");
  if (first?.kind !== "document") throw new Error("tipo");
  const afterFirst = executeCadEntityCommandBatch(doc, first.commands, "TINSERT").document;

  const bigger = fusionar(afterFirst, 1, 1, 2, 3); // toda la tabla: contiene la fusión anterior entera
  eq(bigger?.kind, "document", "una fusión que CONTIENE la anterior entera sí se aplica");
  if (bigger?.kind !== "document") throw new Error("tipo");
  const replace = bigger.commands.find((command) => command.type === "replace");
  assert.ok(replace?.type === "replace");
  if (replace?.type !== "replace") throw new Error("tipo");
  const table = replace.entity as unknown as { cells: { row: number; column: number; rowSpan?: number; columnSpan?: number }[] };
  eq(table.cells.length, 1, "toda la tabla queda como UNA sola celda fusionada");
  eq(table.cells[0].rowSpan, 2, "rowSpan cubre las dos filas");
  eq(table.cells[0].columnSpan, 3, "columnSpan cubre las tres columnas");
}

console.log(
  `annotate-table-structure: ${checks} comprobaciones · TINSERT/Fusionar rechaza solapes, agrandar sigue permitido`,
);
